# Feature Request: Telegram Bot for Rental Management App (Meter Readings, Rent Status, WhatsApp Notifications, Reporting Queries)

## Context
This is my Rental Management App. I want a single Telegram bot that handles four related but separate workflows:

1. **Water meter reading entry** — replacing manual entry of meter readings with chat-based submission.
2. **Rent status updates** — letting a quick message like "G01 Rent Received" mark that unit's rent as received on the app's existing Rent Status page, instead of opening the app and clicking through manually.
3. **WhatsApp rent breakdown notifications** — sending each tenant their monthly rent/water/service-charge breakdown via WhatsApp, triggered by a single Telegram command, instead of manually composing and pasting each message into web.whatsapp.com.
4. **Reporting queries** — since the bot runs 24/7 with a live connection to the same data, let an authorized user ask it quick read-only questions like "which rooms are pending" or "current month total rent" instead of opening the app to check.

All four features share the same bot and the same user linking/authorization system. Features 1 and 2 follow the same principle: the bot is a thin input layer that calls into the app's existing business logic — it never bypasses validation or writes directly to the database. Feature 3 additionally requires a small separate always-on service to handle WhatsApp sending — see its section below for why. Feature 4 is read-only, so it carries the least risk of the four — it never writes anything, only reads and summarizes.

## Confirmed Stack (from codebase inspection — build against this directly, no further discovery needed)
- **Backend runtime**: Node.js 22 on Firebase Cloud Functions, using `firebase-admin` and the `grammy` Telegram bot framework.
- **Database**: Cloud Firestore. Each tenant/unit is a document in the `properties` collection (document ID or a field corresponds to the room ID, e.g. `G01`).
- **Frontend**: React 18 (TypeScript/JSX), Vite, Tailwind CSS — not touched by this feature except for reference when replicating logic.
- **Relevant Firestore fields per tenant document**:
  - `paymentHistory`: map of `{ [monthKey]: "Pending" | "Rent Only" | "Paid" | "None" }`, e.g. `{ "2026-Aug": "Paid" }`
  - `paymentTotals`: map of `{ [monthKey]: number }`, e.g. `{ "2026-Aug": 7240 }`
  - `waterReadings`: map of `{ [monthKey]: number }`, e.g. `{ "2026-Aug": 1041.2 }`
  - `rent`: number, the base monthly rent, e.g. `6533`
  - `waterRate`: number, per-unit water rate (default `0.25`, `0.20` for 4th floor units)
- **Key existing code to reuse, not reimplement**:
  - UI grid: `src/pages/RentDetails.jsx`
  - Calculation helpers: `src/lib/utils.ts` — `computeFinancialsForMonth`, `computeWaterForMonth`
  - Mutation handler: `src/contexts/DataContext.tsx` — `updateRentStatus` (see exact formula in Feature 2 below)
- **Deployment**:
  - Production runs in webhook mode via the deployed HTTPS Cloud Function `telegramWebhook` (already live, e.g. `https://us-central1-<project>.cloudfunctions.net/telegramWebhook`), running 24/7 serverless with Firebase Admin credentials already available in that environment.
  - Local development uses polling via `npm run bot:dev` (`scripts/telegram-bot-dev.js`).
  - This means: **no new hosting decision needed** — build Feature 1 and Feature 2 as `grammy` command/message handlers registered in the same bot instance that `telegramWebhook` already dispatches to, and make sure they also work through the local polling runner for dev/testing.

**Before writing any code, still skim the files listed above** to confirm current formatting/conventions (e.g. exact monthKey generation, existing error-handling patterns in `updateRentStatus`) before adding new handlers, since implementation details can drift from this summary. Ask only if something in those files contradicts what's documented here.

## Goal
Build a Telegram bot integration that lets an authorized user (a) submit a water meter reading, (b) update a unit's rent payment status, (c) send tenants their monthly breakdown via WhatsApp, and (d) ask quick read-only questions about rent/payment status — all via chat, validated against business rules, and using the exact same data model/pipeline as the existing manual-entry flows, so nothing downstream (billing, reports, tenant statements, Rent Status page) needs to change.

---

# Feature 1: Water Meter Reading Entry

## Functional Requirements

### 1. Identity & Authorization
- Only Telegram users I explicitly authorize can submit readings — this bot must not accept input from strangers.
- Each authorized Telegram account must be linked to a specific existing user/role in the app (e.g., "Owner", "Property Manager", or a specific staff member), reusing the existing user/auth table if possible rather than creating a parallel identity system.
- Provide a one-time linking flow: e.g., an admin generates a linking code in the app (or via a bot admin command), the Telegram user sends `/link <code>` to the bot, and the bot binds their Telegram chat_id to the app user record.
- Unauthorized/unlinked users who message the bot should get a polite rejection message, not an error, and this attempt should be logged.

### 2. Selecting the Property / Unit / Meter
- The app already has multiple properties/units, each with its own water meter. The bot must know which meter a reading applies to before accepting a number.
- Support one of these flows (pick whichever fits the existing data model best, or offer both):
  - `/reading` starts an interactive flow: bot lists the properties/units the linked user has permission for (as inline keyboard buttons), user picks one, then bot asks for the reading number.
  - Direct shorthand: `/reading <unit_code> <value>` for power users who know the unit code.
- If a user only manages one property/unit, skip the selection step and go straight to asking for the number.

### 3. Entering the Reading
- Accept the reading as a plain number (support decimals if the existing schema does).
- Reject non-numeric input with a clear error message and let the user retry, don't crash or hang the conversation state.

### 4. Bulk Entry (for users managing multiple units)
- Support submitting several readings in a single message instead of one at a time, using a simple line-per-unit format, e.g.:
  ```
  101: 1041.2
  102: 998.0
  103: 1204.5
  ```
- Parse each line independently — a malformed line (bad unit code, non-numeric value) should not abort the whole batch. Instead, process every valid line and return a per-line summary: which succeeded, which were flagged for confirmation (per the anomaly rules below), and which failed with a reason.
- If any lines in the batch trigger an anomaly warning (unusually high jump or near-zero consumption), ask for confirmation on just those specific lines rather than the whole batch, so the clean entries aren't held up.
- Only show unit codes the linked user is actually authorized to submit for; reject (with a clear message) any line referencing a unit outside their permission scope, without failing the rest of the batch.
- Reuse the exact same single-reading validation/save logic per line internally — bulk entry should be a thin wrapper around the same pipeline, not a separate code path.

### 5. Validation Rules (apply before saving)
- **Not less than the previous reading** for that same meter (water meters are cumulative — flag or reject if the new value is lower than the last recorded value, since that likely indicates a meter replacement or a typo).
- **Sanity-check the jump size**: if the new reading is dramatically higher than the previous reading (e.g., more than X units/percent above typical consumption for that unit), don't auto-reject — instead ask the user to confirm ("This is unusually high compared to last month's reading of Y. Confirm this is correct? Yes/No") before saving.
- **Prevent duplicate submissions** for the same meter within the same billing period — if a reading already exists for the current cycle, warn the user and ask whether they want to overwrite/correct it (and if so, log it as a correction, not a silent overwrite, if the schema supports an audit trail).
- **Flag zero or near-zero consumption**: if the new reading implies little to no usage since the last cycle, don't reject it outright, but flag it for confirmation ("This shows almost no water usage since last month — is the unit vacant, or could the meter be faulty? Confirm this is correct? Yes/No"). Log flagged-zero readings the same way as flagged-high readings so the owner can review patterns over time (e.g., a meter that's been near-zero for several cycles in a row is worth investigating).
- All validation error/confirmation messages should be human-friendly, not raw exceptions.

### 6. Saving the Reading
- Persist by updating the tenant document's `waterReadings.<monthKey>` field in the `properties` collection (matching the `{ "2026-Aug": 1041.2 }` shape), using the same write path `RentDetails.jsx` uses today — go through `DataContext.tsx` rather than writing to Firestore directly from the bot handler, so any downstream recompute (e.g. `computeWaterForMonth`) stays consistent.
- Store metadata: which Telegram user submitted it, timestamp, and the linked app user. If there's no existing audit trail for meter readings, add a lightweight one (e.g. a `meterReadingLog` subcollection or top-level collection) rather than skipping audit entirely.

### 7. Confirmation & Feedback
- After successful save, bot replies with a clear confirmation: unit name, reading value, date, and (if easy to compute) the consumption delta since the last reading.
- If something fails (validation, DB error, permission issue), the bot should explain what went wrong and what to do next — never leave the user with silence or a generic error.

### 8. Admin/Owner Visibility
- Optionally notify the owner/admin (via a separate Telegram message or in-app notification) when a reading is submitted via the bot, especially if it triggered an anomaly warning.

---

# Feature 2: Rent Status Update via Telegram Bot

## Goal
Let an authorized user send a short message like **"G01 Rent Received"** and have the bot parse it, find unit G01, and set that unit's status for the current month on the existing Rent Status page — same underlying update logic as clicking the cell manually in the app.

## Rent Status Model (confirmed from codebase — `DataContext.tsx` L191-232, `updateRentStatus`)
Each tenant document in `properties` has a `paymentHistory` map keyed by month (`"2026-Aug"` style) with values `"Pending" | "Rent Only" | "Paid" | "None"`, and a parallel `paymentTotals` map holding the amount collected for that month. Setting a status runs this exact logic today, and the bot must call the same `updateRentStatus` function rather than reimplement it:

| Status | `paymentHistory.<monthKey>` | `paymentTotals.<monthKey>` |
|---|---|---|
| **Pending** | `"Pending"` | `0` |
| **Rent Only** | `"Rent Only"` | `tenant.rent` |
| **Paid** | `"Paid"` | `tenant.rent + waterCharge + serviceCharge(₹60)` |

- `waterCharge` for a month is computed via `computeWaterForMonth` in `src/lib/utils.ts`, using the tenant's `waterReadings` map and `waterRate` (default `0.25`, `0.20` for 4th floor).
- The full breakdown for "Paid" is computed by `computeFinancialsForMonth`, which the bot should call to get the exact total rather than recalculating water charge and service charge separately — this guarantees the number shown to the user matches what the app itself would show.
- `"None"` is the fourth possible value in the schema (likely representing a month before move-in / not applicable) — the bot should treat months already at `"None"` the way a dash cell is treated visually: never target them for a status update, and if a user tries, explain that the unit wasn't active that month rather than creating a Pending/Rent Only entry out of nowhere.

## Functional Requirements

### 1. Message Parsing
- Support flexible, close-to-natural phrasing rather than a rigid command syntax, since the whole point is speed. Recognize these keyword groups and map them to the three settable statuses (`updateRentStatus` handles the actual write):
  - **Rent Only**: `G01 Rent Received`, `G01 Rent Only`, `G01 Rent Paid`
  - **Paid** (rent + water + service charge): `G01 Paid`, `G01 Fully Paid`, `G01 Rent and Water Received`, `G01 Rent + Water Paid`
  - **Pending**: `G01 Pending`, `G01 Due`, `G01 Not Paid`, `G01 Unpaid` (reverts the cell to Pending)
  - `/rent G01 <status>` as a strict fallback command for unambiguous cases
- Parsing approach: extract the unit code (first token, case-insensitive, matched against tenant room IDs in the `properties` collection — e.g. `G01`, `102`, `403`) and match the remaining text against the keyword groups above.
- If the unit code isn't recognized, tell the user which unit codes exist for units they manage, rather than a bare error.
- If the phrase doesn't match any known keyword group, don't guess — reply asking the user to rephrase or use `/rent <unit_code> <status>`, and list the three settable statuses in plain terms ("Rent Only", "Paid", "Pending").

### 2. Which Month
- Default to the **current month**, expressed as the `monthKey` format the schema already uses (`"YYYY-MMM"`, e.g. `"2026-Aug"`) — generate this the same way the existing code does (check `RentDetails.jsx`/`utils.ts` for the exact helper rather than reimplementing date formatting).
- Allow an optional explicit month in the message for corrections, e.g. `G01 Rent Received Aug`, parsed into the same `monthKey` format.

### 3. Authorization
- Reuse the same Telegram-to-app-user linking system from Feature 1 — no separate linking flow needed.
- A linked user can only update rent status for units they're authorized to manage (same permission scope used for meter readings, or the app's existing per-unit permission system if different).

### 4. Amount Capture
- `updateRentStatus` already computes the amount for Rent Only (`tenant.rent`) and Paid (`tenant.rent + waterCharge + serviceCharge`) — the bot does **not** need the user to type an amount for these to work correctly, since the real total comes from `computeFinancialsForMonth`/`computeWaterForMonth`, not user input.
- Still support an optional trailing amount in the message purely as a **cross-check**, e.g. `G01 Rent Received 6533` or `G01 Paid 8500` — see validation below for what happens when it's provided.
- Setting a cell to **Pending** never involves an amount (it always zeroes `paymentTotals.<monthKey>`).

### 5. Validation & Confirmation
- If the unit's status for that month is **already set to the status being requested**, tell the user it's already set that way rather than silently re-saving (e.g., "G01 is already marked Rent Only for Aug.").
- If the unit's status for that month is already **Paid** and the incoming message would downgrade it to **Rent Only** or **Pending**, treat this as a correction and ask for explicit confirmation before overwriting ("G01 is currently marked Paid for Aug. Change to Rent Only? Yes/No") — downgrades are more consequential than upgrades and shouldn't happen by accident.
- If the target month's current status is `"None"`, reject the update and explain the unit wasn't active/applicable that month rather than creating an out-of-place entry.
- **Amount cross-check** (schema confirms `rent` is a real field on every tenant document, e.g. `rent: 6533`): if the user provides an amount, compare it against what the status implies —
  - For **Rent Only**: compare against `tenant.rent` directly.
  - For **Paid**: compare against the full total from `computeFinancialsForMonth` (rent + water + ₹60 service charge) for that month.
  - On a mismatch, flag for confirmation rather than rejecting outright (e.g., "Expected rent for G01 is ₹6,533, you entered ₹6,000 — confirm this is correct? Yes/No"). If confirmed, still save using the **computed** amount (not the user's typed figure) unless the app's existing manual-entry UI actually allows overriding the computed total — check `RentDetails.jsx` for whether manual overrides are supported before deciding.
- All validation/confirmation messages should be human-friendly, not raw exceptions.

### 6. Saving the Update
- Call `updateRentStatus` from `src/contexts/DataContext.tsx` directly (or the equivalent server-side callable if that function is client-only — check whether it's safe to invoke from a Cloud Function or whether the same logic needs a thin server-side twin using `firebase-admin`). Don't reimplement the Firestore writes to `paymentHistory`/`paymentTotals` from scratch in the bot handler.
- Record metadata (Telegram user, app user, timestamp) in the same audit mechanism used for Feature 1, or a new lightweight log collection if none exists yet for rent status changes.

### 7. Confirmation & Feedback
- On success, reply with a clear confirmation: unit, new status, month, amount (if any), and timestamp.
- On failure or ambiguity, explain exactly what's needed to proceed (which unit codes are valid, which statuses are recognized, etc.).

### 8. Admin/Owner Visibility
- Optionally notify the owner when a rent status is updated via bot, especially downgrades or amount mismatches — mirroring Feature 1's admin notification approach.

---

# Feature 3: Rent Breakdown Notification via WhatsApp

## Goal
Let an authorized user send a single Telegram command and have the bot compose each tenant's full monthly breakdown (rent, water usage & charge, service charge, total due) from the same data Features 1 and 2 already maintain, then deliver it to that tenant's WhatsApp — replacing the current manual process of composing and pasting each message by hand into web.whatsapp.com.

## Important Architecture Note — read before building
You currently send these messages manually via **web.whatsapp.com**, not an official API. Automating that (typically via a library like `whatsapp-web.js`, which drives a headless/real browser logged into WhatsApp Web) has two consequences that shape this feature's design:

1. **Not officially sanctioned by WhatsApp.** This isn't the Meta Business Cloud API — it's browser automation of the consumer/business web client. It generally works at small scale (a dozen or so tenants), but carries real risk of the number being flagged or temporarily blocked, especially if messages go out rapidly or the account looks bot-like. This is a judgment call the owner is making with eyes open, not something to design around silently.
2. **Needs a persistent process, not a serverless function.** `whatsapp-web.js` holds an open browser session and WebSocket connection to stay logged in — Firebase Cloud Functions spin down between invocations and can't hold that session alive. This means:
   - Stand up a small **separate, always-on service** (e.g. a lightweight Node.js process on a low-cost always-on host — a small VPS, a Cloud Run service with `min-instances=1`, or similar — check what's cheapest/simplest given the rest of this project already lives on Firebase) that runs `whatsapp-web.js`, handles the one-time QR-code login, and persists its session data to disk/a volume so it doesn't need re-scanning on every restart.
   - This service exposes a small internal HTTP endpoint (e.g. `POST /send-whatsapp { phone, message }`) that only the Telegram bot's Cloud Function is allowed to call (protect it with a shared secret/API key, not left open on the internet).
   - The Telegram bot (in `telegramWebhook`, same as Features 1 & 2) composes the message and calls this endpoint — it does not try to run `whatsapp-web.js` itself inside the Cloud Function.
   - If the WhatsApp Web session logs out (QR expired, phone unlinked), the sending service should surface a clear error, and the bot should tell the owner directly in Telegram that re-authentication (re-scanning the QR on the host machine) is needed — this can't be automated away.

## Functional Requirements

### 1. Trigger Command
- `/notify <unit_code>` — compose and send the current month's breakdown to that one tenant.
- `/notify all` — compose and send to every occupied tenant for the current month (skip units whose status is `"None"` for that month, matching Feature 2's convention).
- Support an optional explicit month, e.g. `/notify G01 Aug`, for resending a past month's breakdown.

### 2. Composing the Breakdown
- Pull the same figures Features 1 & 2 already compute — `computeFinancialsForMonth` / `computeWaterForMonth` from `src/lib/utils.ts` — rather than recalculating anything independently, so the WhatsApp message always matches what the app itself shows.
- Message should include at minimum: tenant name, unit/room number, month, rent amount, water usage (units consumed) and water charge, service charge, and total due — matching the structure of whatever you currently type manually. Since I don't have your exact wording, draft a clean, friendly default template and make the text easy to find/edit in one place (e.g. a single template string or function) rather than scattered across the codebase, so you can tweak wording later without touching logic.
- Respect the tenant's phone number field already stored in Firestore. If it's missing or malformed for a given unit, skip that unit and report it rather than failing the whole batch.

### 3. Preview & Confirmation
- For a single-unit `/notify`, show the composed message back in Telegram first and ask for confirmation before actually sending ("Send this to Srinath (G01)? [Yes] [No]") — cheap insurance against sending a wrong figure to a tenant.
- For `/notify all`, show a summary first (how many tenants, which ones will be skipped and why — missing phone, `"None"` status, already notified this month) and require one confirmation before the whole batch goes out, rather than confirming each individually.

### 4. Duplicate Protection
- Track whether a breakdown was already sent for a given unit/month (e.g. a `notifiedAt.<monthKey>` field per tenant, or a small notification log collection). If already sent, warn before resending ("Already notified G01 for Aug on 2 Sep. Resend? Yes/No").

### 5. Sending & Rate Limiting
- Send one WhatsApp message at a time with a randomized short delay between messages in bulk mode (a few seconds each) rather than firing them all at once — reduces the chance of the automation looking bot-like and tripping spam detection.
- Don't retry aggressively on failure; one retry at most, then report the failure and move to the next tenant in a batch.

### 6. Feedback
- On success (single): confirm tenant, unit, month, and that the message was delivered (or at least accepted by the sending service — WhatsApp Web automation typically can't guarantee true delivery/read confirmation the way an official API can, so be honest about that limitation in the bot's reply).
- On success (bulk): a per-tenant summary — sent / skipped (with reason) / failed (with reason) — not just a single "done" message.
- On failure (e.g. sending service unreachable, WhatsApp session logged out): tell the owner plainly what's wrong and that manual sending may be needed until it's fixed.

### 7. Authorization
- Given this sends real messages to real tenants and carries account risk, restrict `/notify` to the Owner/Admin role only (reuse the same linking/authorization system, but gate this specific command more tightly than meter readings or rent status updates, which staff can also do).

### 8. Audit Trail
- Log every notification attempt (unit, month, phone number used, timestamp, Telegram user who triggered it, success/failure) in a Firestore collection, so there's a record of what was sent to whom and when — useful both for your own tracking and for resolving any "I never got my bill" disputes with tenants.

---

# Feature 4: Reporting Queries

## Goal
Since the bot runs 24/7 with a live connection to the same Firestore data Features 1–3 already use, let an authorized user ask it quick read-only questions — "which rooms have pending rent", "current month total rent", "who's only paid rent so far" — and get an immediate answer, without opening the app. This feature never writes anything; it only reads and summarizes, which makes it the lowest-risk of the four to build and use.

## Functional Requirements

### 1. Query Commands
Support both slash commands (for the command menu) and flexible free-text phrasing that maps to the same handlers:

| Command | Free-text equivalents | What it returns |
|---|---|---|
| `/pending` | "which rooms are pending", "who hasn't paid" | List of units currently Pending for the month |
| `/rentonly` | "who's paid rent only", "which rooms owe water" | List of units currently Rent Only (rent paid, water outstanding) |
| `/summary` | "give me a summary", "how's this month looking" | Counts (Paid / Rent Only / Pending) + collected vs. expected totals |
| `/total` | "current month total rent", "how much collected this month" | Just the collected-vs-expected total figures |
| `/unit <code>` | "G01 status", "how's G01 doing" | That unit's current status, amount, and (if Rent Only) what's still owed |

- All of the above default to the **current month**, with an optional explicit month the same way Features 2 & 3 handle it (e.g. `/summary Aug`, "total rent for August").
- Parsing approach: recognize the command/keyword first, then optionally extract a unit code (for `/unit`) or a month name, reusing the same extraction logic already built for Features 1–3 rather than writing a third parser from scratch.
- If a free-text message doesn't clearly match one of these query types, don't guess — fall through to the general help message (same one used when Features 1–3 don't recognize a message).

### 2. Computing the Numbers
- Read each tenant document in the `properties` collection and look at `paymentHistory.<monthKey>` / `paymentTotals.<monthKey>` for the requested month — don't introduce a new data model, this is the same schema Feature 2 already writes to.
- Skip any unit whose status for that month is `"None"` (not applicable/vacant that month) from all counts and totals — consistent with how Features 2 & 3 treat `"None"`.
- **Collected total** = sum of `paymentTotals.<monthKey>` across included units.
- **Expected total** = sum of, for each included unit, `computeFinancialsForMonth`'s full total (rent + water + service charge) — reuse this helper rather than recalculating the formula independently, so it never drifts from what Feature 2 uses to validate amounts.
- For `/summary`, present both the counts and the collected-vs-expected comparison together, e.g. "8 Paid, 2 Rent Only, 1 Pending — ₹65,200 collected of ₹78,400 expected (83%)."

### 3. Authorization & Scope
- Reuse the same Telegram-to-app-user linking system as the other three features — no separate linking flow.
- A linked user only sees units they're authorized to manage, same scope as Features 1 & 2. If the owner/admin manages everything, they see portfolio-wide reports; a staff member scoped to specific units sees a report limited to just those.

### 4. Formatting the Reply
- Use Telegram's message formatting (bold, line breaks) so lists are easy to scan — one line per unit, e.g. "🔸 G02 — Anil (L) — Pending" rather than a wall of unformatted text.
- If a list would be empty (e.g. no pending rents this month), say so positively ("No pending rents for Aug — nice."), don't return a blank or empty-looking message.
- Keep responses well under Telegram's message length limit; if a portfolio ever grew large enough to risk that, split into multiple messages rather than truncating silently (not a real concern at your current unit count, but worth building correctly).

---

# Shared Technical Requirements (all four features)
- All four features live in the same `grammy` bot instance, already wired into the `telegramWebhook` Cloud Function for production and `scripts/telegram-bot-dev.js` for local polling. Route incoming messages by shape: a message inside an active `/reading` conversation goes to Feature 1's handler; a message matching `<unit_code> <status keyword>` or starting with `/rent` goes to Feature 2's handler; a message starting with `/notify` goes to Feature 3's handler; a message matching one of Feature 4's query commands/keywords (`/pending`, `/rentonly`, `/summary`, `/total`, `/unit`, or their free-text equivalents) goes to Feature 4's handler; anything unrecognized falls through to a help message listing all capabilities.
- No new hosting/deployment decision needed for Features 1, 2 & 4 — extend the existing webhook Cloud Function and dev polling script. Feature 3 is the one exception: it needs the separate always-on WhatsApp-sending service described above, in addition to the existing Cloud Functions setup.
- Store the bot token using whatever mechanism `telegramWebhook` already uses to read it in production (Firebase Functions config/secrets) and whatever `.env`/local config `telegram-bot-dev.js` reads for local dev — never hard-code it, and don't introduce a second secrets mechanism. The WhatsApp-sending service's shared API key follows the same principle: environment variable/secret, never hard-coded, and never logged in plaintext.
- For the Telegram-to-app-user linking data (chat_id ↔ app user), add a new Firestore collection (e.g. `telegramLinks`, keyed by `chat_id` or app user ID) rather than a SQL-style migration, consistent with the rest of the schema being Firestore-native.
- Add input sanitization on all incoming Telegram message text before using it in Firestore queries or business logic.
- Log all bot interactions (command, user, result) using whatever logging Cloud Functions already emits (`console.log`/Firebase Functions logs), or an existing app-level logger if one exists.

## Bot Command Menu (Telegram native "/" menu)
Register a command list with Telegram via `bot.api.setMyCommands(...)` (grammy) on bot startup, so the menu button next to the message box shows all available commands with descriptions — instead of expecting users to remember free-text formats from scratch.

| Command | Description shown in menu |
|---|---|
| `/start` | Welcome message and quick overview of what the bot can do |
| `/link` | Link your Telegram account to your app user (prompts for the code) |
| `/reading` | Submit a water meter reading for one unit |
| `/bulk` | Submit water meter readings for multiple units at once |
| `/rent` | Update a unit's rent status (shows accepted status words) |
| `/notify` | Send a tenant's rent/water breakdown via WhatsApp (Owner/Admin only) |
| `/pending` | List units with pending rent this month |
| `/rentonly` | List units that paid rent only (water still owed) |
| `/summary` | Overview: counts by status + collected vs. expected total |
| `/total` | This month's collected vs. expected total |
| `/unit` | Look up one unit's current status (prompts for unit code) |
| `/help` | List all commands and example phrasings for each |

- Free-text shortcuts (`G01 Rent Received`, `101: 1041.2`, etc.) should keep working exactly as specified above — the command menu is a discoverability aid on top of them, not a replacement.
- `/help` should double as a living reference: list the three rent statuses and example phrasings, and the meter-reading formats (single and bulk), so a new staff member can learn the bot without asking anyone.
- `/notify` is admin-only (Feature 3, section 7) — use grammy's per-scope command support (`setMyCommands` with a `scope`) so regular staff don't see `/notify` in their menu at all, while Owner/Admin accounts do.
- Re-register the command list on every deploy (or check it's idempotent to call `setMyCommands` repeatedly) so menu changes ship automatically with code changes, rather than needing a manual one-off API call.

## Conversation Flow Example
```
User: /start
Bot: Welcome. Please link your account first: /link <code>

User: /link 8X92KP
Bot: ✅ Linked as Property Manager for "Green Valley Apartments".

User: /reading
Bot: Which unit? [Unit 101] [Unit 102] [Unit 103]

User: [taps Unit 101]
Bot: Please send the current water meter reading for Unit 101 (last recorded: 1024.5)

User: 1041.2
Bot: ✅ Saved. Unit 101 reading: 1041.2 (consumption since last reading: 16.7 units) — recorded 1 Sep 2026.
```

**Bulk entry example:**
```
User: /bulk
Bot: Send readings as "unit: value", one per line.

User:
101: 1041.2
102: 998.0
103: 500.0

Bot:
✅ Unit 101: 1041.2 saved (16.7 units used)
✅ Unit 102: 998.0 saved (12.1 units used)
⚠️ Unit 103: 500.0 — this is a big drop from last reading (1180.0). Confirm this is correct? [Yes] [No]
```

**Rent status example:**
```
User: G01 Rent Received
Bot: ✅ G01 marked Rent Only for Aug 2026 (₹6,533) — recorded 1 Sep 2026.

User: G01 Rent Received
Bot: G01 is already marked Rent Only for Aug 2026.

User: G01 Paid
Bot: G01 is currently marked Rent Only for Aug 2026. Change to Paid (₹6,533 rent + ₹260 water + ₹60 service = ₹6,853)? [Yes] [No]

User: [taps Yes]
Bot: ✅ G01 updated to Paid for Aug 2026 (₹6,853) — recorded 1 Sep 2026.

User: G01 Paid 6800
Bot: ⚠️ Computed total for G01 (Aug 2026) is ₹6,853 (rent + water + service charge), you entered ₹6,800 — confirm and save the computed amount? [Yes] [No]

User: G05 Rent Received
Bot: I don't recognize unit G05. Units you manage: G01, G02, 102, 201, 202, 203, 301, 302, 303, 401, 402, 403.
```

**WhatsApp notify example:**
```
User: /notify G01
Bot: Preview for Srinath (G01), Aug 2026:
"Hi Srinath, here's your Aug 2026 bill for Room 01: Rent ₹6,533 + Water (16.7 units) ₹260 + Service ₹60 = Total ₹6,853. Please pay at your earliest convenience. Thank you!"
Send this to +91XXXXXXXXXX? [Yes] [No]

User: [taps Yes]
Bot: ✅ Sent to Srinath (G01) for Aug 2026.

User: /notify all
Bot: This will message 11 tenants for Aug 2026. 1 skipped: Room 08 (Monica) — no month entry yet. Proceed? [Yes] [No]

User: [taps Yes]
Bot: Sending... (this may take a minute)
Bot: Done. ✅ 10 sent, ⏭️ 1 skipped, ❌ 0 failed. Skipped: Monica (Room 08) — no data for Aug.
```

**Reporting query example:**
```
User: which rooms are pending
Bot: Pending for Aug 2026:
🔸 G02 — Anil (L)
🔸 401 — Mastan

User: /summary
Bot: Aug 2026: 8 Paid, 2 Rent Only, 2 Pending
₹65,200 collected of ₹78,400 expected (83%)

User: G01 status
Bot: G01 (Srinath) — Aug 2026: Paid, ₹6,853

User: total rent for Jul
Bot: Jul 2026: ₹83,175 collected of ₹85,900 expected (97%)
```

## Edge Cases to Handle
- User sends a reading without going through `/reading` first (no context) → prompt them to start the flow properly.
- User sends the wrong data type (text instead of number).
- Same user tries to submit for a unit they aren't authorized for.
- Bot restarts mid-conversation — conversation state should not be lost in a way that corrupts data (avoid relying purely on in-memory state for anything beyond the current message exchange; persist partial flow state if the framework supports it, or keep the flow stateless/single-message where possible).
- Multiple staff submitting for the same unit around the same time (avoid race conditions on the "duplicate this cycle" check).
- Bulk message with mixed valid/invalid lines, duplicate unit codes within the same batch, or a batch that's mostly flagged for confirmation — the per-line summary should make it obvious what needs the user's attention versus what's already done.
- Very large bulk pastes — consider a reasonable line limit per message and tell the user to split into multiple batches if exceeded.
- Rent message with an unrecognized unit code → list the unit codes the user actually manages instead of a bare error.
- Rent message with an unrecognized status phrase (typos, unsupported wording) → ask for rephrase with the three accepted statuses listed in plain terms, don't guess the intent.
- Rent status update for a unit outside the user's authorization scope.
- Rent status update targeting a month whose current status is `"None"` — not applicable/before tenancy — reject with an explanation rather than creating an out-of-place entry.
- Setting the same status that's already set → tell the user it's already set, no-op.
- Downgrading from Paid to Rent Only or Pending → require explicit confirmation, since this reverses money already recorded as collected.
- User-provided amount doesn't match the computed amount (`tenant.rent` for Rent Only, or `computeFinancialsForMonth` total for Paid) → flag for confirmation, and save the computed figure rather than the user's typed one once confirmed (unless the app's manual UI genuinely supports overriding it).
- User doesn't provide an amount at all → this is the normal path; the bot computes it, no follow-up needed.
- `/notify` used by a non-admin/non-owner account → reject clearly, since this command is restricted.
- `/notify <unit>` for a unit with no phone number on file → skip and tell the user, don't attempt to send to an empty/malformed number.
- `/notify <unit>` for a unit whose current month status is `"None"` (no data yet) → refuse with an explanation, same as Feature 2's `"None"`-month handling.
- `/notify <unit>` for a month already notified → warn and require confirmation before resending.
- `/notify all` where the WhatsApp sending service is unreachable or logged out → fail the whole batch upfront with a clear message, rather than partially sending and leaving the owner unsure what went through.
- A message send fails partway through a bulk batch (e.g. one tenant's number is invalid) → continue with the rest of the batch and report the specific failure, don't abort the whole run.
- Query for a month with no data at all (e.g. a future month) → say there's no data yet rather than showing an empty/misleading summary.
- `/unit <code>` for an unrecognized unit code → list the unit codes the user manages, same pattern as Feature 2.
- A staff account with a narrow permission scope asks for `/summary` → scope the summary to only their units, don't leak portfolio-wide figures they're not authorized to see.
- Free-text message that's ambiguous between a query and an actual status update (e.g. could "G01 pending" be read as a question or as a command to mark it Pending?) → treat `/rent`-style status-change keywords and query keywords as distinct enough vocabularies that this shouldn't collide, but if genuinely ambiguous, prefer asking for clarification over silently mutating data — a wrong read on a query is far less costly than a wrong read on a write.

## Testing
- Write tests for: the validation logic (lower reading, huge jump, near-zero consumption, duplicate cycle), the linking flow, unauthorized access rejection, and bulk entry (mixed valid/invalid lines, unauthorized unit in a batch, all-flagged batch).
- Write tests for Feature 2: message parsing (all three status keyword groups, unrecognized unit, unrecognized status phrase), authorization scoping, no-op on already-set status, downgrade confirmation (Paid → Rent Only/Pending), `"None"`-month rejection, and amount cross-check (matching computed value, mismatched value, no amount given).
- Write tests for Feature 3: message composition against known fixture data (verify it matches `computeFinancialsForMonth` output), admin-only authorization, duplicate-notification warning, missing-phone-number skip, `"None"`-month rejection, and bulk-batch partial failure handling (one bad number shouldn't stop the rest). Mock the WhatsApp-sending service's HTTP endpoint in tests rather than hitting a real WhatsApp session.
- Write tests for Feature 4: correct aggregation of collected vs. expected totals against fixture data, `"None"`-month exclusion, per-unit lookup for valid/invalid unit codes, and permission scoping (staff sees only their units, owner sees everything).
- Provide a way to test locally against a test bot token before pointing at the production bot.

## Deliverables
1. Working bot code integrated into the existing app codebase (not a standalone side-project), covering all four features, deployed via the existing `telegramWebhook` Cloud Function and runnable locally via `npm run bot:dev`.
2. Any new Firestore collections needed (e.g. `telegramLinks` for chat_id-to-user linking, and audit log collections for meter readings, rent status changes, and WhatsApp notifications sent) — no SQL migrations, this is Firestore.
3. A short README section explaining: how to create the Telegram bot via BotFather, where the bot token is configured for both production (Cloud Functions config/secrets) and local dev (`.env` used by `telegram-bot-dev.js`), how to run it locally, the linking flow for onboarding new staff, the accepted message formats for meter readings and rent status updates, and — for Feature 3 — how to set up and run the WhatsApp-sending service, including the one-time QR login step and where its session data persists.
4. A summary of what existing files/modules were touched or reused (especially `DataContext.tsx`, `utils.ts`, and whatever new Cloud Function handler file is added), so I can review the diff easily.
5. The `/` command menu registered and visible in Telegram (verify by opening the bot chat and tapping the menu button, not just by reading the code).
6. The separate WhatsApp-sending service (Feature 3) as its own small deployable unit, with clear setup instructions and a note on hosting cost/complexity so the owner can decide where to run it.

---
**All implementation details for Features 1 & 2 are confirmed above** — stack, schema, exact `updateRentStatus` formula, deployment model, and the `rent` field for amount cross-checks. Please proceed directly to implementation. The one thing worth confirming as you go for Feature 2, since it wasn't fully clear from the summary: whether `updateRentStatus` in `DataContext.tsx` can be safely invoked from a Cloud Function (server-side, via `firebase-admin`) as-is, or whether it's written against the client Firebase SDK and needs an equivalent server-side version — flag this specifically once you've opened the file.

**For Feature 3**, a few things to confirm/decide as you build, since they weren't pinned down in this spec:
1. The exact field name for tenant phone numbers in the `properties` collection (it's confirmed to exist — check the actual field name, e.g. `phone`, `phoneNumber`, `whatsappNumber`).
2. Where to host the always-on WhatsApp-sending service — propose the simplest/cheapest option given the rest of the stack is Firebase (e.g. a small Cloud Run service with `min-instances=1`), and confirm with me before provisioning anything that costs money.
3. The exact wording of the breakdown message — I've provided a reasonable default template in the conversation example; treat it as a starting point and make it trivially editable, not final copy.
