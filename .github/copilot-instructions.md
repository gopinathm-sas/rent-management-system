# Copilot instructions (Rent Management System)

This repo is a **single-page app in `index.html`** using **Firebase Auth + Firestore** (client-side). Treat it as a small, production-like system: prioritize correctness, data integrity, and not breaking existing UX.

## Project shape
- Main app: `index.html` (HTML + Tailwind + all JS in a `<script type="module">`).
- Backend: Firebase (Auth + Firestore) only.
- Deployment: static hosting (e.g., Vercel). Assume users may hit cached builds.

## Core data model (Firestore)
- `properties` collection: tenant/room state used for dashboard + cards.
  - Common fields: `roomNo`, `roomId`, `tenant`, `contact`, `rent`, `deposit`, `relocate`, `status`, `payStatus`, `paymentHistory`, `createdAt`, `updatedAt`, `updatedBy`.
  - Reality: older data may have **duplicates per room** and inconsistent naming; code must be duplicate-tolerant.
- `rooms` collection: dashboard metadata rows (optional / may be empty).
- `authorizedUsers` collection: docs keyed by **email**. Used to gate access after Google sign-in.

## Non-negotiable behavior
- The 12 rooms are authoritative from `IMMUTABLE_ROOMS_DATA`. Do not add/remove rooms without an explicit request.
- Room cards must render reliably after login/logout. Avoid render chains that can break if an optional DOM node is missing.
- If multiple `properties` docs match a room, prefer the **best** record:
  1) occupied record first (by status/tenant presence)
  2) newest by `updatedAt`/`createdAt`

## Coding patterns to follow
- Prefer **small, surgical edits** in `index.html`; don’t refactor into a framework unless asked.
- Make DOM updates **null-safe**:
  - Always check `document.getElementById(...)` results before using.
  - Avoid assuming optional sections exist.
- Keep Firestore listeners **fail-safe**:
  - Use `try/catch` around optional render/update calls.
  - Core dashboard refresh (room cards + occupancy metrics) must still run even if another section errors.
- Preserve existing UI/UX. Do not add new pages/modals/animations/themes unless explicitly requested.

## Data integrity rules
- When creating tenant data, do **not** create duplicate `properties` docs for the same room.
  - Update an existing matching doc when possible; otherwise create.
- When setting a room to `Vacant`, archive/clear tenant fields consistently.
- Treat `rent` as numeric when possible; format defensively (don’t assume it’s always a number).

## Debugging guidance
- If a bug appears “only after re-login” or “only on Vercel”, suspect:
  - runtime exceptions preventing render updates
  - deployment caching
  - stale Firestore listeners
- Prefer adding lightweight `console.warn`/`console.log` in hot paths (then remove if asked).

## When making changes
- Update only what the user asked.
- If you change behavior that affects data, explain the migration impact (e.g., legacy duplicate docs).
- Validate by:
  - searching for duplicate IDs / DOM conflicts
  - sanity-checking the console for runtime errors

## Handy local commands
- Install deps: `npm install`
- Run any existing tests (if present): `npm test`
