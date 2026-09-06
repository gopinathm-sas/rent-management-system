require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.WHATSAPP_PORT || 3001;
const API_KEY = process.env.WHATSAPP_API_KEY || 'munirathnam_secret_wa_key_2026';

let currentQR = null;
let clientStatus = 'INITIALIZING'; // 'INITIALIZING', 'QR_REQUIRED', 'READY', 'DISCONNECTED', 'AUTHENTICATING'
let connectedPhone = null;

console.log('🚀 Initializing WhatsApp Web Client...');

const findChromeExecutable = () => {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  const macPaths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
  ];
  if (process.platform === 'darwin') {
    for (const p of macPaths) {
      if (fs.existsSync(p)) return p;
    }
  }
  return undefined;
};

const chromePath = findChromeExecutable();
if (chromePath) {
  console.log(`🌐 Using system browser at: ${chromePath}`);
}

const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: path.resolve(__dirname, '.wwebjs_auth')
  }),
  puppeteer: {
    headless: true,
    ...(chromePath ? { executablePath: chromePath } : {}),
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ]
  }
});

// Event listeners
client.on('qr', (qr) => {
  currentQR = qr;
  clientStatus = 'QR_REQUIRED';
  console.log('\n📲 [WhatsApp] SCAN QR CODE BELOW TO LOG IN:\n');
  qrcode.generate(qr, { small: true });
  console.log('\n🌐 Or view QR in browser at: http://localhost:' + PORT + '/qr\n');
});

client.on('authenticated', () => {
  clientStatus = 'AUTHENTICATING';
  currentQR = null;
  console.log('🔐 [WhatsApp] Authentication successful!');
});

client.on('auth_failure', (msg) => {
  clientStatus = 'DISCONNECTED';
  console.error('❌ [WhatsApp] Authentication failure:', msg);
});

client.on('ready', () => {
  clientStatus = 'READY';
  currentQR = null;
  connectedPhone = client.info?.wid?.user || 'Connected';
  console.log(`✅ [WhatsApp] Client is READY! Connected phone: +${connectedPhone}`);
});

client.on('disconnected', (reason) => {
  clientStatus = 'DISCONNECTED';
  connectedPhone = null;
  console.warn('⚠️ [WhatsApp] Client disconnected:', reason);
});

// Start client in background
client.initialize().catch((err) => {
  console.error('❌ [WhatsApp] Client initialization error:', err.message);
});

// 1. Health / Status Check Endpoint
app.get('/status', (req, res) => {
  res.json({
    ok: true,
    status: clientStatus,
    phone: connectedPhone,
    hasQR: Boolean(currentQR),
    timestamp: new Date().toISOString()
  });
});

// 2. Web QR Code Viewer (for easy scanning in browser)
app.get('/qr', (req, res) => {
  if (clientStatus === 'READY') {
    return res.send(`
      <html>
        <body style="font-family: system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 90vh; background: #f0fdf4; color: #166534;">
          <h2>✅ WhatsApp is Connected & Ready!</h2>
          <p>Connected Account: <b>+${connectedPhone || 'WhatsApp User'}</b></p>
        </body>
      </html>
    `);
  }

  if (!currentQR) {
    return res.send(`
      <html>
        <body style="font-family: system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 90vh; background: #fafafa; color: #52525b;">
          <h2>⏳ Initializing WhatsApp session...</h2>
          <p>Please refresh in a few seconds to view QR code.</p>
          <script>setTimeout(() => location.reload(), 3000);</script>
        </body>
      </html>
    `);
  }

  res.send(`
    <html>
      <head>
        <title>Munirathnam Illam WhatsApp Login</title>
        <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.1/build/qrcode.min.js"></script>
      </head>
      <body style="font-family: system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 95vh; background: #f8fafc; color: #1e293b;">
        <div style="background: white; padding: 32px; border-radius: 24px; box-shadow: 0 10px 25px rgba(0,0,0,0.06); text-align: center; max-width: 400px;">
          <h2 style="margin: 0 0 8px 0; color: #0f172a;">Scan QR Code</h2>
          <p style="margin: 0 0 24px 0; font-size: 14px; color: #64748b;">Open WhatsApp on your phone ➔ Linked Devices ➔ Link a device</p>
          <canvas id="canvas" style="border-radius: 12px;"></canvas>
          <p style="margin-top: 16px; font-size: 12px; color: #94a3b8;">This page will automatically refresh once connected.</p>
        </div>
        <script>
          QRCode.toCanvas(document.getElementById('canvas'), ${JSON.stringify(currentQR)}, { width: 280 }, function (error) {
            if (error) console.error(error);
          });
          setInterval(async () => {
            try {
              const res = await fetch('/status');
              const data = await res.json();
              if (data.status === 'READY') {
                location.reload();
              }
            } catch(e) {}
          }, 3000);
        </script>
      </body>
    </html>
  `);
});

// 3. Send WhatsApp Message Endpoint
app.post('/send-whatsapp', async (req, res) => {
  const reqKey = req.headers['x-api-key'];
  if (reqKey !== API_KEY) {
    return res.status(401).json({ ok: false, error: 'Unauthorized: Invalid API Key' });
  }

  if (clientStatus !== 'READY') {
    return res.status(503).json({
      ok: false,
      error: `WhatsApp service is not ready (Current status: ${clientStatus}). Please scan QR code first.`
    });
  }

  const { phone, message } = req.body;
  if (!phone || !message) {
    return res.status(400).json({ ok: false, error: 'Both phone and message are required.' });
  }

  // Clean phone number (strip +, spaces, dashes)
  const cleanDigits = String(phone).replace(/\D/g, '');
  const chatId = cleanDigits.includes('@') ? cleanDigits : `${cleanDigits}@c.us`;

  try {
    const isRegistered = await client.isRegisteredUser(chatId);
    if (!isRegistered) {
      return res.status(404).json({
        ok: false,
        error: `Phone number +${cleanDigits} is not registered on WhatsApp.`
      });
    }

    const sentMsg = await client.sendMessage(chatId, message);
    console.log(`📤 [WhatsApp] Sent to +${cleanDigits} (ID: ${sentMsg.id._serialized})`);

    res.json({
      ok: true,
      messageId: sentMsg.id._serialized,
      recipient: cleanDigits,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error(`❌ [WhatsApp] Failed to send to +${cleanDigits}:`, err.message);
    res.status(500).json({
      ok: false,
      error: err.message || 'Failed to send WhatsApp message'
    });
  }
});

const admin = require('firebase-admin');

// Initialize Firebase Admin for Firestore Queue listener
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || 'munirathnam-illam'
    });
    console.log('🔥 [Firebase] Initialized for whatsappQueue processing (Project: munirathnam-illam)');
  } catch (err) {
    console.warn('⚠️ [Firebase] Could not initialize Firebase Admin:', err.message);
  }
}

// Queue Worker function to process pending WhatsApp reminders
let isProcessingQueue = false;
async function processWhatsappQueue() {
  if (isProcessingQueue || clientStatus !== 'READY' || !admin.apps.length) return;
  isProcessingQueue = true;

  try {
    const snap = await admin.firestore().collection('whatsappQueue')
      .where('status', '==', 'PENDING')
      .limit(10)
      .get();

    for (const doc of snap.docs) {
      const data = doc.data();
      const cleanDigits = String(data.phone).replace(/\D/g, '');
      const chatId = cleanDigits.includes('@') ? cleanDigits : `${cleanDigits}@c.us`;

      try {
        console.log(`[Queue Worker] Sending WhatsApp to +${cleanDigits} (Room ${data.roomId || 'Unknown'})...`);
        const isReg = await client.isRegisteredUser(chatId).catch(() => true);
        if (!isReg) {
          console.warn(`[Queue Worker] +${cleanDigits} is not registered on WhatsApp`);
          await doc.ref.update({
            status: 'FAILED',
            error: 'Not registered on WhatsApp',
            processedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          continue;
        }

        const sentMsg = await client.sendMessage(chatId, data.message);
        console.log(`✅ [Queue Worker] Successfully sent to +${cleanDigits} (ID: ${sentMsg.id._serialized})`);

        await doc.ref.update({
          status: 'SENT',
          messageId: sentMsg.id._serialized || null,
          processedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Add to audit trail
        await admin.firestore().collection('whatsappAudit').add({
          tenantId: data.tenantId || null,
          roomId: data.roomId || null,
          roomNo: data.roomNo || null,
          tenantName: data.tenantName || 'Unknown',
          phone: cleanDigits,
          monthKey: data.monthKey || null,
          status: 'SENT',
          messageId: sentMsg.id._serialized || null,
          source: 'QUEUE_WORKER',
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      } catch (sendErr) {
        console.error(`❌ [Queue Worker] Error sending to +${cleanDigits}:`, sendErr.message);
        await doc.ref.update({
          status: 'FAILED',
          error: sendErr.message,
          processedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }

      await new Promise(r => setTimeout(r, 2000));
    }
  } catch (qErr) {
    console.error('[Queue Worker] Error polling queue:', qErr.message);
  } finally {
    isProcessingQueue = false;
  }
}

// Start queue listener when client is ready
client.on('ready', () => {
  if (admin.apps.length) {
    console.log('📡 [Queue Worker] Listening for pending WhatsApp reminders in Firestore...');
    try {
      admin.firestore().collection('whatsappQueue')
        .where('status', '==', 'PENDING')
        .onSnapshot(() => {
          processWhatsappQueue().catch(() => {});
        }, (err) => {
          console.warn('[Queue Worker] Snapshot listener error:', err.message);
        });
    } catch (e) {
      console.warn('[Queue Worker] Snapshot setup error:', e.message);
    }
    // Fallback interval polling every 10 seconds
    setInterval(() => {
      processWhatsappQueue().catch(() => {});
    }, 10000);
  }
});

app.listen(PORT, () => {
  console.log(`🚀 [WhatsApp Service] Listening on port ${PORT}`);
  console.log(`📡 [WhatsApp Service] Status: http://localhost:${PORT}/status`);
  console.log(`🔑 [WhatsApp Service] Auth endpoint: POST /send-whatsapp with x-api-key header\n`);
});
