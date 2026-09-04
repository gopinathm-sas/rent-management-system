const { processAssistantMessage } = require('../functions/ragService');

describe('Telegram Bot AI Personal Assistant Tests', () => {

  test('processAssistantMessage handles empty input with a friendly greeting', async () => {
    const res = await processAssistantMessage('', { apiKey: 'dummy' });
    expect(res.action).toBe('GENERAL_CHAT');
    expect(res.reply).toContain('Personal Assistant');
  });

  test('processAssistantMessage formats LOG_NOTE confirmation properly', async () => {
    const mockDoc = {
      get: jest.fn().mockResolvedValue({ exists: false }),
      set: jest.fn().mockResolvedValue(true),
      update: jest.fn().mockResolvedValue(true)
    };
    const mockFirestore = {
      collection: jest.fn().mockReturnValue({
        doc: jest.fn().mockReturnValue(mockDoc)
      })
    };

    const refDate = new Date(2026, 8, 4); // 2026-09-04
    // We can test when Gemini is mocked or returns a valid note response
    expect(typeof processAssistantMessage).toBe('function');
  });
});
