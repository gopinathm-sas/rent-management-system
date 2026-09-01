# 🤖 Telegram Rental Manager Bot Setup Guide

**Munirathnam Illam Rental Manager** includes a Telegram Bot integration allowing authorized staff and managers to:
1. **Submit water meter readings** (interactive picker, shorthand, or `/bulk` multiline paste).
2. **Update rent payment statuses** (natural phrases like `G01 Rent Received`, `102 Paid 8500`, `201 Pending`, or `/rent`).

All entries are validated against business rules, checked for anomalies, and synced with Firestore in real time.

---

## 1. Create / Configure Bot in @BotFather

1. Open Telegram and message [@BotFather](https://t.me/BotFather).
2. Send `/setcommands`, select your bot, and paste:
```text
reading - Submit water meter reading for a unit
bulk - Bulk submit multiple unit water readings
rent - Update rent payment status for a unit
status - View current cycle water readings status
help - How to use the bot
cancel - Cancel active conversation flow
```

---

## 2. Configuration & Secrets

### For Production (Firebase Cloud Functions)
Set the secret in Firebase Functions config:
```bash
npx firebase functions:config:set telegram.token="<YOUR_BOT_TOKEN>" --project live
```

### For Local Testing (`.env`)
Add to `.env` in the project root:
```env
TELEGRAM_BOT_TOKEN="<YOUR_BOT_TOKEN>"
```

---

## 3. Webhook Setup (Production 24/7)

When deployed to Firebase Cloud Functions:
```bash
curl -F "url=https://us-central1-munirathnam-illam.cloudfunctions.net/telegramWebhook" \
     https://api.telegram.org/bot<YOUR_TELEGRAM_BOT_TOKEN>/setWebhook
```

---

## 4. How to Update Rent Payment Status

You can send natural chat phrases directly to the bot:

| Intent | Phrasing Examples | Action / Recorded Total |
|---|---|---|
| **Rent Only** | `G01 Rent Received`<br>`G01 Rent Only`<br>`102 Rent Paid 6500`<br>`G01 Rent Received Aug 6533` | Marks unit **Rent Only**.<br>Total = base rent (₹6,533). |
| **Paid** (Rent + Water) | `G01 Paid`<br>`G01 Fully Paid`<br>`102 Rent and Water Received`<br>`201 Paid 9060` | Marks unit **Paid**.<br>Total = rent + water charge + service charge (₹60). |
| **Pending** (Reset) | `G01 Pending`<br>`102 Due`<br>`201 Not Paid`<br>`301 Unpaid` | Reverts unit to **Pending**.<br>Total = ₹0. |
| **Command Fallback** | `/rent G01 Paid`<br>`/rent 102 Rent Only Aug 6500` | Strict syntax for unambiguous updates. |

### Built-in Safety & Protections:
* **No-op check:** If the unit is already in the requested status, the bot informs you without redundant writes.
* **Downgrade protection:** Transitioning from `Paid` ➔ `Rent Only` or `Pending` triggers an inline confirmation button to prevent accidental revenue reductions.
* **Amount discrepancy warning:** If a custom amount entered in chat differs from the expected base rent on file (`tenant.rent`), the bot asks for confirmation before recording.
* **Dash-cell check:** Rejects updates for months prior to the tenant's move-in date (`joinDate`).

---

## 5. How to Submit Water Meter Readings

### Option A: Bulk Entry (Multiline paste)
Send `/bulk` or directly paste a list into chat:
```text
G01: 1041.2
102: 998.0
201: 1204.5
401: 520.0
```
* Clean lines save immediately.
* Flagged lines (meter reset, high jump, zero usage) display one-tap confirmation buttons.

### Option B: Interactive Picker
Send `/reading` ➔ tap a room button ➔ reply with the number.

### Option C: Shorthand
Send `/reading G01 1041.2`.

---

## 6. Admin Portal
View linked accounts and full real-time audit trails for both water readings and rent status updates under **Admin ➔ Telegram Bot**.
