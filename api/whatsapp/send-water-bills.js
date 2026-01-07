const admin = require('firebase-admin');

function getEnv(name) {
  const value = process.env[name];
  if (!value || String(value).trim() === '') return null;
  return String(value);
}

function normalizeToDigits(phoneRaw) {
  const raw = String(phoneRaw || '').trim();
  if (!raw) return null;
  const digits = raw.replace(/\D+/g, '');
  return digits || null;
}

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  if (req.body !== undefined) return req.body;

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const err = new Error('Invalid JSON body');
    err.statusCode = 400;
    throw err;
  }
}

function initFirebaseAdmin() {
  if (admin.apps.length) return;

  const serviceAccountJson = getEnv('FIREBASE_SERVICE_ACCOUNT_JSON');
  if (!serviceAccountJson) {
    throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_JSON env var');
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountJson);
  } catch {
    throw new Error('Invalid FIREBASE_SERVICE_ACCOUNT_JSON (not valid JSON)');
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

async function assertIsAdminUser(email) {
  const db = admin.firestore();
  const snap = await db.collection('adminUsers').doc(String(email || '').trim()).get();
  if (!snap.exists) {
    const err = new Error('Forbidden');
    err.statusCode = 403;
    throw err;
  }
}

async function sendWhatsAppText({ token, phoneNumberId, toDigits, body, apiVersion }) {
  const url = `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(phoneNumberId)}/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: toDigits,
      type: 'text',
      text: { body },
    }),
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const err = new Error(`WhatsApp API error (${response.status})`);
    err.details = data;
    err.statusCode = 502;
    throw err;
  }

  return data;
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return json(res, 405, { error: 'Method Not Allowed' });
    }

    const whatsappToken = getEnv('WHATSAPP_TOKEN');
    const phoneNumberId = getEnv('WHATSAPP_PHONE_NUMBER_ID');
    const apiVersion = getEnv('WHATSAPP_API_VERSION') || 'v20.0';

    if (!whatsappToken || !phoneNumberId) {
      return json(res, 500, { error: 'Server not configured (missing WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID)' });
    }

    initFirebaseAdmin();

    const authHeader = String(req.headers.authorization || '');
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return json(res, 401, { error: 'Missing Authorization Bearer token' });
    }

    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(match[1]);
    } catch (e) {
      return json(res, 401, { error: 'Invalid Firebase ID token', details: e?.message || String(e) });
    }

    const email = decoded?.email;
    if (!email) {
      return json(res, 401, { error: 'Token has no email; cannot authorize' });
    }

    await assertIsAdminUser(email);

    let body = await readJsonBody(req);
    if (typeof body === 'string') {
      body = body.trim();
      if (!body) body = null;
      else {
        try {
          body = JSON.parse(body);
        } catch {
          return json(res, 400, { error: 'Invalid JSON body' });
        }
      }
    }

    const messages = Array.isArray(body?.messages) ? body.messages : null;
    if (!messages) {
      return json(res, 400, { error: 'Body must include { messages: [...] }' });
    }

    if (messages.length > 50) {
      return json(res, 400, { error: 'Too many messages (max 50 per request)' });
    }

    const allowedRaw = getEnv('WHATSAPP_ALLOWED_TO');
    const allowedSet = new Set(
      (allowedRaw ? allowedRaw.split(',') : [])
        .map(s => normalizeToDigits(s))
        .filter(Boolean)
    );

    const results = [];

    for (const msg of messages) {
      const toDigits = normalizeToDigits(msg?.to);
      const textBody = String(msg?.body || '').trim();

      if (!toDigits || !textBody) {
        results.push({ ok: false, to: msg?.to || null, error: 'Invalid message: missing to/body' });
        continue;
      }

      if (allowedSet.size > 0 && !allowedSet.has(toDigits)) {
        results.push({ ok: false, to: toDigits, error: 'Blocked by WHATSAPP_ALLOWED_TO' });
        continue;
      }

      try {
        const data = await sendWhatsAppText({
          token: whatsappToken,
          phoneNumberId,
          toDigits,
          body: textBody,
          apiVersion,
        });
        results.push({ ok: true, to: toDigits, data });
      } catch (e) {
        results.push({ ok: false, to: toDigits, error: e?.message || String(e), details: e?.details || null });
      }
    }

    return json(res, 200, { ok: true, sentBy: email, results });
  } catch (e) {
    const status = e?.statusCode && Number.isFinite(Number(e.statusCode)) ? Number(e.statusCode) : 500;
    return json(res, status, { error: e?.message || String(e) });
  }
};
