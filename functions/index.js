const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

admin.initializeApp();

const DEFAULT_WATER_RATE = 0.25;
const DISCOUNTED_WATER_RATE = 0.2;
const DISCOUNTED_WATER_ROOMS = new Set(['11', '12', '13']);
const WATER_UNITS_MULTIPLIER = 10;
const RENT_WATER_SERVICE_CHARGE = 60;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatDateYMD(date) {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  return `${y}-${m}-${d}`;
}

function parseYMD(ymd) {
  if (!ymd || typeof ymd !== 'string') return null;
  const m = /^\d{4}-\d{2}-\d{2}$/.exec(ymd.trim());
  if (!m) return null;
  const d = new Date(`${ymd.trim()}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  // convert to local midnight date object for comparisons
  const local = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  local.setHours(0, 0, 0, 0);
  return local;
}

function getDefaultWaterRateForRoom(roomNo) {
  const room = String(roomNo || '').trim();
  if (DISCOUNTED_WATER_ROOMS.has(room)) return DISCOUNTED_WATER_RATE;
  return DEFAULT_WATER_RATE;
}

function getWaterMonthKey(year, monthIndex) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${year}-${months[monthIndex]}`;
}

function getPrevYearMonth(year, monthIndex) {
  if (monthIndex > 0) return { year, monthIndex: monthIndex - 1 };
  return { year: year - 1, monthIndex: 11 };
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
    const units = currentNum * WATER_UNITS_MULTIPLIER;
    const amount = Math.round(units * rate);
    return { units, amount, meterReset: true };
  }

  if (!Number.isFinite(currentNum) || !Number.isFinite(prevNum)) {
    return { units: null, amount: null, meterReset: false };
  }

  const units = (currentNum - prevNum) * WATER_UNITS_MULTIPLIER;
  const amount = Math.round(units * rate);
  return { units, amount, meterReset: false };
}

function buildMonthList(noticeDate, vacateDate) {
  const start = new Date(noticeDate);
  const end = new Date(vacateDate);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  if (end.getTime() < start.getTime()) return [];

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthList = [];

  let y = start.getFullYear();
  let m = start.getMonth();
  const endY = end.getFullYear();
  const endM = end.getMonth();
  while (y < endY || (y === endY && m <= endM)) {
    monthList.push({ year: y, monthIndex: m, key: `${y}-${months[m]}` });
    m += 1;
    if (m >= 12) {
      m = 0;
      y += 1;
    }
  }
  return monthList;
}

function buildEvictionSettlementSnapshot(tenantRecord, noticeDateYmd, vacateDateYmd) {
  const rent = Number(tenantRecord && tenantRecord.rent) || 0;
  const deposit = Number(tenantRecord && tenantRecord.deposit) || 0;
  const roomNo = String((tenantRecord && tenantRecord.roomNo) || '').trim();

  const rateRaw = Number(tenantRecord && tenantRecord.waterRate);
  const waterRate = Number.isFinite(rateRaw) ? rateRaw : getDefaultWaterRateForRoom(roomNo);

  const noticeDate = parseYMD(noticeDateYmd);
  const vacateDate = parseYMD(vacateDateYmd);
  if (!noticeDate || !vacateDate) return null;

  const monthList = buildMonthList(noticeDate, vacateDate);
  if (monthList.length === 0) return null;

  const servicePerMonth = Number(RENT_WATER_SERVICE_CHARGE) || 0;

  const waterByMonth = {};
  const serviceByMonth = {};
  const missingWaterMonths = [];

  let waterTotal = 0;

  for (const it of monthList) {
    const w = computeWaterForMonth(tenantRecord, it.year, it.monthIndex, waterRate);
    const amt = Number(w && w.amount);
    const units = Number(w && w.units);
    const hasAmount = Number.isFinite(amt) && Number.isFinite(units) && units >= 0;

    if (hasAmount) {
      waterByMonth[it.key] = Math.round(amt);
      waterTotal += amt;
    } else {
      waterByMonth[it.key] = 0;
      missingWaterMonths.push(it.key);
    }

    serviceByMonth[it.key] = servicePerMonth;
  }

  const rentMonths = monthList.length;
  const rentDeduction = rentMonths * rent;
  const mandatoryNoticeRent = rent;
  const serviceDeduction = rentMonths * servicePerMonth;

  const totalDeduction = rentDeduction + mandatoryNoticeRent + waterTotal + serviceDeduction;
  const refund = deposit - totalDeduction;

  return {
    noticeDate: noticeDateYmd,
    vacateDate: vacateDateYmd,
    months: monthList.map((x) => x.key),
    rentPerMonth: rent,
    waterRate,
    serviceChargePerMonth: servicePerMonth,
    serviceChargeTotal: Math.round(serviceDeduction),
    mandatoryNoticeRent,
    rentDeduction,
    waterDeduction: Math.round(waterTotal),
    totalDeduction: Math.round(totalDeduction),
    deposit,
    refund: Math.round(refund),
    waterByMonth,
    serviceByMonth,
    missingWaterMonths,
    autoGenerated: true,
    finalized: false
  };
}

async function getAdminEmail() {
  const snap = await admin.firestore().doc('adminSettings/main').get();
  const email = snap.exists ? (snap.data() || {}).adminEmail : null;
  const trimmed = typeof email === 'string' ? email.trim() : '';
  return trimmed || null;
}

function getTransport() {
  const cfg = functions.config();
  const user = (cfg.gmail && cfg.gmail.user) || process.env.GMAIL_USER;
  const pass = (cfg.gmail && cfg.gmail.pass) || process.env.GMAIL_PASS;
  if (!user || !pass) {
    throw new Error('Missing Gmail SMTP credentials. Set functions config gmail.user/gmail.pass (or env GMAIL_USER/GMAIL_PASS).');
  }
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass }
  });
}

function inr(n) {
  const num = Number(n) || 0;
  return `₹${Math.round(num).toLocaleString('en-IN')}`;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildSettlementEmail({ roomId, docId, archivedTenant }) {
  const tenantName = archivedTenant && archivedTenant.tenant;
  const contact = archivedTenant && archivedTenant.contact;
  const evictionDate = archivedTenant && archivedTenant.evictionDate;
  const noticeDate = archivedTenant && archivedTenant.evictionNoticeDate;
  const vacateDate = archivedTenant && archivedTenant.vacateDate;
  const settlement = archivedTenant && archivedTenant.evictionSettlement;

  const lines = [];
  lines.push(`Room: ${roomId || ''}`);
  lines.push(`Tenant: ${tenantName || ''}`);
  lines.push(`Contact: ${contact || ''}`);
  lines.push(`Notice Date: ${noticeDate || ''}`);
  lines.push(`Eviction Date: ${evictionDate || ''}`);
  lines.push(`Vacate Date: ${vacateDate || ''}`);
  lines.push('');

  let html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.4">
      <h2>Eviction Settlement Report</h2>
      <p><b>Room:</b> ${escapeHtml(roomId || '')}</p>
      <p><b>Tenant:</b> ${escapeHtml(tenantName || '')}<br/>
         <b>Contact:</b> ${escapeHtml(contact || '')}</p>
      <p><b>Notice Date:</b> ${escapeHtml(noticeDate || '')}<br/>
         <b>Eviction Date:</b> ${escapeHtml(evictionDate || '')}<br/>
         <b>Vacate Date:</b> ${escapeHtml(vacateDate || '')}</p>
  `;

  if (!settlement) {
    lines.push('Settlement snapshot not found in archivedTenant.');
    html += `<p style="color:#b45309"><b>Settlement snapshot not found</b> in archived tenant record.</p>`;
  } else {
    lines.push(`Deposit: ${settlement.deposit}`);
    lines.push(`Total Deduction: ${settlement.totalDeduction}`);
    lines.push(`Refund (positive = refund, negative = owes): ${settlement.refund}`);

    html += `
      <h3>Totals</h3>
      <ul>
        <li><b>Deposit:</b> ${escapeHtml(inr(settlement.deposit))}</li>
        <li><b>Rent deduction:</b> ${escapeHtml(inr(settlement.rentDeduction))}</li>
        <li><b>Mandatory 1 month rent:</b> ${escapeHtml(inr(settlement.mandatoryNoticeRent))}</li>
        <li><b>Water deduction:</b> ${escapeHtml(inr(settlement.waterDeduction))}</li>
        <li><b>Service charge total:</b> ${escapeHtml(inr(settlement.serviceChargeTotal))} (₹${RENT_WATER_SERVICE_CHARGE}/month)</li>
        <li><b>Total deduction:</b> ${escapeHtml(inr(settlement.totalDeduction))}</li>
        <li><b>Result:</b> ${escapeHtml(inr(settlement.refund))} ${Number(settlement.refund) >= 0 ? '(Refund to tenant)' : '(Tenant owes)'}</li>
      </ul>
    `;

    const months = Array.isArray(settlement.months) ? settlement.months : [];
    const waterByMonth = settlement.waterByMonth || {};
    const serviceByMonth = settlement.serviceByMonth || {};

    html += `
      <h3>Month-wise</h3>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse; font-size: 13px">
        <thead><tr><th>Month</th><th>Rent</th><th>Water</th><th>Service</th></tr></thead>
        <tbody>
          ${months.map((m) => {
            const w = waterByMonth[m];
            const s = serviceByMonth[m];
            return `<tr><td>${escapeHtml(m)}</td><td align="right">${escapeHtml(inr(settlement.rentPerMonth))}</td><td align="right">${escapeHtml(inr(w))}</td><td align="right">${escapeHtml(inr(s))}</td></tr>`;
          }).join('')}
        </tbody>
      </table>
    `;
  }

  html += `
      <p style="color:#6b7280; font-size: 12px">Doc: ${escapeHtml(docId)} • Generated automatically</p>
    </div>
  `;

  return { subject: `Eviction Settlement: Room ${roomId || ''}`, text: lines.join('\n'), html };
}

exports.onVacateSendSettlementEmail = functions.firestore
  .document('properties/{docId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data() || {};
    const after = change.after.data() || {};

    const wasVacant = String(before.status || '').trim().toLowerCase() === 'vacant';
    const isVacant = String(after.status || '').trim().toLowerCase() === 'vacant';
    if (!isVacant) return null;

    const archivedTenant = after.archivedTenant;
    const settlement = archivedTenant && archivedTenant.evictionSettlement;
    if (!settlement) return null;

    const alreadySent = settlement.emailSentAt || settlement.emailSentTo;
    if (alreadySent) return null;

    // Only send when transitioning into vacant OR when archivedTenant is newly set.
    const hadArchived = Boolean(before.archivedTenant && before.archivedTenant.evictionSettlement);
    if (wasVacant && hadArchived) return null;

    const adminEmail = await getAdminEmail();
    if (!adminEmail) {
      console.warn('Admin email is not configured (adminSettings/main.adminEmail). Skipping email.');
      return null;
    }

    const roomId = String(after.roomId || (archivedTenant && archivedTenant.roomId) || '').trim();

    const { subject, text, html } = buildSettlementEmail({
      roomId,
      docId: context.params.docId,
      archivedTenant
    });

    const transport = getTransport();
    await transport.sendMail({
      from: `Rent Manager <${(functions.config().gmail && functions.config().gmail.user) || process.env.GMAIL_USER}>`,
      to: adminEmail,
      subject,
      text,
      html
    });

    await change.after.ref.update({
      'archivedTenant.evictionSettlement.emailSentAt': admin.firestore.FieldValue.serverTimestamp(),
      'archivedTenant.evictionSettlement.emailSentTo': adminEmail,
      'archivedTenant.evictionSettlement.emailSentReason': 'vacated'
    });

    return null;
  });

exports.scheduledAutoVacateEvictions = functions.pubsub
  .schedule('every 60 minutes')
  .timeZone('Asia/Kolkata')
  .onRun(async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayYmd = formatDateYMD(today);

    const snap = await admin.firestore()
      .collection('properties')
      .where('status', '==', 'Occupied')
      .where('evictionDate', '<=', todayYmd)
      .get();

    if (snap.empty) return null;

    // Pick best record per roomId (duplicates exist in some projects).
    const byRoomId = new Map();
    for (const doc of snap.docs) {
      const data = doc.data() || {};
      const roomId = String(data.roomId || '').trim();
      if (!roomId) continue;

      const ts = data.updatedAt || data.createdAt;
      const ms = typeof ts?.toMillis === 'function' ? ts.toMillis() : (typeof ts?.seconds === 'number' ? ts.seconds * 1000 : 0);

      const prev = byRoomId.get(roomId);
      if (!prev || ms > prev.ms) byRoomId.set(roomId, { doc, data, ms });
    }

    const batch = admin.firestore().batch();
    let count = 0;

    for (const { doc, data } of byRoomId.values()) {
      const noticeYmd = typeof data.evictionNoticeDate === 'string' ? data.evictionNoticeDate.trim() : null;
      const vacateYmd = typeof data.evictionDate === 'string' ? data.evictionDate.trim() : todayYmd;

      const autoSettlement = noticeYmd ? buildEvictionSettlementSnapshot(data, noticeYmd, vacateYmd) : null;

      const archivedTenant = {
        archivedAt: admin.firestore.FieldValue.serverTimestamp(),
        reason: 'eviction',
        vacateDate: vacateYmd,
        vacateNotes: 'Auto-vacated by scheduler (eviction date reached)',
        tenant: data.tenant ?? null,
        contact: data.contact ?? null,
        rent: data.rent ?? null,
        waterRate: data.waterRate ?? null,
        deposit: data.deposit ?? null,
        ebServNo: data.ebServNo ?? null,
        ebAcNo: data.ebAcNo ?? null,
        keyNo: data.keyNo ?? null,
        relocate: data.relocate ?? null,
        lastRentRevisionAt: data.lastRentRevisionAt ?? null,
        noAnnualRevision: Boolean(data.noAnnualRevision),
        evictionDate: data.evictionDate ?? null,
        evictionNoticeDate: data.evictionNoticeDate ?? null,
        evictionSettlement: autoSettlement || (data.evictionSettlement ?? null),
        paymentHistory: data.paymentHistory ?? {},
        paymentTotals: data.paymentTotals ?? {},
        waterReadings: data.waterReadings ?? {},
        unRevisedRent: data.unRevisedRent ?? null,
        unRevisedRentCapturedAt: data.unRevisedRentCapturedAt ?? null
      };

      batch.update(doc.ref, {
        status: 'Vacant',
        archivedTenant,
        tenant: null,
        contact: null,
        rent: null,
        waterRate: null,
        deposit: null,
        ebServNo: null,
        ebAcNo: null,
        keyNo: null,
        relocate: null,
        lastRentRevisionAt: null,
        noAnnualRevision: false,
        evictionDate: null,
        evictionNoticeDate: null,
        evictionSettlement: null,
        payStatus: null,
        paymentHistory: {},
        paymentTotals: {},
        waterReadings: {},
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: 'scheduled-auto-vacate'
      });

      count += 1;
    }

    if (count > 0) {
      await batch.commit();
      console.log(`Auto-vacated ${count} tenant(s) where evictionDate <= ${todayYmd}`);
    }

    return null;
  });
