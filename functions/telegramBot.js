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
const RENT_WATER_SERVICE_CHARGE = 60;
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

/**
 * Returns the active billing cycle for water meter readings and monthly billing.
 * (e.g. In September 2026, the active reading cycle is 2026-Aug, with 2026-Jul as baseline).
 */
function getActiveWaterCycleDateParts() {
  const { year, monthIndex, day, dateObj } = getKolkataDateParts();
  const cycleYM = getPrevYearMonth(year, monthIndex);
  const baselineYM = getPrevYearMonth(cycleYM.year, cycleYM.monthIndex);
  return {
    cycleYear: cycleYM.year,
    cycleMonthIndex: cycleYM.monthIndex,
    cycleKey: getWaterMonthKey(cycleYM.year, cycleYM.monthIndex),
    baselineYear: baselineYM.year,
    baselineMonthIndex: baselineYM.monthIndex,
    baselineKey: getWaterMonthKey(baselineYM.year, baselineYM.monthIndex),
    currentCalendarYear: year,
    currentCalendarMonthIndex: monthIndex,
    currentCalendarKey: getWaterMonthKey(year, monthIndex),
    day,
    dateObj
  };
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
    return { meterDelta: cur, units, amount, isMeterReset: true, isNearZero: cur === 0 };
  }

  if (!Number.isFinite(prev)) {
    return { meterDelta: null, units: null, amount: null, isMeterReset: false, isNearZero: false };
  }

  const meterDelta = Math.round((cur - prev) * 10) / 10;
  const units = Math.round(meterDelta * WATER_UNITS_MULTIPLIER * 10) / 10;
  const amount = Math.round(units * waterRate);
  const isNearZero = meterDelta >= 0 && meterDelta <= 0.1;

  return { meterDelta, units, amount, isMeterReset: false, isNearZero };
}

function computeWaterForMonth(tenantData, year, monthIndex, waterRate) {
  const readings = (tenantData && tenantData.waterReadings) || {};
  const resetMap = (tenantData && tenantData.waterMeterReset) || {};
  const currentKey = getWaterMonthKey(year, monthIndex);
  const prev = getPrevYearMonth(year, monthIndex);
  const prevKey = getWaterMonthKey(prev.year, prev.monthIndex);

  const currentReading = readings[currentKey];
  const prevReading = readings[prevKey];

  const hasCurrent = currentReading !== null && currentReading !== undefined && currentReading !== '';
  const hasPrev = prevReading !== null && prevReading !== undefined && prevReading !== '';

  const currentNum = hasCurrent ? Number(currentReading) : NaN;
  const prevNum = hasPrev ? Number(prevReading) : NaN;

  const isMeterReset = Boolean(resetMap[currentKey]);
  const rate = Number.isFinite(waterRate) ? waterRate : DEFAULT_WATER_RATE;

  if (isMeterReset) {
    if (!Number.isFinite(currentNum)) return { units: null, amount: null, meterReset: true };
    const units = Math.round(currentNum * WATER_UNITS_MULTIPLIER * 10) / 10;
    const amount = Math.round(units * rate);
    return { units, amount, meterReset: true };
  }

  if (!Number.isFinite(currentNum) || !Number.isFinite(prevNum)) {
    return { units: null, amount: null, meterReset: false };
  }

  const units = Math.round((currentNum - prevNum) * WATER_UNITS_MULTIPLIER * 10) / 10;
  const amount = Math.round(units * rate);
  return { units, amount, meterReset: false };
}

function isMonthBeforeJoinDate(key, joinDate) {
  if (!joinDate) return false;
  const [yearStr, monthName] = key.split('-');
  const year = parseInt(yearStr, 10);
  const monthIndex = MONTHS_LIST.indexOf(monthName);
  if (monthIndex === -1) return false;

  const join = new Date(joinDate);
  if (Number.isNaN(join.getTime())) return false;
  const joinYear = join.getFullYear();
  const joinMonth = join.getMonth();

  return year < joinYear || (year === joinYear && monthIndex < joinMonth);
}

function isFirstOccupancyMonth(tenant, year, monthIndex) {
  if (!tenant || !tenant.joinDate) return false;
  const join = new Date(tenant.joinDate);
  if (Number.isNaN(join.getTime())) return false;
  return join.getFullYear() === year && join.getMonth() === monthIndex;
}

function getProratedRent(baseRent, joinDate, deductionDays = 0) {
  if (!joinDate) return baseRent;
  const date = new Date(joinDate);
  const day = date.getDate();
  if (day === 1 && (!deductionDays || deductionDays === 0)) return baseRent;

  const year = date.getFullYear();
  const month = date.getMonth();
  const totalDaysInMonth = new Date(year, month + 1, 0).getDate();

  let daysToCharge;
  if (deductionDays && deductionDays > 0) {
    daysToCharge = Math.max(0, totalDaysInMonth - deductionDays);
  } else {
    daysToCharge = (totalDaysInMonth - day) + 1;
  }

  const dailyRate = baseRent / totalDaysInMonth;
  return Math.round(dailyRate * daysToCharge);
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

function getValidRoomListString() {
  return Object.values(IMMUTABLE_ROOMS_DATA).map(r => r.roomId).join(', ');
}

// Bulk Reading Parser
function parseBulkReadingLines(text, maxLines = 20) {
  if (!text || typeof text !== 'string') return { validLines: [], errorLines: [] };

  const rawLines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const validLines = [];
  const errorLines = [];
  const seenUnits = new Map();

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];

    if (i >= maxLines) {
      errorLines.push({
        raw: line,
        error: `Exceeded max batch limit of ${maxLines} lines. Please submit remainder in a separate batch.`
      });
      continue;
    }

    const cleaned = line.replace(/^(\d+[\.\)]|[\*\-\•])\s*/, '').trim();
    const match = cleaned.match(/^([a-zA-Z0-9#\s]+?)[\s:=–-]+(\d+(?:\.\d+)?)$/);
    if (!match) {
      errorLines.push({
        raw: line,
        error: 'Invalid format. Use "Unit: Reading" (e.g. G01: 1041.2)'
      });
      continue;
    }

    const unitStr = match[1].trim();
    const readingVal = Number(match[2]);

    const normalized = normalizeRoomIdentifier(unitStr);
    if (!normalized) {
      errorLines.push({
        raw: line,
        unit: unitStr,
        error: `Unknown room code "${unitStr}"`
      });
      continue;
    }

    if (!Number.isFinite(readingVal) || readingVal < 0) {
      errorLines.push({
        raw: line,
        unit: normalized.roomId,
        error: 'Reading must be a non-negative number'
      });
      continue;
    }

    if (seenUnits.has(normalized.roomNo)) {
      errorLines.push({
        raw: line,
        unit: normalized.roomId,
        error: `Duplicate room code in batch (already listed earlier as ${seenUnits.get(normalized.roomNo)})`
      });
      continue;
    }

    seenUnits.set(normalized.roomNo, readingVal);
    validLines.push({
      raw: line,
      roomNo: normalized.roomNo,
      roomId: normalized.roomId,
      readingNum: readingVal
    });
  }

  return { validLines, errorLines };
}

// Month Parsing Helper
function parseMonthFromText(text, defaultYear, defaultMonthIndex) {
  if (!text) return { year: defaultYear, monthIndex: defaultMonthIndex, monthKey: getWaterMonthKey(defaultYear, defaultMonthIndex) };
  let targetYear = defaultYear;
  let targetMonthIndex = defaultMonthIndex;

  const ymdMatch = text.match(/\b(\d{4})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i);
  if (ymdMatch) {
    targetYear = parseInt(ymdMatch[1], 10);
    const mName = ymdMatch[2].slice(0, 3);
    const idx = MONTHS_LIST.findIndex(m => m.toLowerCase() === mName.toLowerCase());
    if (idx !== -1) targetMonthIndex = idx;
  } else {
    const monthPattern = /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b/i;
    const mMatch = text.match(monthPattern);
    if (mMatch) {
      const prefix = mMatch[1].slice(0, 3).toLowerCase();
      const idx = MONTHS_LIST.findIndex(m => m.toLowerCase() === prefix);
      if (idx !== -1) targetMonthIndex = idx;
    }
  }
  return { year: targetYear, monthIndex: targetMonthIndex, monthKey: getWaterMonthKey(targetYear, targetMonthIndex) };
}

// Rent Status Message Parser
function parseRentStatusMessage(text, defaultYear, defaultMonthIndex) {
  if (!text || typeof text !== 'string') return { ok: false, reason: 'empty' };

  let raw = text.trim();

  // Strip leading /rent command if present
  if (raw.toLowerCase().startsWith('/rent')) {
    raw = raw.replace(/^\/rent\s*/i, '').trim();
  }

  if (!raw) return { ok: false, reason: 'empty' };

  // Split tokens to extract room code first
  // Supported prefixes: "Room G01", "Unit 01", "G01", "102", "01"
  const tokens = raw.split(/\s+/);
  let roomToken = tokens[0];
  let remainingTokens = tokens.slice(1);

  if (/^(ROOM|UNIT|#)$/i.test(roomToken) && tokens.length > 1) {
    roomToken = `${tokens[0]} ${tokens[1]}`;
    remainingTokens = tokens.slice(2);
  }

  const normalized = normalizeRoomIdentifier(roomToken);
  if (!normalized) {
    return { ok: false, reason: 'unknown_room', unitStr: roomToken, raw };
  }

  const restText = remainingTokens.join(' ').trim();
  if (!restText) {
    return { ok: false, reason: 'missing_status', roomNo: normalized.roomNo, roomId: normalized.roomId };
  }

  // Parse Month if mentioned (e.g. Aug, August, Sep, 2026-Aug)
  let targetYear = defaultYear;
  let targetMonthIndex = defaultMonthIndex;
  let cleanedRest = restText;

  const ymdMatch = cleanedRest.match(/\b(\d{4})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i);
  if (ymdMatch) {
    targetYear = parseInt(ymdMatch[1], 10);
    const mName = ymdMatch[2].slice(0, 3);
    const idx = MONTHS_LIST.findIndex(m => m.toLowerCase() === mName.toLowerCase());
    if (idx !== -1) targetMonthIndex = idx;
    cleanedRest = cleanedRest.replace(ymdMatch[0], '').trim();
  } else {
    const monthPattern = /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b/i;
    const mMatch = cleanedRest.match(monthPattern);
    if (mMatch) {
      const prefix = mMatch[1].slice(0, 3).toLowerCase();
      const idx = MONTHS_LIST.findIndex(m => m.toLowerCase() === prefix);
      if (idx !== -1) targetMonthIndex = idx;
      cleanedRest = cleanedRest.replace(mMatch[0], '').trim();
    }
  }

  // Parse optional trailing amount (e.g. "6533", "₹8500")
  let enteredAmount = null;
  const amtMatch = cleanedRest.match(/(?:₹|\bRS\.?\s*)?(\d+(?:\.\d+)?)\s*$/i);
  if (amtMatch) {
    enteredAmount = Number(amtMatch[1]);
    cleanedRest = cleanedRest.slice(0, amtMatch.index).trim();
  }

  // Identify Target Status
  let targetStatus = null;

  // 1. Paid (Rent + Water)
  if (/^(paid|fully\s*paid|rent\s*(and|\+)\s*water\s*(received|paid)|rent\s*&\s*water\s*(received|paid))$/i.test(cleanedRest)) {
    targetStatus = 'Paid';
  }
  // 2. Rent Only
  else if (/^(rent\s*received|rent\s*only|rent\s*paid|rent)$/i.test(cleanedRest)) {
    targetStatus = 'Rent Only';
  }
  // 3. Pending
  else if (/^(pending|due|not\s*paid|unpaid)$/i.test(cleanedRest)) {
    targetStatus = 'Pending';
  }

  if (!targetStatus) {
    return { ok: false, reason: 'unknown_status', roomNo: normalized.roomNo, roomId: normalized.roomId, rawPhrase: restText };
  }

  const monthKey = getWaterMonthKey(targetYear, targetMonthIndex);

  return {
    ok: true,
    roomNo: normalized.roomNo,
    roomId: normalized.roomId,
    targetStatus,
    year: targetYear,
    monthIndex: targetMonthIndex,
    monthKey,
    enteredAmount
  };
}

// Reporting Queries Parser (Feature 4)
function parseReportingQuery(text) {
  if (!text || typeof text !== 'string') return null;
  const raw = text.trim();

  // 1. Pending query: /pending, which rooms are pending, who hasn't paid, unpaid
  if (/^\/pending\b/i.test(raw) || /(?:which|what|list)\s*(?:rooms|units)?\s*(?:are\s*)?pending/i.test(raw) || /who\s*(?:has\s*not|hasn't)\s*paid/i.test(raw) || /unpaid\s*(?:rooms|units|rent)?/i.test(raw)) {
    return { type: 'pending', raw };
  }

  // 2. Rent Only query: /rentonly, who's paid rent only, which rooms owe water
  if (/^\/rentonly\b/i.test(raw) || /who(?:'s|\s+has)\s*paid\s*rent\s*only/i.test(raw) || /(?:which|what)\s*(?:rooms|units)?\s*(?:owe|pending)\s*water/i.test(raw) || /rent\s*only\s*(?:list|rooms|units)?/i.test(raw)) {
    return { type: 'rent_only', raw };
  }

  // 3. Summary query: /summary, give me a summary, how's this month looking
  if (/^\/summary\b/i.test(raw) || /(?:give\s*me\s*a\s*summary|how(?:'s|\s+is)\s*this\s*month\s*looking|monthly\s*summary|collection\s*summary)/i.test(raw)) {
    return { type: 'summary', raw };
  }

  // 4. Total query: /total, current month total rent, how much collected this month
  if (/^\/total\b/i.test(raw) || /(?:current\s*month\s*)?total\s*(?:rent|collection|revenue)/i.test(raw) || /how\s*much\s*(?:is\s*)?collected/i.test(raw)) {
    return { type: 'total', raw };
  }

  // 5. Unit Status query: /unit <room>, G01 status, how's G01 doing
  const unitMatch = raw.match(/^(?:\/unit\s+|)(?:room\s+|unit\s+|#|)([a-z0-9]{2,4})\s+(?:status|details|bill|doing)/i) ||
                    raw.match(/^(?:\/unit\s+)([a-z0-9]{2,4})\b/i) ||
                    raw.match(/(?:how(?:'s|\s+is)\s+)([a-z0-9]{2,4})\s+doing/i);
  if (unitMatch) {
    const norm = normalizeRoomIdentifier(unitMatch[1]);
    if (norm) {
      return { type: 'unit', roomNo: norm.roomNo, roomId: norm.roomId, raw };
    }
  }

  return null;
}

// WhatsApp Helper & Formatter (Feature 3)
function normalizePhoneNumber(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  if (digits.length >= 10 && digits.length <= 15) return digits;
  return null;
}

function formatTenantWhatsAppBill(tenant, year, monthIndex) {
  const monthKey = getWaterMonthKey(year, monthIndex);
  let baseRent = Number(tenant.rent) || 0;
  if (isFirstOccupancyMonth(tenant, year, monthIndex) && tenant.joinDate) {
    baseRent = getProratedRent(baseRent, tenant.joinDate);
  }

  const effectiveWaterRate = Number(tenant.waterRate) || getDefaultWaterRateForRoom(tenant.roomNo);
  const waterCalc = computeWaterForMonth(tenant, year, monthIndex, effectiveWaterRate);
  const waterUnits = waterCalc?.units ?? 0;
  const waterCharge = waterCalc?.amount ?? 0;
  const serviceCharge = RENT_WATER_SERVICE_CHARGE;
  const total = baseRent + waterCharge + serviceCharge;

  return {
    monthKey,
    tenantName: tenant.tenant || 'Tenant',
    roomId: tenant.roomId,
    roomNo: tenant.roomNo,
    baseRent,
    waterUnits,
    waterCharge,
    serviceCharge,
    total,
    phone: tenant.phone || null,
    formattedText:
      `🏢 *Munirathnam Illam — Monthly Rent & Water Bill*\n\n` +
      `Dear ${tenant.tenant || 'Tenant'},\n` +
      `Here is the bill breakdown for *${monthKey}* (Room *${tenant.roomId}*):\n\n` +
      `• *Base Rent:* ₹${baseRent.toLocaleString('en-IN')}\n` +
      `• *Water Consumption:* ${waterUnits} units (₹${waterCharge.toLocaleString('en-IN')})\n` +
      `• *Service Charge:* ₹${serviceCharge}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `💰 *Total Amount Due:* *₹${total.toLocaleString('en-IN')}*\n\n` +
      `Please transfer the amount at your earliest convenience.\n` +
      `Thank you!\n` +
      `_— Munirathnam Illam Management_`
  };
}

async function sendWhatsAppViaMicroservice(phone, message) {
  const serviceUrl = process.env.WHATSAPP_SERVICE_URL || 'http://localhost:3001';
  const apiKey = process.env.WHATSAPP_API_KEY || 'munirathnam_secret_wa_key_2026';

  const cleanPhone = normalizePhoneNumber(phone);
  if (!cleanPhone) {
    return { ok: false, error: 'Invalid or missing phone number' };
  }

  const fetch = globalThis.fetch || require('node-fetch');
  try {
    const response = await fetch(`${serviceUrl.replace(/\/$/, '')}/send-whatsapp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify({
        phone: cleanPhone,
        message
      })
    });

    const resData = await response.json().catch(() => ({}));
    if (!response.ok || !resData.ok) {
      return { ok: false, error: resData.error || `HTTP ${response.status}: Failed to send WhatsApp message` };
    }
    return { ok: true, messageId: resData.messageId };
  } catch (err) {
    return { ok: false, error: `WhatsApp service error: ${err.message}` };
  }
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
  const snap = await admin.firestore().collection('properties').get();
  const tenantsByRoomNo = {};
  const tenantsByRoomId = {};
  const allTenants = [];
  snap.docs.forEach(doc => {
    const data = { id: doc.id, ...doc.data() };
    const roomNo = String(data.roomNo || '').padStart(2, '0');
    const roomId = String(data.roomId || '').trim();
    if (roomNo) tenantsByRoomNo[roomNo] = data;
    if (roomId) tenantsByRoomId[roomId] = data;
    allTenants.push(data);
  });
  return { tenantsByRoomNo, tenantsByRoomId, allTenants };
}

// Core Save Water Reading Logic
async function saveWaterReading({ tenant, roomNo, roomId, monthKey, readingNum, isReset, telegramUser, anomalyTag = null }) {
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
    isNearZero: deltaResult?.isNearZero ?? false,
    anomalyTag: anomalyTag || (deltaResult?.isNearZero ? 'zero_consumption' : null),
    submittedBy: {
      chatId: String(telegramUser.chatId),
      email: telegramUser.email || null,
      role: telegramUser.role || 'Owner',
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

// Core Save Rent Status Logic
async function saveRentStatus({ tenant, roomNo, roomId, monthKey, year, monthIndex, targetStatus, enteredAmount, telegramUser }) {
  let baseRent = Number(tenant?.rent) || 0;

  if (isFirstOccupancyMonth(tenant, year, monthIndex) && tenant?.joinDate) {
    baseRent = getProratedRent(baseRent, tenant.joinDate);
  }

  let finalTotal = 0;
  let waterCharge = 0;

  if (targetStatus === 'Paid') {
    const effectiveWaterRate = Number(tenant?.waterRate) || getDefaultWaterRateForRoom(roomNo);
    const waterCalc = computeWaterForMonth(tenant, year, monthIndex, effectiveWaterRate);
    waterCharge = waterCalc?.amount || 0;
    const serviceCharge = RENT_WATER_SERVICE_CHARGE;

    finalTotal = enteredAmount !== null && Number.isFinite(enteredAmount)
      ? enteredAmount
      : (baseRent + waterCharge + serviceCharge);
  } else if (targetStatus === 'Rent Only') {
    finalTotal = enteredAmount !== null && Number.isFinite(enteredAmount)
      ? enteredAmount
      : baseRent;
  } else {
    finalTotal = 0;
  }

  const oldStatus = tenant?.paymentHistory?.[monthKey] || 'Pending';
  const oldTotal = tenant?.paymentTotals?.[monthKey] || 0;

  const updatePayload = {
    [`paymentHistory.${monthKey}`]: targetStatus,
    [`paymentTotals.${monthKey}`]: finalTotal,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: `telegram:${telegramUser.email || telegramUser.chatId}`
  };

  await admin.firestore().collection('properties').doc(tenant.id).update(updatePayload);

  // Write audit trail
  await admin.firestore().collection('rentStatusAudit').add({
    tenantId: tenant.id,
    roomId: roomId,
    roomNo: roomNo,
    tenantName: tenant.tenant || 'Unknown',
    monthKey: monthKey,
    oldStatus: oldStatus,
    newStatus: targetStatus,
    oldTotal: oldTotal,
    newTotal: finalTotal,
    expectedRent: baseRent,
    waterCharge: waterCharge,
    enteredAmount: enteredAmount !== null ? enteredAmount : null,
    submittedBy: {
      chatId: String(telegramUser.chatId),
      email: telegramUser.email || null,
      role: telegramUser.role || 'Owner',
      name: [telegramUser.firstName, telegramUser.lastName].filter(Boolean).join(' ') || telegramUser.username || 'Telegram User',
      username: telegramUser.username || null
    },
    source: 'telegram_bot',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return {
    oldStatus,
    oldTotal,
    newStatus: targetStatus,
    newTotal: finalTotal,
    baseRent,
    waterCharge
  };
}

// Command list for Telegram "/" native menu
const BOT_COMMANDS = [
  { command: 'start', description: 'Welcome overview & quick guide' },
  { command: 'reading', description: 'Submit water meter reading for one unit' },
  { command: 'bulk', description: 'Bulk submit readings for multiple units' },
  { command: 'rent', description: 'Update rent payment status for a unit' },
  { command: 'notify', description: 'Send rent breakdown via WhatsApp (Admin)' },
  { command: 'pending', description: 'List units with pending rent this month' },
  { command: 'rentonly', description: 'List units that paid rent only (water owed)' },
  { command: 'summary', description: 'Overview: counts + collected vs expected' },
  { command: 'total', description: 'This month collected vs expected total' },
  { command: 'unit', description: 'Look up one unit status (e.g. /unit G01)' },
  { command: 'status', description: 'View monthly water meter status' },
  { command: 'help', description: 'List all commands and example phrasings' },
  { command: 'link', description: 'Link Telegram account with staff code' },
  { command: 'cancel', description: 'Cancel active conversation flow' }
];

async function registerBotCommands(bot) {
  try {
    await bot.api.setMyCommands(BOT_COMMANDS);
    await bot.api.setChatMenuButton({ menu_button: { type: 'commands' } });
    console.log('[Telegram Bot] Native commands menu and Menu button registered successfully.');
  } catch (err) {
    console.warn('[Telegram Bot] Warning registering commands menu:', err.message);
  }
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
    return await next();
  });

  // /start command
  bot.command('start', async (ctx) => {
    const name = ctx.from?.first_name || 'Owner';
    await ctx.reply(
      `👋 *Welcome to Munirathnam Illam Rental Bot, ${name}!* 🏢\n\n` +
      `You have full access as *Owner*.\n\n` +
      `*⚡ Water Meter Readings:*\n` +
      `• /reading — Interactive room picker\n` +
      `• \`/reading <room> <val>\` — Single entry (e.g. \`/reading G01 105.4\`)\n` +
      `• /bulk — Bulk paste multiple unit readings\n` +
      `• /status — View current month's water readings\n\n` +
      `*💰 Rent Status Updates:*\n` +
      `• \`G01 Rent Received\` — Mark Rent Only (base rent)\n` +
      `• \`G01 Paid\` — Mark Paid (rent + water + service charge)\n` +
      `• \`G01 Pending\` — Revert to Pending\n` +
      `• /rent — Interactive rent status menu\n\n` +
      `*📲 WhatsApp Tenant Notifications:*\n` +
      `• \`/notify G01\` — Preview & send bill to tenant via WhatsApp\n` +
      `• \`/notify all\` — Broadcast bills to all active tenants\n\n` +
      `*📊 Reporting & Lookups:*\n` +
      `• /pending — List unpaid units\n` +
      `• /rentonly — List units owing water\n` +
      `• /summary — Overall status counts & collection %\n` +
      `• /total — Collected vs expected revenue\n` +
      `• \`/unit G01\` — Look up specific unit status\n\n` +
      `_Type any command or query to begin._`,
      { parse_mode: 'Markdown' }
    );
  });

  // /help command
  bot.command('help', async (ctx) => {
    await ctx.reply(
      `📖 *Munirathnam Illam Bot Guide*\n\n` +
      `*🚰 Water Meter Commands:*\n` +
      `• /reading — Interactive unit selection\n` +
      `• \`/reading <unit> <val>\` — Shorthand (e.g. \`/reading G01 104.5\`)\n` +
      `• /bulk — Paste multiple unit readings at once\n` +
      `• /status — View recorded water meter readings\n\n` +
      `*💰 Rent Payment Status Messages:*\n` +
      `• \`<Unit> Rent Received\` ➔ Sets *Rent Only* (e.g. \`G01 Rent Received 6533\`)\n` +
      `• \`<Unit> Paid\` ➔ Sets *Paid* (e.g. \`G01 Paid 9060\` or \`102 Paid\`)\n` +
      `• \`<Unit> Pending\` ➔ Sets *Pending* (e.g. \`G01 Pending\`)\n` +
      `• \`/rent <unit> <status> [month] [amount]\` (e.g. \`/rent G01 Paid Aug 8500\`)\n\n` +
      `*📲 WhatsApp Notifications:*\n` +
      `• \`/notify <unit> [month]\` — Preview & send bill to tenant\n` +
      `• \`/notify all [month]\` — Send bills to all occupied tenants\n\n` +
      `*📊 Instant Reporting Queries:*\n` +
      `• /pending (or "which rooms are pending")\n` +
      `• /rentonly (or "who's paid rent only")\n` +
      `• /summary (or "give me a summary")\n` +
      `• /total (or "how much collected this month")\n` +
      `• \`/unit <room>\` (or "G01 status")`,
      { parse_mode: 'Markdown' }
    );
  });

  // /link command
  bot.command('link', async (ctx) => {
    const raw = (ctx.message?.text || '').trim();
    const parts = raw.split(/\s+/).filter(Boolean);

    if (parts.length < 2) {
      await ctx.reply("💬 Please provide your 6-character linking code:\n\n`/link <CODE>`", { parse_mode: 'Markdown' });
      return;
    }

    const code = parts[1].toUpperCase();
    const codeSnap = await admin.firestore().collection('telegramAuthCodes').doc(code).get();

    if (!codeSnap.exists) {
      await ctx.reply("❌ Invalid or expired linking code. Please ask the Admin to generate a new one.");
      return;
    }

    const codeData = codeSnap.data();
    if (codeData.expiresAt && new Date(codeData.expiresAt).getTime() < Date.now()) {
      await ctx.reply("⏳ This linking code has expired. Please ask the Admin to generate a new one.");
      return;
    }

    const chatId = ctx.chat.id;
    await admin.firestore().collection('telegramUsers').doc(String(chatId)).set({
      chatId: String(chatId),
      email: codeData.email,
      role: codeData.role || 'Staff',
      username: ctx.from?.username || null,
      firstName: ctx.from?.first_name || 'Staff',
      lastName: ctx.from?.last_name || null,
      linkedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    await admin.firestore().collection('telegramAuthCodes').doc(code).delete();
    await ctx.reply(`✅ Linked successfully as *${codeData.role}* (${codeData.email})!`, { parse_mode: 'Markdown' });
  });

  // /cancel command
  bot.command('cancel', async (ctx) => {
    const chatId = ctx.chat.id;
    await clearSession(chatId);
    await ctx.reply("❌ Active operation cancelled. Send /reading, /bulk, /rent, or /notify to start over.");
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

  // /status command
  bot.command('status', async (ctx) => {
    const rawText = (ctx.message?.text || '').trim();
    const { cycleKey, cycleYear, cycleMonthIndex } = getActiveWaterCycleDateParts();
    const monthObj = parseMonthFromText(rawText, cycleYear, cycleMonthIndex);
    const targetMonthKey = monthObj.monthKey;

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

      const val = tenant.waterReadings?.[targetMonthKey];
      if (val !== undefined && val !== null && val !== '') {
        recordedCount++;
        const resetNote = tenant.waterMeterReset?.[targetMonthKey] ? ' 🔄 (Reset)' : '';
        lines.push(`✅ *${room.roomId}* (${room.roomNo}): \`${val}\`${resetNote} _(${tenant.tenant || 'Tenant'})_`);
      } else {
        lines.push(`⏳ *${room.roomId}* (${room.roomNo}): _Pending_ _(${tenant.tenant || 'Tenant'})_`);
      }
    });

    await ctx.reply(
      `📊 *Water Meter Status (${targetMonthKey})*\n` +
      `Recorded: *${recordedCount} / ${allTenants.length}* occupied rooms\n\n` +
      lines.join('\n') +
      `\n\n_Use /reading or /bulk to enter readings._`,
      { parse_mode: 'Markdown' }
    );
  });

  // /bulk command
  bot.command('bulk', async (ctx) => {
    const chatId = ctx.chat.id;
    const { cycleKey } = getActiveWaterCycleDateParts();

    await setSession(chatId, {
      step: 'awaiting_bulk_input',
      cycleKey
    });

    await ctx.reply(
      `📝 *Bulk Water Meter Entry (${cycleKey})*\n\n` +
      `Please paste your readings, one line per unit:\n\n` +
      `*Example:*\n` +
      `\`G01: 1041.2\`\n` +
      `\`102: 998.0\`\n` +
      `\`201: 1204.5\`\n` +
      `\`401: 520.0\`\n\n` +
      `_Send /cancel to abort._`,
      { parse_mode: 'Markdown' }
    );
  });

  // /rent command (Interactive Menu or Direct Command)
  bot.command('rent', async (ctx) => {
    const rawText = (ctx.message?.text || '').trim();
    const parts = rawText.split(/\s+/).filter(Boolean);

    // If arguments provided: /rent <room> <status> [month] [amount]
    if (parts.length >= 3) {
      return await handleRentStatusUpdate(ctx, rawText);
    }

    // Interactive Menu
    const { allTenants } = await getOccupiedTenants();
    const sortedRooms = Object.values(IMMUTABLE_ROOMS_DATA).sort((a, b) =>
      String(a.roomNo).localeCompare(String(b.roomNo), undefined, { numeric: true })
    );

    const { cycleKey } = getActiveWaterCycleDateParts();

    const keyboard = new InlineKeyboard();
    let col = 0;

    sortedRooms.forEach((r) => {
      const tenant = allTenants.find(t => t.roomNo === r.roomNo || t.roomId === r.roomId);
      const isOccupied = Boolean(tenant);
      const curStatus = tenant?.paymentHistory?.[cycleKey] || 'Pending';
      const icon = curStatus === 'Paid' ? '🟢' : (curStatus === 'Rent Only' ? '🟣' : (isOccupied ? '🟠' : '⚪'));

      keyboard.text(`${icon} ${r.roomId} (${r.roomNo})`, `sel_rent_room:${r.roomNo}`);
      col++;
      if (col % 3 === 0) keyboard.row();
    });

    keyboard.row().text("❌ Cancel", "flow_cancel");

    await ctx.reply(
      `💰 *Select a room to update Rent Status (${cycleKey}):*\n\n` +
      `🟢 = Paid | 🟣 = Rent Only | 🟠 = Pending | ⚪ = Vacant\n\n` +
      `_Format: Room ID (Room No) — e.g. G01 (01), 102 (04)_\n` +
      `_Or type directly: \`G01 Rent Received\` / \`102 Paid\`_`,
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
  });

  // -------------------------------------------------------------
  // FEATURE 4: REPORTING QUERY HANDLERS (READ-ONLY)
  // -------------------------------------------------------------

  async function handlePendingQuery(ctx, year, monthIndex) {
    const monthKey = getWaterMonthKey(year, monthIndex);
    const { allTenants } = await getOccupiedTenants();

    const pendingTenants = allTenants.filter(t => {
      if (isMonthBeforeJoinDate(monthKey, t.joinDate)) return false;
      const status = t.paymentHistory?.[monthKey];
      return !status || status === 'Pending' || status === 'None';
    });

    if (pendingTenants.length === 0) {
      await ctx.reply(`🎉 *No pending rents for ${monthKey}!* All active units are settled or paid rent.`, { parse_mode: 'Markdown' });
      return;
    }

    let msg = `📋 *Pending Rent Status (${monthKey})*\n` +
              `Total Pending: *${pendingTenants.length} unit(s)*\n\n`;

    pendingTenants.forEach(t => {
      const rNo = t.roomNo ? ` (${t.roomNo})` : '';
      msg += `🔸 *${t.roomId}${rNo}* — ${t.tenant || 'Tenant'} _(Rent: ₹${Number(t.rent || 0).toLocaleString('en-IN')})_\n`;
    });

    msg += `\n_💡 Send \`${pendingTenants[0].roomId} Rent Received\` to update._`;
    await ctx.reply(msg, { parse_mode: 'Markdown' });
  }

  async function handleRentOnlyQuery(ctx, year, monthIndex) {
    const monthKey = getWaterMonthKey(year, monthIndex);
    const { allTenants } = await getOccupiedTenants();

    const rentOnlyTenants = allTenants.filter(t => {
      if (isMonthBeforeJoinDate(monthKey, t.joinDate)) return false;
      return t.paymentHistory?.[monthKey] === 'Rent Only';
    });

    if (rentOnlyTenants.length === 0) {
      await ctx.reply(`ℹ️ *No units marked Rent Only for ${monthKey}.*`, { parse_mode: 'Markdown' });
      return;
    }

    let msg = `🟣 *Rent Only Units (${monthKey})*\n` +
              `Rent collected, water bill outstanding (${rentOnlyTenants.length} units):\n\n`;

    rentOnlyTenants.forEach(t => {
      const effectiveWaterRate = Number(t.waterRate) || getDefaultWaterRateForRoom(t.roomNo);
      const waterCalc = computeWaterForMonth(t, year, monthIndex, effectiveWaterRate);
      const waterCharge = waterCalc?.amount ?? 0;
      const serviceCharge = RENT_WATER_SERVICE_CHARGE;
      const outstandingWater = waterCharge + serviceCharge;

      const rNo = t.roomNo ? ` (${t.roomNo})` : '';
      msg += `• *${t.roomId}${rNo}* — ${t.tenant || 'Tenant'} (Owes Water: ₹${outstandingWater.toLocaleString('en-IN')})\n`;
    });

    msg += `\n_💡 Send \`${rentOnlyTenants[0].roomId} Paid\` when full settlement is received._`;
    await ctx.reply(msg, { parse_mode: 'Markdown' });
  }

  function computeFinancialsForMonth(allTenants, year, monthIndex) {
    const monthKey = getWaterMonthKey(year, monthIndex);
    let rentCollected = 0;
    let waterCollected = 0;
    let totalCollected = 0;
    let rentPending = 0;
    let expectedRent = 0;
    let paidCount = 0;
    let rentOnlyCount = 0;
    let pendingCount = 0;

    Object.keys(IMMUTABLE_ROOMS_DATA).forEach(roomNo => {
      const roomData = IMMUTABLE_ROOMS_DATA[roomNo];
      const tenant = allTenants.find(t => t.roomNo === roomData.roomNo || t.roomId === roomData.roomId);
      if (!tenant) return;

      const status = tenant.paymentHistory?.[monthKey] || null;
      const isPreMoveIn = isMonthBeforeJoinDate(monthKey, tenant.joinDate);
      if (isPreMoveIn && status !== 'Paid' && status !== 'Rent Only') {
        return;
      }

      let baseRent = Number(tenant.rent) || 0;
      if (isFirstOccupancyMonth(tenant, year, monthIndex) && tenant.joinDate) {
        baseRent = getProratedRent(baseRent, tenant.joinDate);
      }

      expectedRent += baseRent;

      const storedTotal = tenant.paymentTotals?.[monthKey];
      const effectiveWaterRate = Number(tenant.waterRate) || getDefaultWaterRateForRoom(roomNo);
      const waterCalc = computeWaterForMonth(tenant, year, monthIndex, effectiveWaterRate);
      const waterAmount = (Number.isFinite(waterCalc?.amount) && (waterCalc.amount || 0) > 0) ? waterCalc.amount || 0 : 0;
      const waterComponent = (status === 'Paid') ? (waterAmount + RENT_WATER_SERVICE_CHARGE) : 0;

      if (status === 'Paid') {
        paidCount++;
        let roomTotal = 0;
        let roomRent = 0;
        if (Number.isFinite(Number(storedTotal)) && Number(storedTotal) > 0) {
          roomTotal = Number(storedTotal);
          roomRent = Math.max(0, roomTotal - waterComponent);
        } else {
          roomRent = baseRent;
          roomTotal = roomRent + waterComponent;
        }
        rentCollected += roomRent;
        waterCollected += waterComponent;
        totalCollected += roomTotal;
      } else if (status === 'Rent Only') {
        rentOnlyCount++;
        const roomRent = (Number.isFinite(Number(storedTotal)) && Number(storedTotal) > 0) ? Number(storedTotal) : baseRent;
        rentCollected += roomRent;
        totalCollected += roomRent;
      } else {
        pendingCount++;
        rentPending += baseRent;
      }
    });

    const collectionPercent = expectedRent > 0 ? Math.round((rentCollected / expectedRent) * 100) : 0;

    return {
      monthKey,
      paidCount,
      rentOnlyCount,
      pendingCount,
      rentCollected,
      waterCollected,
      totalCollected,
      rentPending,
      expectedRent,
      collectionPercent
    };
  }

  async function handleSummaryQuery(ctx, year, monthIndex) {
    const { allTenants } = await getOccupiedTenants();
    const fin = computeFinancialsForMonth(allTenants, year, monthIndex);

    await ctx.reply(
      `📊 *Collection Summary for ${fin.monthKey}*\n\n` +
      `• 🟢 *Paid:* ${fin.paidCount} unit(s)\n` +
      `• 🟣 *Rent Only:* ${fin.rentOnlyCount} unit(s)\n` +
      `• 🟠 *Pending:* ${fin.pendingCount} unit(s)\n\n` +
      `💰 *Total Collected:* *₹${fin.totalCollected.toLocaleString('en-IN')}*\n` +
      `   _(Base Rent: ₹${fin.rentCollected.toLocaleString('en-IN')} + Utilities: ₹${fin.waterCollected.toLocaleString('en-IN')})_\n\n` +
      `🎯 *Expected Monthly Rent:* *₹${fin.expectedRent.toLocaleString('en-IN')}*\n` +
      `⏳ *Pending Rent:* *₹${fin.rentPending.toLocaleString('en-IN')}*\n` +
      `📈 *Collection Rate:* *${fin.collectionPercent}%*`,
      { parse_mode: 'Markdown' }
    );
  }

  async function handleTotalQuery(ctx, year, monthIndex) {
    const { allTenants } = await getOccupiedTenants();
    const fin = computeFinancialsForMonth(allTenants, year, monthIndex);

    await ctx.reply(
      `💵 *Revenue Breakdown (${fin.monthKey})*\n\n` +
      `• 💰 *Total Collected:* *₹${fin.totalCollected.toLocaleString('en-IN')}*\n` +
      `   • Rent: ₹${fin.rentCollected.toLocaleString('en-IN')}\n` +
      `   • Water & Service: ₹${fin.waterCollected.toLocaleString('en-IN')}\n\n` +
      `• 🎯 *Expected Rent:* *₹${fin.expectedRent.toLocaleString('en-IN')}*\n` +
      `• ⏳ *Pending Rent:* *₹${fin.rentPending.toLocaleString('en-IN')}*\n` +
      `• 📈 *Progress:* *${fin.collectionPercent}%*`,
      { parse_mode: 'Markdown' }
    );
  }

  async function handleUnitQuery(ctx, roomNo, roomId, year, monthIndex) {
    const monthKey = getWaterMonthKey(year, monthIndex);
    const { tenantsByRoomNo } = await getOccupiedTenants();
    const tenant = tenantsByRoomNo[roomNo];

    if (!tenant) {
      await ctx.reply(`⚪ Room *${roomId}* is currently marked as Vacant.`, { parse_mode: 'Markdown' });
      return;
    }

    if (isMonthBeforeJoinDate(monthKey, tenant.joinDate)) {
      await ctx.reply(`ℹ️ Room *${roomId}* (${tenant.tenant}) joined on ${tenant.joinDate}. Month ${monthKey} is before move-in.`, { parse_mode: 'Markdown' });
      return;
    }

    const curStatus = tenant.paymentHistory?.[monthKey] || 'Pending';
    const curTotal = tenant.paymentTotals?.[monthKey] || 0;

    let baseRent = Number(tenant.rent) || 0;
    if (isFirstOccupancyMonth(tenant, year, monthIndex) && tenant.joinDate) {
      baseRent = getProratedRent(baseRent, tenant.joinDate);
    }
    const effectiveWaterRate = Number(tenant.waterRate) || getDefaultWaterRateForRoom(roomNo);
    const waterCalc = computeWaterForMonth(tenant, year, monthIndex, effectiveWaterRate);
    const waterUnits = waterCalc?.units ?? 0;
    const waterCharge = waterCalc?.amount ?? 0;
    const serviceCharge = RENT_WATER_SERVICE_CHARGE;
    const expectedTotal = baseRent + waterCharge + serviceCharge;

    const icon = curStatus === 'Paid' ? '🟢' : (curStatus === 'Rent Only' ? '🟣' : '🟠');

    await ctx.reply(
      `🏠 *Room ${roomId}* (Room No: *${roomNo}*) — *${tenant.tenant}*\n` +
      `📅 *Cycle:* ${monthKey}\n\n` +
      `• Status: ${icon} *${curStatus}*\n` +
      `• Recorded Total: *₹${curTotal.toLocaleString('en-IN')}*\n` +
      `• Base Rent: ₹${baseRent.toLocaleString('en-IN')}\n` +
      `• Water Usage: ${waterUnits} units (₹${waterCharge})\n` +
      `• Service Charge: ₹${serviceCharge}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `💰 Expected Full Total: *₹${expectedTotal.toLocaleString('en-IN')}*\n` +
      `📞 Phone: \`${tenant.phone || 'Not provided'}\``,
      { parse_mode: 'Markdown' }
    );
  }

  // Register feature 4 query slash commands
  bot.command('pending', async (ctx) => {
    const { cycleYear, cycleMonthIndex } = getActiveWaterCycleDateParts();
    const { year, monthIndex } = parseMonthFromText(ctx.message?.text, cycleYear, cycleMonthIndex);
    await handlePendingQuery(ctx, year, monthIndex);
  });

  bot.command('rentonly', async (ctx) => {
    const { cycleYear, cycleMonthIndex } = getActiveWaterCycleDateParts();
    const { year, monthIndex } = parseMonthFromText(ctx.message?.text, cycleYear, cycleMonthIndex);
    await handleRentOnlyQuery(ctx, year, monthIndex);
  });

  bot.command('summary', async (ctx) => {
    const { cycleYear, cycleMonthIndex } = getActiveWaterCycleDateParts();
    const { year, monthIndex } = parseMonthFromText(ctx.message?.text, cycleYear, cycleMonthIndex);
    await handleSummaryQuery(ctx, year, monthIndex);
  });

  bot.command('total', async (ctx) => {
    const { cycleYear, cycleMonthIndex } = getActiveWaterCycleDateParts();
    const { year, monthIndex } = parseMonthFromText(ctx.message?.text, cycleYear, cycleMonthIndex);
    await handleTotalQuery(ctx, year, monthIndex);
  });

  bot.command('unit', async (ctx) => {
    const raw = (ctx.message?.text || '').trim();
    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length < 2) {
      await ctx.reply(`💬 Please specify the unit code:\n\n\`/unit G01\` or \`/unit 102 Aug\``, { parse_mode: 'Markdown' });
      return;
    }
    const norm = normalizeRoomIdentifier(parts[1]);
    if (!norm) {
      await ctx.reply(`❌ Unknown room "${parts[1]}". Valid units: ${getValidRoomListString()}`);
      return;
    }
    const { cycleYear, cycleMonthIndex } = getActiveWaterCycleDateParts();
    const { year, monthIndex } = parseMonthFromText(parts.slice(2).join(' '), cycleYear, cycleMonthIndex);
    await handleUnitQuery(ctx, norm.roomNo, norm.roomId, year, monthIndex);
  });

  // -------------------------------------------------------------
  // FEATURE 3: WHATSAPP BREAKDOWN NOTIFICATIONS
  // -------------------------------------------------------------

  bot.command('notify', async (ctx) => {
    const chatId = ctx.chat.id;
    const telegramUser = ctx.state.telegramUser || await getTelegramUser(chatId);

    // Gate to Owner / Admin only
    if (telegramUser?.role !== 'Owner' && telegramUser?.role !== 'Admin') {
      await ctx.reply("⛔ Permission Denied: Only Owner or Admin can trigger WhatsApp tenant notifications.");
      return;
    }

    const raw = (ctx.message?.text || '').trim();
    const parts = raw.split(/\s+/).filter(Boolean);

    if (parts.length < 2) {
      await ctx.reply(
        `📲 *WhatsApp Rent Breakdown Notification*\n\n` +
        `• \`/notify G01\` — Preview & send to Room G01\n` +
        `• \`/notify all\` — Broadcast to all active tenants\n` +
        `• \`/notify 102 Aug\` — Send for specific month`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const targetArg = parts[1].toLowerCase();
    const { cycleYear, cycleMonthIndex } = getActiveWaterCycleDateParts();
    const { year, monthIndex, monthKey } = parseMonthFromText(parts.slice(2).join(' '), cycleYear, cycleMonthIndex);

    // 1. Bulk Broadcast: /notify all
    if (targetArg === 'all') {
      const { allTenants } = await getOccupiedTenants();
      const eligible = [];
      const skipped = [];

      allTenants.forEach(t => {
        if (isMonthBeforeJoinDate(monthKey, t.joinDate)) {
          skipped.push({ roomId: t.roomId, name: t.tenant, reason: 'Pre-tenancy month' });
          return;
        }
        if (!t.phone || !normalizePhoneNumber(t.phone)) {
          skipped.push({ roomId: t.roomId, name: t.tenant, reason: 'Missing phone number' });
          return;
        }
        eligible.push(t);
      });

      if (eligible.length === 0) {
        await ctx.reply(`⚠️ No eligible tenants found for ${monthKey}.`, { parse_mode: 'Markdown' });
        return;
      }

      await setSession(chatId, {
        step: 'awaiting_notify_all_confirmation',
        year,
        monthIndex,
        monthKey,
        eligibleTenantIds: eligible.map(e => e.id)
      });

      let summaryMsg = `📲 *WhatsApp Broadcast Preview (${monthKey})*\n\n` +
                       `Ready to send to *${eligible.length} occupied tenant(s)*.\n`;

      if (skipped.length > 0) {
        summaryMsg += `\n*⏭️ Skipped (${skipped.length}):*\n`;
        skipped.forEach(s => {
          summaryMsg += `• Room ${s.roomId} (${s.name}) — _${s.reason}_\n`;
        });
      }

      summaryMsg += `\n⚠️ *Proceed with sending to all ${eligible.length} tenants?*`;

      const kb = new InlineKeyboard()
        .text(`✅ Confirm & Send (${eligible.length})`, `conf_notify:all`)
        .text("❌ Cancel", "flow_cancel");

      await ctx.reply(summaryMsg, { parse_mode: 'Markdown', reply_markup: kb });
      return;
    }

    // 2. Single Unit: /notify <room>
    const norm = normalizeRoomIdentifier(targetArg);
    if (!norm) {
      await ctx.reply(`❌ Unknown room "${targetArg}". Valid units: ${getValidRoomListString()}`);
      return;
    }

    const { tenantsByRoomNo } = await getOccupiedTenants();
    const tenant = tenantsByRoomNo[norm.roomNo];

    if (!tenant) {
      await ctx.reply(`⚠️ Room *${norm.roomId}* is currently vacant.`, { parse_mode: 'Markdown' });
      return;
    }

    if (isMonthBeforeJoinDate(monthKey, tenant.joinDate)) {
      await ctx.reply(`⚠️ Room *${norm.roomId}* tenant (${tenant.tenant}) joined on ${tenant.joinDate}. Month ${monthKey} is before move-in.`, { parse_mode: 'Markdown' });
      return;
    }

    const bill = formatTenantWhatsAppBill(tenant, year, monthIndex);
    const cleanPhone = normalizePhoneNumber(tenant.phone);

    if (!cleanPhone) {
      await ctx.reply(`⚠️ Room *${norm.roomId}* (${tenant.tenant}) has no valid phone number on file (\`${tenant.phone || 'None'}\`).`, { parse_mode: 'Markdown' });
      return;
    }

    await setSession(chatId, {
      step: 'awaiting_notify_single_confirmation',
      roomNo: norm.roomNo,
      roomId: norm.roomId,
      tenantId: tenant.id,
      phone: cleanPhone,
      year,
      monthIndex,
      monthKey,
      billMessage: bill.formattedText
    });

    const previewMsg = `📲 *WhatsApp Message Preview for ${tenant.tenant} (${norm.roomId}) — ${monthKey}:*\n\n` +
                       `\`\`\`\n${bill.formattedText}\n\`\`\`\n\n` +
                       `📞 *Recipient Phone:* \`+${cleanPhone}\`\n\n` +
                       `Send this breakdown now?`;

    const kb = new InlineKeyboard()
      .text(`✅ Send to ${tenant.tenant}`, `conf_notify:single:${norm.roomNo}`)
      .text("❌ Cancel", "flow_cancel");

    await ctx.reply(previewMsg, { parse_mode: 'Markdown', reply_markup: kb });
  });

  // Helper to start reading flow for a specific room
  async function promptReadingForRoom(ctx, room, tenant) {
    const chatId = ctx.chat.id;
    const { cycleKey, baselineKey } = getActiveWaterCycleDateParts();

    const prevReading = tenant.waterReadings?.[baselineKey] ?? null;
    const existingCurrent = tenant.waterReadings?.[cycleKey] ?? null;

    await setSession(chatId, {
      step: 'awaiting_reading_value',
      roomNo: room.roomNo,
      roomId: room.roomId,
      tenantId: tenant.id,
      tenantName: tenant.tenant || 'Tenant',
      currentMonthKey: cycleKey,
      prevMonthKey: baselineKey,
      prevVal: prevReading !== null ? Number(prevReading) : null,
      existingCurrent: existingCurrent !== null ? Number(existingCurrent) : null
    });

    let msg = `🏠 *Room ${room.roomId}* (${room.roomNo})\n` +
              `👤 *Tenant:* ${tenant.tenant || 'Occupied'}\n` +
              `📅 *Cycle:* ${cycleKey} _(Last Month's Usage)_\n\n`;

    if (prevReading !== null) {
      msg += `📌 *Last Recorded (${baselineKey}):* \`${prevReading}\`\n`;
    } else {
      msg += `📌 *Last Recorded:* None\n`;
    }

    if (existingCurrent !== null) {
      msg += `⚠️ *Note:* A reading of \`${existingCurrent}\` is already saved for this cycle.\n`;
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
        await ctx.reply(`❌ Unknown room: "${roomIdentifier}". Valid units: ${getValidRoomListString()}`);
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

    const { cycleKey } = getActiveWaterCycleDateParts();

    const keyboard = new InlineKeyboard();
    let col = 0;

    sortedRooms.forEach((r) => {
      const tenant = allTenants.find(t => t.roomNo === r.roomNo || t.roomId === r.roomId);
      const isOccupied = Boolean(tenant);
      const isDone = tenant?.waterReadings?.[cycleKey] !== undefined && tenant?.waterReadings?.[cycleKey] !== null;

      const label = `${isDone ? '✅' : (isOccupied ? '💧' : '⚪')} ${r.roomId} (${r.roomNo})`;
      keyboard.text(label, `sel_room:${r.roomNo}`);
      col++;
      if (col % 3 === 0) keyboard.row();
    });

    keyboard.row().text("❌ Cancel", "flow_cancel");

    await ctx.reply(
      `🚰 *Select a room to enter water meter reading (${cycleKey}):*\n\n` +
      `✅ = Done | 💧 = Pending | ⚪ = Vacant\n` +
      `_Format: Room ID (Room No) — e.g. G01 (01), 102 (04)_\n` +
      `_💡 Tip: Or use /bulk to paste multiple units at once._`,
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
  });

  // Rent Status Update Handler (Natural Phrase or Command)
  async function handleRentStatusUpdate(ctx, text) {
    const chatId = ctx.chat.id;
    const telegramUser = ctx.state.telegramUser || await getTelegramUser(chatId);
    const { cycleYear, cycleMonthIndex } = getActiveWaterCycleDateParts();

    const parsed = parseRentStatusMessage(text, cycleYear, cycleMonthIndex);

    if (!parsed.ok) {
      if (parsed.reason === 'unknown_room') {
        await ctx.reply(
          `❌ I don't recognize unit "${parsed.unitStr}".\n\n` +
          `🏢 *Managed Units:*\n${getValidRoomListString()}`,
          { parse_mode: 'Markdown' }
        );
        return;
      }

      if (parsed.reason === 'unknown_status' || parsed.reason === 'missing_status') {
        await ctx.reply(
          `❓ I didn't recognize that status for Room *${parsed.roomId || ''}*.\n\n` +
          `*Accepted Status Options:*\n` +
          `• *Rent Only:* \`${parsed.roomId || 'G01'} Rent Received\`\n` +
          `• *Paid (Rent + Water):* \`${parsed.roomId || 'G01'} Paid\`\n` +
          `• *Pending (Reset):* \`${parsed.roomId || 'G01'} Pending\`\n\n` +
          `_Or use: \`/rent ${parsed.roomId || 'G01'} <status> [month] [amount]\`_`,
          { parse_mode: 'Markdown' }
        );
        return;
      }

      await ctx.reply("❌ Invalid format. Use e.g. `G01 Rent Received` or `G01 Paid 9060`.", { parse_mode: 'Markdown' });
      return;
    }

    const { roomNo, roomId, targetStatus, year, monthIndex, monthKey, enteredAmount } = parsed;

    const { tenantsByRoomNo } = await getOccupiedTenants();
    const tenant = tenantsByRoomNo[roomNo];

    if (!tenant) {
      await ctx.reply(`⚠️ Room *${roomId}* is currently marked as Vacant. No active tenant is assigned.`, { parse_mode: 'Markdown' });
      return;
    }

    // Check Dash-Cell (Pre-tenancy Month)
    if (isMonthBeforeJoinDate(monthKey, tenant.joinDate)) {
      await ctx.reply(
        `⚠️ Room *${roomId}* tenant (*${tenant.tenant}*) joined on *${tenant.joinDate}*.\n` +
        `Month *${monthKey}* is before their move-in date and cannot be modified.`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const curStatus = tenant.paymentHistory?.[monthKey] || 'Pending';
    const curTotal = tenant.paymentTotals?.[monthKey] || 0;

    // Check Already Set
    if (curStatus === targetStatus && (enteredAmount === null || enteredAmount === curTotal)) {
      await ctx.reply(
        `ℹ️ Room *${roomId}* is already marked as *${targetStatus}* for *${monthKey}* (Total: ₹${curTotal.toLocaleString('en-IN')}).`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Calculate base rent and expected totals
    let baseRent = Number(tenant.rent) || 0;
    if (isFirstOccupancyMonth(tenant, year, monthIndex) && tenant.joinDate) {
      baseRent = getProratedRent(baseRent, tenant.joinDate);
    }

    const effectiveWaterRate = Number(tenant.waterRate) || getDefaultWaterRateForRoom(roomNo);
    const waterCalc = computeWaterForMonth(tenant, year, monthIndex, effectiveWaterRate);
    const waterCharge = waterCalc?.amount || 0;
    const serviceCharge = RENT_WATER_SERVICE_CHARGE;
    const computedPaidTotal = baseRent + waterCharge + serviceCharge;

    // Check Downgrade Protection (Paid -> Rent Only or Pending)
    if (curStatus === 'Paid' && (targetStatus === 'Rent Only' || targetStatus === 'Pending')) {
      await setSession(chatId, {
        step: 'awaiting_rent_confirmation',
        action: 'downgrade',
        roomNo,
        roomId,
        tenantId: tenant.id,
        monthKey,
        year,
        monthIndex,
        targetStatus,
        enteredAmount
      });

      const kb = new InlineKeyboard()
        .text(`✅ Yes, Change to ${targetStatus}`, `conf_rent_save:${roomNo}`)
        .text("❌ Cancel", "flow_cancel");

      await ctx.reply(
        `⚠️ *Downgrade Confirmation Required!*\n\n` +
        `Room *${roomId}* is currently marked *Paid* (₹${curTotal.toLocaleString('en-IN')}) for *${monthKey}*.\n\n` +
        `Are you sure you want to change it to *${targetStatus}*?`,
        { parse_mode: 'Markdown', reply_markup: kb }
      );
      return;
    }

    // Check Amount Discrepancy for Rent Only
    if (enteredAmount !== null && targetStatus === 'Rent Only' && enteredAmount !== baseRent) {
      await setSession(chatId, {
        step: 'awaiting_rent_confirmation',
        action: 'amount_mismatch',
        roomNo,
        roomId,
        tenantId: tenant.id,
        monthKey,
        year,
        monthIndex,
        targetStatus,
        enteredAmount
      });

      const kb = new InlineKeyboard()
        .text(`✅ Confirm ₹${enteredAmount}`, `conf_rent_save:${roomNo}`)
        .text("❌ Cancel", "flow_cancel");

      await ctx.reply(
        `⚠️ *Amount Mismatch Warning!*\n\n` +
        `Expected base rent for *${roomId}* is *₹${baseRent.toLocaleString('en-IN')}*, but you entered *₹${enteredAmount.toLocaleString('en-IN')}*.\n\n` +
        `Confirm recording ₹${enteredAmount.toLocaleString('en-IN')} for *${monthKey}*?`,
        { parse_mode: 'Markdown', reply_markup: kb }
      );
      return;
    }

    // Check Amount Discrepancy for Paid
    if (enteredAmount !== null && targetStatus === 'Paid' && enteredAmount !== computedPaidTotal) {
      await setSession(chatId, {
        step: 'awaiting_rent_confirmation',
        action: 'amount_mismatch',
        roomNo,
        roomId,
        tenantId: tenant.id,
        monthKey,
        year,
        monthIndex,
        targetStatus,
        enteredAmount
      });

      const kb = new InlineKeyboard()
        .text(`✅ Confirm ₹${enteredAmount}`, `conf_rent_save:${roomNo}`)
        .text("❌ Cancel", "flow_cancel");

      await ctx.reply(
        `⚠️ *Amount Mismatch Warning!*\n\n` +
        `Computed total for *${roomId}* (${monthKey}) is *₹${computedPaidTotal.toLocaleString('en-IN')}* (₹${baseRent} rent + ₹${waterCharge} water + ₹${serviceCharge} service), but you entered *₹${enteredAmount.toLocaleString('en-IN')}*.\n\n` +
        `Confirm recording ₹${enteredAmount.toLocaleString('en-IN')} for *${monthKey}*?`,
        { parse_mode: 'Markdown', reply_markup: kb }
      );
      return;
    }

    // Save Directly
    try {
      const result = await saveRentStatus({
        tenant,
        roomNo,
        roomId,
        monthKey,
        year,
        monthIndex,
        targetStatus,
        enteredAmount,
        telegramUser
      });

      await clearSession(chatId);

      let breakdownText = '';
      if (targetStatus === 'Paid') {
        breakdownText = `\n🧾 _(₹${result.baseRent.toLocaleString('en-IN')} rent + ₹${result.waterCharge} water + ₹${RENT_WATER_SERVICE_CHARGE} service)_`;
      }

      await ctx.reply(
        `✅ *Rent Status Updated!*\n\n` +
        `🏠 *Room:* ${roomId} (${roomNo})\n` +
        `👤 *Tenant:* ${tenant.tenant || 'Occupied'}\n` +
        `🏷️ *Status:* *${targetStatus}*\n` +
        `📅 *Billing Cycle:* ${monthKey}\n` +
        `💰 *Total Recorded:* ₹${result.newTotal.toLocaleString('en-IN')}${breakdownText}\n` +
        `⏱️ *Recorded:* ${new Date().toLocaleDateString('en-IN')}`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      console.error("Error saving rent status:", err);
      await ctx.reply("❌ Error saving rent status: " + err.message);
    }
  }

  // Callback query handler (Inline keyboard clicks)
  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const chatId = ctx.chat.id;
    const telegramUser = ctx.state.telegramUser || await getTelegramUser(chatId);

    if (data === 'flow_cancel') {
      await clearSession(chatId);
      await ctx.answerCallbackQuery({ text: "Cancelled" });
      await ctx.editMessageText("❌ Operation cancelled.");
      return;
    }

    // WhatsApp Notification Confirmations (Feature 3)
    if (data.startsWith('conf_notify:')) {
      const parts = data.split(':');
      const actionType = parts[1]; // 'single' or 'all'
      const roomNo = parts[2];

      const session = await getSession(chatId);
      if (!session) {
        await ctx.answerCallbackQuery({ text: "Session expired" });
        await ctx.reply("⏳ Session expired. Please send /notify command again.");
        return;
      }

      // Single WhatsApp Send
      if (actionType === 'single') {
        const { tenantsByRoomNo } = await getOccupiedTenants();
        const tenant = tenantsByRoomNo[session.roomNo];

        if (!tenant) {
          await ctx.answerCallbackQuery({ text: "Tenant missing" });
          return;
        }

        await ctx.answerCallbackQuery({ text: "Sending WhatsApp..." });
        await ctx.editMessageText(`⏳ *Sending WhatsApp message to ${tenant.tenant} (${session.roomId})...*`, { parse_mode: 'Markdown' });

        const sendRes = await sendWhatsAppViaMicroservice(session.phone, session.billMessage);

        // Record Audit Trail
        await admin.firestore().collection('whatsappAudit').add({
          tenantId: tenant.id,
          roomId: session.roomId,
          roomNo: session.roomNo,
          tenantName: tenant.tenant || 'Unknown',
          phone: session.phone,
          monthKey: session.monthKey,
          status: sendRes.ok ? 'SENT' : 'FAILED',
          messageId: sendRes.messageId || null,
          error: sendRes.error || null,
          sentBy: {
            chatId: String(telegramUser.chatId),
            email: telegramUser.email || null,
            name: telegramUser.firstName || 'Owner'
          },
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        await clearSession(chatId);

        if (sendRes.ok) {
          await ctx.reply(`✅ *WhatsApp Bill Sent Successfully!*\n\n👤 *Recipient:* ${tenant.tenant} (${session.roomId})\n📞 *Phone:* \`+${session.phone}\`\n📅 *Cycle:* ${session.monthKey}`, { parse_mode: 'Markdown' });
        } else {
          await ctx.reply(`❌ *Failed to send WhatsApp message:*\n${sendRes.error}\n\n_Make sure the WhatsApp service is running (\`npm run whatsapp:dev\`)._`, { parse_mode: 'Markdown' });
        }
        return;
      }

      // Bulk All WhatsApp Send
      if (actionType === 'all') {
        const { allTenants } = await getOccupiedTenants();
        const eligible = allTenants.filter(t => session.eligibleTenantIds.includes(t.id));

        await ctx.answerCallbackQuery({ text: "Starting batch send..." });
        await ctx.editMessageText(`⏳ *Sending WhatsApp bills to ${eligible.length} tenants... Please wait.*`, { parse_mode: 'Markdown' });

        let sentCount = 0;
        let failCount = 0;
        const results = [];

        for (const tenant of eligible) {
          const bill = formatTenantWhatsAppBill(tenant, session.year, session.monthIndex);
          const cleanPhone = normalizePhoneNumber(tenant.phone);

          const sendRes = await sendWhatsAppViaMicroservice(cleanPhone, bill.formattedText);

          await admin.firestore().collection('whatsappAudit').add({
            tenantId: tenant.id,
            roomId: tenant.roomId,
            roomNo: tenant.roomNo,
            tenantName: tenant.tenant || 'Unknown',
            phone: cleanPhone,
            monthKey: session.monthKey,
            status: sendRes.ok ? 'SENT' : 'FAILED',
            messageId: sendRes.messageId || null,
            error: sendRes.error || null,
            sentBy: {
              chatId: String(telegramUser.chatId),
              email: telegramUser.email || null,
              name: telegramUser.firstName || 'Owner'
            },
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });

          if (sendRes.ok) {
            sentCount++;
            results.push(`✅ Room ${tenant.roomId} (${tenant.tenant})`);
          } else {
            failCount++;
            results.push(`❌ Room ${tenant.roomId} (${tenant.tenant}): ${sendRes.error}`);
          }

          // 2.5 second rate-limiting delay between messages
          await new Promise(r => setTimeout(r, 2500));
        }

        await clearSession(chatId);

        let finalReport = `📊 *WhatsApp Broadcast Complete (${session.monthKey})*\n\n` +
                          `• Sent: *${sentCount}*\n` +
                          `• Failed: *${failCount}*\n\n` +
                          results.slice(0, 15).join('\n');

        await ctx.reply(finalReport, { parse_mode: 'Markdown' });
        return;
      }
    }

    // Room Selection (Water Reading)
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

    // Rent Room Selection (Interactive /rent flow)
    if (data.startsWith('sel_rent_room:')) {
      const roomNo = data.split(':')[1];
      const roomData = IMMUTABLE_ROOMS_DATA[roomNo];
      const { cycleKey } = getActiveWaterCycleDateParts();

      const { tenantsByRoomNo } = await getOccupiedTenants();
      const tenant = tenantsByRoomNo[roomNo];

      if (!tenant) {
        await ctx.answerCallbackQuery({ text: `Room ${roomData?.roomId} is vacant` });
        await ctx.reply(`⚠️ Room *${roomData?.roomId}* is vacant.`);
        return;
      }

      await ctx.answerCallbackQuery();

      const kb = new InlineKeyboard()
        .text("🟣 Rent Only", `set_rent:${roomNo}:Rent Only`)
        .text("🟢 Paid", `set_rent:${roomNo}:Paid`)
        .row()
        .text("🟠 Pending", `set_rent:${roomNo}:Pending`)
        .text("❌ Cancel", "flow_cancel");

      const cur = tenant.paymentHistory?.[cycleKey] || 'Pending';

      await ctx.reply(
        `🏠 *Room ${roomData.roomId}* (Room No: *${roomData.roomNo}*) — ${tenant.tenant}\n` +
        `📅 *Cycle:* ${cycleKey}\n` +
        `📌 *Current Status:* ${cur}\n\n` +
        `Select target status:`,
        { parse_mode: 'Markdown', reply_markup: kb }
      );
      return;
    }

    // Set Rent Status via Interactive Button
    if (data.startsWith('set_rent:')) {
      const parts = data.split(':');
      const roomNo = parts[1];
      const targetStatus = parts[2];
      const roomData = IMMUTABLE_ROOMS_DATA[roomNo];
      const { cycleKey } = getActiveWaterCycleDateParts();

      const { tenantsByRoomNo } = await getOccupiedTenants();
      const tenant = tenantsByRoomNo[roomNo];

      if (!tenant) {
        await ctx.answerCallbackQuery({ text: "Tenant missing" });
        return;
      }

      await ctx.answerCallbackQuery();
      return await handleRentStatusUpdate(ctx, `/rent ${roomData.roomId} ${targetStatus} ${cycleKey}`);
    }

    // Rent Confirmation Action (Downgrade or Mismatch Confirmed)
    if (data.startsWith('conf_rent_save:')) {
      const roomNo = data.split(':')[1];
      const session = await getSession(chatId);

      if (!session || session.step !== 'awaiting_rent_confirmation' || session.roomNo !== roomNo) {
        await ctx.answerCallbackQuery({ text: "Session expired" });
        await ctx.reply("⏳ Session expired. Please send the command again.");
        return;
      }

      const { tenantsByRoomNo } = await getOccupiedTenants();
      const tenant = tenantsByRoomNo[roomNo];

      if (!tenant) {
        await ctx.answerCallbackQuery({ text: "Tenant record missing" });
        return;
      }

      try {
        const result = await saveRentStatus({
          tenant,
          roomNo: session.roomNo,
          roomId: session.roomId,
          monthKey: session.monthKey,
          year: session.year,
          monthIndex: session.monthIndex,
          targetStatus: session.targetStatus,
          enteredAmount: session.enteredAmount,
          telegramUser
        });

        await clearSession(chatId);
        await ctx.answerCallbackQuery({ text: "Status updated!" });

        let breakdownText = '';
        if (session.targetStatus === 'Paid') {
          breakdownText = `\n🧾 _(₹${result.baseRent.toLocaleString('en-IN')} rent + ₹${result.waterCharge} water + ₹${RENT_WATER_SERVICE_CHARGE} service)_`;
        }

        await ctx.editMessageText(
          `✅ *Rent Status Updated!*\n\n` +
          `🏠 *Room:* ${session.roomId} (${session.roomNo})\n` +
          `👤 *Tenant:* ${tenant.tenant || 'Occupied'}\n` +
          `🏷️ *Status:* *${session.targetStatus}*\n` +
          `📅 *Billing Cycle:* ${session.monthKey}\n` +
          `💰 *Total Recorded:* ₹${result.newTotal.toLocaleString('en-IN')}${breakdownText}\n` +
          `⏱️ *Recorded:* ${new Date().toLocaleDateString('en-IN')}`,
          { parse_mode: 'Markdown' }
        );
      } catch (err) {
        console.error("Rent confirmation save failed:", err);
        await ctx.answerCallbackQuery({ text: "Save failed" });
        await ctx.reply("❌ Error saving rent status: " + err.message);
      }
      return;
    }

    // Single Water Reading Confirmation Actions
    if (data.startsWith('conf:')) {
      const [, action] = data.split(':');
      const session = await getSession(chatId);

      if (!session || session.step !== 'awaiting_confirmation') {
        await ctx.answerCallbackQuery({ text: "Session expired" });
        await ctx.reply("⏳ Session expired or invalid. Please start again with /reading.");
        return;
      }

      const { roomNo, roomId, tenantId, tenantName, currentMonthKey, readingNum } = session;
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

    // Bulk Confirmation Item Actions: conf_bulk:<roomNo>:<action>
    if (data.startsWith('conf_bulk:')) {
      const parts = data.split(':');
      const roomNo = parts[1];
      const action = parts[2];

      const session = await getSession(chatId);
      if (!session || session.step !== 'awaiting_bulk_confirmations' || !session.flaggedItems) {
        await ctx.answerCallbackQuery({ text: "Bulk session expired" });
        await ctx.reply("⏳ Session expired. Please send /bulk again.");
        return;
      }

      if (action === 'cancel_all') {
        await clearSession(chatId);
        await ctx.answerCallbackQuery({ text: "Flagged items cancelled" });
        await ctx.editMessageText("❌ All pending flagged items were skipped.");
        return;
      }

      const itemIndex = session.flaggedItems.findIndex(it => it.roomNo === roomNo);
      if (itemIndex === -1) {
        await ctx.answerCallbackQuery({ text: "Item already processed" });
        return;
      }

      const item = session.flaggedItems[itemIndex];
      const { tenantsByRoomNo } = await getOccupiedTenants();
      const tenant = tenantsByRoomNo[roomNo];

      if (!tenant) {
        await ctx.answerCallbackQuery({ text: "Tenant record missing" });
        return;
      }

      const isReset = action === 'reset';

      try {
        await saveWaterReading({
          tenant,
          roomNo: item.roomNo,
          roomId: item.roomId,
          monthKey: session.cycleKey,
          readingNum: item.readingNum,
          isReset,
          telegramUser,
          anomalyTag: item.reason
        });

        session.flaggedItems.splice(itemIndex, 1);
        await setSession(chatId, session);

        await ctx.answerCallbackQuery({ text: `Saved ${item.roomId}: ${item.readingNum}` });

        if (session.flaggedItems.length === 0) {
          await clearSession(chatId);
          await ctx.reply(`🎉 *All flagged bulk items have been confirmed and saved!*`, { parse_mode: 'Markdown' });
        } else {
          await ctx.reply(`✅ *Confirmed & Saved:* Room ${item.roomId} = \`${item.readingNum}\`\n\n_${session.flaggedItems.length} item(s) still pending confirmation._`, { parse_mode: 'Markdown' });
        }
      } catch (err) {
        console.error("Bulk item save failed:", err);
        await ctx.answerCallbackQuery({ text: "Save error" });
        await ctx.reply(`❌ Error saving Room ${item.roomId}: ` + err.message);
      }
      return;
    }

    await ctx.answerCallbackQuery();
  });

  // Direct shorthand reading handler
  async function handleDirectReadingEntry(ctx, room, tenant, readingStr) {
    const chatId = ctx.chat.id;
    const telegramUser = ctx.state.telegramUser || await getTelegramUser(chatId);

    const readingNum = Number(readingStr);
    if (!Number.isFinite(readingNum) || readingNum < 0) {
      await ctx.reply("❌ Invalid reading number. Please provide a non-negative number.");
      return;
    }

    const { cycleKey, baselineKey } = getActiveWaterCycleDateParts();
    const prevReading = tenant.waterReadings?.[baselineKey] ?? null;
    const existingCurrent = tenant.waterReadings?.[cycleKey] ?? null;
    const prevVal = prevReading !== null ? Number(prevReading) : null;

    // Check Lower than Previous -> Meter Reset check
    if (prevVal !== null && readingNum < prevVal) {
      await setSession(chatId, {
        step: 'awaiting_confirmation',
        roomNo: room.roomNo,
        roomId: room.roomId,
        tenantId: tenant.id,
        tenantName: tenant.tenant || 'Tenant',
        currentMonthKey: cycleKey,
        readingNum,
        prevVal
      });

      const kb = new InlineKeyboard()
        .text("🔄 Yes, Meter Reset", "conf:reset")
        .text("❌ Cancel", "conf:cancel");

      await ctx.reply(
        `⚠️ *Potential Meter Reset Detected!*\n\n` +
        `Reading \`${readingNum}\` is LOWER than baseline reading \`${prevVal}\` for Room *${room.roomId}* (${baselineKey}).\n\n` +
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
        currentMonthKey: cycleKey,
        readingNum,
        prevVal
      });

      const kb = new InlineKeyboard()
        .text("✅ Confirm & Save", "conf:save")
        .text("❌ Cancel", "conf:cancel");

      await ctx.reply(
        `⚠️ *Large Consumption Warning!*\n\n` +
        `Reading \`${readingNum}\` is +${(readingNum - prevVal).toFixed(1)} meter units higher than previous (\`${prevVal}\`).\n\n` +
        `This equals *${Math.round((readingNum - prevVal) * WATER_UNITS_MULTIPLIER)} water units*.\n` +
        `Are you sure this reading is correct?`,
        { parse_mode: 'Markdown', reply_markup: kb }
      );
      return;
    }

    // Check Zero / Near-Zero Usage
    if (prevVal !== null && readingNum >= prevVal && (readingNum - prevVal) <= 0.1) {
      await setSession(chatId, {
        step: 'awaiting_confirmation',
        roomNo: room.roomNo,
        roomId: room.roomId,
        tenantId: tenant.id,
        tenantName: tenant.tenant || 'Tenant',
        currentMonthKey: cycleKey,
        readingNum,
        prevVal
      });

      const kb = new InlineKeyboard()
        .text("✅ Yes, Save Zero Usage", "conf:save")
        .text("❌ Cancel", "conf:cancel");

      await ctx.reply(
        `⚠️ *Zero/Near-Zero Consumption Detected!*\n\n` +
        `Reading \`${readingNum}\` indicates *0 water units consumed* since last cycle (\`${prevVal}\`) for occupied Room *${room.roomId}*.\n\n` +
        `Is this correct (vacant period / meter check)?`,
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
        currentMonthKey: cycleKey,
        readingNum,
        prevVal
      });

      const kb = new InlineKeyboard()
        .text("📝 Overwrite Reading", "conf:save")
        .text("❌ Cancel", "conf:cancel");

      await ctx.reply(
        `⚠️ *Existing Reading Warning!*\n\n` +
        `Room *${room.roomId}* already has a reading of \`${existingCurrent}\` for *${cycleKey}*.\n\n` +
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
        monthKey: cycleKey,
        readingNum,
        isReset: false,
        telegramUser
      });

      const { deltaResult } = result;
      let reply = `✅ *Water Reading Saved Successfully!*\n\n` +
                  `🏠 *Room:* ${room.roomId} (${room.roomNo})\n` +
                  `👤 *Tenant:* ${tenant.tenant || 'Occupied'}\n` +
                  `📊 *Reading:* \`${readingNum}\`\n` +
                  `📅 *Billing Cycle:* ${cycleKey}\n`;

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

  // Bulk Readings Processor
  async function processBulkReadings(ctx, text) {
    const chatId = ctx.chat.id;
    const telegramUser = ctx.state.telegramUser || await getTelegramUser(chatId);
    const { cycleKey, baselineKey } = getActiveWaterCycleDateParts();

    const { validLines, errorLines } = parseBulkReadingLines(text, 20);

    if (validLines.length === 0 && errorLines.length === 0) {
      await ctx.reply("⚠️ No lines detected. Send readings in `Unit: Reading` format (e.g. `G01: 1041.2`).", { parse_mode: 'Markdown' });
      return;
    }

    const { tenantsByRoomNo } = await getOccupiedTenants();

    const savedResults = [];
    const flaggedItems = [];
    const failedResults = [...errorLines];

    for (const item of validLines) {
      const tenant = tenantsByRoomNo[item.roomNo];
      if (!tenant) {
        failedResults.push({
          unit: item.roomId,
          error: `Room ${item.roomId} is currently marked as Vacant.`
        });
        continue;
      }

      const prevReading = tenant.waterReadings?.[baselineKey] ?? null;
      const existingCurrent = tenant.waterReadings?.[cycleKey] ?? null;
      const prevVal = prevReading !== null ? Number(prevReading) : null;
      const readingNum = item.readingNum;

      // 1. Lower than previous -> flag reset
      if (prevVal !== null && readingNum < prevVal) {
        flaggedItems.push({
          ...item,
          tenantId: tenant.id,
          prevVal,
          reason: 'lower_than_prev',
          reasonText: `Lower than baseline (${readingNum} < ${prevVal})`
        });
        continue;
      }

      // 2. High Jump -> flag jump
      if (prevVal !== null && (readingNum - prevVal) > 50) {
        flaggedItems.push({
          ...item,
          tenantId: tenant.id,
          prevVal,
          reason: 'high_jump',
          reasonText: `High Jump (+${(readingNum - prevVal).toFixed(1)} units)`
        });
        continue;
      }

      // 3. Zero / Near-Zero Usage -> flag zero
      if (prevVal !== null && readingNum >= prevVal && (readingNum - prevVal) <= 0.1) {
        flaggedItems.push({
          ...item,
          tenantId: tenant.id,
          prevVal,
          reason: 'zero_consumption',
          reasonText: `Zero consumption (+0 units)`
        });
        continue;
      }

      // 4. Overwrite -> flag overwrite
      if (existingCurrent !== null && Number(existingCurrent) !== readingNum) {
        flaggedItems.push({
          ...item,
          tenantId: tenant.id,
          prevVal,
          reason: 'overwrite',
          reasonText: `Overwrite existing (${existingCurrent})`
        });
        continue;
      }

      // Clean line: Save immediately
      try {
        const result = await saveWaterReading({
          tenant,
          roomNo: item.roomNo,
          roomId: item.roomId,
          monthKey: cycleKey,
          readingNum,
          isReset: false,
          telegramUser
        });

        savedResults.push({
          roomId: item.roomId,
          readingNum,
          deltaResult: result.deltaResult
        });
      } catch (err) {
        failedResults.push({
          unit: item.roomId,
          error: err.message
        });
      }
    }

    // Build Response Message
    let msg = `📋 *Bulk Entry Results (${cycleKey})*\n\n`;

    if (savedResults.length > 0) {
      msg += `*✅ Saved Successfully (${savedResults.length}):*\n`;
      savedResults.forEach(s => {
        const delta = s.deltaResult?.meterDelta !== null ? ` (+${s.deltaResult.meterDelta.toFixed(1)}m • ${s.deltaResult.units}u • ₹${s.deltaResult.amount})` : '';
        msg += `• *${s.roomId}:* \`${s.readingNum}\`${delta}\n`;
      });
      msg += `\n`;
    }

    if (flaggedItems.length > 0) {
      msg += `*⚠️ Needs Confirmation (${flaggedItems.length}):*\n`;
      flaggedItems.forEach(f => {
        msg += `• *${f.roomId}:* \`${f.readingNum}\` — _${f.reasonText}_\n`;
      });
      msg += `\n`;
    }

    if (failedResults.length > 0) {
      msg += `*❌ Failed / Skipped (${failedResults.length}):*\n`;
      failedResults.forEach(e => {
        msg += `• ${e.unit ? `*${e.unit}:* ` : ''}${e.error || e.raw}\n`;
      });
      msg += `\n`;
    }

    // Handle flagged item keyboard
    if (flaggedItems.length > 0) {
      await setSession(chatId, {
        step: 'awaiting_bulk_confirmations',
        cycleKey,
        flaggedItems
      });

      const kb = new InlineKeyboard();
      flaggedItems.forEach((f, idx) => {
        const actionType = f.reason === 'lower_than_prev' ? 'reset' : 'save';
        const label = f.reason === 'lower_than_prev' ? `🔄 Reset ${f.roomId}` : `✅ Confirm ${f.roomId}`;
        kb.text(label, `conf_bulk:${f.roomNo}:${actionType}`);
        if ((idx + 1) % 2 === 0) kb.row();
      });
      kb.row().text("❌ Skip All Flagged", "conf_bulk:all:cancel_all");

      await ctx.reply(msg + `_Tap buttons below to confirm flagged items:_`, { parse_mode: 'Markdown', reply_markup: kb });
    } else {
      await clearSession(chatId);
      await ctx.reply(msg, { parse_mode: 'Markdown' });
    }
  }

  // Text message router
  bot.on('message:text', async (ctx) => {
    const chatId = ctx.chat.id;
    const text = ctx.message.text.trim();
    const telegramUser = ctx.state.telegramUser || await getTelegramUser(chatId);

    const session = await getSession(chatId);

    // 1. Bulk Input Mode (or multiline text)
    if (session?.step === 'awaiting_bulk_input' || text.includes('\n')) {
      return await processBulkReadings(ctx, text);
    }

    // 2. Active Single Reading Value entry
    if (session?.step === 'awaiting_reading_value') {
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
          .text("🔄 Yes, Meter Reset", "conf:reset")
          .text("❌ Cancel", "conf:cancel");

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
          .text("✅ Confirm & Save", "conf:save")
          .text("❌ Cancel", "conf:cancel");

        await ctx.reply(
          `⚠️ *Large Consumption Warning!*\n\n` +
          `Reading \`${readingNum}\` is +${(readingNum - prevVal).toFixed(1)} higher than previous (\`${prevVal}\`).\n\n` +
          `This equals *${Math.round((readingNum - prevVal) * WATER_UNITS_MULTIPLIER)} water units*.\n` +
          `Are you sure this reading is correct?`,
          { parse_mode: 'Markdown', reply_markup: kb }
        );
        return;
      }

      // Check Zero / Near-Zero Consumption
      if (prevVal !== null && readingNum >= prevVal && (readingNum - prevVal) <= 0.1) {
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
          .text("✅ Yes, Save Zero Usage", "conf:save")
          .text("❌ Cancel", "conf:cancel");

        await ctx.reply(
          `⚠️ *Zero/Near-Zero Consumption Detected!*\n\n` +
          `Reading \`${readingNum}\` indicates *0 units consumed* since last cycle (\`${prevVal}\`) for occupied Room *${roomId}*.\n\n` +
          `Confirm this reading?`,
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
          .text("📝 Overwrite Reading", "conf:save")
          .text("❌ Cancel", "conf:cancel");

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
      return;
    }

    // 3. Feature 4: Reporting Queries Check (e.g. "which rooms are pending", "how much collected this month", "G01 status")
    const queryIntent = parseReportingQuery(text);
    if (queryIntent) {
      const { cycleYear, cycleMonthIndex } = getActiveWaterCycleDateParts();
      const { year, monthIndex } = parseMonthFromText(text, cycleYear, cycleMonthIndex);

      if (queryIntent.type === 'pending') {
        return await handlePendingQuery(ctx, year, monthIndex);
      }
      if (queryIntent.type === 'rent_only') {
        return await handleRentOnlyQuery(ctx, year, monthIndex);
      }
      if (queryIntent.type === 'summary') {
        return await handleSummaryQuery(ctx, year, monthIndex);
      }
      if (queryIntent.type === 'total') {
        return await handleTotalQuery(ctx, year, monthIndex);
      }
      if (queryIntent.type === 'unit') {
        return await handleUnitQuery(ctx, queryIntent.roomNo, queryIntent.roomId, year, monthIndex);
      }
    }

    // 4. Rent Status Check: Does message match Rent phrase or start with /rent?
    const rentRegex = /^(?:[a-zA-Z0-9#\s]+?)\s+(?:rent\s*(?:received|only|paid|and\s*water|&\s*water|\+\s*water)|paid|fully\s*paid|pending|due|not\s*paid|unpaid)(?:\s+.*)?$/i;
    if (text.toLowerCase().startsWith('/rent') || rentRegex.test(text)) {
      return await handleRentStatusUpdate(ctx, text);
    }

    // 5. Default Help Response for unrecognized input
    await ctx.reply(
      "💡 *How would you like to interact?*\n\n" +
      "*🚰 Water Meter Readings:*\n" +
      "• Send /reading to pick a room from the menu.\n" +
      "• Send \`/reading <room> <val>\` (e.g. \`/reading G01 104.5\`).\n" +
      "• Send /bulk to paste multiple units at once.\n\n" +
      "*💰 Rent Payment Status:*\n" +
      "• Send \`G01 Rent Received\` ➔ Sets Rent Only\n" +
      "• Send \`G01 Paid\` ➔ Sets Paid (Rent + Water)\n" +
      "• Send \`G01 Pending\` ➔ Reverts to Pending\n" +
      "• Send /rent for interactive menu.\n\n" +
      "*📲 WhatsApp Notifications:*\n" +
      "• Send \`/notify G01\` or \`/notify all\`\n\n" +
      "*📊 Queries:*\n" +
      "• Send /pending, /summary, /total, or `/unit G01`",
      { parse_mode: 'Markdown' }
    );
  });

  return bot;
}

module.exports = {
  createTelegramBot,
  registerBotCommands,
  computeWaterReadingDelta,
  computeWaterForMonth,
  normalizeRoomIdentifier,
  parseBulkReadingLines,
  parseRentStatusMessage,
  parseReportingQuery,
  parseMonthFromText,
  formatTenantWhatsAppBill,
  normalizePhoneNumber,
  getDefaultWaterRateForRoom,
  getWaterMonthKey,
  getPrevYearMonth,
  getActiveWaterCycleDateParts,
  getKolkataDateParts,
  getProratedRent,
  isFirstOccupancyMonth,
  isMonthBeforeJoinDate,
  IMMUTABLE_ROOMS_DATA,
  BOT_COMMANDS
};
