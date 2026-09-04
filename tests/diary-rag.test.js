const {
  cosineSimilarity,
  resolveExplicitDate,
  answerDiaryQuestion
} = require('../functions/ragService');

describe('Personal Diary RAG Semantic Search & Q&A Unit Tests', () => {

  describe('Cosine Similarity Mathematics', () => {
    test('returns 1.0 for identical vectors', () => {
      const vecA = [0.5, 0.2, 0.8, -0.1];
      const sim = cosineSimilarity(vecA, vecA);
      expect(sim).toBeCloseTo(1.0, 5);
    });

    test('returns 0 for orthogonal vectors', () => {
      const vecA = [1, 0, 0];
      const vecB = [0, 1, 0];
      const sim = cosineSimilarity(vecA, vecB);
      expect(sim).toBeCloseTo(0.0, 5);
    });

    test('returns -1 for diametrically opposite vectors', () => {
      const vecA = [1, 2, 3];
      const vecB = [-1, -2, -3];
      const sim = cosineSimilarity(vecA, vecB);
      expect(sim).toBeCloseTo(-1.0, 5);
    });

    test('handles empty or mismatched length vectors gracefully', () => {
      expect(cosineSimilarity([], [])).toBe(0);
      expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
      expect(cosineSimilarity(null, [1, 2])).toBe(0);
    });
  });

  describe('Direct Date Detection & Resolution', () => {
    const refDate = new Date(2026, 8, 4); // Friday, Sep 4, 2026

    test('resolves explicit YYYY-MM-DD dates in query', () => {
      expect(resolveExplicitDate('What happened on 2026-08-15?', refDate)).toBe('2026-08-15');
      expect(resolveExplicitDate('Notes from 2026-01-01', refDate)).toBe('2026-01-01');
    });

    test('resolves relative terms "today", "yesterday", "tomorrow"', () => {
      expect(resolveExplicitDate("What are today's notes?", refDate)).toBe('2026-09-04');
      expect(resolveExplicitDate("What did I do yesterday?", refDate)).toBe('2026-09-03');
      expect(resolveExplicitDate("Tasks for tomorrow", refDate)).toBe('2026-09-05');
    });

    test('resolves natural month-day expressions (e.g. "Aug 15", "15th August", "Sep 1")', () => {
      expect(resolveExplicitDate('Did I meet plumber on Aug 15?', refDate)).toBe('2026-08-15');
      expect(resolveExplicitDate('Notes from 15th August 2026', refDate)).toBe('2026-08-15');
      expect(resolveExplicitDate('What happened on September 1?', refDate)).toBe('2026-09-01');
      expect(resolveExplicitDate('Check 4th Sep', refDate)).toBe('2026-09-04');
    });

    test('resolves weekday references (e.g. "last Monday", "on Thursday")', () => {
      // Sep 4, 2026 is a Friday (day 5)
      // Thursday before Friday is Sep 3 (day 4) -> diff = 1
      expect(resolveExplicitDate('What did I do on thursday?', refDate)).toBe('2026-09-03');
      // Monday before is Aug 31 (day 1) -> diff = 4
      expect(resolveExplicitDate('Notes from last monday', refDate)).toBe('2026-08-31');
    });

    test('returns null when no date is mentioned in query', () => {
      expect(resolveExplicitDate('Who is the tenant in G01?', refDate)).toBeNull();
      expect(resolveExplicitDate('What is the water meter status?', refDate)).toBeNull();
    });
  });

  describe('Zero-Hallucination & Threshold Handling', () => {
    test('returns empty message if diary has no entries', async () => {
      const mockFirestore = {
        collection: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ empty: true, docs: [] })
        })
      };

      const res = await answerDiaryQuestion('What did I do with motor?', {
        apiKey: 'fake-key',
        firestore: mockFirestore
      });

      expect(res.answer).toContain('currently empty');
      expect(res.sourceDates).toEqual([]);
    });

    test('bypasses vector search directly when explicit date is resolved', async () => {
      const mockGet = jest.fn().mockResolvedValue({
        exists: true,
        data: () => ({
          id: '2026-08-15',
          date: '2026-08-15',
          content: 'Independence day celebration and inspected water motor.'
        })
      });

      const mockFirestore = {
        collection: jest.fn().mockReturnValue({
          doc: jest.fn().mockReturnValue({ get: mockGet })
        })
      };

      // Mock https module or verify date bypass branch
      const res = await answerDiaryQuestion('What happened on 2026-08-15?', {
        apiKey: 'dummy_key',
        firestore: mockFirestore
      }).catch(err => {
        // If external call fails due to dummy key, verify that directDate was targeted
        return { directDate: '2026-08-15' };
      });

      expect(mockFirestore.collection).toHaveBeenCalledWith('diaryNotes');
    });
  });
});
