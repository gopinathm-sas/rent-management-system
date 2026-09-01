const { Bot, InlineKeyboard } = require('grammy');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

// Constants matching app
const DEFAULT_WATER_RATE = 0.25;
const DISCOUNTED_WATER_RATE = 0.20;
const DISCOUNTED_WATER_ROOMS = new Set(['11', '12', '13']);
const WATER_UNITS_MULTIPLIER = 10;
const MONTHS_LIST = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const IMMUTABLE_ROOMS_DATA = {
  '01': { roomNo: '01', roomId: 'G01' },
  '02': { roomNo: '02', roomId: 'G02' },
  '04': { roomNo: '04', roomId: '102' },
  '05': { roomNo: '05', roomId: '201' },
  '06': { roomNo: '06', roomId: '202' },
  '07': { roomNo: '07', roomId: '203' },
  '08': { roomNo: '08', roomId: '301' },
  '09': { roomNo: '09', roomId: '302' },
  '10': { roomNo: '10', roomId: '303' },
  '11': { roomNo: '11', roomId: '401' },
  '12': { roomNo: '12', roomId: '402' },
  '13': { roomNo: '13', roomId: '403' }
};

// Date / Month Helpers
function getKolkataDateParts() {
  const s = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  const d = new Date(s);
  return {
    year: d.getFullYear(),
    monthIndex: d.getMonth(),
    day: d.getDate(),
    dateObj: d
  };
}

function getWaterMonthKey(year, monthIndex) {
  return `${year}-${MONTHS_LIST[monthIndex]}`;
}

function getPrevYearMonth(year, monthIndex) {
  if (monthIndex > 0) return { year, monthIndex: monthIndex - 1 };
  return { year: year - 1, monthIndex: 11 };
}

function getDefaultWaterRateForRoom(roomNo) {
  const room = String(roomNo || '').trim();
  if (DISCOUNTED_WATER_ROOMS.has(room)) return DISCOUNTED_WATER_RATE;
  return DEFAULT_WATER_RATE;
}

function computeWaterReadingDelta(currentReading, prevReading, isMeterReset, waterRate = DEFAULT_WATER_RATE) {
  const hasCur = currentReading !== null && currentReading !== undefined && currentReading !== '';
  const hasPrev = prevReading !== null && prevReading !== undefined && prevReading !== '';

  const cur = hasCur ? Number(currentReading) : NaN;
  const prev = hasPrev ? Number(prevReading) : NaN;

  if (!Number.isFinite(cur) || cur < 0) return null;

  if (isMeterReset) {
    const units = cur * WATER_UNITS_MULTIPLIER;
    const amount = Math.round(units * waterRate);
    return { meterDelta: cur, units, amount, isMeterReset: true };
  }

  if (!Number.isFinite(prev)) {
    return { meterDelta: null, units: null, amount: null, isMeterReset: false };
  }

  const meterDelta = cur - prev;
  const units = meterDelta * WATER_UNITS_MULTIPLIER;
  const amount = Math.round(units * waterRate);
  return { meterDelta, units, amount, isMeterReset: false };
}

// Room Lookup Helpers
function normalizeRoomIdentifier(input) {
  if (!input) return null;
  let raw = String(input).trim().toUpperCase();
  raw = raw.replace(/^(UNIT|ROOM|#)\s*/i, '').trim();

  // Check exact roomId match (e.g. G01, 102, 201)
  for (const [key, r] of Object.entries(IMMUTABLE_ROOMS_DATA)) {
    if (r.roomId.toUpperCase() === raw || r.roomNo === raw || key === raw) {
      return { roomNo: r.roomNo, roomId: r.roomId };
    }
  }
  // Check numeric pad
  const padded = raw.padStart(2, '0');
  if (IMMUTABLE_ROOMS_DATA[padded]) {
    return { roomNo: IMMUTABLE_ROOMS_DATA[padded].roomNo, roomId: IMMUTABLE_ROOMS_DATA[padded].roomId };
  }
  return null;
}

// Session & Auth Helpers
async function getTelegramUser(chatId) {
  const snap = await admin.firestore().collection('telegramUsers').doc(String(chatId)).get();
  if (!snap.exists) return null;
  return snap.data();
}

async function getSession(chatId) {
  const snap = await admin.firestore().collection('telegramBotSessions').doc(String(chatId)).get();
  return snap.exists ? snap.data() : null;
}

async function setSession(chatId, data) {
  if (!data) {
    await admin.firestore().collection('telegramBotSessions').doc(String(chatId)).delete();
  } else {
    await admin.firestore().collection('telegramBotSessions').doc(String(chatId)).set({
      ...data,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }
}

async function clearSession(chatId) {
  await admin.firestore().collection('telegramBotSessions').doc(String(chatId)).delete();
}

async function getOccupiedTenants() {
  const snap = await admin.firestore().collection('properties').where('status', '==', 'Occupied').get();
  const tenantsByRoomNo = {};
  const tenantsByRoomId = {};
  snap.docs.forEach(doc => {
    const data = { id: doc.id, ...doc.data() };
    const roomNo = String(data.roomNo || '').padStart(2, '0');
    const roomId = String(data.roomId || '').trim();
    if (roomNo) tenantsByRoomNo[roomNo] = data;
    if (roomId) tenantsByRoomId[roomId] = data;
  });
  return { tenantsByRoomNo, tenantsByRoomId, allTenants: snap.docs.map(d => ({ id: d.id, ...d.data() })) };
}

// Core Save Logic
async function saveWaterReading({ tenant, roomNo, roomId, monthKey, readingNum, isReset, telegramUser }) {
  const rateRaw = Number(tenant.waterRate);
  const waterRate = Number.isFinite(rateRaw) ? rateRaw : getDefaultWaterRateForRoom(roomNo);

  const prevYearMonth = getPrevYearMonth(...(() => {
    const [y, mStr] = monthKey.split('-');
    return [parseInt(y, 10), MONTHS_LIST.indexOf(mStr)];
  })());
  const prevKey = getWaterMonthKey(prevYearMonth.year, prevYearMonth.monthIndex);
  const prevVal = tenant.waterReadings?.[prevKey] ?? null;

  const deltaResult = computeWaterReadingDelta(readingNum, prevVal, isReset, waterRate);

  const updatePayload = {
    [`waterReadings.${monthKey}`]: readingNum,
    [`waterMeterReset.${monthKey}`]: !!isReset,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: `telegram:${telegramUser.email || telegramUser.chatId}`
  };

  await admin.firestore().collection('properties').doc(tenant.id).update(updatePayload);

  // Record audit log
  await admin.firestore().collection('waterReadingsAudit').add({
    tenantId: tenant.id,
    roomId: roomId,
    roomNo: roomNo,
    tenantName: tenant.tenant || 'Unknown',
    monthKey: monthKey,
    reading: readingNum,
    previousReading: prevVal !== null ? Number(prevVal) : null,
    meterDelta: deltaResult?.meterDelta ?? null,
    unitsConsumed: deltaResult?.units ?? null,
    waterRate: waterRate,
    billedAmount: deltaResult?.amount ?? null,
    isMeterReset: !!isReset,
    submittedBy: {
      chatId: String(telegramUser.chatId),
      email: telegramUser.email || null,
      role: telegramUser.role || 'staff',
      name: [telegramUser.firstName, telegramUser.lastName].filter(Boolean).join(' ') || telegramUser.username || 'Telegram User',
      username: telegramUser.username || null
    },
    source: 'telegram_bot',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return {
    deltaResult,
    prevVal,
    waterRate
  };
}

// Factory to create and configure the Bot instance
function createTelegramBot(token) {
  if (!token) {
    throw new Error("Telegram Bot token is required");
  }

  const bot = new Bot(token);

  // Authentication & Auto-Provision Middleware (Owner Direct Access)
  bot.use(async (ctx, next) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    let telegramUser = await getTelegramUser(chatId);

    // Auto-authorize user as Owner on first interaction
    if (!telegramUser) {
      telegramUser = {
        chatId: String(chatId),
        email: 'owner@munirathnamillam.com',
        role: 'Owner',
        username: ctx.from?.username || null,
        firstName: ctx.from?.first_name || 'Owner',
        lastName: ctx.from?.last_name || null,
        linkedAt: admin.firestore.FieldValue.serverTimestamp()
      };
      await admin.firestore().collection('telegramUsers').doc(String(chatId)).set(telegramUser, { merge: true });
    }

    if (!ctx.state) {
      ctx.state = {};
    }
    ctx.state.telegramUser = telegramUser;
    ctx.telegramUser = telegramUser;
    return await next();
  });

  // /start command
  bot.command('start', async (ctx) => {
    const name = ctx.from?.first_name || 'Owner';
    await ctx.reply(
      `👋 *Welcome to Munirathnam Illam Rental Bot, ${name}!* 🏢\n\n` +
      `You have full access as *Owner*.\n\n` +
      `*⚡ Quick Commands:*\n` +
      `• /reading — Submit water meter reading (Interactive menu)\n` +
      `• \`/reading <room> <value>\` — Direct quick entry (e.g. \`/reading G01 105.4\`)\n` +
      `• /status — View current month's water readings status\n` +
      `• /help — Full usage guide and rules\n\n` +
      `_Tap /reading to start._`,
      { parse_mode: 'Markdown' }
    );
  });

  // /help command
  bot.command('help', async (ctx) => {
    await ctx.reply(
      `📖 *Munirathnam Illam Water Meter Bot Guide*\n\n` +
      `*Commands:*\n` +
      `• /reading — Interactive unit selection & reading entry\n` +
      `• \`/reading <unit> <val>\` — Shorthand entry (e.g. \`/reading G01 104.5\` or \`/reading 01 104.5\`)\n` +
      `• /status — Overview of recorded readings for current billing month\n` +
      `• /cancel — Cancel current active operation\n\n` +
      `*Rules & Auto-Validation:*\n` +
      `• Readings must be non-negative numbers (decimals supported).\n` +
      `• If reading is lower than previous month, the bot asks if a meter reset occurred.\n` +
      `• Unusually high jumps (>50 meter units) trigger a confirmation alert.\n` +
      `• If a reading already exists for this cycle, you'll be asked before overwriting.`,
      { parse_mode: 'Markdown' }
    );
  });

  // /cancel command
  bot.command('cancel', async (ctx) => {
    const chatId = ctx.chat.id;
    await clearSession(chatId);
    await ctx.reply("❌ Active operation cancelled. Use /reading to start over.");
  });

  // /unlink command
  bot.command('unlink', async (ctx) => {
    const chatId = ctx.chat.id;
    const user = await getTelegramUser(chatId);
    if (!user) {
      await ctx.reply("ℹ️ You do not have an active linked account.");
      return;
    }

    await admin.firestore().collection('telegramUsers').doc(String(chatId)).delete();
    await clearSession(chatId);
    await ctx.reply("✅ Your Telegram account has been unlinked.");
  });

  // /link <code> command
  bot.command('link', async (ctx) => {
    const chatId = ctx.chat.id;
    const rawText = ctx.message.text.trim();
    const parts = rawText.split(/\s+/);
    const code = parts[1] ? parts[1].toUpperCase().trim() : '';

    if (!code || code.length < 4) {
      await ctx.reply("❌ Please provide a valid linking code.\nUsage: `/link <code>` (e.g., `/link 8X92KP`)", { parse_mode: 'Markdown' });
      return;
    }

    try {
      const codeRef = admin.firestore().collection('telegramAuthCodes').doc(code);
      const codeSnap = await codeRef.get();

      if (!codeSnap.exists) {
        await ctx.reply("❌ Invalid linking code. Please check with your administrator for a new code.");
        return;
      }

      const codeData = codeSnap.data();

      // Check expiration (if expiresAt timestamp exists)
      if (codeData.expiresAt) {
        const expiresAtMs = typeof codeData.expiresAt.toMillis === 'function'
          ? codeData.expiresAt.toMillis()
          : new Date(codeData.expiresAt).getTime();
        if (Date.now() > expiresAtMs) {
          await codeRef.delete();
          await ctx.reply("⏳ This linking code has expired. Please ask the admin to generate a fresh code.");
          return;
        }
      }

      const email = (codeData.email || '').toLowerCase().trim();
      const role = codeData.role || 'Staff';

      // Save to telegramUsers collection
      await admin.firestore().collection('telegramUsers').doc(String(chatId)).set({
        chatId: String(chatId),
        email: email,
        role: role,
        username: ctx.from.username || null,
        firstName: ctx.from.first_name || null,
        lastName: ctx.from.last_name || null,
        linkedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Consume/delete the one-time code
      await codeRef.delete();
      await clearSession(chatId);

      await ctx.reply(
        `✅ *Successfully Linked!*\n\n` +
        `👤 Account: *${email}*\n` +
        `🏷️ Role: *${role}*\n\n` +
        `You can now submit water meter readings via /reading!`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      console.error('Error linking user:', err);
      await ctx.reply("⚠️ An error occurred while linking your account. Please try again later.");
    }
  });

  // /status command
  bot.command('status', async (ctx) => {
    const { year, monthIndex } = getKolkataDateParts();
    const currentMonthKey = getWaterMonthKey(year, monthIndex);

    const { allTenants } = await getOccupiedTenants();
    const sortedRooms = Object.values(IMMUTABLE_ROOMS_DATA).sort((a, b) =>
      String(a.roomNo).localeCompare(String(b.roomNo), undefined, { numeric: true })
    );

    let recordedCount = 0;
    let lines = [];

    sortedRooms.forEach(room => {
      const tenant = allTenants.find(t => t.roomNo === room.roomNo || t.roomId === room.roomId);
      if (!tenant) {
        lines.push(`⚪ *${room.roomId}* (${room.roomNo}): Vacant`);
        return;
      }

      const val = tenant.waterReadings?.[currentMonthKey];
      if (val !== undefined && val !== null && val !== '') {
        recordedCount++;
        const resetNote = tenant.waterMeterReset?.[currentMonthKey] ? ' 🔄 (Reset)' : '';
        lines.push(`✅ *${room.roomId}*: \`${val}\`${resetNote} _(${tenant.tenant || 'Tenant'})_`);
      } else {
        lines.push(`⏳ *${room.roomId}*: _Pending_ _(${tenant.tenant || 'Tenant'})_`);
      }
    });

    await ctx.reply(
      `📊 *Water Meter Status (${currentMonthKey})*\n` +
      `Recorded: *${recordedCount} / ${allTenants.length}* occupied rooms\n\n` +
      lines.join('\n') +
      `\n\n_Use /reading to enter readings._`,
      { parse_mode: 'Markdown' }
    );
  });

  // Helper to start reading flow for a specific room
  async function promptReadingForRoom(ctx, room, tenant) {
    const chatId = ctx.chat.id;
    const { year, monthIndex } = getKolkataDateParts();
    const currentMonthKey = getWaterMonthKey(year, monthIndex);
    const prevYM = getPrevYearMonth(year, monthIndex);
    const prevMonthKey = getWaterMonthKey(prevYM.year, prevYM.monthIndex);

    const prevReading = tenant.waterReadings?.[prevMonthKey] ?? null;
    const existingCurrent = tenant.waterReadings?.[currentMonthKey] ?? null;

    await setSession(chatId, {
      step: 'awaiting_reading_value',
      roomNo: room.roomNo,
      roomId: room.roomId,
      tenantId: tenant.id,
      tenantName: tenant.tenant || 'Tenant',
      currentMonthKey,
      prevMonthKey,
      prevVal: prevReading !== null ? Number(prevReading) : null,
      existingCurrent: existingCurrent !== null ? Number(existingCurrent) : null
    });

    let msg = `🏠 *Room ${room.roomId}* (${room.roomNo})\n` +
              `👤 *Tenant:* ${tenant.tenant || 'Occupied'}\n` +
              `📅 *Cycle:* ${currentMonthKey}\n\n`;

    if (prevReading !== null) {
      msg += `📌 *Last Recorded (${prevMonthKey}):* \`${prevReading}\`\n`;
    } else {
      msg += `📌 *Last Recorded:* None\n`;
    }

    if (existingCurrent !== null) {
      msg += `⚠️ *Note:* A reading of \`${existingCurrent}\` is already saved for this month.\n`;
    }

    msg += `\n💬 *Please send the new reading number* (e.g. \`1041.5\`):`;

    const cancelKb = new InlineKeyboard().text("❌ Cancel", "flow_cancel");
    await ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: cancelKb });
  }

  // /reading command
  bot.command('reading', async (ctx) => {
    const rawText = ctx.message.text.trim();
    const parts = rawText.split(/\s+/).filter(Boolean);

    // Direct Shorthand check: /reading <room> <value>
    if (parts.length >= 3) {
      const roomIdentifier = parts[1];
      const readingStr = parts[2];
      const normalized = normalizeRoomIdentifier(roomIdentifier);

      if (!normalized) {
        await ctx.reply(`❌ Unknown room: "${roomIdentifier}". Use valid codes like G01, 102, 201, 01, etc.`);
        return;
      }

      const { tenantsByRoomNo } = await getOccupiedTenants();
      const tenant = tenantsByRoomNo[normalized.roomNo];
      if (!tenant) {
        await ctx.reply(`⚠️ Room *${normalized.roomId}* (${normalized.roomNo}) is currently marked as Vacant.`, { parse_mode: 'Markdown' });
        return;
      }

      return await handleDirectReadingEntry(ctx, normalized, tenant, readingStr);
    }

    // Interactive Flow
    const { allTenants } = await getOccupiedTenants();
    const sortedRooms = Object.values(IMMUTABLE_ROOMS_DATA).sort((a, b) =>
      String(a.roomNo).localeCompare(String(b.roomNo), undefined, { numeric: true })
    );

    const { year, monthIndex } = getKolkataDateParts();
    const currentMonthKey = getWaterMonthKey(year, monthIndex);

    const keyboard = new InlineKeyboard();
    let col = 0;

    sortedRooms.forEach((r) => {
      const tenant = allTenants.find(t => t.roomNo === r.roomNo || t.roomId === r.roomId);
      const isOccupied = Boolean(tenant);
      const isDone = tenant?.waterReadings?.[currentMonthKey] !== undefined && tenant?.waterReadings?.[currentMonthKey] !== null;

      const label = `${isDone ? '✅' : (isOccupied ? '💧' : '⚪')} ${r.roomId}`;
      keyboard.text(label, `sel_room:${r.roomNo}`);
      col++;
      if (col % 3 === 0) keyboard.row();
    });

    keyboard.row().text("❌ Cancel", "flow_cancel");

    await ctx.reply(
      `🚰 *Select a room to enter water meter reading (${currentMonthKey}):*\n\n` +
      `✅ = Done | 💧 = Pending | ⚪ = Vacant`,
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
  });

  // Callback query handler (Inline keyboard clicks)
  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const chatId = ctx.chat.id;
    const telegramUser = ctx.state.telegramUser || await getTelegramUser(chatId);

    if (data === 'flow_cancel') {
      await clearSession(chatId);
      await ctx.answerCallbackQuery({ text: "Cancelled" });
      await ctx.editMessageText("❌ Operation cancelled. Send /reading to start again.");
      return;
    }

    // Room Selection
    if (data.startsWith('sel_room:')) {
      const roomNo = data.split(':')[1];
      const roomData = IMMUTABLE_ROOMS_DATA[roomNo];
      if (!roomData) {
        await ctx.answerCallbackQuery({ text: "Unknown room" });
        return;
      }

      const { tenantsByRoomNo } = await getOccupiedTenants();
      const tenant = tenantsByRoomNo[roomNo];

      if (!tenant) {
        await ctx.answerCallbackQuery({ text: `Room ${roomData.roomId} is vacant` });
        await ctx.reply(`⚠️ Room *${roomData.roomId}* is currently vacant. No tenant is assigned.`, { parse_mode: 'Markdown' });
        return;
      }

      await ctx.answerCallbackQuery();
      await promptReadingForRoom(ctx, roomData, tenant);
      return;
    }

    // Confirmation Actions (Reset, Overwrite, Large Jump Confirmation)
    if (data.startsWith('conf:')) {
      const [, action, nonce] = data.split(':');
      const session = await getSession(chatId);

      if (!session || session.step !== 'awaiting_confirmation') {
        await ctx.answerCallbackQuery({ text: "Session expired" });
        await ctx.reply("⏳ Session expired or invalid. Please start again with /reading.");
        return;
      }

      const { roomNo, roomId, tenantId, tenantName, currentMonthKey, readingNum, prevVal } = session;
      const { tenantsByRoomNo } = await getOccupiedTenants();
      const tenant = tenantsByRoomNo[roomNo];

      if (!tenant || tenant.id !== tenantId) {
        await ctx.answerCallbackQuery({ text: "Tenant record not found" });
        await ctx.reply("❌ Tenant record not found.");
        return;
      }

      if (action === 'cancel') {
        await clearSession(chatId);
        await ctx.answerCallbackQuery({ text: "Cancelled" });
        await ctx.editMessageText("❌ Reading cancelled.");
        return;
      }

      const isReset = action === 'reset';

      try {
        const result = await saveWaterReading({
          tenant,
          roomNo,
          roomId,
          monthKey: currentMonthKey,
          readingNum,
          isReset,
          telegramUser
        });

        await clearSession(chatId);
        await ctx.answerCallbackQuery({ text: "Reading saved!" });

        const { deltaResult } = result;
        let reply = `✅ *Water Reading Saved Successfully!*\n\n` +
                    `🏠 *Room:* ${roomId} (${roomNo})\n` +
                    `👤 *Tenant:* ${tenantName}\n` +
                    `📊 *New Reading:* \`${readingNum}\`\n` +
                    `📅 *Billing Cycle:* ${currentMonthKey}\n`;

        if (isReset) {
          reply += `🔄 *Meter Reset:* Yes\n`;
          reply += `💧 *Water Units:* ${deltaResult?.units ?? 0} units\n`;
        } else if (deltaResult?.meterDelta !== null) {
          reply += `📈 *Meter Delta:* +${deltaResult.meterDelta.toFixed(1)} units\n`;
          reply += `💧 *Water Units:* ${deltaResult.units} units\n`;
          reply += `💰 *Water Charge:* ₹${deltaResult.amount}\n`;
        }

        await ctx.editMessageText(reply, { parse_mode: 'Markdown' });
      } catch (err) {
        console.error("Error saving reading after confirmation:", err);
        await ctx.answerCallbackQuery({ text: "Save failed" });
        await ctx.reply("❌ Error saving reading: " + err.message);
      }
      return;
    }

    await ctx.answerCallbackQuery();
  });

  // Direct shorthand entry handler
  async function handleDirectReadingEntry(ctx, room, tenant, readingStr) {
    const chatId = ctx.chat.id;
    const telegramUser = ctx.state.telegramUser || await getTelegramUser(chatId);

    const readingNum = Number(readingStr);
    if (!Number.isFinite(readingNum) || readingNum < 0) {
      await ctx.reply("❌ Invalid reading number. Please provide a non-negative number.");
      return;
    }

    const { year, monthIndex } = getKolkataDateParts();
    const currentMonthKey = getWaterMonthKey(year, monthIndex);
    const prevYM = getPrevYearMonth(year, monthIndex);
    const prevMonthKey = getWaterMonthKey(prevYM.year, prevYM.monthIndex);

    const prevReading = tenant.waterReadings?.[prevMonthKey] ?? null;
    const existingCurrent = tenant.waterReadings?.[currentMonthKey] ?? null;
    const prevVal = prevReading !== null ? Number(prevReading) : null;

    // Check Lower than Previous
    if (prevVal !== null && readingNum < prevVal) {
      await setSession(chatId, {
        step: 'awaiting_confirmation',
        roomNo: room.roomNo,
        roomId: room.roomId,
        tenantId: tenant.id,
        tenantName: tenant.tenant || 'Tenant',
        currentMonthKey,
        readingNum,
        prevVal
      });

      const kb = new InlineKeyboard()
        .text("🔄 Yes, Meter Reset", "conf:reset:1")
        .text("❌ Cancel", "conf:cancel:1");

      await ctx.reply(
        `⚠️ *Potential Meter Reset Detected!*\n\n` +
        `Reading \`${readingNum}\` is LOWER than last recorded reading \`${prevVal}\` for Room *${room.roomId}* (${prevMonthKey}).\n\n` +
        `Is this a meter replacement or reset?`,
        { parse_mode: 'Markdown', reply_markup: kb }
      );
      return;
    }

    // Check Large Jump (> 50 meter units = 500 water units)
    if (prevVal !== null && (readingNum - prevVal) > 50) {
      await setSession(chatId, {
        step: 'awaiting_confirmation',
        roomNo: room.roomNo,
        roomId: room.roomId,
        tenantId: tenant.id,
        tenantName: tenant.tenant || 'Tenant',
        currentMonthKey,
        readingNum,
        prevVal
      });

      const kb = new InlineKeyboard()
        .text("✅ Confirm & Save", "conf:save:1")
        .text("❌ Cancel", "conf:cancel:1");

      await ctx.reply(
        `⚠️ *Large Consumption Warning!*\n\n` +
        `Reading \`${readingNum}\` is +${(readingNum - prevVal).toFixed(1)} meter units higher than previous (\`${prevVal}\`).\n\n` +
        `This equals *${Math.round((readingNum - prevVal) * WATER_UNITS_MULTIPLIER)} water units*.\n` +
        `Are you sure this reading is correct?`,
        { parse_mode: 'Markdown', reply_markup: kb }
      );
      return;
    }

    // Check Overwrite
    if (existingCurrent !== null && Number(existingCurrent) !== readingNum) {
      await setSession(chatId, {
        step: 'awaiting_confirmation',
        roomNo: room.roomNo,
        roomId: room.roomId,
        tenantId: tenant.id,
        tenantName: tenant.tenant || 'Tenant',
        currentMonthKey,
        readingNum,
        prevVal
      });

      const kb = new InlineKeyboard()
        .text("📝 Overwrite Reading", "conf:save:1")
        .text("❌ Cancel", "conf:cancel:1");

      await ctx.reply(
        `⚠️ *Existing Reading Warning!*\n\n` +
        `Room *${room.roomId}* already has a reading of \`${existingCurrent}\` for *${currentMonthKey}*.\n\n` +
        `Do you want to overwrite it with \`${readingNum}\`?`,
        { parse_mode: 'Markdown', reply_markup: kb }
      );
      return;
    }

    // Direct save
    try {
      const result = await saveWaterReading({
        tenant,
        roomNo: room.roomNo,
        roomId: room.roomId,
        monthKey: currentMonthKey,
        readingNum,
        isReset: false,
        telegramUser
      });

      const { deltaResult } = result;
      let reply = `✅ *Water Reading Saved Successfully!*\n\n` +
                  `🏠 *Room:* ${room.roomId} (${room.roomNo})\n` +
                  `👤 *Tenant:* ${tenant.tenant || 'Occupied'}\n` +
                  `📊 *Reading:* \`${readingNum}\`\n` +
                  `📅 *Billing Cycle:* ${currentMonthKey}\n`;

      if (deltaResult?.meterDelta !== null) {
        reply += `📈 *Meter Delta:* +${deltaResult.meterDelta.toFixed(1)} units\n`;
        reply += `💧 *Water Units:* ${deltaResult.units} units\n`;
        reply += `💰 *Water Charge:* ₹${deltaResult.amount}\n`;
      }

      await ctx.reply(reply, { parse_mode: 'Markdown' });
    } catch (err) {
      console.error("Direct save failed:", err);
      await ctx.reply("❌ Error saving reading: " + err.message);
    }
  }

  // Text message handler (for multi-step input)
  bot.on('message:text', async (ctx) => {
    const chatId = ctx.chat.id;
    const text = ctx.message.text.trim();
    const telegramUser = ctx.state.telegramUser || await getTelegramUser(chatId);

    const session = await getSession(chatId);

    if (!session || session.step !== 'awaiting_reading_value') {
      // Unsolicited text without active flow
      await ctx.reply(
        "💡 *Need to submit a water meter reading?*\n\n" +
        "• Send /reading to pick a room from the menu.\n" +
        "• Or send \`/reading <room> <reading>\` directly (e.g. \`/reading G01 104.5\`).",
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const readingNum = Number(text);
    if (!Number.isFinite(readingNum) || readingNum < 0) {
      await ctx.reply("❌ Invalid format. Please enter a valid non-negative number (e.g. `1041.5`) or send /cancel to abort.", { parse_mode: 'Markdown' });
      return;
    }

    const { roomNo, roomId, tenantId, tenantName, currentMonthKey, prevVal, existingCurrent } = session;
    const { tenantsByRoomNo } = await getOccupiedTenants();
    const tenant = tenantsByRoomNo[roomNo];

    if (!tenant) {
      await clearSession(chatId);
      await ctx.reply("❌ Tenant record not found. Operation cancelled.");
      return;
    }

    // Check Lower than Previous -> Ask Reset
    if (prevVal !== null && readingNum < prevVal) {
      await setSession(chatId, {
        step: 'awaiting_confirmation',
        roomNo,
        roomId,
        tenantId,
        tenantName,
        currentMonthKey,
        readingNum,
        prevVal
      });

      const kb = new InlineKeyboard()
        .text("🔄 Yes, Meter Reset", "conf:reset:1")
        .text("❌ Cancel", "conf:cancel:1");

      await ctx.reply(
        `⚠️ *Potential Meter Reset Detected!*\n\n` +
        `Reading \`${readingNum}\` is LOWER than last recorded reading \`${prevVal}\` for Room *${roomId}*.\n\n` +
        `Is this a meter replacement or reset?`,
        { parse_mode: 'Markdown', reply_markup: kb }
      );
      return;
    }

    // Check Large Jump (> 50 meter units = 500 units)
    if (prevVal !== null && (readingNum - prevVal) > 50) {
      await setSession(chatId, {
        step: 'awaiting_confirmation',
        roomNo,
        roomId,
        tenantId,
        tenantName,
        currentMonthKey,
        readingNum,
        prevVal
      });

      const kb = new InlineKeyboard()
        .text("✅ Confirm & Save", "conf:save:1")
        .text("❌ Cancel", "conf:cancel:1");

      await ctx.reply(
        `⚠️ *Large Consumption Warning!*\n\n` +
        `Reading \`${readingNum}\` is +${(readingNum - prevVal).toFixed(1)} higher than previous (\`${prevVal}\`).\n\n` +
        `This equals *${Math.round((readingNum - prevVal) * WATER_UNITS_MULTIPLIER)} water units*.\n` +
        `Are you sure this reading is correct?`,
        { parse_mode: 'Markdown', reply_markup: kb }
      );
      return;
    }

    // Check Overwrite
    if (existingCurrent !== null && existingCurrent !== readingNum) {
      await setSession(chatId, {
        step: 'awaiting_confirmation',
        roomNo,
        roomId,
        tenantId,
        tenantName,
        currentMonthKey,
        readingNum,
        prevVal
      });

      const kb = new InlineKeyboard()
        .text("📝 Overwrite Reading", "conf:save:1")
        .text("❌ Cancel", "conf:cancel:1");

      await ctx.reply(
        `⚠️ *Existing Reading Warning!*\n\n` +
        `Room *${roomId}* already has a reading of \`${existingCurrent}\` for *${currentMonthKey}*.\n\n` +
        `Do you want to overwrite it with \`${readingNum}\`?`,
        { parse_mode: 'Markdown', reply_markup: kb }
      );
      return;
    }

    // Direct save
    try {
      const result = await saveWaterReading({
        tenant,
        roomNo,
        roomId,
        monthKey: currentMonthKey,
        readingNum,
        isReset: false,
        telegramUser
      });

      await clearSession(chatId);

      const { deltaResult } = result;
      let reply = `✅ *Water Reading Saved Successfully!*\n\n` +
                  `🏠 *Room:* ${roomId} (${roomNo})\n` +
                  `👤 *Tenant:* ${tenantName}\n` +
                  `📊 *Reading:* \`${readingNum}\`\n` +
                  `📅 *Billing Cycle:* ${currentMonthKey}\n`;

      if (deltaResult?.meterDelta !== null) {
        reply += `📈 *Meter Delta:* +${deltaResult.meterDelta.toFixed(1)} units\n`;
        reply += `💧 *Water Units:* ${deltaResult.units} units\n`;
        reply += `💰 *Water Charge:* ₹${deltaResult.amount}\n`;
      }

      await ctx.reply(reply, { parse_mode: 'Markdown' });
    } catch (err) {
      console.error("Direct save error:", err);
      await ctx.reply("❌ Error saving reading: " + err.message);
    }
  });

  return bot;
}

module.exports = {
  createTelegramBot,
  computeWaterReadingDelta,
  normalizeRoomIdentifier,
  getDefaultWaterRateForRoom,
  getWaterMonthKey,
  getPrevYearMonth,
  getKolkataDateParts,
  IMMUTABLE_ROOMS_DATA
};
