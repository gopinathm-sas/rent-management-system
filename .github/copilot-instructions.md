# Copilot instructions (Rent Management System)

This repo is a **single-file SPA**: UI + logic live in `index.html` (Tailwind CDN + Firebase JS modules). Make **small, surgical edits**; avoid framework refactors unless asked.

## Big picture
- Entry point: `index.html` contains all app JS in one `<script type="module">`.
- Backend: Firebase Auth + Firestore.
- Auth gate (`onAuthStateChanged` in `index.html`): mode is stored in `sessionStorage.loginMode` and checked against allowlists:
  - user mode: `authorizedUsers/{email}`
  - admin mode: `adminUsers/{email}` (admin sessions can only use the Admin section)

## Data model (Firestore)
- `properties`: tenant/room records (legacy duplicates exist).
  - Room matching must tolerate duplicates: `findTenantForRoom()` + `pickBestRoomRecord()` prefers occupied, then newest by `updatedAt/createdAt`.
  - Important fields: `roomNo`, `roomId`, `tenant`, `contact`, `rent`, `deposit`, `waterRate`, `relocate`, `status`, `payStatus`, `paymentHistory`, `paymentTotals`, `waterReadings`.
  - Vacating archives a snapshot into `archivedTenant` and clears the live fields; restore uses `findRestoreCandidateForRoomId()`.
- `expenses`: itemized expenses; live subscription via `subscribeExpenses()`.
- `adminSettings/main`: admin-only config; currently `adminEmail`.
- `rooms`: legacy dashboard-row data loaded by `loadDashboardDataFromFirestore()`; failures are caught so the app still runs.

Security rules live in `firestore.rules` (default-deny; staff reads/writes `properties` + `expenses`; admin manages allowlists + settings).

## Core invariants & business rules
- Rooms are fixed by `IMMUTABLE_ROOMS_DATA` (12 rooms: 01, 02, 04–13). Don’t add/remove rooms unless explicitly requested.
- Water: default rate `0.25`, discounted `0.20` for rooms 11–13; units multiplier `10`; service charge `₹60`.
- Rent revision: `getRentRevisionDates()` is yearly unless `noAnnualRevision`.
- Post-paid locking: `isFutureYearMonth()` treats current + future months as locked; UI includes `runLockedMonthsCleanup()` for one-time cleanup.

## Eviction + automation
- UI gates eviction controls behind `evictionConfirmed`; eviction dates are stored as `YYYY-MM-DD` strings.
- Auto-vacate is **client-side**: `autoVacateEvictedTenants()` runs in `index.html` while the app is open (no server-side scheduler).

## Editing conventions
- Keep `window.*` exports stable (UI uses inline `onclick`).
- Prefer null-safe DOM access; optional sections are intentionally wrapped in `try/catch` so dashboards keep refreshing.
- When changing tenant fields, update both live save/update logic and archive/restore logic.
- Unless explicitly requested, avoid editing `functions/` (Cloud Functions are not part of the current deployment plan).

## Dev/ops utilities
- Hosting config: `firebase.json` (SPA rewrite to `/index.html`; dev-only files/scripts are ignored from hosting).
- Destructive scripts: `delete_collections.js` (backup + delete; see `DELETE_README.md`), `clear-data.js` (browser console helper).
- Tests: `tests/keyboard-focus-a11y.test.js` is Jest-style but not wired in `package.json`; `SECURITY.md` documents running it via `npx jest`.
