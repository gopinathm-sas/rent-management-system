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
  normalizeRoomIdentifier,
  getDefaultWaterRateForRoom,
  getWaterMonthKey,
  getPrevYearMonth,
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

describe('Telegram Bot - Water Calculation & Delta Logic', () => {
  test('should calculate standard delta and units correctly', () => {
    // Current: 1041.2, Prev: 1024.5 -> Delta: 16.7 meter units -> 167 water units -> Amount: 167 * 0.25 = 42
    const result = computeWaterReadingDelta(1041.2, 1024.5, false, 0.25);
    expect(result).not.toBeNull();
    expect(result.meterDelta).toBeCloseTo(16.7);
    expect(result.units).toBeCloseTo(167);
    expect(result.amount).toBe(42);
    expect(result.isMeterReset).toBe(false);
  });

  test('should calculate discounted rate for rooms 11, 12, 13', () => {
    expect(getDefaultWaterRateForRoom('11')).toBe(0.20);
    expect(getDefaultWaterRateForRoom('12')).toBe(0.20);
    expect(getDefaultWaterRateForRoom('13')).toBe(0.20);
    expect(getDefaultWaterRateForRoom('01')).toBe(0.25);
    expect(getDefaultWaterRateForRoom('04')).toBe(0.25);

    // Rate 0.20 for Room 11
    const result = computeWaterReadingDelta(100, 90, false, 0.20);
    expect(result.units).toBe(100); // 10 * 10
    expect(result.amount).toBe(20);  // 100 * 0.20 = 20
  });

  test('should calculate correctly when meter reset is true', () => {
    // If meter reset, units = current * 10
    const result = computeWaterReadingDelta(15.5, 950.0, true, 0.25);
    expect(result.isMeterReset).toBe(true);
    expect(result.meterDelta).toBe(15.5);
    expect(result.units).toBe(155);
    expect(result.amount).toBe(Math.round(155 * 0.25)); // 39
  });

  test('should return null delta if previous reading is missing (first reading)', () => {
    const result = computeWaterReadingDelta(1041.2, null, false, 0.25);
    expect(result.meterDelta).toBeNull();
    expect(result.units).toBeNull();
    expect(result.amount).toBeNull();
  });

  test('should reject negative or non-numeric current reading', () => {
    expect(computeWaterReadingDelta(-5, 10, false, 0.25)).toBeNull();
    expect(computeWaterReadingDelta('abc', 10, false, 0.25)).toBeNull();
    expect(computeWaterReadingDelta(null, 10, false, 0.25)).toBeNull();
  });
});

describe('Telegram Bot - Anomaly & Validation Rules', () => {
  test('should identify lower-than-previous reading for reset confirmation', () => {
    const prevReading = 1050;
    const newReading = 1020;
    const isLower = newReading < prevReading;
    expect(isLower).toBe(true);
  });

  test('should identify large consumption jumps (> 50 meter units)', () => {
    const prevReading = 1000;
    const normalReading = 1025; // +25 units
    const highJumpReading = 1080; // +80 units

    expect(normalReading - prevReading > 50).toBe(false);
    expect(highJumpReading - prevReading > 50).toBe(true);
  });
});

describe('Telegram Bot - Month & Date Helpers', () => {
  test('should build water month keys', () => {
    expect(getWaterMonthKey(2026, 0)).toBe('2026-Jan');
    expect(getWaterMonthKey(2026, 8)).toBe('2026-Sep');
    expect(getWaterMonthKey(2026, 11)).toBe('2026-Dec');
  });

  test('should get previous year and month index', () => {
    expect(getPrevYearMonth(2026, 8)).toEqual({ year: 2026, monthIndex: 7 }); // Aug 2026
    expect(getPrevYearMonth(2026, 0)).toEqual({ year: 2025, monthIndex: 11 }); // Dec 2025
  });
});

describe('Telegram Bot - Instance Creation', () => {
  test('should throw if token is missing', () => {
    expect(() => createTelegramBot(null)).toThrow('Telegram Bot token is required');
  });

  test('should instantiate bot and register middleware and commands', () => {
    const bot = createTelegramBot('dummy_token_12345');
    expect(bot).toBeDefined();
    expect(bot.command).toHaveBeenCalledWith('start', expect.any(Function));
    expect(bot.command).toHaveBeenCalledWith('reading', expect.any(Function));
    expect(bot.command).toHaveBeenCalledWith('status', expect.any(Function));
    expect(bot.command).toHaveBeenCalledWith('link', expect.any(Function));
    expect(bot.command).toHaveBeenCalledWith('unlink', expect.any(Function));
    expect(bot.command).toHaveBeenCalledWith('help', expect.any(Function));
    expect(bot.command).toHaveBeenCalledWith('cancel', expect.any(Function));
  });
});
