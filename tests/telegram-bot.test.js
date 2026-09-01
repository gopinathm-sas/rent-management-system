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
  }))
}), { virtual: true });

const {
  createTelegramBot,
  computeWaterReadingDelta,
  computeWaterForMonth,
  normalizeRoomIdentifier,
  parseBulkReadingLines,
  parseRentStatusMessage,
  getDefaultWaterRateForRoom,
  getWaterMonthKey,
  getPrevYearMonth,
  getActiveWaterCycleDateParts,
  getProratedRent,
  isFirstOccupancyMonth,
  isMonthBeforeJoinDate,
  IMMUTABLE_ROOMS_DATA
} = require('../functions/telegramBot');

describe('Telegram Bot - Room Identifier Normalization', () => {
  test('should normalize 2-digit room numbers', () => {
    expect(normalizeRoomIdentifier('01')).toEqual({ roomNo: '01', roomId: 'G01' });
    expect(normalizeRoomIdentifier('02')).toEqual({ roomNo: '02', roomId: 'G02' });
    expect(normalizeRoomIdentifier('04')).toEqual({ roomNo: '04', roomId: '102' });
    expect(normalizeRoomIdentifier('11')).toEqual({ roomNo: '11', roomId: '401' });
  });

  test('should normalize roomId strings (case-insensitive)', () => {
    expect(normalizeRoomIdentifier('G01')).toEqual({ roomNo: '01', roomId: 'G01' });
    expect(normalizeRoomIdentifier('g01')).toEqual({ roomNo: '01', roomId: 'G01' });
    expect(normalizeRoomIdentifier('102')).toEqual({ roomNo: '04', roomId: '102' });
    expect(normalizeRoomIdentifier('401')).toEqual({ roomNo: '11', roomId: '401' });
  });

  test('should normalize with prefix "unit" or "room"', () => {
    expect(normalizeRoomIdentifier('Unit 01')).toEqual({ roomNo: '01', roomId: 'G01' });
    expect(normalizeRoomIdentifier('Room G01')).toEqual({ roomNo: '01', roomId: 'G01' });
    expect(normalizeRoomIdentifier('Unit G02')).toEqual({ roomNo: '02', roomId: 'G02' });
  });

  test('should return null for invalid room numbers', () => {
    expect(normalizeRoomIdentifier('99')).toBeNull();
    expect(normalizeRoomIdentifier('G99')).toBeNull();
    expect(normalizeRoomIdentifier('')).toBeNull();
    expect(normalizeRoomIdentifier(null)).toBeNull();
  });
});

describe('Telegram Bot - Bulk Reading Parser', () => {
  test('should parse multiline text with colon delimiters', () => {
    const text = `
      G01: 1041.2
      102: 998.0
      201: 1204.5
    `;
    const { validLines, errorLines } = parseBulkReadingLines(text);
    expect(errorLines).toHaveLength(0);
    expect(validLines).toHaveLength(3);
    expect(validLines[0]).toEqual({ raw: 'G01: 1041.2', roomNo: '01', roomId: 'G01', readingNum: 1041.2 });
    expect(validLines[1]).toEqual({ raw: '102: 998.0', roomNo: '04', roomId: '102', readingNum: 998.0 });
    expect(validLines[2]).toEqual({ raw: '201: 1204.5', roomNo: '05', roomId: '201', readingNum: 1204.5 });
  });

  test('should parse mixed delimiters (equals, dash, space, bullets)', () => {
    const text = `
      1. G01 = 1041.2
      • 102 - 998.0
      - 201 1204.5
      Room 202: 550
    `;
    const { validLines, errorLines } = parseBulkReadingLines(text);
    expect(errorLines).toHaveLength(0);
    expect(validLines).toHaveLength(4);
    expect(validLines[0].roomId).toBe('G01');
    expect(validLines[1].roomId).toBe('102');
    expect(validLines[2].roomId).toBe('201');
    expect(validLines[3].roomId).toBe('202');
  });

  test('should isolate malformed lines without failing valid lines', () => {
    const text = `
      G01: 1041.2
      bad_line_without_numbers
      102: 998.0
      999: 500.0
      201: invalid_number
    `;
    const { validLines, errorLines } = parseBulkReadingLines(text);
    expect(validLines).toHaveLength(2);
    expect(validLines[0].roomId).toBe('G01');
    expect(validLines[1].roomId).toBe('102');

    expect(errorLines).toHaveLength(3);
    expect(errorLines[0].raw).toBe('bad_line_without_numbers');
    expect(errorLines[1].unit).toBe('999');
    expect(errorLines[2].raw).toBe('201: invalid_number');
  });

  test('should flag duplicate room codes within the same batch', () => {
    const text = `
      G01: 1041.2
      01: 1050.0
    `;
    const { validLines, errorLines } = parseBulkReadingLines(text);
    expect(validLines).toHaveLength(1);
    expect(errorLines).toHaveLength(1);
    expect(errorLines[0].error).toContain('Duplicate room code');
  });
});

describe('Telegram Bot - Rent Status Message Parser', () => {
  const defaultYear = 2026;
  const defaultMonthIndex = 7; // Aug

  test('should parse "Rent Received" / "Rent Only" phrases', () => {
    const p1 = parseRentStatusMessage('G01 Rent Received', defaultYear, defaultMonthIndex);
    expect(p1.ok).toBe(true);
    expect(p1.roomId).toBe('G01');
    expect(p1.targetStatus).toBe('Rent Only');
    expect(p1.monthKey).toBe('2026-Aug');
    expect(p1.enteredAmount).toBeNull();

    const p2 = parseRentStatusMessage('102 Rent Only', defaultYear, defaultMonthIndex);
    expect(p2.ok).toBe(true);
    expect(p2.roomId).toBe('102');
    expect(p2.targetStatus).toBe('Rent Only');

    const p3 = parseRentStatusMessage('201 Rent Paid 7000', defaultYear, defaultMonthIndex);
    expect(p3.ok).toBe(true);
    expect(p3.roomId).toBe('201');
    expect(p3.targetStatus).toBe('Rent Only');
    expect(p3.enteredAmount).toBe(7000);
  });

  test('should parse "Paid" phrases (Rent + Water)', () => {
    const p1 = parseRentStatusMessage('G01 Paid', defaultYear, defaultMonthIndex);
    expect(p1.ok).toBe(true);
    expect(p1.roomId).toBe('G01');
    expect(p1.targetStatus).toBe('Paid');
    expect(p1.monthKey).toBe('2026-Aug');

    const p2 = parseRentStatusMessage('G01 Fully Paid 9060', defaultYear, defaultMonthIndex);
    expect(p2.ok).toBe(true);
    expect(p2.targetStatus).toBe('Paid');
    expect(p2.enteredAmount).toBe(9060);

    const p3 = parseRentStatusMessage('102 Rent and Water Received', defaultYear, defaultMonthIndex);
    expect(p3.ok).toBe(true);
    expect(p3.roomId).toBe('102');
    expect(p3.targetStatus).toBe('Paid');

    const p4 = parseRentStatusMessage('Room 201 Rent + Water Paid ₹8500', defaultYear, defaultMonthIndex);
    expect(p4.ok).toBe(true);
    expect(p4.roomId).toBe('201');
    expect(p4.targetStatus).toBe('Paid');
    expect(p4.enteredAmount).toBe(8500);
  });

  test('should parse "Pending" / "Unpaid" phrases', () => {
    const p1 = parseRentStatusMessage('G01 Pending', defaultYear, defaultMonthIndex);
    expect(p1.ok).toBe(true);
    expect(p1.roomId).toBe('G01');
    expect(p1.targetStatus).toBe('Pending');

    const p2 = parseRentStatusMessage('102 Due', defaultYear, defaultMonthIndex);
    expect(p2.ok).toBe(true);
    expect(p2.targetStatus).toBe('Pending');

    const p3 = parseRentStatusMessage('201 Not Paid', defaultYear, defaultMonthIndex);
    expect(p3.ok).toBe(true);
    expect(p3.targetStatus).toBe('Pending');

    const p4 = parseRentStatusMessage('301 Unpaid', defaultYear, defaultMonthIndex);
    expect(p4.ok).toBe(true);
    expect(p4.targetStatus).toBe('Pending');
  });

  test('should parse explicit month specified in message', () => {
    const p1 = parseRentStatusMessage('G01 Rent Received September 6533', 2026, 7);
    expect(p1.ok).toBe(true);
    expect(p1.monthKey).toBe('2026-Sep');
    expect(p1.enteredAmount).toBe(6533);

    const p2 = parseRentStatusMessage('102 Paid 2026-Jul 8500', 2026, 7);
    expect(p2.ok).toBe(true);
    expect(p2.monthKey).toBe('2026-Jul');
    expect(p2.enteredAmount).toBe(8500);
  });

  test('should support /rent strict command', () => {
    const p1 = parseRentStatusMessage('/rent G01 Paid', defaultYear, defaultMonthIndex);
    expect(p1.ok).toBe(true);
    expect(p1.roomId).toBe('G01');
    expect(p1.targetStatus).toBe('Paid');

    const p2 = parseRentStatusMessage('/rent 102 Rent Only Aug 6500', defaultYear, defaultMonthIndex);
    expect(p2.ok).toBe(true);
    expect(p2.roomId).toBe('102');
    expect(p2.targetStatus).toBe('Rent Only');
    expect(p2.enteredAmount).toBe(6500);
  });

  test('should reject unknown room codes and give error reason', () => {
    const p = parseRentStatusMessage('G99 Rent Received', defaultYear, defaultMonthIndex);
    expect(p.ok).toBe(false);
    expect(p.reason).toBe('unknown_room');
    expect(p.unitStr).toBe('G99');
  });

  test('should reject unrecognized status phrase', () => {
    const p = parseRentStatusMessage('G01 Some Random Phrase', defaultYear, defaultMonthIndex);
    expect(p.ok).toBe(false);
    expect(p.reason).toBe('unknown_status');
  });
});

describe('Telegram Bot - Rent Status Business Logic & Helpers', () => {
  test('should check if month is before join date (dash-cell check)', () => {
    const joinDate = '2026-08-15';
    expect(isMonthBeforeJoinDate('2026-Jul', joinDate)).toBe(true);
    expect(isMonthBeforeJoinDate('2026-Jun', joinDate)).toBe(true);
    expect(isMonthBeforeJoinDate('2026-Aug', joinDate)).toBe(false);
    expect(isMonthBeforeJoinDate('2026-Sep', joinDate)).toBe(false);
  });

  test('should compute prorated rent for first month occupancy', () => {
    const baseRent = 6000;
    // Joined Aug 16 in a 31-day month (16 days charged: 16 to 31)
    const joinDate = '2026-08-16';
    const prorated = getProratedRent(baseRent, joinDate);
    // 6000 / 31 * 16 = 3096.77 -> 3097
    expect(prorated).toBe(3097);

    // Joined 1st of month -> full rent
    expect(getProratedRent(baseRent, '2026-08-01')).toBe(6000);
  });

  test('should compute total for Paid status including water and service charge', () => {
    const tenant = {
      rent: 6500,
      waterRate: 0.25,
      waterReadings: {
        '2026-Jul': 100,
        '2026-Aug': 110 // delta = 10 meter units = 100 water units = ₹25
      }
    };

    const water = computeWaterForMonth(tenant, 2026, 7, 0.25);
    expect(water.amount).toBe(25);
    const serviceCharge = 60;
    const totalPaid = tenant.rent + water.amount + serviceCharge;
    expect(totalPaid).toBe(6585);
  });
});

describe('Telegram Bot - Water Calculation & Delta Logic', () => {
  test('should calculate standard delta and units correctly', () => {
    const result = computeWaterReadingDelta(1041.2, 1024.5, false, 0.25);
    expect(result).not.toBeNull();
    expect(result.meterDelta).toBeCloseTo(16.7);
    expect(result.units).toBeCloseTo(167);
    expect(result.amount).toBe(42);
    expect(result.isMeterReset).toBe(false);
    expect(result.isNearZero).toBe(false);
  });

  test('should detect zero or near-zero consumption (<= 0.1)', () => {
    const resZero = computeWaterReadingDelta(1024.5, 1024.5, false, 0.25);
    expect(resZero.meterDelta).toBe(0);
    expect(resZero.units).toBe(0);
    expect(resZero.amount).toBe(0);
    expect(resZero.isNearZero).toBe(true);

    const resNearZero = computeWaterReadingDelta(1024.6, 1024.5, false, 0.25);
    expect(resNearZero.isNearZero).toBe(true);

    const resNormal = computeWaterReadingDelta(1025.5, 1024.5, false, 0.25);
    expect(resNormal.isNearZero).toBe(false);
  });

  test('should calculate discounted rate for rooms 11, 12, 13', () => {
    expect(getDefaultWaterRateForRoom('11')).toBe(0.20);
    expect(getDefaultWaterRateForRoom('12')).toBe(0.20);
    expect(getDefaultWaterRateForRoom('13')).toBe(0.20);
    expect(getDefaultWaterRateForRoom('01')).toBe(0.25);

    const result = computeWaterReadingDelta(100, 90, false, 0.20);
    expect(result.units).toBe(100);
    expect(result.amount).toBe(20);
  });
});

describe('Telegram Bot - Command Registration', () => {
  test('should instantiate bot and register all commands including /rent', () => {
    const bot = createTelegramBot('dummy_token_12345');
    expect(bot).toBeDefined();
    expect(bot.command).toHaveBeenCalledWith('start', expect.any(Function));
    expect(bot.command).toHaveBeenCalledWith('reading', expect.any(Function));
    expect(bot.command).toHaveBeenCalledWith('bulk', expect.any(Function));
    expect(bot.command).toHaveBeenCalledWith('rent', expect.any(Function));
    expect(bot.command).toHaveBeenCalledWith('status', expect.any(Function));
    expect(bot.command).toHaveBeenCalledWith('help', expect.any(Function));
    expect(bot.command).toHaveBeenCalledWith('cancel', expect.any(Function));
  });
});
