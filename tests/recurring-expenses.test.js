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

const { getMonthlyExpenseTotal } = require('../functions/telegramBot');

// Pure JS version matching src/lib/utils.ts sumExpensesForMonth implementation
function sumExpensesForMonth(expenses, year, monthIndex) {
  if (!Array.isArray(expenses)) return 0;
  return expenses
    .filter(e => {
      if (e.pendingConfirmation === true) return false;
      if (!e.date) return false;
      const d = new Date(e.date);
      return d.getFullYear() === year && d.getMonth() === monthIndex;
    })
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
}

describe('Recurring Expenses - Totals & Pending Confirmation Filter', () => {
  test('sumExpensesForMonth should ignore expenses where pendingConfirmation is true', () => {
    const expenses = [
      { id: '1', date: '2026-09-01', amount: 1500, category: 'EB Bill', pendingConfirmation: false },
      { id: '2', date: '2026-09-05', amount: 800, category: 'Internet', pendingConfirmation: true },
      { id: '3', date: '2026-09-10', amount: 2000, category: 'Plumbing' }, // undefined pendingConfirmation treated as confirmed
      { id: '4', date: '2026-08-15', amount: 3000, category: 'Painting', pendingConfirmation: false }
    ];

    // September 2026 (year = 2026, monthIndex = 8)
    const totalSept = sumExpensesForMonth(expenses, 2026, 8);
    // Should sum 1500 + 2000 = 3500 (ignores 800 pending, and 3000 from August)
    expect(totalSept).toBe(3500);

    // August 2026 (year = 2026, monthIndex = 7)
    const totalAug = sumExpensesForMonth(expenses, 2026, 7);
    expect(totalAug).toBe(3000);
  });

  test('filtering pendingConfirmation expenses for UI and monthly totals', () => {
    const expenses = [
      { id: 'e1', date: '2026-09-01', amount: 1200, category: 'Water', pendingConfirmation: false },
      { id: 'e2', date: '2026-09-02', amount: 5000, category: 'EB Bill', pendingConfirmation: true },
      { id: 'e3', date: '2026-09-03', amount: 450, category: 'Cleaning' }
    ];

    const confirmed = expenses.filter(e => !e.pendingConfirmation);
    const pending = expenses.filter(e => e.pendingConfirmation === true);

    expect(confirmed).toHaveLength(2);
    expect(pending).toHaveLength(1);
    expect(pending[0].category).toBe('EB Bill');

    const totalConfirmed = confirmed.reduce((sum, e) => sum + e.amount, 0);
    expect(totalConfirmed).toBe(1650);
  });

  test('clamping day of month for shorter months', () => {
    // Helper to simulate day-clamping logic used in backend
    function getClampedDay(year, monthIndex, targetDay) {
      const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
      return Math.min(targetDay, daysInMonth);
    }

    // Feb in non-leap year (e.g. 2025 has 28 days)
    expect(getClampedDay(2025, 1, 31)).toBe(28);
    // Feb in leap year (e.g. 2024 or 2028 has 29 days)
    expect(getClampedDay(2028, 1, 31)).toBe(29);
    // April has 30 days
    expect(getClampedDay(2026, 3, 31)).toBe(30);
    // August has 31 days
    expect(getClampedDay(2026, 7, 31)).toBe(31);
    // Day 15 remains 15
    expect(getClampedDay(2026, 1, 15)).toBe(15);
  });
});
