# Feature Request: Telegram Bot for Water Meter Reading Entry

## Context
This is my Rental Management App. Currently, water meter readings for each rental unit are entered manually through the app's UI every billing cycle. I want to replace/supplement that manual entry with a Telegram bot, so I (or my property staff) can just send the reading number to the bot from a phone, and it gets validated and saved into the same water meter readings table the app already uses.

**Before writing any code, first explore the existing codebase** (backend framework, database schema, ORM, existing "meter reading" model/table, existing auth system, and existing API structure) and summarize what you find. Adapt everything below to match the existing stack and conventions rather than introducing a new pattern. Ask me only if something is genuinely ambiguous after inspecting the repo.

## Goal
Build a Telegram bot integration that lets an authorized user submit a water meter reading via chat, have it validated against business rules, and have it stored using the exact same data model/pipeline as the existing manual-entry flow — so nothing downstream (billing, reports, tenant statements) needs to change.

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
- Persist through the same service/repository layer the manual entry UI already uses (don't bypass business logic by writing directly to the DB from the bot handler) so validation, billing triggers, and any hooks stay consistent.
- Store metadata: which Telegram user submitted it, timestamp, and the linked app user, in whatever audit/history mechanism the app already has (or add one if none exists).

### 7. Confirmation & Feedback
- After successful save, bot replies with a clear confirmation: unit name, reading value, date, and (if easy to compute) the consumption delta since the last reading.
- If something fails (validation, DB error, permission issue), the bot should explain what went wrong and what to do next — never leave the user with silence or a generic error.

### 8. Admin/Owner Visibility
- Optionally notify the owner/admin (via a separate Telegram message or in-app notification) when a reading is submitted via the bot, especially if it triggered an anomaly warning.

## Technical Requirements
- Use the standard Telegram Bot API via the appropriate library for our stack (detect and reuse whatever language/framework this project already uses instead of introducing a new one).
- Support both polling and webhook mode where feasible, but default to whichever is simpler to deploy given our current hosting setup — ask me which the current infra supports if it's not obvious from the repo (e.g., is there already an HTTPS endpoint available for a webhook?).
- Store the bot token and any secrets in environment variables / the existing secrets management approach — never hard-code them.
- Reuse the existing database migration approach to add any new tables/columns needed (e.g., a `telegram_users` linking table with `telegram_chat_id`, `app_user_id`, `linked_at`).
- Add input sanitization on all incoming Telegram message text before using it in queries or business logic.
- Log all bot interactions (command, user, result) using the existing logging setup for observability and debugging.

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

## Edge Cases to Handle
- User sends a reading without going through `/reading` first (no context) → prompt them to start the flow properly.
- User sends the wrong data type (text instead of number).
- Same user tries to submit for a unit they aren't authorized for.
- Bot restarts mid-conversation — conversation state should not be lost in a way that corrupts data (avoid relying purely on in-memory state for anything beyond the current message exchange; persist partial flow state if the framework supports it, or keep the flow stateless/single-message where possible).
- Multiple staff submitting for the same unit around the same time (avoid race conditions on the "duplicate this cycle" check).
- Bulk message with mixed valid/invalid lines, duplicate unit codes within the same batch, or a batch that's mostly flagged for confirmation — the per-line summary should make it obvious what needs the user's attention versus what's already done.
- Very large bulk pastes — consider a reasonable line limit per message and tell the user to split into multiple batches if exceeded.

## Testing
- Write tests for: the validation logic (lower reading, huge jump, near-zero consumption, duplicate cycle), the linking flow, unauthorized access rejection, and bulk entry (mixed valid/invalid lines, unauthorized unit in a batch, all-flagged batch).
- Provide a way to test locally against a test bot token before pointing at the production bot.

## Deliverables
1. Working bot code integrated into the existing app codebase (not a standalone side-project).
2. Any new DB migrations required.
3. A short README section explaining: how to create the Telegram bot via BotFather, where to put the token, how to run it locally, and how the linking flow works for onboarding new staff.
4. A summary of what existing files/modules were touched or reused, so I can review the diff easily.

---
**Before starting implementation**, please first tell me:
1. What backend framework/language and database this project uses (from your inspection).
2. Where the existing water meter reading logic/model lives.
3. Whether polling or webhook mode is more practical given current hosting.

Then proceed with implementation once confirmed.
