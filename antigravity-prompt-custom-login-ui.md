# Feature Request: Replace Popup-Style Login with a Custom Embedded Login Page

## Context
This is my Rental Management App (React 18, TypeScript/JSX, Vite, Tailwind CSS, Firebase Auth + Firestore backend). The current login screen relies on a separate popup-style window (the generic Google-branded flow), and I already use Firebase's email link ("magic link") sign-in as well. I want a single, fully embedded login page that matches my app's own branding — no popup window at all — while keeping the same underlying Firebase Auth mechanics.

**Before writing any code, first find and inspect the existing login implementation** — the current login page/component, however Google sign-in is currently wired up (likely `signInWithPopup`), and however the email-link flow is currently triggered and completed (`sendSignInLinkToEmail`/`isSignInWithEmailLink`/`signInWithEmailLink`). Adapt this spec to the actual file structure and conventions found, rather than assuming file names.

## Goal
Replace the current login experience with a single, self-contained login page that:
- Is fully embedded in the app's own UI (no separate popup window, no visually jarring third-party chrome).
- Supports email link (magic link) sign-in as the primary method.
- If Google sign-in is being kept, switches it from `signInWithPopup` to `signInWithRedirect` so there's no popup at all — a full-page redirect that returns to the app, rather than a floating window.
- Uses Tailwind classes consistent with the rest of the app's existing design language (colors, spacing, font) — not a generic/default-looking form.

## Functional Requirements

### 1. Login Form (initial state)
- Centered card layout: app logo/icon, a short heading ("Sign in to your account"), a one-line explanation ("We'll email you a magic link"), an email input, and a "Send magic link" button.
- Validate the email format client-side before attempting to send; show an inline error next to the field if invalid, don't submit.
- On submit, call `sendSignInLinkToEmail(auth, email, actionCodeSettings)` (or whatever the existing code already calls this) with `actionCodeSettings.url` pointing back to this same login page/route so the link returns to the app correctly.
- Store the email in `window.localStorage` under a clear key (e.g. `emailForSignIn`) so the completion step can recover it — Firebase's documented pattern for this flow, since the link may be opened on a different device/browser than where it was requested.

### 2. Sent-Link Confirmation State
- After successfully sending, replace the form with a confirmation message ("Check your email — we sent a sign-in link to `<email>`") and a "Resend" option.
- Add a short cooldown (e.g. 30 seconds) before "Resend" becomes clickable again, to avoid accidental spam-clicking triggering repeated emails.
- If sending fails (network error, invalid email rejected server-side, rate limit from Firebase), show a clear inline error and let the user try again — no raw Firebase error strings surfaced to the user.

### 3. Completing Sign-In (link click)
- On page load, check `isSignInWithEmailLink(auth, window.location.href)`. If true:
  - Retrieve the stored email from `localStorage`. If missing (e.g. link opened on a different device/browser than where it was requested), show a small inline prompt asking the user to re-enter their email to complete sign-in, rather than failing silently.
  - Call `signInWithEmailLink(auth, email, window.location.href)`, then clear the stored email and redirect to the app's main/dashboard route.
  - If the link is expired or invalid, show a clear message and a way to request a new one (route back to the login form).

### 4. Google Sign-In (if kept)
- If the app is keeping Google as an option alongside magic link, add it as a secondary "Continue with Google" button below the email form, separated by a light divider ("or").
- Implement via `signInWithRedirect` instead of `signInWithPopup` — this eliminates the popup window; the browser does a full-page redirect to Google and back instead.
- Handle the redirect result on page load with `getRedirectResult(auth)`, alongside the email-link check from section 3, and route to the dashboard on success.
- If Google sign-in isn't actually needed going forward (magic link alone may be sufficient), flag this as a question rather than assuming — removing it entirely is simpler if it's not used.

### 5. Styling
- Match the app's existing Tailwind theme (colors, border radius, font) — pull from existing config/components rather than inventing new values.
- Loading state on the submit button while the email is sending (disabled + spinner or text change, e.g. "Sending...").
- Fully responsive — the card should look correct on mobile widths, not just desktop.
- No visual dependency on Google's or any third-party branding beyond a small icon on the optional "Continue with Google" button.

### 6. Session Persistence
- Confirm Firebase Auth's default persistence (`browserLocalPersistence`) is in effect so users stay logged in across reloads — check existing `auth` initialization for this rather than assuming.

## Edge Cases to Handle
- User clicks the magic link on a different device/browser than where they requested it → prompt for email re-entry instead of failing.
- User clicks an expired or already-used link → clear message, route back to request a new one.
- User double-clicks "Send magic link" → the loading/disabled state on the button should prevent duplicate sends.
- User has JavaScript-blocked or ad-blocker interference with Firebase's auth requests → surface a generic "couldn't send the link, try again" message rather than a blank failure.
- Firebase rate-limits repeated magic-link requests for the same email → surface this clearly rather than a generic error.

## Testing
- Unit test the email validation logic.
- Test the link-completion flow with a mocked `isSignInWithEmailLink`/`signInWithEmailLink` to confirm redirect-to-dashboard behavior on success and correct error handling on failure/expiry.
- Manually verify the cross-device case (request the link on desktop, open it on mobile) still prompts correctly for email re-entry.
- If Google sign-in is kept, test that `getRedirectResult` correctly completes sign-in after the redirect returns.

## Deliverables
1. The reworked login page/component, fully embedded (no popup), styled to match the app's existing design.
2. Any Firebase console configuration notes I need to apply manually (e.g. confirming the login route is in the authorized domains list, and that `actionCodeSettings.url` matches an allowed redirect target) — call these out explicitly since they can't be done from code alone.
3. A summary of what was removed/changed from the old popup-based flow, so I can see exactly what's different.

---
**Before starting implementation**, please first tell me:
1. Where the current login component and Firebase Auth initialization live.
2. Whether Google sign-in should be kept (as a redirect-based secondary option) or removed entirely in favor of magic-link-only.
3. Whether `actionCodeSettings` is already configured somewhere, or needs to be added fresh.

Then proceed with implementation once confirmed.
