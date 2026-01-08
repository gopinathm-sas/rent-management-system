# Copilot instructions (Rent Management System)

## Architecture (single-file SPA + mobile wrapper)
- **Web app**: `index.html` contains all UI + logic (~5000+ lines). Uses Tailwind CDN + Firebase JS modules.
- **Mobile**: Capacitor wraps `index.html` for iOS. Script `scripts/copy-web-assets.js` copies to `www/` and injects `capacitor.js`.
- **Backend**: Firebase Hosting (SPA rewrite in `firebase.json`) + Firestore + optional Cloud Functions (`functions/index.js`).
- **Editing philosophy**: Make **small, surgical edits** to `index.html`. Avoid framework migrations unless explicitly requested.

## Auth flow (client + server enforcement)
- **Client gate**: `onAuthStateChanged` checks login mode (`sessionStorage.loginMode` = `user`|`admin`) against Firestore allowlists:
  - `user` → `authorizedUsers/{email}` must exist
  - `admin` → `adminUsers/{email}` must exist
- **UI switching**: `applySessionNavMode()` shows/hides `[data-user-only]` and `[data-admin-only]` elements.
- **Server rules** (`firestore.rules`): default-deny; "staff" (authorized OR admin) can read/write `properties`+`expenses`; only admins manage allowlists + `adminSettings`.

## Data model (Firestore + duplicate tolerance)
**Collections:**
- `properties/{docId}`: tenant/room records. **Legacy duplicates exist** per room; matching logic uses:
  - `pickBestRoomRecord(records)`: prefers `status='Occupied'`, then newest `updatedAt/createdAt`.
  - `findTenantForRoom(roomData)`: fetches candidates by `roomId`, calls `pickBestRoomRecord()`.
- `expenses/{docId}`: itemized expenses. Live-updated via `subscribeExpenses()` real-time listener.
- `adminSettings/main`: admin-only config (e.g., `adminEmail` for settlement emails).
- `rooms/{docId}`: legacy dashboard rows loaded by `loadDashboardDataFromFirestore()`. Failures are caught so app stays functional.

**Tenant lifecycle:**
- **Vacate**: archives snapshot to `archivedTenant` field, clears live fields (`tenant`, `contact`, `rent`, etc.).
- **Restore**: uses `findRestoreCandidateForRoomId()` to find archived snapshot.

## Business rules (don't change unless asked)
- **Rooms**: fixed by `IMMUTABLE_ROOMS_DATA` (12 rooms: 01, 02, 04–13). Room 03 intentionally absent.
- **Water pricing** (duplicated in `index.html` + `functions/index.js`):
  - Default rate `0.25`, discounted `0.20` for rooms 11–13.
  - Units multiplier `10`; service charge `₹60`.
  - Keep logic consistent between client + functions.
- **Rent revision**: `getRentRevisionDates()` generates yearly increases unless `noAnnualRevision=true`.
- **Post-paid locking**: `isFutureYearMonth(year, month)` treats current + future as locked. One-time cleanup: `runLockedMonthsCleanup()`.

## Eviction automation (client-side + server-side)
- **Client**: `autoVacateEvictedTenants()` auto-vacates when `evictionDate ≤ today` (runs while app is open).
- **Server** (`functions/index.js`):
  - `scheduledAutoVacateEvictions` (hourly cron).
  - `onVacateSendSettlementEmail` (triggers on vacate if `archivedTenant.evictionSettlement` exists).
- **Date format**: `YYYY-MM-DD` strings. Status strings are case-sensitive (`Occupied`/`Vacant`).

## Editing conventions (critical for inline handlers)
- **`window.*` exports**: UI uses inline `onclick="window.deleteProperty(...)"`. Keep these stable.
- **Error resilience**: Optional UI sections wrapped in `try/catch` so dashboards keep refreshing on partial failures.
- **Tenant field changes**: Update both:
  - Live save/update logic (e.g., `saveProperty()`, `updateProperty()`).
  - Archive/restore logic (`archivedTenant` snapshot fields).
- **Functions**: Avoid editing `functions/` unless requested (Cloud Functions deployment not currently active).

## Developer workflows (commands that actually work)
**Web dev:**
- No build step. Open `index.html` directly or run any static server.

**iOS/Capacitor:**
```bash
npm run copy:web      # Copy index.html → www/, inject capacitor.js
npm run cap:sync      # Sync web assets + native dependencies
npm run ios           # Full iOS workflow (copy + sync + open Xcode)
```

**Testing:**
- A11y tests: `npm install --save-dev jest jsdom && npx jest tests/keyboard-focus-a11y.test.js` (see `SECURITY.md`).
- Note: `package.json` has no wired test script; run directly with `npx jest`.

**Destructive scripts:**
- `delete_collections.js`: Backs up + deletes Firestore collections. Requires `GOOGLE_APPLICATION_CREDENTIALS` env var. See `DELETE_README.md`.
  - Example: `node delete_collections.js --dry-run properties rooms`

## Key files reference
- `index.html`: entire web app (UI + logic).
- `firestore.rules`: security rules (default-deny; staff/admin allowlists).
- `functions/index.js`: Cloud Functions (eviction cron, settlement emails).
- `scripts/copy-web-assets.js`: Capacitor build step (injects `capacitor.js`).
- `capacitor.config.json`: iOS app config (`webDir: "www"`).
- `SECURITY.md`: a11y testing instructions + Firebase rules guidance.
- `DELETE_README.md`: safe collection deletion workflow.
