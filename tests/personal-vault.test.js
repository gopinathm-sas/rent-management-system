const {
  cosineSimilarity,
  chunkText,
  classifyVaultIntent,
  findMatchingVaultDocument,
  extractTextFromBuffer,
  answerVaultQuestion
} = require('../functions/vaultService');

describe('Personal Vault Service Unit Tests', () => {

  describe('Cosine Similarity Mathematics', () => {
    test('returns 1.0 for identical vectors', () => {
      const vec = [0.3, -0.4, 0.8, 0.1];
      expect(cosineSimilarity(vec, vec)).toBeCloseTo(1.0, 5);
    });

    test('returns 0.0 for orthogonal vectors', () => {
      const v1 = [1, 0, 0];
      const v2 = [0, 1, 0];
      expect(cosineSimilarity(v1, v2)).toBeCloseTo(0.0, 5);
    });

    test('returns -1.0 for diametrically opposite vectors', () => {
      const v1 = [2, 3, -1];
      const v2 = [-2, -3, 1];
      expect(cosineSimilarity(v1, v2)).toBeCloseTo(-1.0, 5);
    });

    test('handles empty or malformed inputs without throwing', () => {
      expect(cosineSimilarity([], [])).toBe(0);
      expect(cosineSimilarity(null, [1, 2])).toBe(0);
      expect(cosineSimilarity([1, 2], [1])).toBe(0);
    });
  });

  describe('Sliding-Window Document Chunking', () => {
    test('returns single chunk for text within maxChars limit', () => {
      const text = 'Munirathnam Illam Rental Agreement for Room G01.';
      const chunks = chunkText(text, 500, 50);
      expect(chunks).toEqual([text]);
    });

    test('returns empty array for empty or non-string input', () => {
      expect(chunkText('')).toEqual([]);
      expect(chunkText(null)).toEqual([]);
      expect(chunkText(undefined)).toEqual([]);
    });

    test('splits long text across paragraphs cleanly', () => {
      const p1 = 'Paragraph 1: Details regarding the property lease agreement and advance payment terms.';
      const p2 = 'Paragraph 2: Rules regarding building maintenance, water bill computation, and electricity.';
      const p3 = 'Paragraph 3: Notice period requirement is strictly 30 days before vacation.';
      const fullText = `${p1}\n\n${p2}\n\n${p3}`;

      const chunks = chunkText(fullText, 120, 20);
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0]).toContain('Paragraph 1');
    });
  });

  describe('Intent Classification (File Retrieval vs Content Q&A)', () => {
    test('classifies direct file requests as FILE_RETRIEVAL', async () => {
      const q1 = await classifyVaultIntent('send me the rental agreement');
      expect(q1.intent).toBe('FILE_RETRIEVAL');

      const q2 = await classifyVaultIntent('give me my passport copy');
      expect(q2.intent).toBe('FILE_RETRIEVAL');

      const q3 = await classifyVaultIntent('download electricity bill');
      expect(q3.intent).toBe('FILE_RETRIEVAL');
    });

    test('classifies information questions as CONTENT_QA', async () => {
      const q1 = await classifyVaultIntent('What is my LIC policy number?');
      expect(q1.intent).toBe('CONTENT_QA');

      const q2 = await classifyVaultIntent('Who is the tenant in Room G02?');
      expect(q2.intent).toBe('CONTENT_QA');

      const q3 = await classifyVaultIntent('When does the building insurance expire?');
      expect(q3.intent).toBe('CONTENT_QA');
    });
  });

  describe('Document Matching by Title and Substring', () => {
    const mockFirestore = {
      collection: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({
          empty: false,
          docs: [
            {
              id: 'doc-1',
              data: () => ({
                title: 'Rental Agreement Room G01',
                originalFilename: 'rental_agreement_g01.pdf',
                contentType: 'application/pdf'
              })
            },
            {
              id: 'doc-2',
              data: () => ({
                title: 'LIC Life Insurance Policy',
                originalFilename: 'lic_policy_2026.pdf',
                contentType: 'application/pdf'
              })
            },
            {
              id: 'doc-3',
              data: () => ({
                title: 'TNEB Electricity Bill Jan 2026',
                originalFilename: 'tneb_bill.pdf',
                contentType: 'application/pdf'
              })
            }
          ]
        })
      })
    };

    test('matches exact or substring title accurately', async () => {
      const res = await findMatchingVaultDocument('Rental Agreement', { firestore: mockFirestore });
      expect(res.matches.length).toBe(1);
      expect(res.matches[0].id).toBe('doc-1');
      expect(res.confidence).toBe('high');
    });

    test('matches token overlap for query keywords', async () => {
      const res = await findMatchingVaultDocument('LIC Insurance', { firestore: mockFirestore });
      expect(res.matches.length).toBe(1);
      expect(res.matches[0].id).toBe('doc-2');
    });

    test('returns empty matches when query does not match any document', async () => {
      const res = await findMatchingVaultDocument('Nonexistent Vehicle Registration', { firestore: mockFirestore });
      expect(res.matches.length).toBe(0);
      expect(res.confidence).toBe('none');
    });
  });

  describe('Direct Text Buffer Extraction', () => {
    test('extracts plain text without OCR from UTF8 buffer', async () => {
      const rawText = 'Munirathnam Illam Maintenance Records 2026';
      const buf = Buffer.from(rawText, 'utf8');

      const res = await extractTextFromBuffer(buf, 'text/plain', { filename: 'notes.txt' });
      expect(res.text).toBe(rawText);
      expect(res.ocrUsed).toBe(false);
      expect(res.unsupported).toBe(false);
    });

    test('handles empty or non-buffer input gracefully', async () => {
      const res = await extractTextFromBuffer(null, 'text/plain', {});
      expect(res.text).toBe('');
      expect(res.unsupported).toBe(true);
    });
  });

  describe('Grounded Question Answering Fallbacks', () => {
    test('returns vault empty prompt when no chunks exist', async () => {
      const emptyFirestore = {
        collection: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ empty: true, docs: [] })
        })
      };

      const res = await answerVaultQuestion('What is the policy number?', {
        firestore: emptyFirestore,
        apiKey: 'fake-key'
      });

      expect(res.answer).toContain('currently empty');
      expect(res.sources).toEqual([]);
    });
  });
});
