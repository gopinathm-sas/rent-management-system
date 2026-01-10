# Copilot instructions (Rent Management System)

## Architecture (read this first)
- Single-file SPA: UI + logic live in [index.html](index.html) (Tailwind CDN + Firebase JS modules). No bundler.
- Hosting: [firebase.json](firebase.json) serves repo root and rewrites all routes to `/index.html` (SPA).
- iOS (Capacitor): runtime uses `www/index.html` (generated). Always edit root [index.html](index.html) and run `npm run copy:web` (injects `capacitor.js`, copies `assets/`) via [scripts/copy-web-assets.js](scripts/copy-web-assets.js). Never hand-edit `www/index.html`.
- Backend automation: Cloud Functions in [functions/index.js](functions/index.js) (Node 18) for eviction settlement + scheduled auto-vacate + email.

## Dev workflows
- Web: open [index.html](index.html) directly.
- iOS: `npm run ios` (runs `copy:web`, `cap sync ios`, opens Xcode). Use `npm run cap:sync` to sync all platforms.
- Tests: `npm test` is a placeholder. The repo has a Jest/jsdom a11y test in [tests/keyboard-focus-a11y.test.js](tests/keyboard-focus-a11y.test.js).
- Firebase deploy: `firebase deploy --only hosting` / `firebase deploy --only functions` / `firebase deploy --only hosting,functions`.
- Destructive tooling: [delete_collections.js](delete_collections.js) needs `GOOGLE_APPLICATION_CREDENTIALS` (see [DELETE_README.md](DELETE_README.md)).

## Firebase security + data model (source of truth)
- Treat [firestore.rules](firestore.rules) as authoritative (some guidance in [SECURITY.md](SECURITY.md) may be stale).
- Role lists are stored as docs keyed by email (rules check exact + lowercase): `authorizedUsers/*`, `adminUsers/*`, `viewerUsers/*`.
- Permissions:
  - Staff = authorized OR admin → read/write `properties` and `expenses`.
  - Viewer → read-only `properties` and `expenses`.
  - Admin-only: `adminSettings/*` + managing allowlists.
- Tenant upload flow uses `tenantUploadInvites` + `tenantUploadSubmissions` with `emailLower`, expiry (`expiresAt`), and `inviteId`/`roomId` consistency checks.

## Project conventions to preserve
- Many UI actions are inline `onclick="..."` calling `window.*` exports; keep existing `window.<name>` APIs stable when refactoring.
- Rooms are fixed in `IMMUTABLE_ROOMS_DATA` (room “03” intentionally absent) in [index.html](index.html).
- Dates are `YYYY-MM-DD`; status strings are case-sensitive (`Occupied` / `Vacant`) and are shared with [functions/index.js](functions/index.js).

## Cross-file business logic duplication (update both)
- Water billing constants/logic are duplicated in [index.html](index.html) and [functions/index.js](functions/index.js): `DEFAULT_WATER_RATE` (0.25), `DISCOUNTED_WATER_RATE` (0.20 for rooms 11–13), `WATER_UNITS_MULTIPLIER` (10), `RENT_WATER_SERVICE_CHARGE` (₹60).
- Eviction settlement snapshot calculations exist client-side and in functions; keep outputs consistent.
