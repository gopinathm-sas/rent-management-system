# Deployment (Test vs Live)

This repo is a single-page app hosted on Firebase Hosting (root `index.html`), plus optional Firebase Cloud Functions.

## Environments

- **Live** (Production): Firebase project id `munirathnam-illam` (alias: `live`)
- **Test** (Staging): Firebase project id `munirathnam-illam-test` (alias: `test`)

> If you want Test to be a different project id, update `.firebaserc`.

## One-time setup (on your machine)

1) Login to Firebase:

```bash
npx firebase-tools login
```

2) Confirm your project aliases:

```bash
npx firebase-tools use --list
```

If you haven’t created the Test project yet, create it in Firebase Console first, then update `.firebaserc`:

- `.firebaserc` → `projects.test`

## Deploy commands

These scripts are defined in `package.json` and always deploy explicitly to either `live` or `test`.

### Live (Production)

- Hosting only:

```bash
npm run deploy:live:hosting
```

- Functions only:

```bash
npm run deploy:live:functions
```

- Hosting + Functions:

```bash
npm run deploy:live
```

### Test (Staging)

- Hosting only:

```bash
npm run deploy:test:hosting
```

- Functions only:

```bash
npm run deploy:test:functions
```

- Hosting + Functions:

```bash
npm run deploy:test
```

## Release process (recommended)

- Do all UI/logic work on your “test” flow first (branch or PR).
- Deploy to **Test** using `npm run deploy:test`.
- When verified, merge and tag a release.
- Deploy that release to **Live** using `npm run deploy:live`.
