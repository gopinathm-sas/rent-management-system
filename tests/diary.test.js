const fs = require('fs');
const path = require('path');

/**
 * Helpers under test (mirroring src/lib/utils.ts for Node/Jest environment)
 */
function getLocalDateKey(d = new Date()) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatDiaryDate(dateKey) {
    if (!dateKey) return '';
    const parts = dateKey.split('-');
    if (parts.length !== 3) return dateKey;
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const date = new Date(year, month, day);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDiaryDateWithWeekday(dateKey) {
    if (!dateKey) return '';
    const parts = dateKey.split('-');
    if (parts.length !== 3) return dateKey;
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const date = new Date(year, month, day);
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
}

function getTagSuggestions(input, allExistingTags, currentTags = []) {
    if (!input || !input.trim()) return [];
    const query = input.trim().toLowerCase();
    return allExistingTags
        .filter(t => t.toLowerCase().includes(query) && !currentTags.some(curr => curr.toLowerCase() === t.toLowerCase()))
        .slice(0, 5);
}

function filterDiaryNotes(notes, { searchQuery = '', selectedTag = null } = {}) {
    let list = [...notes];
    list.sort((a, b) => (b.date || b.id).localeCompare(a.date || a.id));

    if (selectedTag) {
        const lowerTag = selectedTag.toLowerCase();
        list = list.filter(n => Array.isArray(n.tags) && n.tags.some(t => t.toLowerCase() === lowerTag));
    }

    if (searchQuery.trim()) {
        const queryLower = searchQuery.trim().toLowerCase();
        list = list.filter(n => {
            const contentMatch = (n.content || '').toLowerCase().includes(queryLower);
            const tagMatch = Array.isArray(n.tags) && n.tags.some(t => t.toLowerCase().includes(queryLower));
            const dateMatch = (n.date || n.id || '').includes(queryLower) || formatDiaryDate(n.date || n.id).toLowerCase().includes(queryLower);
            return contentMatch || tagMatch || dateMatch;
        });
    }

    return list;
}

describe('Personal Diary Feature Unit Tests', () => {

    describe('Date Key Generation & Formatting', () => {
        test('generates valid YYYY-MM-DD date key with zero padding', () => {
            const testDate = new Date(2026, 8, 4); // September 4, 2026
            const key = getLocalDateKey(testDate);
            expect(key).toBe('2026-09-04');
        });

        test('generates exactly one key per unique calendar day', () => {
            const date1 = new Date(2026, 0, 1, 9, 30);  // Jan 1 morning
            const date2 = new Date(2026, 0, 1, 23, 45); // Jan 1 night
            expect(getLocalDateKey(date1)).toBe('2026-01-01');
            expect(getLocalDateKey(date2)).toBe('2026-01-01');
        });

        test('formats date for sticky note display', () => {
            expect(formatDiaryDate('2026-09-04')).toBe('Sep 4, 2026');
            expect(formatDiaryDate('2026-12-25')).toBe('Dec 25, 2026');
            expect(formatDiaryDate('')).toBe('');
        });

        test('formats date with weekday for editor modal', () => {
            const formatted = formatDiaryDateWithWeekday('2026-09-04');
            expect(formatted).toContain('Friday');
            expect(formatted).toContain('Sep 4, 2026');
        });
    });

    describe('Tag Suggestion & Near-Duplicate Detection', () => {
        const fixtureTags = ['Ideas', 'Maintenance', 'Repairs', 'Plumbing', 'Tenant Note', 'Water Issue', 'Electrical'];

        test('suggests existing tags case-insensitively when typing', () => {
            const suggestions = getTagSuggestions('ide', fixtureTags, []);
            expect(suggestions).toContain('Ideas');

            const suggestionsCap = getTagSuggestions('PLUMB', fixtureTags, []);
            expect(suggestionsCap).toContain('Plumbing');
        });

        test('excludes tags that are already attached to the active note', () => {
            const suggestions = getTagSuggestions('rep', fixtureTags, ['Repairs']);
            expect(suggestions).not.toContain('Repairs');
        });

        test('handles partial string matches cleanly and limits results', () => {
            const suggestions = getTagSuggestions('e', fixtureTags, []);
            expect(suggestions.length).toBeLessThanOrEqual(5);
        });
    });

    describe('Auto-Save Debounce Simulator', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        test('debounces rapid edits and saves only once after settling', () => {
            const mockSave = jest.fn();
            let timer = null;

            const triggerEdit = (text) => {
                if (timer) clearTimeout(timer);
                timer = setTimeout(() => {
                    mockSave(text);
                }, 750);
            };

            // Simulate rapid typing
            triggerEdit('H');
            jest.advanceTimersByTime(200);
            triggerEdit('Hell');
            jest.advanceTimersByTime(200);
            triggerEdit('Hello World');

            // Not saved yet
            expect(mockSave).not.toHaveBeenCalled();

            // Settle after 750ms
            jest.advanceTimersByTime(750);
            expect(mockSave).toHaveBeenCalledTimes(1);
            expect(mockSave).toHaveBeenCalledWith('Hello World');
        });
    });

    describe('Search & Tag Filtering', () => {
        const fixtureNotes = [
            { id: '2026-09-04', date: '2026-09-04', content: 'Called plumber to inspect room G02 pipe leak', tags: ['Repairs', 'Plumbing'] },
            { id: '2026-09-03', date: '2026-09-03', content: 'Reviewed monthly electricity bill breakdown', tags: ['Bills'] },
            { id: '2026-09-01', date: '2026-09-01', content: 'New tenant moved into room 103, deposit collected', tags: ['Tenant', 'Deposit'] },
            { id: '2026-08-28', date: '2026-08-28', content: 'Painting work scheduled for next weekend', tags: ['Maintenance'] }
        ];

        test('sorts notes by date descending by default', () => {
            const result = filterDiaryNotes(fixtureNotes);
            expect(result[0].id).toBe('2026-09-04');
            expect(result[result.length - 1].id).toBe('2026-08-28');
        });

        test('filters notes by tag', () => {
            const result = filterDiaryNotes(fixtureNotes, { selectedTag: 'Repairs' });
            expect(result.length).toBe(1);
            expect(result[0].id).toBe('2026-09-04');
        });

        test('filters notes by content text search', () => {
            const result = filterDiaryNotes(fixtureNotes, { searchQuery: 'electricity' });
            expect(result.length).toBe(1);
            expect(result[0].id).toBe('2026-09-03');
        });

        test('combines tag filter and search query', () => {
            const result = filterDiaryNotes(fixtureNotes, { selectedTag: 'Tenant', searchQuery: 'deposit' });
            expect(result.length).toBe(1);
            expect(result[0].id).toBe('2026-09-01');

            const noMatch = filterDiaryNotes(fixtureNotes, { selectedTag: 'Tenant', searchQuery: 'plumber' });
            expect(noMatch.length).toBe(0);
        });
    });

    describe('Firestore Security Rules Verification', () => {
        test('ensures diaryNotes collection rule is defined in firestore.rules', () => {
            const rulesPath = path.resolve(__dirname, '../firestore.rules');
            const rulesContent = fs.readFileSync(rulesPath, 'utf8');

            expect(rulesContent).toContain('match /diaryNotes/{noteId}');
            expect(rulesContent).toMatch(/match \/diaryNotes\/\{noteId\}[\s\S]*allow read: if isStaffOrViewer\(\);/);
            expect(rulesContent).toMatch(/match \/diaryNotes\/\{noteId\}[\s\S]*allow write: if isStaff\(\);/);
        });
    });
});
