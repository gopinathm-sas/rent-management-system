# Copilot instructions (Rent Management System)

## Big picture
- Single-file SPA: all UI + logic lives in [index.html](index.html) (~7k lines) using Tailwind CDN + Firebase JS modules.
- Hosting: [firebase.json](firebase.json) serves the repo root and rewrites all routes to `/index.html` (SPA). The hosted app uses root `index.html`.
- iOS: Capacitor uses `www/index.html`; run `npm run copy:web` to copy root `index.html` → `www/` and inject `capacitor.js` ([scripts/copy-web-assets.js](scripts/copy-web-assets.js)). Do not hand-edit `www/index.html`.

## Key workflows
- Web dev: open [index.html](index.html) directly (no build step).
- iOS: `npm run ios` (copies web → `www/`, `cap sync ios`, opens Xcode).
- Tests: there is no working `npm test`; run `npm install --save-dev jest jsdom && npx jest tests/keyboard-focus-a11y.test.js` ([tests/keyboard-focus-a11y.test.js](tests/keyboard-focus-a11y.test.js)).
- Firestore destructive tooling: [delete_collections.js](delete_collections.js) requires `GOOGLE_APPLICATION_CREDENTIALS` ([DELETE_README.md](DELETE_README.md)).

## Auth + security model (client + rules)
- Client mode: `sessionStorage.loginMode` is used to gate UI; `applySessionNavMode()` toggles `[data-user-only]` / `[data-admin-only]` in [index.html](index.html).
- Rules are default-deny and allowlist-based in [firestore.rules](firestore.rules):
  - Staff (authorized OR admin) can read/write `properties` and `expenses`.
  - Only admins manage `authorizedUsers`, `adminUsers`, and `adminSettings/*`.
  - Tenant uploads use `tenantUploadInvites` + `tenantUploadSubmissions` with `emailLower` + expiry checks.
- Note: [SECURITY.md](SECURITY.md) includes some older/generic rule guidance; treat [firestore.rules](firestore.rules) as the source of truth.

## Data model + conventions
- Primary collections: `properties`, `expenses`, `adminSettings/main` (and upload invite/submission collections above).
- Duplicate-tolerant tenant lookup: `pickBestRoomRecord()` + `findTenantForRoom()` (both in [index.html](index.html)).
- UI handlers: many buttons call `window.*` functions from inline `onclick="..."`; keep `window.<name>` exports stable when refactoring.

## Business rules to keep consistent
- Rooms are fixed in `IMMUTABLE_ROOMS_DATA` (room 03 intentionally absent) in [index.html](index.html).
- Water billing constants/logic are duplicated in [index.html](index.html) and [functions/index.js](functions/index.js) (rates, multiplier, ₹60 service charge). If you change one, change the other.
- Date strings are `YYYY-MM-DD`; status strings are case-sensitive (`Occupied` / `Vacant`).

## Git workflow
- After completing a change, commit and push to the current branch by default.
- If the user says not to commit/push (or asks to batch multiple changes), follow the user’s instruction.
