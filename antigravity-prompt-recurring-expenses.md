# Feature Request: Recurring Expenses on the Expense Page

## Context
This is my Rental Management App (React 18, TypeScript/JSX, Vite, Tailwind CSS, Firebase Auth + Firestore + Cloud Functions backend — same stack as the rest of the app). Some expenses repeat every month (e.g. internet bill, a fixed maintenance retainer) and I currently have to re-enter them by hand each time. I want the Expense page to support marking an expense as recurring, so the app automatically creates it again on the same day every month — flagged for me to review and confirm the amount, since it can vary month to month, rather than being silently finalized.

**Before writing any code, first find and inspect the existing Expense tab's implementation** (component, Firestore collection/fields, and add/save function) — this was already flagged as unconfirmed in a prior feature (expense entry via the Telegram bot) and is a prerequisite for this one too. Reuse whatever's found rather than introducing a second, parallel expense data model.

## Confirmed Requirements (from our discussion)
- **Auto-create, but flagged for review** — on the recurring day, the app creates the expense entry automatically, but it's marked as needing my confirmation before it counts as final (not silently added as if I'd entered it myself).
- **Amount varies each time** — don't assume the same amount every month; ask me to confirm/enter the actual amount when reviewing the auto-created entry, using last month's amount only as a starting suggestion.
- **Manageable afterward** — I need to be able to pause, stop, or edit a recurring expense at any time, not just set it once and be stuck with it.

## Functional Requirements

### 1. Setting Up a Recurring Expense
- When adding or editing an expense on the Expense page, add a "Make this recurring" option.
- Recurring setup fields: category (reuse whatever category mechanism the Expense tab already has), day of month (1–31), and an optional note/description template that pre-fills each month's entry.
- Store recurring definitions in their own collection (e.g. `recurringExpenses`), separate from the actual expense records — a recurring definition is a *rule*, not an expense entry itself.
- Each definition has a status: `active` or `paused`.

### 2. Automatic Monthly Generation
- A scheduled Cloud Function (Firebase Scheduled Function / Cloud Scheduler, running daily) checks all `active` recurring definitions and, for each whose day-of-month matches today, creates a new expense entry in the normal expense collection — but marked with a `pendingConfirmation: true` flag (or equivalent) and a reference back to its recurring definition (e.g. `recurringId`).
- **Day clamping**: if a recurring day (e.g. 31) doesn't exist in the current month (e.g. February), generate it on the last actual day of that month instead of skipping it.
- **Idempotency**: before creating an entry, check whether one was already generated for that recurring definition + month (e.g. by checking for an existing entry with that `recurringId` and month), so a function retry or duplicate run never creates two entries for the same month.
- **Catch-up check**: the daily check should also catch a recurring definition whose day has already passed earlier in the current month without an entry yet existing (e.g. the function had downtime on the exact day) — check "should this month have an entry by now and doesn't?" rather than only "does today match the day exactly?" — so a missed run doesn't silently skip the whole month.

### 3. Reviewing & Confirming Pending Entries
- Add a "Needs Review" section on the Expense page (visually distinct, e.g. a badge/counter) listing all `pendingConfirmation` entries.
- Each pending entry shows its category, date, and note, with the amount field either blank or pre-filled with the amount from the most recent confirmed occurrence of that same recurring definition, as a starting suggestion — clearly editable, not locked in.
- **Pending entries are excluded from the Expense page's totals/reports until confirmed** — an unconfirmed guessed amount shouldn't distort monthly totals.
- Confirming an entry: user reviews/adjusts the amount, then confirms — at that point `pendingConfirmation` is cleared and it becomes a normal expense entry, counted in totals like any other.
- Allow dismissing/deleting a pending entry outright (e.g. the bill didn't apply this particular month, or was cancelled) without it affecting the recurring definition itself — the next month's generation should proceed normally afterward.

### 4. Managing Recurring Definitions
- A "Manage Recurring Expenses" view listing all recurring definitions (active and paused) with their category, day of month, and last-used amount.
- Controls per definition: **Edit** (category, day, note), **Pause** (stops future auto-generation without touching already-created entries), **Resume**, and **Delete** (stops future generation permanently; historical expense entries already generated from it are untouched — deleting the rule doesn't delete past expenses).
- Editing a definition (e.g. changing the day of month) only affects future generations — entries already created keep their original date.

### 5. Data Consistency with Existing Expense Records
- Confirmed recurring-generated entries should be indistinguishable from manually entered ones in the main expense collection/schema (same fields), aside from the optional `recurringId` reference for traceability — so existing reports, totals, and the Telegram bot's `/expense`-related features (if they read from this collection) continue to work without special-casing.

## Edge Cases to Handle
- Recurring day set to 29/30/31 in a shorter month → clamp to that month's actual last day, don't skip the month entirely.
- Scheduled function runs twice for the same day (retry) → idempotency check prevents a duplicate pending entry for the same recurring definition + month.
- Scheduled function has downtime on the exact due day → the catch-up check should still generate the entry later that month rather than silently missing it.
- Multiple recurring expenses due on the same day → each generates its own independent pending entry.
- A pending entry sits unconfirmed for a while → it should stay visible and counted in the "Needs Review" badge indefinitely until confirmed or dismissed, not silently disappear or auto-confirm itself.
- Pausing a recurring definition after this month's entry was already generated and confirmed → no retroactive effect; it simply stops generating from the next cycle onward.
- Deleting a recurring definition → past confirmed expenses generated from it remain in the records; only future generation stops.

## Testing
- Unit test day-of-month clamping for short months (Feb, 30-day months).
- Test idempotency: simulate the scheduled function running twice in the same day for the same definition and confirm only one pending entry is created.
- Test the catch-up path: simulate a definition whose day already passed this month with no entry yet, and confirm the function still generates one.
- Test that a paused definition does not generate, and that resuming it does on the next matching day.
- Test that pending entries are excluded from totals until confirmed, and included immediately after confirmation.
- Test that dismissing a pending entry doesn't affect the underlying recurring definition or future months.

## Deliverables
1. The `recurringExpenses` collection and the recurring-definition management UI (create, edit, pause/resume, delete) on the Expense page.
2. The scheduled Cloud Function that generates pending entries daily, with clamping, idempotency, and catch-up logic.
3. The "Needs Review" section and confirm/adjust/dismiss flow for pending entries.
4. A summary of what existing Expense tab files/functions were reused, so recurring-generated entries stay fully consistent with manually entered ones.

---
**Before starting implementation**, please first tell me:
1. The exact Expense tab schema and add/save function found during inspection (same open item as the earlier Telegram-bot expense feature — if that was already resolved by the time this is built, reuse those findings directly).
2. Whether Firebase Cloud Scheduler / Scheduled Functions are already used anywhere else in this project (for consistent setup/config conventions), or if this would be the first one.

Then proceed with implementation once confirmed.
