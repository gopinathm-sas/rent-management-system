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
  parseReportingQuery,
  parseMonthFromText,
  formatTenantWhatsAppBill,
  normalizePhoneNumber,
  parseExpenseInput,
  findSimilarCategory,
  getDefaultWaterRateForRoom,
  getWaterMonthKey,
  getPrevYearMonth,
  getActiveWaterCycleDateParts,
  getProratedRent,
  isFirstOccupancyMonth,
  isMonthBeforeJoinDate,
  IMMUTABLE_ROOMS_DATA,
  BOT_COMMANDS,
  extractHashtags,
  getKolkataDateKey,
  formatDiaryDateDisplay
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

  test('should ignore /bulk command and header lines at the beginning of the text', () => {
    const text = `
      /bulk 2026-Aug
      Water Readings:
      G01: 1041.2
      102: 998.0 units
      201 = 1204,5
    `;
    const { validLines, errorLines } = parseBulkReadingLines(text);
    expect(errorLines).toHaveLength(0);
    expect(validLines).toHaveLength(3);
    expect(validLines[0].roomId).toBe('G01');
    expect(validLines[1].readingNum).toBe(998.0);
    expect(validLines[2].readingNum).toBe(1204.5);
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

describe('Telegram Bot - Feature 4: Reporting Queries Parser', () => {
  test('should parse /pending and free-text pending queries', () => {
    expect(parseReportingQuery('/pending')).toEqual({ type: 'pending', raw: '/pending' });
    expect(parseReportingQuery('which rooms are pending')).toEqual({ type: 'pending', raw: 'which rooms are pending' });
    expect(parseReportingQuery("who hasn't paid")).toEqual({ type: 'pending', raw: "who hasn't paid" });
    expect(parseReportingQuery('unpaid rooms')).toEqual({ type: 'pending', raw: 'unpaid rooms' });
  });

  test('should parse /rentonly and free-text rent only queries', () => {
    expect(parseReportingQuery('/rentonly')).toEqual({ type: 'rent_only', raw: '/rentonly' });
    expect(parseReportingQuery("who's paid rent only")).toEqual({ type: 'rent_only', raw: "who's paid rent only" });
    expect(parseReportingQuery('which rooms owe water')).toEqual({ type: 'rent_only', raw: 'which rooms owe water' });
  });

  test('should parse /summary and free-text summary queries', () => {
    expect(parseReportingQuery('/summary')).toEqual({ type: 'summary', raw: '/summary' });
    expect(parseReportingQuery('give me a summary')).toEqual({ type: 'summary', raw: 'give me a summary' });
    expect(parseReportingQuery("how's this month looking")).toEqual({ type: 'summary', raw: "how's this month looking" });
  });

  test('should parse /total and free-text revenue queries', () => {
    expect(parseReportingQuery('/total')).toEqual({ type: 'total', raw: '/total' });
    expect(parseReportingQuery('current month total rent')).toEqual({ type: 'total', raw: 'current month total rent' });
    expect(parseReportingQuery('how much collected this month')).toEqual({ type: 'total', raw: 'how much collected this month' });
  });

  test('should parse /unit and free-text unit status queries', () => {
    const u1 = parseReportingQuery('/unit G01');
    expect(u1).toEqual({ type: 'unit', roomNo: '01', roomId: 'G01', raw: '/unit G01' });

    const u2 = parseReportingQuery('G01 status');
    expect(u2).toEqual({ type: 'unit', roomNo: '01', roomId: 'G01', raw: 'G01 status' });

    const u3 = parseReportingQuery("how's 102 doing");
    expect(u3).toEqual({ type: 'unit', roomNo: '04', roomId: '102', raw: "how's 102 doing" });
  });

  test('should parse month extraction from queries', () => {
    const m1 = parseMonthFromText('/summary Jul', 2026, 7);
    expect(m1.monthKey).toBe('2026-Jul');

    const m2 = parseMonthFromText('total rent for September', 2026, 7);
    expect(m2.monthKey).toBe('2026-Sep');

    const m3 = parseMonthFromText('/pending 2026-Jan', 2026, 7);
    expect(m3.monthKey).toBe('2026-Jan');
  });
});

describe('Telegram Bot - Feature 3: WhatsApp Notification & Formatting', () => {
  test('should normalize phone numbers to international format', () => {
    expect(normalizePhoneNumber('9876543210')).toBe('919876543210');
    expect(normalizePhoneNumber('+91 98765 43210')).toBe('919876543210');
    expect(normalizePhoneNumber('919876543210')).toBe('919876543210');
    expect(normalizePhoneNumber('invalid')).toBeNull();
    expect(normalizePhoneNumber('')).toBeNull();
    expect(normalizePhoneNumber(null)).toBeNull();
  });

  test('should format WhatsApp bill with water and base rent breakdown', () => {
    const tenant = {
      tenant: 'Srinath',
      roomId: 'G01',
      roomNo: '01',
      rent: 6533,
      waterRate: 0.25,
      phone: '9876543210',
      waterReadings: {
        '2026-Jul': 100,
        '2026-Aug': 116.7 // 16.7 meter units = 167 units = ₹42
      }
    };

    const bill = formatTenantWhatsAppBill(tenant, 2026, 7); // Aug 2026
    expect(bill.monthKey).toBe('2026-Aug');
    expect(bill.tenantName).toBe('Srinath');
    expect(bill.baseRent).toBe(6533);
    expect(bill.waterUnits).toBe(167);
    expect(bill.waterCharge).toBe(42);
    expect(bill.serviceCharge).toBe(60);
    expect(bill.total).toBe(6533 + 42 + 60); // 6635
    expect(bill.formattedText).toContain('Srinath');
    expect(bill.formattedText).toContain('2026-Aug');
    expect(bill.formattedText).toContain('₹6,533');
    expect(bill.formattedText).toContain('167 units');
    expect(bill.formattedText).toContain('₹6,635');
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
  test('should instantiate bot and register all commands including /rent, /notify, /pending, /summary, /total', () => {
    const bot = createTelegramBot('dummy_token_12345');
    expect(bot).toBeDefined();
    expect(bot.command).toHaveBeenCalledWith('start', expect.any(Function));
    expect(bot.command).toHaveBeenCalledWith('reading', expect.any(Function));
    expect(bot.command).toHaveBeenCalledWith('bulk', expect.any(Function));
    expect(bot.command).toHaveBeenCalledWith('rent', expect.any(Function));
    expect(bot.command).toHaveBeenCalledWith('notify', expect.any(Function));
    expect(bot.command).toHaveBeenCalledWith('pending', expect.any(Function));
    expect(bot.command).toHaveBeenCalledWith('rentonly', expect.any(Function));
    expect(bot.command).toHaveBeenCalledWith('summary', expect.any(Function));
    expect(bot.command).toHaveBeenCalledWith('total', expect.any(Function));
    expect(bot.command).toHaveBeenCalledWith('unit', expect.any(Function));
    expect(bot.command).toHaveBeenCalledWith('expense', expect.any(Function));
    expect(bot.command).toHaveBeenCalledWith('undo', expect.any(Function));
    expect(bot.command).toHaveBeenCalledWith('status', expect.any(Function));
    expect(bot.command).toHaveBeenCalledWith('help', expect.any(Function));
    expect(bot.command).toHaveBeenCalledWith('cancel', expect.any(Function));
  });
});

describe('Telegram Bot - Feature 5: Expense Parser & Typo Detection', () => {
  test('should parse standard free-text expense input', () => {
    const res = parseExpenseInput('Plumbing repair 1500 fixed the leak in G02', 2026, 8);
    expect(res).not.toBeNull();
    expect(res.ok).toBe(true);
    expect(res.rawCategory).toBe('Plumbing repair');
    expect(res.amount).toBe(1500);
    expect(res.note).toBe('fixed the leak in G02');
  });

  test('should parse short free-text expense without note', () => {
    const res = parseExpenseInput('Plumbng 800', 2026, 8);
    expect(res.ok).toBe(true);
    expect(res.rawCategory).toBe('Plumbng');
    expect(res.amount).toBe(800);
    expect(res.note).toBe('');
  });

  test('should parse explicit /expense command', () => {
    const res = parseExpenseInput('/expense Electricity Bill 3200 August EB Bill', 2026, 7);
    expect(res.ok).toBe(true);
    expect(res.rawCategory).toBe('Electricity Bill');
    expect(res.amount).toBe(3200);
    expect(res.note).toBe('August EB Bill');
    expect(res.monthKey).toBe('2026-Aug');
  });

  test('should handle rupee currency symbol and commas', () => {
    const res = parseExpenseInput('Painting ₹12,000 Entire 2nd floor', 2026, 8);
    expect(res.ok).toBe(true);
    expect(res.rawCategory).toBe('Painting');
    expect(res.amount).toBe(12000);
    expect(res.note).toBe('Entire 2nd floor');
  });

  test('should parse explicit date overrides', () => {
    const res = parseExpenseInput('Painting 5000 front wall -- 15 Aug', 2026, 8);
    expect(res.ok).toBe(true);
    expect(res.amount).toBe(5000);
    expect(res.note).toBe('front wall');
    expect(res.monthKey).toBe('2026-Aug');
    expect(res.date).toBe('2026-08-15');
  });

  test('should return missing_amount when no number is given', () => {
    const res = parseExpenseInput('Plumbing repair in G02', 2026, 8);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('missing_amount');
    expect(res.rawCategory).toBe('Plumbing repair in G02');
  });

  test('should return missing_category when number is first token', () => {
    const res = parseExpenseInput('1500 plumbing repair', 2026, 8);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('missing_category');
    expect(res.amount).toBe(1500);
  });

  test('should match aliases correctly', () => {
    const matchEB = findSimilarCategory('eb bill');
    expect(matchEB.match).toBe('Electricity Bill');
    expect(matchEB.isExact).toBe(true);

    const matchPlumb = findSimilarCategory('plumbing');
    expect(matchPlumb.match).toBe('Plumbing & Repairs');
    expect(matchPlumb.isExact).toBe(true);

    const matchWifi = findSimilarCategory('wifi');
    expect(matchWifi.match).toBe('Internet Bill');
    expect(matchWifi.isExact).toBe(true);

    const matchClean = findSimilarCategory('cleaning');
    expect(matchClean.match).toBe('House Keeping Salary');
    expect(matchClean.isExact).toBe(true);

    const matchWaterTank = findSimilarCategory('water load');
    expect(matchWaterTank.match).toBe('Water Tank');
    expect(matchWaterTank.isExact).toBe(true);

    const matchAdvance = findSimilarCategory('deposit refund');
    expect(matchAdvance.match).toBe('Advance Payback');
    expect(matchAdvance.isExact).toBe(true);
  });

  test('should detect typos and suggest closest category', () => {
    const typoCheck = findSimilarCategory('Plumbng');
    expect(typoCheck.isTypo).toBe(true);
    expect(typoCheck.match).toBe('Plumbing & Repairs');

    const paintTypo = findSimilarCategory('paintng');
    expect(paintTypo.isTypo).toBe(true);
    expect(paintTypo.match).toBe('Painting');
  });

  test('should distinguish room rent commands from expense commands', () => {
    // Starts with room identifier -> Rent/Unit
    expect(normalizeRoomIdentifier('G01')).not.toBeNull();
    expect(normalizeRoomIdentifier('102')).not.toBeNull();
    expect(normalizeRoomIdentifier('403')).not.toBeNull();

    // Starts with category name -> Expense
    expect(normalizeRoomIdentifier('Plumbing')).toBeNull();
    expect(normalizeRoomIdentifier('Electricity')).toBeNull();
    expect(normalizeRoomIdentifier('Painting')).toBeNull();
  });
});

describe('Telegram Bot - Personal Diary Feature', () => {
  test('should register /diary and /notes commands in BOT_COMMANDS list', () => {
    const diaryCmd = BOT_COMMANDS.find(c => c.command === 'diary');
    const notesCmd = BOT_COMMANDS.find(c => c.command === 'notes');
    expect(diaryCmd).toBeDefined();
    expect(notesCmd).toBeDefined();
  });

  test('should extract hashtags from diary text entry', () => {
    const { tags, cleanText } = extractHashtags('Fixed terrace water pump and replaced bulb #Repairs #Maintenance');
    expect(tags).toEqual(['Repairs', 'Maintenance']);
    expect(cleanText).toBe('Fixed terrace water pump and replaced bulb #Repairs #Maintenance');
  });

  test('should deduplicate hashtags and handle case insensitivity', () => {
    const { tags } = extractHashtags('Meeting with tenant #idea #Idea #IDEA #Task');
    expect(tags).toEqual(['idea', 'Task']);
  });

  test('should handle diary text with no hashtags gracefully', () => {
    const { tags, cleanText } = extractHashtags('Just a regular note without any tags');
    expect(tags).toEqual([]);
    expect(cleanText).toBe('Just a regular note without any tags');
  });

  test('should format Kolkata date key YYYY-MM-DD properly', () => {
    const dateKey = getKolkataDateKey();
    expect(dateKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('should format diary date for display', () => {
    const display = formatDiaryDateDisplay('2026-09-04');
    expect(display).toContain('Sep 4, 2026');
    expect(display).toContain('Fri');
  });
});

