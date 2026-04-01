# Chat Session Handoff (2026-01-09)

Use this file to resume work in a new chat. Paste the **Quick Resume Prompt** section into the new session.

## Quick Resume Prompt
I’m working on the Rent Management System (single-file SPA in `index.html`, Tailwind CDN + Firebase JS modules, Capacitor iOS wrapper). Please read `CHAT_SESSION_HANDOFF.md` in the repo and continue from the current state.

## Project Basics
- Web app: `index.html` contains all UI + logic.
- Mobile: Capacitor wraps `index.html`; `npm run copy:web` copies `index.html` → `www/index.html` and injects `capacitor.js`.
- Backend: Firebase Hosting + Firestore + Storage. Cloud Functions exist but are optional.

## Key Features Implemented (high-level)
- Removed separate “Admin Portal” login; admin/staff are auto-detected via Firestore allowlists.
- Auth boot overlay to prevent login flash; web failsafe + iOS watchdog to avoid stuck loading.
- FaceID app lock toggle (localStorage `appLockEnabled`) via Capacitor biometric plugin.
- Staff tenant document upload (Storage + Firestore metadata) limited to initial tenant entry.
- Tenant self-upload via invite link:
  - Admin generates invite/link.
  - Tenant signs in via Firebase Email Link (passwordless).
  - Tenant uploads to Storage under invite-scoped path.
  - Submissions logged in Firestore.

## Admin Discoverability UX
- Admin settings UI (including tenant upload link generator) moved into Room Details.
- Added an admin-only top-nav button near logout that scrolls to Admin Settings.

## Important Fixes / Behaviors
### Admin button not visible
- Admin-only UI shows only when `isAdminSession === true`.
- Admin detection now checks allowlist doc IDs case-insensitively (tries lowercase + raw email).
- Ensure Firestore contains:
  - `adminUsers/gopinath.clinsas@gmail.com` (doc id must be the full email; case no longer matters).

### Tenant email-link auth errors
- Added clearer tenant-upload error messaging for:
  - `auth/operation-not-allowed`: Email Link sign-in not enabled in Firebase Auth.
  - `auth/quota-exceeded`: Daily quota exceeded for email-link sign-in.

### Firebase console settings required (tenant email link)
- Authentication → Sign-in method:
  - Enable **Email/Password**
  - Enable **Email link (passwordless sign-in)**
- Authentication → Settings → Authorized domains:
  - Ensure `PROJECT_ID.web.app` (and `PROJECT_ID.firebaseapp.com`) are present.

### Delivery note
- Email link often lands in Gmail Spam initially; marking “Not spam” helps.

## Latest Work (recent commits)
- `23cf48c` Add admin shortcut to settings
- `d34a2ac` Fix admin detection email case
- `42398c2` Improve tenant upload auth error
- `a266b61` Handle tenant email-link quota exceeded

## Known Operational Limitations
- Firebase email-link sign-in has daily quotas; if exceeded, no mail will be sent until reset.

## How to run/sync
- After editing `index.html`, run:
  - `npm run copy:web`

## What to do next (if needed)
- If tenant uploads are urgent but email quota is exceeded, use staff upload flow as a workaround.
- If admin button still doesn’t show:
  - Verify current login email matches an existing doc in `adminUsers/`.
  - Look for console log: `isAdmin= true`.
