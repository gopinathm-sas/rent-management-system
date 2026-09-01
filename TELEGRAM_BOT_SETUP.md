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
bulk - Bulk submit multiple room readings at once
status - View current month water readings status
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
npm run bot:dev
```
The terminal will display:
```text
🤖 Starting Munirathnam Illam Telegram Bot (Polling Mode)...
[Firebase] Initialized with project ID: munirathnam-illam
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

## 5. How to Submit Readings

### Option A: Bulk Entry (Recommended for multiple rooms)
Send `/bulk` or directly paste a multiline text list into the chat:
```text
G01: 1041.2
102: 998.0
201: 1204.5
401: 520.0
```
* **Format:** `Unit: Reading` (supports `:`, `=`, `-`, or spaces).
* **Execution:** Clean lines are saved immediately to Firestore; flagged anomalies (meter resets, zero usage, high jumps) show one-tap confirmation buttons below the batch summary.

### Option B: Interactive Menu
1. Send `/reading`.
2. Bot displays an interactive keyboard of all rooms with indicators:
   - `✅` = Already recorded for this month
   - `💧` = Occupied & Pending
   - `⚪` = Vacant
3. Tap a room (e.g. `[💧 G01]`).
4. Bot shows the tenant name and last recorded reading, and asks for the new value.
5. Reply with `1041.2`.

### Option C: Quick Shorthand Entry
Directly send:
```text
/reading G01 1041.2
# or
/reading 01 1041.2
```

---

## 6. Built-in Validation Rules

| Check | Trigger Condition | Bot Action |
|---|---|---|
| **Lower than previous** | New reading < baseline reading | Asks if this is a meter replacement/reset (`[🔄 Yes, Meter Reset]`). |
| **Zero / Near-Zero Usage** | Reading $\Delta \le 0.1$ units on occupied unit | Prompts confirmation to ensure meter is not stuck or faulty. |
| **Large consumption jump** | Meter delta > 50 units (500L) | Shows warning with consumption and asks for explicit confirmation. |
| **Duplicate for current cycle** | Reading already exists for current month | Shows existing value and asks whether to overwrite. |
| **Invalid number** | Letters, negative numbers | Prompts user with friendly retry instructions. |

---

## 7. Summary of Modified / Added Files

* **Cloud Functions:**
  * [`functions/telegramBot.js`](file:///Users/apple/Desktop/Munirathnam%20Illam%20Rental%20Manager/functions/telegramBot.js) — Core Telegram bot logic, bulk entry parser, zero-usage detection, validation, state management, and Firestore mutations.
  * [`functions/index.js`](file:///Users/apple/Desktop/Munirathnam%20Illam%20Rental%20Manager/functions/index.js) — Exported `telegramWebhook` HTTPS Cloud Function.
  * [`functions/package.json`](file:///Users/apple/Desktop/Munirathnam%20Illam%20Rental%20Manager/functions/package.json) — `grammy` dependency.
* **Security & Database:**
  * [`firestore.rules`](file:///Users/apple/Desktop/Munirathnam%20Illam%20Rental%20Manager/firestore.rules) — Rules for `telegramUsers`, `telegramAuthCodes`, and `waterReadingsAudit`.
* **Admin Web UI:**
  * [`src/components/TelegramBotTab.jsx`](file:///Users/apple/Desktop/Munirathnam%20Illam%20Rental%20Manager/src/components/TelegramBotTab.jsx) — Admin UI with linking code generator, audit trail table with anomaly/zero-usage badges.
  * [`src/pages/Admin.jsx`](file:///Users/apple/Desktop/Munirathnam%20Illam%20Rental%20Manager/src/pages/Admin.jsx) — Integrated Telegram Bot tab.
* **Developer Tools & Tests:**
  * [`scripts/telegram-bot-dev.js`](file:///Users/apple/Desktop/Munirathnam%20Illam%20Rental%20Manager/scripts/telegram-bot-dev.js) — Standalone polling runner (`npm run bot:dev`).
  * [`package.json`](file:///Users/apple/Desktop/Munirathnam%20Illam%20Rental%20Manager/package.json) — Added `bot:dev` script.
  * [`tests/telegram-bot.test.js`](file:///Users/apple/Desktop/Munirathnam%20Illam%20Rental%20Manager/tests/telegram-bot.test.js) — Automated Jest unit tests covering bulk parsing, zero-usage detection, calculations, and room normalizations.
