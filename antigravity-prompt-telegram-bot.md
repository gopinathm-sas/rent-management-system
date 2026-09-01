# Feature Request: Telegram Bot for Rental Management App

## Context
This is my Rental Management App. I want a single Telegram bot that handles two related but separate workflows:

1. **Water meter reading entry** — replacing manual entry of meter readings with chat-based submission.
2. **Rent status updates** — letting a quick message like "G01 Rent Received" mark that unit's rent as received on the app's existing Rent Status page, instead of opening the app and clicking through manually.

Both features share the same bot, the same user linking/authorization system, and the same principle: the bot is a thin input layer that calls into the app's existing business logic — it never bypasses validation or writes directly to the database.

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
Build a Telegram bot integration that lets an authorized user (a) submit a water meter reading, and (b) update a unit's rent payment status, both via chat — validated against business rules and stored using the exact same data model/pipeline as the existing manual-entry flows, so nothing downstream (billing, reports, tenant statements, Rent Status page) needs to change.

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

# Shared Technical Requirements (both features)
- Both features live in the same `grammy` bot instance, already wired into the `telegramWebhook` Cloud Function for production and `scripts/telegram-bot-dev.js` for local polling. Route incoming messages by shape: a message inside an active `/reading` conversation goes to Feature 1's handler; a message matching `<unit_code> <status keyword>` or starting with `/rent` goes to Feature 2's handler; anything unrecognized falls through to a help message listing both capabilities.
- No new hosting/deployment decision needed — extend the existing webhook Cloud Function and dev polling script rather than standing up a second bot process.
- Store the bot token using whatever mechanism `telegramWebhook` already uses to read it in production (Firebase Functions config/secrets) and whatever `.env`/local config `telegram-bot-dev.js` reads for local dev — never hard-code it, and don't introduce a second secrets mechanism.
- For the Telegram-to-app-user linking data (chat_id ↔ app user), add a new Firestore collection (e.g. `telegramLinks`, keyed by `chat_id` or app user ID) rather than a SQL-style migration, consistent with the rest of the schema being Firestore-native.
- Add input sanitization on all incoming Telegram message text before using it in Firestore queries or business logic.
- Log all bot interactions (command, user, result) using whatever logging Cloud Functions already emits (`console.log`/Firebase Functions logs), or an existing app-level logger if one exists.

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

## Testing
- Write tests for: the validation logic (lower reading, huge jump, near-zero consumption, duplicate cycle), the linking flow, unauthorized access rejection, and bulk entry (mixed valid/invalid lines, unauthorized unit in a batch, all-flagged batch).
- Write tests for Feature 2: message parsing (all three status keyword groups, unrecognized unit, unrecognized status phrase), authorization scoping, no-op on already-set status, downgrade confirmation (Paid → Rent Only/Pending), `"None"`-month rejection, and amount cross-check (matching computed value, mismatched value, no amount given).
- Provide a way to test locally against a test bot token before pointing at the production bot.

## Deliverables
1. Working bot code integrated into the existing app codebase (not a standalone side-project), covering both features, deployed via the existing `telegramWebhook` Cloud Function and runnable locally via `npm run bot:dev`.
2. Any new Firestore collections needed (e.g. `telegramLinks` for chat_id-to-user linking, and any audit log collection for meter readings / rent status changes) — no SQL migrations, this is Firestore.
3. A short README section explaining: how to create the Telegram bot via BotFather, where the bot token is configured for both production (Cloud Functions config/secrets) and local dev (`.env` used by `telegram-bot-dev.js`), how to run it locally, the linking flow for onboarding new staff, and the accepted message formats for both meter readings and rent status updates.
4. A summary of what existing files/modules were touched or reused (especially `DataContext.tsx`, `utils.ts`, and whatever new Cloud Function handler file is added), so I can review the diff easily.

---
**All implementation details are confirmed above** — stack, schema, exact `updateRentStatus` formula, deployment model, and the `rent` field for amount cross-checks. Please proceed directly to implementation. The one thing worth confirming as you go, since it wasn't fully clear from the summary: whether `updateRentStatus` in `DataContext.tsx` can be safely invoked from a Cloud Function (server-side, via `firebase-admin`) as-is, or whether it's written against the client Firebase SDK and needs an equivalent server-side version — flag this specifically once you've opened the file, since it affects how Feature 2 is wired up.
