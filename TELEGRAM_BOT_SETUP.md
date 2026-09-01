# 🤖 Telegram Rental Manager Bot Setup Guide

**Munirathnam Illam Rental Manager** includes a comprehensive Telegram Bot integration supporting 4 key workflows:
1. **Water meter reading entry** (interactive picker, shorthand, or `/bulk` multiline paste).
2. **Rent payment status updates** (`G01 Rent Received`, `G01 Paid`, `G01 Pending`, `/rent`).
3. **WhatsApp rent breakdown notifications** (`/notify <room>`, `/notify all`).
4. **Instant financial & occupancy queries** (`/pending`, `/rentonly`, `/summary`, `/total`, `/unit <room>`).

All entries are validated against business rules, checked for anomalies, and synced with Firestore in real time.

---

## 1. Native Telegram `/` Command Menu

The bot automatically registers its command menu via `setMyCommands` and `setChatMenuButton`:

| Command | Description shown in menu |
|---|---|
| `/start` | Welcome overview & quick guide |
| `/reading` | Submit water meter reading for one unit |
| `/bulk` | Bulk submit readings for multiple units |
| `/rent` | Update rent payment status for a unit |
| `/notify` | Send rent & water breakdown via WhatsApp (Admin) |
| `/pending` | List units with pending rent this month |
| `/rentonly` | List units that paid rent only (water owed) |
| `/summary` | Overview: counts + collected vs expected |
| `/total` | This month collected vs expected total |
| `/unit` | Look up one unit status (e.g. `/unit G01`) |
| `/status` | View monthly water meter status |
| `/help` | List all commands and example phrasings |
| `/link` | Link Telegram account with staff code |
| `/cancel` | Cancel active conversation flow |

---

## 2. Configuration & Secrets

### For Production (Firebase Cloud Functions)
Set secrets in Firebase Functions config / `.env`:
```env
TELEGRAM_BOT_TOKEN="<YOUR_BOT_TOKEN>"
WHATSAPP_SERVICE_URL="http://localhost:3001" # or your deployed WhatsApp service URL
WHATSAPP_API_KEY="munirathnam_secret_wa_key_2026"
```

### Webhook URL (Production 24/7)
Registered automatically with Telegram:
```bash
curl -F "url=https://us-central1-munirathnam-illam.cloudfunctions.net/telegramWebhook" \
     https://api.telegram.org/bot<YOUR_TELEGRAM_BOT_TOKEN>/setWebhook
```

---

## 3. Feature 1: Water Meter Readings

### Option A: Bulk Entry (Multiline paste)
Send `/bulk` or directly paste a list into chat:
```text
G01: 1041.2
102: 998.0
201: 1204.5
401: 520.0
```
* Clean lines save immediately.
* Flagged lines (meter reset, high jump $>50\text{m}$, zero usage $\Delta \le 0.1\text{m}$) display one-tap inline confirmation buttons.

### Option B: Interactive Picker
Send `/reading` ➔ tap a room button ➔ reply with the number.

### Option C: Direct Shorthand
Send `/reading G01 1041.2`.

---

## 4. Feature 2: Rent Payment Status Updates

Send natural chat messages directly to the bot:

| Intent | Phrasing Examples | Action / Recorded Total |
|---|---|---|
| **Rent Only** | `G01 Rent Received`<br>`G01 Rent Only`<br>`102 Rent Paid 6500`<br>`G01 Rent Received Aug 6533` | Sets **Rent Only**.<br>Total = base rent (₹6,533). |
| **Paid** (Rent + Water) | `G01 Paid`<br>`G01 Fully Paid`<br>`102 Rent and Water Received`<br>`201 Paid 9060` | Sets **Paid**.<br>Total = rent + water charge + service charge (₹60). |
| **Pending** (Reset) | `G01 Pending`<br>`102 Due`<br>`201 Not Paid`<br>`301 Unpaid` | Reverts to **Pending**.<br>Total = ₹0. |
| **Command Fallback** | `/rent G01 Paid`<br>`/rent 102 Rent Only Aug 6500` | Strict syntax for unambiguous updates. |

### Built-in Safety Guards:
* **No-op check:** Informs user if already in requested status.
* **Downgrade protection:** Requires explicit confirmation when changing from `Paid` ➔ `Rent Only` or `Pending`.
* **Amount discrepancy alert:** Warns if entered amount differs from expected computed total.
* **Pre-move-in check:** Prevents edits to months prior to `tenant.joinDate`.

---

## 5. Feature 3: WhatsApp Rent Breakdown Notifications

Send monthly bills to tenants' WhatsApp numbers with automatic water, rent, and service charge computations.

### Commands:
* `/notify G01` — Previews the composed WhatsApp message in Telegram with recipient details and `[✅ Send WhatsApp]` / `[❌ Cancel]` buttons.
* `/notify all` — Previews a broadcast summary of all occupied units, lists any skipped units (missing phone), and requests one-tap confirmation before sending with rate limiting (2.5s delay between messages).
* `/notify 102 Jul` — Send for a specific past month.

### WhatsApp Microservice Setup (`whatsapp-service/`):
Because `whatsapp-web.js` requires an active browser/WebSocket session, it runs as a lightweight microservice:

1. **Install dependencies:**
   ```bash
   cd whatsapp-service && npm install && cd ..
   ```
2. **Start the service:**
   ```bash
   npm run whatsapp:dev
   ```
3. **Scan QR Code:**
   * Scan the QR code shown in the terminal, or open `http://localhost:3001/qr` in your browser.
   * WhatsApp session data persists locally in `whatsapp-service/.wwebjs_auth/` so re-scanning is only needed if logged out.

---

## 6. Feature 4: Instant Reporting Queries (Read-Only)

Ask the bot quick questions without opening the app:

| Query Type | Slash Command | Free-Text Phrasing | Returns |
|---|---|---|---|
| **Pending Rent** | `/pending` | `"which rooms are pending"`, `"who hasn't paid"`, `"unpaid rooms"` | List of units currently unpaid for the cycle |
| **Rent Only** | `/rentonly` | `"who's paid rent only"`, `"which rooms owe water"` | Units with water bills still outstanding |
| **Summary** | `/summary` | `"give me a summary"`, `"how's this month looking"` | Status breakdown + ₹ collected of ₹ expected (%) |
| **Revenue Total** | `/total` | `"current month total rent"`, `"how much collected this month"` | Collected vs expected revenue |
| **Unit Status** | `/unit G01` | `"G01 status"`, `"how's 102 doing"` | Single room breakdown and payment status |

*All queries default to the active billing cycle and support explicit months (e.g. `/summary Jul`, `total rent for August`).*

---

## 7. Admin Portal & Audit Logs

Under **Admin ➔ Telegram Bot** in the web app:
* **Generate Linking Codes:** Create 15-minute one-time codes for staff onboarding (`/link <CODE>`).
* **Audit Trail Filter:** Filter between **All**, **Water**, **Rent**, and **WhatsApp** logs in real time.
