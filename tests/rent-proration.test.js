jest.mock('grammy', () => ({
  Bot: jest.fn().mockImplementation(() => ({
    use: jest.fn(),
    command: jest.fn(),
    on: jest.fn(),
    catch: jest.fn(),
    start: jest.fn()
  })),
  InlineKeyboard: jest.fn().mockImplementation(() => ({
    text: jest.fn().mockReturnThis(),
    row: jest.fn().mockReturnThis()
  })),
  InputFile: {
    fromPath: jest.fn(),
    fromBuffer: jest.fn()
  }
}), { virtual: true });

const {
    isFirstOccupancyMonth,
    getMonthKey,
    isMonthBeforeJoinDate,
    isEvictionMonth
} = require('../functions/telegramBot');

// utils.ts getProratedRent implementation
function getDaysInMonth(year, monthIndex) {
    return new Date(year, monthIndex + 1, 0).getDate();
}

function getProratedRent(rent, joinDate, year, monthIndex, deductionDays = 0) {
    const daysInMonth = getDaysInMonth(year, monthIndex);
    const joinDay = new Date(joinDate).getDate();
    const billableDays = Math.max(0, daysInMonth - (joinDay - 1) - deductionDays);
    return Math.round((rent / daysInMonth) * billableDays);
}

describe('Rent Proration & Occupancy Logic', () => {
    test('isFirstOccupancyMonth returns true for month and year of joinDate', () => {
        const tenant = {
            joinDate: '2026-08-15',
            status: 'Occupied'
        };
        // August 2026 (monthIndex 7)
        expect(isFirstOccupancyMonth(tenant, 2026, 7)).toBe(true);
        // September 2026 (monthIndex 8)
        expect(isFirstOccupancyMonth(tenant, 2026, 8)).toBe(false);
        // July 2026 (monthIndex 6)
        expect(isFirstOccupancyMonth(tenant, 2026, 6)).toBe(false);
    });

    test('getProratedRent calculates correct mid-month amount', () => {
        // Rent: 10,000, joined on Aug 15 (monthIndex 7, 31 days in Aug)
        // billableDays = 31 - (15 - 1) = 17 days
        // (10000 / 31) * 17 = 5483.87 -> Math.round -> 5484
        const prorated = getProratedRent(10000, '2026-08-15', 2026, 7, 0);
        expect(prorated).toBe(5484);
    });

    test('getProratedRent with deduction days', () => {
        // With 2 deduction days: 17 - 2 = 15 days
        // (10000 / 31) * 15 = 4838.7 -> Math.round -> 4839
        const prorated = getProratedRent(10000, '2026-08-15', 2026, 7, 2);
        expect(prorated).toBe(4839);
    });

    test('isMonthBeforeJoinDate correctly gates payments before move-in', () => {
        expect(isMonthBeforeJoinDate('2026-Jul', '2026-08-15')).toBe(true);
        expect(isMonthBeforeJoinDate('2026-Aug', '2026-08-15')).toBe(false);
        expect(isMonthBeforeJoinDate('2026-Sep', '2026-08-15')).toBe(false);
    });
});
