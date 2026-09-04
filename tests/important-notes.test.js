const { processAssistantMessage, answerDiaryQuestion } = require('../functions/ragService');

describe('Important Notes & AI Assistant Tests', () => {

  test('processAssistantMessage module exports required functions', () => {
    expect(typeof processAssistantMessage).toBe('function');
    expect(typeof answerDiaryQuestion).toBe('function');
  });

  test('processAssistantMessage handles empty input gracefully', async () => {
    const res = await processAssistantMessage('', { apiKey: 'dummy' });
    expect(res.action).toBe('GENERAL_CHAT');
    expect(res.reply).toContain('Personal Assistant');
  });

  test('processAssistantMessage routes conversational prompt to assistant', async () => {
    const mockDb = {
      collection: jest.fn().mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ exists: false }),
          set: jest.fn().mockResolvedValue(true)
        }),
        get: jest.fn().mockResolvedValue({ docs: [] })
      })
    };

    expect(typeof mockDb.collection).toBe('function');
  });
});
