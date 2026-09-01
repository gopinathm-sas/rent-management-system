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
  parseBulkReadingLines,
  getDefaultWaterRateForRoom,
  getWaterMonthKey,
  getPrevYearMonth,
  getActiveWaterCycleDateParts,
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
    expect(validLines).toHaveLength(2); // G01 and 102
    expect(validLines[0].roomId).toBe('G01');
    expect(validLines[1].roomId).toBe('102');

    expect(errorLines).toHaveLength(3);
    expect(errorLines[0].raw).toBe('bad_line_without_numbers');
    expect(errorLines[1].unit).toBe('999'); // unknown room
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

  test('should enforce max line limits', () => {
    const lines = Array.from({ length: 25 }, (_, i) => `G01: ${1000 + i}`).join('\n');
    const { errorLines } = parseBulkReadingLines(lines, 20);
    expect(errorLines.some(e => e.error.includes('Exceeded max batch limit'))).toBe(true);
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
    // Exact match (0 delta)
    const resZero = computeWaterReadingDelta(1024.5, 1024.5, false, 0.25);
    expect(resZero.meterDelta).toBe(0);
    expect(resZero.units).toBe(0);
    expect(resZero.amount).toBe(0);
    expect(resZero.isNearZero).toBe(true);

    // Near zero (0.1 delta)
    const resNearZero = computeWaterReadingDelta(1024.6, 1024.5, false, 0.25);
    expect(resNearZero.isNearZero).toBe(true);

    // Normal consumption (1.0 delta)
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

  test('should calculate correctly when meter reset is true', () => {
    const result = computeWaterReadingDelta(15.5, 950.0, true, 0.25);
    expect(result.isMeterReset).toBe(true);
    expect(result.meterDelta).toBe(15.5);
    expect(result.units).toBe(155);
    expect(result.amount).toBe(Math.round(155 * 0.25));
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

  test('should compute active water cycle parts (prior month)', () => {
    const parts = getActiveWaterCycleDateParts();
    expect(parts.cycleKey).toBeDefined();
    expect(parts.baselineKey).toBeDefined();
  });
});

describe('Telegram Bot - Instance Creation & Command Registration', () => {
  test('should throw if token is missing', () => {
    expect(() => createTelegramBot(null)).toThrow('Telegram Bot token is required');
  });

  test('should instantiate bot and register all commands including bulk', () => {
    const bot = createTelegramBot('dummy_token_12345');
    expect(bot).toBeDefined();
    expect(bot.command).toHaveBeenCalledWith('start', expect.any(Function));
    expect(bot.command).toHaveBeenCalledWith('reading', expect.any(Function));
    expect(bot.command).toHaveBeenCalledWith('bulk', expect.any(Function));
    expect(bot.command).toHaveBeenCalledWith('status', expect.any(Function));
    expect(bot.command).toHaveBeenCalledWith('help', expect.any(Function));
    expect(bot.command).toHaveBeenCalledWith('cancel', expect.any(Function));
  });
});
