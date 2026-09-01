# 🤖 Telegram Water Meter Bot Setup Guide

**Munirathnam Illam Rental Manager** includes a Telegram Bot integration allowing authorized staff and managers to submit monthly water meter readings directly via Telegram chat. Readings are validated, checked for anomalies, and synced with Firestore in real time.

---

## 1. Create Bot with @BotFather

1. Open Telegram and search for [@BotFather](https://t.me/BotFather).
2. Send `/newbot`.
3. Choose a name: `Munirathnam Illam Water Bot`.
4. Choose a username (must end in `bot`), e.g., `MunirathnamIllamBot`.
5. Copy the **HTTP API Token** provided by BotFather (e.g., `7123456789:AAH...`).

### Set Bot Commands in BotFather
Send `/setcommands` to `@BotFather`, select your bot, and paste:
```text
reading - Submit water meter reading for a room
status - View current month water readings status
link - Link your Telegram account with a 6-character code
unlink - Disconnect your Telegram account
help - How to use the bot
cancel - Cancel active conversation flow
```

---

## 2. Configuration & Secrets

### For Local Testing (`.env`)
Add the token to your `.env` file in the project root:
```env
TELEGRAM_BOT_TOKEN="7123456789:AAH..."
```

### For Production (Firebase Cloud Functions)
Set the secret in Firebase Functions config:
```bash
firebase functions:config:set telegram.token="7123456789:AAH..."
```
*(Or set `TELEGRAM_BOT_TOKEN` in the Cloud Functions runtime environment).*

---

## 3. Local Testing Runner (Polling Mode)

To run the bot locally without needing public URLs or webhooks:
```bash
TELEGRAM_BOT_TOKEN="your_token_here" npm run bot:dev
```
The terminal will display:
```text
🤖 Starting Munirathnam Illam Telegram Bot (Polling Mode)...
[Firebase] Initialized with project ID: munirathnam-illam-test
✅ Bot @MunirathnamIllamBot is running and listening for messages!
```

---

## 4. Production Webhook Deployment

When ready to deploy the Cloud Function:
```bash
# 1. Deploy the Cloud Function
firebase deploy --only functions:telegramWebhook

# 2. Register the Webhook with Telegram API
curl -F "url=https://<REGION>-<PROJECT_ID>.cloudfunctions.net/telegramWebhook" \
     https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook
```

To verify webhook status anytime:
```bash
curl https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo
```

---

## 5. Staff Onboarding & Linking Flow

1. **Admin generates code:**
   - Go to the web app: **Admin** ➔ **Telegram Bot** tab.
   - Enter the staff member's email (e.g. `staff@munirathnamillam.com`) and choose a role (`Staff`, `Property Manager`, `Admin`).
   - Click **Generate One-Time Code**.
   - Copy the 6-character code (e.g. `8X92KP`, valid for 15 minutes).
2. **Staff links in Telegram:**
   - Staff opens `@MunirathnamIllamBot` in Telegram and sends:
     ```text
     /link 8X92KP
     ```
   - The bot replies:
     ```text
     ✅ Successfully Linked!
     👤 Account: staff@munirathnamillam.com
     🏷️ Role: Staff
     ```
3. **Revoking access:**
   - Admin can view all authorized Telegram staff under the **Telegram Bot** tab and click **Unlink Account** at any time.

---

## 6. How Staff Submit Readings

### Option A: Interactive Menu
1. Send `/reading`.
2. Bot displays an interactive keyboard of all rooms with indicators:
   - `✅` = Already recorded for this month
   - `💧` = Occupied & Pending
   - `⚪` = Vacant
3. Tap a room (e.g. `[💧 G01]`).
4. Bot shows the tenant name and last recorded reading, and asks for the new value:
   ```text
   🏠 Room G01 (01)
   👤 Tenant: John Doe
   📅 Cycle: 2026-Sep
   📌 Last Recorded (2026-Aug): 1024.5

   💬 Please send the new reading number (e.g. 1041.5):
   ```
5. Reply with `1041.2`.
6. Bot confirms and saves:
   ```text
   ✅ Water Reading Saved Successfully!
   🏠 Room: G01 (01)
   👤 Tenant: John Doe
   📊 New Reading: 1041.2
   📅 Billing Cycle: 2026-Sep
   📈 Meter Delta: +16.7 units
   💧 Water Units: 167 units
   💰 Water Charge: ₹42
   ```

### Option B: Quick Shorthand Entry
Directly send:
```text
/reading G01 1041.2
# or
/reading 01 1041.2
```

---

## 7. Built-in Validation Rules

| Check | Trigger Condition | Bot Action |
|---|---|---|
| **Lower than previous** | New reading < previous reading | Asks if this is a meter replacement/reset (`[🔄 Yes, Meter Reset]`). |
| **Large consumption jump** | Meter delta > 50 units (500L) | Shows warning with consumption and asks for explicit confirmation. |
| **Duplicate for current cycle** | Reading already exists for current month | Shows existing value and asks whether to overwrite. |
| **Invalid number** | Letters, negative numbers | Prompts user with friendly retry instructions. |
| **Unauthorized user** | Unlinked Telegram account | Denies access and instructs user to request a linking code. |

---

## 8. Summary of Modified / Added Files

* **Cloud Functions:**
  * [`functions/telegramBot.js`](file:///Users/apple/Desktop/Munirathnam%20Illam%20Rental%20Manager/functions/telegramBot.js) — Core Telegram bot logic, validation, state management, and Firestore mutation.
  * [`functions/index.js`](file:///Users/apple/Desktop/Munirathnam%20Illam%20Rental%20Manager/functions/index.js) — Exported `telegramWebhook` HTTPS Cloud Function.
  * [`functions/package.json`](file:///Users/apple/Desktop/Munirathnam%20Illam%20Rental%20Manager/functions/package.json) — Added `grammy` dependency.
* **Security & Database:**
  * [`firestore.rules`](file:///Users/apple/Desktop/Munirathnam%20Illam%20Rental%20Manager/firestore.rules) — Rules for `telegramUsers`, `telegramAuthCodes`, and `waterReadingsAudit`.
* **Admin Web UI:**
  * [`src/components/TelegramBotTab.jsx`](file:///Users/apple/Desktop/Munirathnam%20Illam%20Rental%20Manager/src/components/TelegramBotTab.jsx) — Admin UI for generating codes, managing linked staff, and viewing submission audits.
  * [`src/pages/Admin.jsx`](file:///Users/apple/Desktop/Munirathnam%20Illam%20Rental%20Manager/src/pages/Admin.jsx) — Added Telegram Bot management tab.
* **Developer Tools & Tests:**
  * [`scripts/telegram-bot-dev.js`](file:///Users/apple/Desktop/Munirathnam%20Illam%20Rental%20Manager/scripts/telegram-bot-dev.js) — Standalone polling runner (`npm run bot:dev`).
  * [`package.json`](file:///Users/apple/Desktop/Munirathnam%20Illam%20Rental%20Manager/package.json) — Added `bot:dev` script.
  * [`tests/telegram-bot.test.js`](file:///Users/apple/Desktop/Munirathnam%20Illam%20Rental%20Manager/tests/telegram-bot.test.js) — Automated Jest unit tests covering calculations, room normalizations, and validation.
