require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.WHATSAPP_PORT || 3001;
const API_KEY = process.env.WHATSAPP_API_KEY || 'munirathnam_secret_wa_key_2026';

let currentQR = null;
let clientStatus = 'INITIALIZING'; // 'INITIALIZING', 'QR_REQUIRED', 'READY', 'DISCONNECTED', 'AUTHENTICATING'
let connectedPhone = null;

console.log('🚀 Initializing WhatsApp Web Client...');

const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: path.resolve(__dirname, '.wwebjs_auth')
  }),
  puppeteer: {
    headless: true,
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

app.listen(PORT, () => {
  console.log(`🚀 [WhatsApp Service] Listening on port ${PORT}`);
  console.log(`📡 [WhatsApp Service] Status: http://localhost:${PORT}/status`);
  console.log(`🔑 [WhatsApp Service] Auth endpoint: POST /send-whatsapp with x-api-key header\n`);
});
