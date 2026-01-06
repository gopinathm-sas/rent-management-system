# Copilot instructions (Rent Management System)

This repo is a **single-file SPA**: UI + logic live in `index.html` (Tailwind CDN + Firebase JS modules). Make **small, surgical edits**; avoid framework refactors unless asked.

## Big picture
- Entry point: `index.html` contains all JS in one `<script type="module">`.
- Backend: Firebase Auth + Firestore only.
- Auth gate: `onAuthStateChanged` checks `authorizedUsers/{email}`; unauthorized users are signed out.

## Firestore collections & fields
- `properties`: tenant records (note: legacy duplicates exist).
  - Matching: room cards use `findTenantForRoom()` which tolerates multiple docs and picks the “best” via `pickBestRoomRecord()` (occupied first, then newest by `updatedAt/createdAt`).
  - Common fields: `roomNo`, `roomId`, `tenant`, `contact`, `rent`, `deposit`, `relocate`, `status`, `payStatus`, `paymentHistory`, `updatedAt`, `updatedBy`, `createdAt`, `createdBy`.
  - Flags: `noAnnualRevision` disables annual rent revision tracking for that tenant.
- `rooms`: optional dashboard-row metadata keyed by `roomId` (loaded to populate inputs).
- `authorizedUsers`: docs keyed by email (existence = access allowed).

## Core invariants
- Rooms are fixed by `IMMUTABLE_ROOMS_DATA` (12 rooms). Do not add/remove rooms unless explicitly requested.
- Keep dashboard rendering resilient: `initDataListener()` wraps optional renders in `try/catch` so core views still refresh.

## Key UX/data flows
- Login: `loginWithGoogle()` → Auth state → authorization check → `initDataListener()`.
- Real-time updates: `onSnapshot(query(collection(db, "properties"), orderBy("createdAt", "desc")))` repopulates `allPropertiesData` then refreshes metrics/cards/tables.
- Tenant save: `addTenantForm` updates an existing `properties` doc when possible to avoid duplicates; otherwise `addDoc`.
- Rent revision: `renderRentRevisionDueCard()` uses `getRentRevisionDates()` and skips tenants with `noAnnualRevision`.

## Admin/destructive scripts
- `delete_collections.js`: backs up + deletes Firestore collections using `firebase-admin` + service account JSON (see `DELETE_README.md`).
- `clear-data.js`: browser-console helper to delete `properties` docs.

## Local commands (what actually exists)
- Install deps for scripts: `npm install`
- Run delete tool: `node delete_collections.js --key /path/to/serviceAccount.json --dry-run properties rooms`

## Conventions when editing
- Prefer null-safe DOM access (`getElementById` checks) and keep `window.*` exports stable (UI uses inline `onclick`).
- When adding new tenant-affecting fields, update both: save/update payloads and any “Vacant” archival path.
