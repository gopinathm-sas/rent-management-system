const admin = require('firebase-admin');

process.env.GCLOUD_PROJECT = 'munirathnam-illam';
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'munirathnam-illam' });

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'munirathnam-illam' });
}

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

const MONTHS_LIST = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DEFAULT_WATER_RATE = 0.25;
const DISCOUNTED_WATER_RATE = 0.20;
const DISCOUNTED_WATER_ROOMS = new Set(['11', '12', '13']);
const WATER_UNITS_MULTIPLIER = 10;
const RENT_WATER_SERVICE_CHARGE = 60;

function computeWaterForMonth(tenantData, year, monthIndex, waterRate) {
  const readings = (tenantData && tenantData.waterReadings) || {};
  const resetMap = (tenantData && tenantData.waterMeterReset) || {};
  const currentKey = `${year}-${MONTHS_LIST[monthIndex]}`;
  const prevMonthIndex = monthIndex > 0 ? monthIndex - 1 : 11;
  const prevYear = monthIndex > 0 ? year : year - 1;
  const prevKey = `${prevYear}-${MONTHS_LIST[prevMonthIndex]}`;

  const currentReading = readings[currentKey];
  const prevReading = readings[prevKey];

  const hasCurrent = currentReading !== null && currentReading !== undefined && currentReading !== '';
  const hasPrev = prevReading !== null && prevReading !== undefined && prevReading !== '';

  const currentNum = hasCurrent ? Number(currentReading) : NaN;
  const prevNum = hasPrev ? Number(prevReading) : NaN;

  const isMeterReset = Boolean(resetMap[currentKey]);
  const rate = Number.isFinite(waterRate) ? waterRate : DEFAULT_WATER_RATE;

  if (isMeterReset) {
    if (!Number.isFinite(currentNum)) return { units: 0, amount: 0, meterReset: true };
    const units = Math.round(currentNum * WATER_UNITS_MULTIPLIER * 10) / 10;
    const amount = Math.round(units * rate);
    return { units, amount, meterReset: true };
  }

  if (!Number.isFinite(currentNum) || !Number.isFinite(prevNum)) {
    return { units: 0, amount: 0, meterReset: false };
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

function getEffectiveRent(tenantData) {
  return Number(tenantData?.rent) || 0;
}

async function debugFinancials() {
  const snap = await admin.firestore().collection('properties').get();
  const tenants = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const monthKey = '2026-Aug';
  const year = 2026;
  const monthIndex = 7;

  console.log(`\n=== DEBUG FINANCIALS FOR ${monthKey} ===\n`);

  let appRentCollected = 0;
  let appWaterCollected = 0;
  let appTotalCollected = 0;
  let appPending = 0;
  let totalBaseRentExpected = 0;

  tenants.forEach(t => {
    const roomNo = String(t.roomNo || '').padStart(2, '0');
    const roomId = t.roomId || roomNo;
    const status = t.paymentHistory?.[monthKey] || 'Pending';
    const totalRecorded = t.paymentTotals?.[monthKey] || 0;
    const joinDate = t.joinDate;
    const baseRent = Number(t.rent) || 0;

    const isPreMoveIn = isMonthBeforeJoinDate(monthKey, joinDate);

    console.log(`Room ${roomId} (${t.tenant || 'Vacant'}): Status = "${status}", Total = ₹${totalRecorded}, BaseRent = ₹${baseRent}, Join = ${joinDate}, isPreMoveIn = ${isPreMoveIn}`);

    if (t.status !== 'Occupied') return;
    if (isPreMoveIn && status !== 'Paid' && status !== 'Rent Only') return;

    totalBaseRentExpected += baseRent;

    const waterRate = DISCOUNTED_WATER_ROOMS.has(roomNo) ? 0.20 : 0.25;
    const waterCalc = computeWaterForMonth(t, year, monthIndex, waterRate);
    const waterAmount = (waterCalc.amount > 0) ? waterCalc.amount : 0;
    const waterComponent = (status === 'Paid') ? (waterAmount + RENT_WATER_SERVICE_CHARGE) : 0;

    if (status === 'Pending' || status === 'None' || !status) {
      appPending += baseRent;
    } else if (status === 'Paid') {
      const roomTotal = totalRecorded > 0 ? totalRecorded : (baseRent + waterComponent);
      const roomRent = Math.max(0, roomTotal - waterComponent);
      appRentCollected += roomRent;
      appWaterCollected += waterComponent;
      appTotalCollected += roomTotal;
    } else if (status === 'Rent Only') {
      const roomRent = totalRecorded > 0 ? totalRecorded : baseRent;
      appRentCollected += roomRent;
      appTotalCollected += roomRent;
    }
  });

  console.log('\n=== SUMMARY COMPUTATION ===');
  console.log('App Rent Collected:', appRentCollected);
  console.log('App Water Collected:', appWaterCollected);
  console.log('App Total Collected:', appTotalCollected);
  console.log('App Pending Rent:', appPending);
  console.log('Total Rent Expected (Collected Rent + Pending Rent):', appRentCollected + appPending);
  console.log('Total Base Rent of Occupied Units:', totalBaseRentExpected);
}

debugFinancials();
