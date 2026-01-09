# Copilot instructions (Rent Management System)

## Big picture
- Single-file SPA: all UI + logic live in [index.html](index.html) (~7k lines) using Tailwind CDN + Firebase JS modules.
- Hosting: [firebase.json](firebase.json) serves the repo root and rewrites all routes to `/index.html` (SPA). The hosted app uses root `index.html`.
- iOS: Capacitor uses `www/index.html`; run `npm run copy:web` to copy root `index.html` → `www/` and inject `capacitor.js` ([scripts/copy-web-assets.js](scripts/copy-web-assets.js)). Do not hand-edit `www/index.html`.
- Cloud Functions live in [functions/index.js](functions/index.js) (Node 18) and automate eviction settlement + email.

## Key workflows
- Web dev: open [index.html](index.html) directly (no build step).
- iOS: `npm run ios` (copies web → `www/`, `cap sync ios`, opens Xcode).
- Tests: `npm test` is a placeholder; run `npm install --save-dev jest jsdom && npx jest tests/keyboard-focus-a11y.test.js` ([tests/keyboard-focus-a11y.test.js](tests/keyboard-focus-a11y.test.js)).
- Firestore destructive tooling: [delete_collections.js](delete_collections.js) requires `GOOGLE_APPLICATION_CREDENTIALS` ([DELETE_README.md](DELETE_README.md)).

## Auth + security model (client + rules)
- User avatars are sanitized: `photoURL` is used only if it starts with `http://` or `https://` (otherwise it falls back to a placeholder URL).
  - Staff (authorized OR admin) can read/write `properties` and `expenses`.
  - Only admins manage `authorizedUsers`, `adminUsers`, and `adminSettings/*`.
  - Tenant uploads use `tenantUploadInvites` + `tenantUploadSubmissions` with `emailLower` + expiry checks.
- Note: [SECURITY.md](SECURITY.md) includes some older/generic rule guidance; treat [firestore.rules](firestore.rules) as the source of truth.

- Firebase deploy (CLI): project alias is set in [.firebaserc](.firebaserc).
  - Hosting only: `firebase deploy --only hosting`
  - Functions only: `firebase deploy --only functions`
  - Both: `firebase deploy --only hosting,functions`

## Data model + conventions
- Primary collections: `properties`, `expenses`, `adminSettings/main` (and upload invite/submission collections above).
- Duplicate-tolerant tenant lookup: `pickBestRoomRecord()` + `findTenantForRoom()` (both in [index.html](index.html)).
- UI handlers: many buttons call `window.*` functions from inline `onclick="..."`; keep `window.<name>` exports stable when refactoring.

## Business rules to keep consistent
- Rooms are fixed in `IMMUTABLE_ROOMS_DATA` (room 03 intentionally absent) in [index.html](index.html).
- Water billing constants/logic are duplicated in [index.html](index.html) and [functions/index.js](functions/index.js) (rates, multiplier, ₹60 service charge). If you change one, change the other.
- Date strings are `YYYY-MM-DD`; status strings are case-sensitive (`Occupied` / `Vacant`) and are used by both the UI and [functions/index.js](functions/index.js).

## Functions automation
- [functions/index.js](functions/index.js) sends an eviction settlement email when a `properties/{docId}` record becomes vacant and includes `archivedTenant.evictionSettlement`.
- Gmail SMTP credentials are required (Firebase functions config `gmail.user`/`gmail.pass` OR env `GMAIL_USER`/`GMAIL_PASS`). Admin recipient email comes from `adminSettings/main.adminEmail`.
- A scheduler auto-vacates tenants hourly when `evictionDate <= today` (Asia/Kolkata timezone).

## Git workflow
- After completing a change, commit and push to the current branch by default.
- If the user says not to commit/push (or asks to batch multiple changes), follow the user’s instruction.
