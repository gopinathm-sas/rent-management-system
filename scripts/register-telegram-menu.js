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
  console.log("1. Setting complete commands list with Telegram Bot API...");
  const commands = [
    { command: 'start', description: 'Welcome overview & quick guide' },
    { command: 'reading', description: 'Submit water meter reading for one unit' },
    { command: 'bulk', description: 'Bulk submit readings for multiple units' },
    { command: 'rent', description: 'Update rent payment status for a unit' },
    { command: 'notify', description: 'Send rent & water breakdown via WhatsApp' },
    { command: 'pending', description: 'List units with pending rent this month' },
    { command: 'rentonly', description: 'List units that paid rent only (water owed)' },
    { command: 'summary', description: 'Overview: counts + collected vs expected' },
    { command: 'total', description: 'This month collected vs expected total' },
    { command: 'unit', description: 'Look up one unit status (e.g. /unit G01)' },
    { command: 'expense', description: 'Log an expense (category, amount, note)' },
    { command: 'undo', description: 'Remove recent expense entry (within 10 min)' },
    { command: 'status', description: 'View monthly water meter status' },
    { command: 'help', description: 'List all commands and example phrasings' },
    { command: 'link', description: 'Link Telegram account with staff code' },
    { command: 'cancel', description: 'Cancel active conversation flow' }
  ];

  const resCmds = await callTelegramApi('setMyCommands', { commands });
  console.log('setMyCommands response:', resCmds);

  console.log("2. Setting chat menu button to 'commands'...");
  const resBtn = await callTelegramApi('setChatMenuButton', {
    menu_button: { type: 'commands' }
  });
  console.log('setChatMenuButton response:', resBtn);

  console.log("3. Verifying registered commands...");
  const resGetCmds = await callTelegramApi('getMyCommands', {});
  console.log('getMyCommands count:', resGetCmds.result?.length);
  console.log('Registered commands:', resGetCmds.result?.map(c => `/${c.command} - ${c.description}`));
}

run();
