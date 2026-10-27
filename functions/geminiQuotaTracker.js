const admin = require('firebase-admin');

/**
 * Tracks Gemini API usage in Firestore settings/geminiQuota
 * @param {Object} options
 * @param {boolean} options.success - whether the request succeeded
 * @param {string|null} options.error - error message if failed
 * @param {string} options.model - model name used
 * @param {number} options.tokens - tokens consumed (if available)
 */
async function recordGeminiCall({ success = true, error = null, model = 'gemini-3.5-flash-lite', tokens = 0 } = {}) {
  try {
    if (!admin.apps.length) return;
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const month = today.slice(0, 7);

    const updateData = {
      lastUsedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastModel: model,
      [`dailyUsage.${today}.requests`]: admin.firestore.FieldValue.increment(1),
      [`monthlyUsage.${month}.requests`]: admin.firestore.FieldValue.increment(1),
      totalRequests: admin.firestore.FieldValue.increment(1)
    };

    if (tokens > 0) {
      updateData[`dailyUsage.${today}.tokens`] = admin.firestore.FieldValue.increment(tokens);
      updateData.totalTokens = admin.firestore.FieldValue.increment(tokens);
    }

    if (success) {
      updateData.status = 'healthy';
      updateData.lastError = null;
    } else {
      const errStr = String(error || '');
      if (errStr.includes('depleted') || errStr.includes('credits') || errStr.includes('prepayment')) {
        updateData.status = 'depleted';
      } else if (errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('429')) {
        updateData.status = 'rate_limited';
      }
      updateData.lastError = errStr || 'Unknown error';
    }

    await admin.firestore().collection('settings').doc('geminiQuota').set(updateData, { merge: true });
  } catch (e) {
    console.warn('[GeminiQuotaTracker] Failed to record stats:', e.message);
  }
}

module.exports = {
  recordGeminiCall
};
