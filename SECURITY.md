# Security & Best Practices Guide

## Overview
This guide covers security improvements, Firebase configuration, and accessibility enhancements for the Rent Manager application.

## 1. Keyboard Accessibility & Focus Management ✅

### What was implemented:
- **Focus Trap**: When modal opens, focus is trapped within the modal. Tabbing past the last button returns to the first input.
- **Escape Key**: Pressing Escape closes the modal and restores focus to the button that opened it.
- **ARIA Attributes**: Modal has proper `role="dialog"`, `aria-modal="true"`, `aria-hidden`, and `aria-labelledby`.
- **Screen Reader Support**: Login error marked with `role="alert"` and `aria-live="assertive"` for immediate announcements.

### Testing:
Run the test suite:
```bash
npm install --save-dev jest jsdom
npx jest tests/keyboard-focus-a11y.test.js
```

---

## 2. Input Validation & Security ✅

### Form Validation:
- Property name: trimmed, non-empty check before submission
- Rent: validated as positive number (min="1", step="1" on input)
- User authentication: guarded check before `addDoc`/`deleteDoc`
- HTML escaping: all user data escaped before rendering

### XSS Prevention:
- User photo URL validated: only `http://` and `https://` accepted
- Fallback: uses placeholder image if invalid protocol detected

---

## 3. Firebase Security Rules

### Current Status:
⚠️ **IMPORTANT**: Ensure your Firestore uses secure rules (not "allow read, write: if true").

### Recommended Rules:
See `firestore.rules` in the project root. Deploy these steps:

1. **Go to Firebase Console**
   - Navigate to Firestore Database > Rules tab

2. **Copy & paste the rules** from `firestore.rules`

3. **Publish**

4. **Verify with real users** to ensure queries still work

### What the rules provide:
- ✅ User isolation: each user can only read/write their own properties
- ✅ Data validation: ensures name, rent, status, payStatus are valid types
- ✅ Prevents unauthorized deletion/modification
- ✅ Enforces `createdBy` == user's UID

### Example secure query (already in code):
```javascript
const q = query(collection(db, "properties"), orderBy("createdAt", "desc"));
onSnapshot(q, (snapshot) => { ... });
```

With the rules above, only the current user's properties will be returned.

---

## 4. Authenticated Actions

### Current Implementation:
Before submitting the form or deleting, the code checks:
```javascript
if (!currentUser) {
    alert("You must be logged in to perform this action.");
    return;
}
```

This prevents race conditions where an unauthenticated user briefly sees the app content.

---

## 5. Additional Security Recommendations

### For Production:
1. **Enable HTTPS only** (automatic if using Firebase Hosting)
2. **Add CSP headers** to prevent inline script injection (see CSP section below)
3. **Audit log rotation** in Firebase > Audit Logs
4. **Rate limiting**: Consider using Firebase Extensions or Cloud Functions to limit writes

### Content Security Policy (CSP):
If self-hosting, add to your server:
```
Content-Security-Policy: 
  default-src 'self'; 
  script-src 'self' https://cdn.tailwindcss.com https://www.gstatic.com; 
  style-src 'self' https://cdn.tailwindcss.com https://cdnjs.cloudflare.com 'unsafe-inline'; 
  img-src 'self' data: https:; 
  connect-src 'self' https://firestore.googleapis.com https://securetoken.googleapis.com;
```

### Dependencies:
Keep Firebase SDK and libraries up to date:
```bash
npm outdated
npm update
```

---

## 6. Testing Checklist

### Accessibility Testing:
- [ ] Press Tab through the modal — focus should trap
- [ ] Press Escape — modal should close and focus restore
- [ ] Use screen reader (NVDA, JAWS, VoiceOver) — elements should be announced correctly
- [ ] Login error should be announced immediately by screen readers

### Security Testing:
- [ ] Try XSS payloads in property name: `<img src=x onerror="alert(1)">` — should be escaped
- [ ] Try negative rent: `-5000` — input min constraint + form validation should block
- [ ] Try logging out and accessing properties — should redirect to login
- [ ] Try accessing other users' properties (if multi-user) — Firestore rules should deny

### Smoke Tests:
- [ ] Add a property → appears in grid and tenants table
- [ ] Delete a property → confirms, removes from UI and database
- [ ] Toggle modal open/close → focus works, ARIA correct
- [ ] Refresh page → data loads from Firestore with user auth check

---

## 7. Files Added

| File | Purpose |
|------|---------|
| `tests/keyboard-focus-a11y.test.js` | Automated tests for keyboard navigation and focus trapping |
| `firestore.rules` | Security rules to deploy to Firebase Firestore |
| `SECURITY.md` | This file — best practices and deployment guide |

---

## 8. Quick Deploy Checklist

1. **Test locally** (open `index.html` in browser or local server)
2. **Run tests**: `npm test`
3. **Deploy Firestore rules** (Firebase Console > Firestore > Rules)
4. **Review Firebase Authentication settings** (ensure Google Sign-In is enabled)
5. **Commit and push**:
   ```bash
   git add .
   git commit -m "feat: add security rules, keyboard a11y tests, and best practices guide"
   git push origin main
   ```

---

## 9. Further Improvements (Optional)

- Add offline persistence with `enableIndexedDbPersistence()`
- Implement activity logging (Cloud Functions trigger on writes)
- Add email verification for Google sign-in
- Add admin dashboard for app-wide property management
- Implement property sharing/collaboration (add "collaborators" array)

---

**Questions?** Check the test file for examples or the Firestore rules comments for detailed explanations.
