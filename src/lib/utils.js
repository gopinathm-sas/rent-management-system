import {
    DEFAULT_WATER_RATE,
    DISCOUNTED_WATER_RATE,
    DISCOUNTED_WATER_ROOMS,
    WATER_UNITS_MULTIPLIER,
    MONTHS as CONST_MONTHS,
    IMMUTABLE_ROOMS_DATA,
    RENT_WATER_SERVICE_CHARGE
} from './constants';

export const MONTHS = CONST_MONTHS;
export {
    DEFAULT_WATER_RATE,
    DISCOUNTED_WATER_RATE,
    DISCOUNTED_WATER_ROOMS,
    WATER_UNITS_MULTIPLIER,
    IMMUTABLE_ROOMS_DATA,
    RENT_WATER_SERVICE_CHARGE
};

export function getMonthKey(year, monthIndex) {
    return `${year}-${MONTHS[monthIndex]}`;
}

export function formatMonthLabel(year, monthIndex) {
    return `${MONTHS[monthIndex]} ${year}`;
}

export function isFutureYearMonth(year, monthIndex, now = new Date()) {
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    if (year > currentYear) return true;
    if (year === currentYear && monthIndex > currentMonth) return true;
    return false;
}

export function findTenantForRoom(tenants, roomId) {
    if (!tenants || !roomId) return null;
    const list = Array.isArray(tenants) ? tenants : Object.values(tenants);
    return list.find(t =>
        String(t.roomId || '').trim() === String(roomId || '').trim() ||
        String(t.roomNo || '').trim() === String(roomId || '').trim()
    ) || null;
}

export function isOccupiedRecord(record) {
    if (!record) return false;
    const st = String(record.status || '').trim();
    return st === 'Occupied';
}

// Helper to check if a specific month is covered by Eviction Notice (Zero Payment)
export function isEvictionMonth(tenant, year, monthIndex) {
    if (!tenant || !tenant.isEvictionConfirmed || !tenant.evictionNoticeDate) return false;
    const nDate = new Date(tenant.evictionNoticeDate);
    const cellDate = new Date(year, monthIndex, 1);
    const noticeMonthStart = new Date(nDate.getFullYear(), nDate.getMonth(), 1);
    return cellDate >= noticeMonthStart;
}

export function getEffectiveRent(tenantData, year, monthIndex) {
    if (!tenantData) return 0;

    // 1. Check Global Eviction Rule
    if (isEvictionMonth(tenantData, year, monthIndex)) return 0;

    // 2. Determine Base Rent (Current or Historical)
    let rent = Number(tenantData.rent) || 0;

    if (tenantData.lastRevision) {
        const revDate = new Date(tenantData.lastRevision);
        const cellDate = new Date(year, monthIndex, 1);
        const revisionMonthStart = new Date(revDate.getFullYear(), revDate.getMonth(), 1);

        // If cell month is BEFORE revision month, use lastRent
        if (cellDate < revisionMonthStart) {
            rent = Number(tenantData.lastRent) || rent;
        }
    }

    return rent;
}

export function computeRentCollectedForMonth(tenants, rooms, year, monthIndex) {
    const key = getMonthKey(year, monthIndex);
    let total = 0;

    Object.keys(IMMUTABLE_ROOMS_DATA).forEach(roomNo => {
        const roomData = IMMUTABLE_ROOMS_DATA[roomNo];
        const tenantData = findTenantForRoom(tenants, roomData.roomId);
        if (!tenantData) return;

        // EVICTION CHECK: Strictly Exclude from All Financials (Rent Collected = 0)
        // User requested: "none of his rent or water or charges should be included"
        if (isEvictionMonth(tenantData, year, monthIndex)) return;

        const history = tenantData.paymentHistory || {};
        const status = history[key] || null;

        const archived = tenantData.archivedTenant || null;
        const archivedHistory = archived?.paymentHistory || {};
        const archivedStatus = archivedHistory?.[key] || null;

        const useArchived = (!status || status === 'None') && archivedStatus;
        const effectiveStatus = useArchived ? archivedStatus : status;

        if (effectiveStatus !== 'Paid') return;

        const tData = useArchived ? archived : tenantData;

        // Use consistent effective rent logic logic
        const effectiveRent = getEffectiveRent(tData, year, monthIndex);

        // We prioritize the calculated effective rent for consistency with Dashboard rules
        total += effectiveRent;
    });

    return total;
}

export function computePendingRentForMonth(tenants, rooms, year, monthIndex) {
    const key = getMonthKey(year, monthIndex);
    let total = 0;

    Object.keys(IMMUTABLE_ROOMS_DATA).forEach(roomNo => {
        const roomData = IMMUTABLE_ROOMS_DATA[roomNo];
        const tenantData = findTenantForRoom(tenants, roomData.roomId);
        if (!tenantData) return;

        // EVICTION CHECK: Strictly Exclude from All Financials
        if (isEvictionMonth(tenantData, year, monthIndex)) return;

        const history = tenantData.paymentHistory || {};
        const status = history[key] || null;

        const archived = tenantData.archivedTenant || null;
        const archivedHistory = archived?.paymentHistory || {};
        const archivedStatus = archivedHistory?.[key] || null;

        const useArchived = (!status || status === 'None') && archivedStatus;
        const effectiveStatus = useArchived ? archivedStatus : status;

        if (effectiveStatus !== 'Pending') return;

        const tData = useArchived ? archived : tenantData;
        total += getEffectiveRent(tData, year, monthIndex);
    });

    return total;
}

export function computeFinancialsForMonth(tenants, rooms, year, monthIndex) {
    const key = getMonthKey(year, monthIndex);
    let data = { rent: 0, water: 0, total: 0, pending: 0 };

    Object.keys(IMMUTABLE_ROOMS_DATA).forEach(roomNo => {
        const roomData = IMMUTABLE_ROOMS_DATA[roomNo];
        const tenantData = findTenantForRoom(tenants, roomData.roomId);
        if (!tenantData) return;

        // EVICTION CHECK: Strictly Exclude from All Financials
        // Returns 0 for rent, water, and total.
        if (isEvictionMonth(tenantData, year, monthIndex)) return;

        const history = tenantData.paymentHistory || {};
        const storedTotals = tenantData.paymentTotals || {};
        const status = history[key] || null;

        const archived = tenantData.archivedTenant || null;
        const archivedHistory = archived?.paymentHistory || {};
        const archivedTotals = archived?.paymentTotals || {};
        const archivedStatus = archivedHistory?.[key] || null;

        const useArchived = (!status || status === 'None') && archivedStatus;
        const effectiveStatus = useArchived ? archivedStatus : status;
        const tData = useArchived ? archived : tenantData;

        // Pending Calculation
        if (effectiveStatus === 'Pending') {
            data.pending += getEffectiveRent(tData, year, monthIndex);
            return;
        }

        if (effectiveStatus !== 'Paid') return;

        // Paid Calculation
        const effectiveRent = getEffectiveRent(tData, year, monthIndex);

        // Calculate Water Component
        const waterRate = useArchived ? (archived?.waterRate || DEFAULT_WATER_RATE) : (tenantData?.waterRate || DEFAULT_WATER_RATE);
        const waterCalc = computeWaterForMonth(tData, year, monthIndex, waterRate);
        const waterAmount = waterCalc.amount || 0;
        const waterComponent = waterAmount + RENT_WATER_SERVICE_CHARGE;

        data.rent += effectiveRent;
        data.water += waterComponent;
        data.total += (effectiveRent + waterComponent);
    });

    return data;
}

export function sumExpensesForMonth(expenses, year, monthIndex) {
    const key = getMonthKey(year, monthIndex);
    if (!expenses || !Array.isArray(expenses)) return 0;
    return expenses
        .filter(e => String(e?.monthKey || '') === String(key))
        .reduce((sum, e) => sum + (Number(e?.amount) || 0), 0);
}

// WATER CALCULATIONS

export function getDefaultWaterRateForRoom(roomNo) {
    const room = String(roomNo || '').trim();
    if (DISCOUNTED_WATER_ROOMS.includes(room)) return DISCOUNTED_WATER_RATE;
    return DEFAULT_WATER_RATE;
}

export function getWaterMonthKey(year, monthIndex) {
    return `${year}-${MONTHS[monthIndex]}`;
}

export function getPrevYearMonth(year, monthIndex) {
    if (monthIndex > 0) return { year, monthIndex: monthIndex - 1 };
    return { year: year - 1, monthIndex: 11 };
}

export function computeWaterForMonth(tenantData, year, monthIndex, waterRate) {
    const readings = tenantData?.waterReadings || {};
    const resetMap = tenantData?.waterMeterReset || {};
    const currentKey = getWaterMonthKey(year, monthIndex);
    const prev = getPrevYearMonth(year, monthIndex);
    const prevKey = getWaterMonthKey(prev.year, prev.monthIndex);

    const currentReading = readings?.[currentKey];
    const prevReading = readings?.[prevKey];

    const hasCurrent = currentReading !== null && currentReading !== undefined && currentReading !== '';
    const hasPrev = prevReading !== null && prevReading !== undefined && prevReading !== '';

    const currentNum = hasCurrent ? Number(currentReading) : NaN;
    const prevNum = hasPrev ? Number(prevReading) : NaN;

    const isMeterReset = Boolean(resetMap?.[currentKey]);

    // If meter was replaced/reset this month, units are computed from 0 → current.
    if (isMeterReset) {
        if (!Number.isFinite(currentNum)) {
            return { currentReading: null, units: null, amount: null, meterReset: true };
        }
        const units = currentNum * WATER_UNITS_MULTIPLIER;
        const rate = Number.isFinite(waterRate) ? waterRate : DEFAULT_WATER_RATE;
        const amount = Math.round(units * rate);
        return { currentReading: currentNum, units, amount, meterReset: true };
    }

    if (!Number.isFinite(currentNum) || !Number.isFinite(prevNum)) {
        return { currentReading: Number.isFinite(currentNum) ? currentNum : null, units: null, amount: null, meterReset: false };
    }

    const units = (currentNum - prevNum) * WATER_UNITS_MULTIPLIER;
    const rate = Number.isFinite(waterRate) ? waterRate : DEFAULT_WATER_RATE;
    const amount = Math.round(units * rate);
    return { currentReading: currentNum, units, amount, meterReset: false };
}

// RENT REVISION LOGIC
export const RENT_REVISION_WINDOW_DAYS = 15;

export function getRentRevisionDetails(tenantData, today = new Date()) {
    if (!tenantData) return { isDue: false };

    // 1. Check if disabled
    const noRevision = Boolean(tenantData?.noRevision);
    const isEviction = Boolean(tenantData?.isEvictionConfirmed);
    if (noRevision || isEviction) {
        return { isDue: false, reason: isEviction ? 'Eviction in progress' : 'Disabled' };
    }

    // 2. Determine Base Date (Last Revision > Join Date)
    const lastRevStr = tenantData?.lastRevision;
    const joinDateStr = tenantData?.joinDate;

    // Helper to safely parse YYYY-MM-DD
    const parse = (d) => (d ? new Date(d) : null);

    const lastRev = parse(lastRevStr);
    const joinDate = parse(joinDateStr);
    const baseDate = lastRev || joinDate;

    if (!baseDate) return { isDue: false, reason: 'No date available' };

    // 3. Calculate Next Due Date (Base + 1 Year)
    const nextDue = new Date(baseDate);
    nextDue.setFullYear(nextDue.getFullYear() + 1);

    // 4. Calculate Days Remaining
    // Reset hours to compare dates only
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const nextDueMidnight = new Date(nextDue.getFullYear(), nextDue.getMonth(), nextDue.getDate());

    const diffTime = nextDueMidnight - todayMidnight;
    const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // 5. Determine Check Status
    const isDue = daysRemaining <= RENT_REVISION_WINDOW_DAYS;

    return {
        isDue,
        daysRemaining,
        nextDue,
        baseDate,
        isOverdue: daysRemaining < 0
    };
}
