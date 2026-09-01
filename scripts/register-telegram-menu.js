const https = require('https');
const fs = require('fs');
const path = require('path');

// Read token from .env
let token = process.env.TELEGRAM_BOT_TOKEN;
if (!token && fs.existsSync(path.resolve(__dirname, '../.env'))) {
  const envText = fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf8');
  const match = envText.match(/TELEGRAM_BOT_TOKEN=["']?([^"'\r\n]+)["']?/);
  if (match) token = match[1].trim();
}

if (!token) {
  console.error("TELEGRAM_BOT_TOKEN not found in .env");
  process.exit(1);
}

function callTelegramApi(method, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${token}/${method}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve(parsed);
        } catch (e) {
          resolve({ ok: false, raw: body });
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.write(data);
    req.end();
  });
}

async function run() {
  console.log("1. Setting commands list...");
  const commands = [
    { command: 'start', description: 'Welcome overview & quick guide' },
    { command: 'reading', description: 'Submit water meter reading' },
    { command: 'bulk', description: 'Bulk paste multiple unit readings' },
    { command: 'rent', description: 'Update rent payment status' },
    { command: 'status', description: 'View monthly water meter status' },
    { command: 'help', description: 'Command guide & phrasing examples' },
    { command: 'link', description: 'Link Telegram account with staff code' },
    { command: 'cancel', description: 'Cancel active conversation' }
  ];

  const resCmds = await callTelegramApi('setMyCommands', { commands });
  console.log('setMyCommands response:', resCmds);

  console.log("2. Setting chat menu button to 'commands'...");
  const resBtn = await callTelegramApi('setChatMenuButton', {
    menu_button: { type: 'commands' }
  });
  console.log('setChatMenuButton response:', resBtn);

  console.log("3. Verifying getChatMenuButton...");
  const resGet = await callTelegramApi('getChatMenuButton', {});
  console.log('getChatMenuButton response:', resGet);

  console.log("4. Verifying getMyCommands...");
  const resGetCmds = await callTelegramApi('getMyCommands', {});
  console.log('getMyCommands response:', resGetCmds);
}

run();
