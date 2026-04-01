# AGENTS.md — Munirathnam Illam Rental Manager

> **Reference document for AI agents working on this codebase.**
> Read this before starting any development work.

---

## 📋 Project Overview

**Munirathnam Illam Rental Manager** is a private, owner-operated rental management system for a 12-room residential property. It tracks tenants, monthly rent/water payments, utility details, and expenses. The app is built as a React SPA with Firebase backend and targets both web and iOS (via Capacitor).

- **Firebase Project (Production):** `munirathnam-illam`
- **Firebase Project (Staging):** `munirathnam-illam-test`
- **GitHub repo:** `gopinathm-sas/rent-management-system`
- **Current version:** 4.0 (master copy, Jan 2026)

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| **Frontend Framework** | React 18 (with TypeScript) |
| **Build Tool** | Vite 5 |
| **Styling** | Tailwind CSS 3 |
| **Routing** | React Router DOM v6 |
| **Icons** | Lucide React |
| **Backend / DB** | Firebase (Firestore, Auth, Storage) |
| **Cloud Functions** | Firebase Functions (Node.js) |
| **Mobile** | Capacitor 8 (iOS target) |
| **Native Auth** | `@capacitor-firebase/authentication` |
| **Biometrics** | `@capgo/capacitor-native-biometric` (Face ID) |
| **AI Feature** | Google Gemini API (via `src/services/gemini.js`) |
| **Image Upload** | Cloudinary (via `src/services/cloudinary.js`) |
| **Testing** | Jest + jsdom |
| **Package Manager** | npm |

---

## 📁 Folder Structure

```
/
├── src/
│   ├── App.tsx               # Root component; defines all routes + providers
│   ├── main.tsx              # Vite entry point
│   ├── index.css             # Global Tailwind base styles
│   │
│   ├── contexts/
│   │   ├── AuthContext.tsx   # Auth state, Google Sign-In, biometric lock, auto-logout
│   │   ├── DataContext.tsx   # Firestore real-time listeners, CRUD operations
│   │   └── UIContext.tsx     # Toast notifications, global UI state
│   │
│   ├── pages/
│   │   ├── Dashboard.tsx     # Main overview; occupancy metrics + room cards
│   │   ├── RoomDetails.jsx   # Per-room detail view
│   │   ├── RentDetails.jsx   # Monthly rent payment tracking table
│   │   ├── WaterBill.jsx     # Water meter readings and bill computation
│   │   ├── Expenses.tsx      # Expense tracker (add/edit/delete)
│   │   ├── Admin.jsx         # Admin tools: fund management, user roles, withdrawals
│   │   ├── AdminMigration.jsx# Data migration utilities (admin only)
│   │   ├── TenantUpload.jsx  # Shareable tenant onboarding upload form (token-based)
│   │   └── Login.tsx         # Google OAuth login screen
│   │
│   ├── components/
│   │   ├── Layout.tsx        # App shell: sidebar, bottom nav, mobile header
│   │   ├── BiometricLock.tsx # Full-screen biometric lock overlay (native only)
│   │   ├── RoomCard.jsx      # Single room card widget
│   │   ├── RoomDetailsModal.jsx # Full modal for editing tenant / room details
│   │   ├── ProratedRentDialog.jsx# Dialog to configure prorated rent for first month
│   │   ├── ReceiptScanner.tsx# Gemini AI receipt scanner component
│   │   └── ErrorBoundary.tsx # React error boundary wrapper
│   │
│   ├── services/
│   │   ├── firebase.js       # Firebase app init (auth, db, storage); Capacitor-aware
│   │   ├── gemini.js         # Gemini API integration for receipt scanning
│   │   └── cloudinary.js     # Cloudinary upload for tenant ID proofs
│   │
│   ├── lib/
│   │   ├── constants.ts      # IMMUTABLE_ROOMS_DATA (12 rooms), service charges
│   │   └── utils.ts          # Water bill calculations, prorated rent, date helpers
│   │
│   └── types/
│       └── index.ts          # TypeScript interfaces: Tenant, Room, Expense, etc.
│
├── functions/                # Firebase Cloud Functions
├── apps-script/              # Google Apps Script for Drive upload automation
├── scripts/                  # Build/deploy helper scripts
├── tests/                    # Jest tests (a11y, keyboard focus)
├── ios/                      # Capacitor iOS project
├── dist/                     # Vite build output
├── www/                      # Capacitor web assets (synced from dist)
│
├── firestore.rules           # Firestore security rules
├── storage.rules             # Firebase Storage security rules
├── firebase.json             # Firebase Hosting + Functions config
├── .firebaserc               # Project aliases: live / test
├── capacitor.config.json     # Capacitor app config
├── vite.config.ts            # Vite config (aliases, env variable injection)
├── tailwind.config.js        # Tailwind config
├── tsconfig.json             # TypeScript config
├── index.html                # Vite HTML entry
└── package.json              # npm scripts and dependencies
```

---

## 🏗 Architecture

### Pattern
The app follows a **Context + Pages + Components** architecture (similar to MVC):
- **Contexts** are the "model/service layer" — they hold global state and all Firestore logic.
- **Pages** are smart (container) components that consume context and compose views.
- **Components** are mostly presentational/reusable UI widgets.

### Context Layer (Global State)
Three nested context providers wrap the entire app:

| Context | Responsibility |
|---|---|
| `AuthContext` | Current user, Google login/logout, biometric lock, 15-min auto-logout |
| `DataContext` | Real-time Firestore snapshots for `properties`, `expenses`, `rooms`; all CRUD mutations |
| `UIContext` | Toast notification queue, sheet/drawer visibility |

### Routing (`App.tsx`)
All routes except `/login` and `/upload/:token` are protected by `ProtectedRoute`. The `GlobalLock` component checks biometric lock state before showing any content.

```
/           → Dashboard
/rooms      → RoomDetails
/rent       → RentDetails
/water      → WaterBill
/expenses   → Expenses
/admin      → Admin
/admin/migrate → AdminMigration
/upload/:token → TenantUpload (public, token-gated)
/login      → Login
```

### Data Flow
```
Firebase Auth (Google)
  ↓
AuthContext (currentUser)
  ↓
DataContext — onSnapshot listeners start
  ├── properties (tenants) — real-time
  ├── expenses             — real-time, ordered by date desc
  └── rooms                — real-time (falls back to IMMUTABLE_ROOMS_DATA)
  ↓
Pages/Components consume via useData() / useAuth() / useUI()
```

---

## 🗄 Firestore Schema

### `properties` — Tenant records (one doc per occupied/tracked room)
```ts
{
  id: string,           // auto-generated
  roomNo: string,       // "01" – "13"
  roomId: string,       // "G01" – "G13"
  tenant: string,       // Tenant full name
  phone: string,
  rent: number,
  advance: number,      // Security deposit
  joinDate: string,     // "YYYY-MM-DD"
  status: "Occupied" | "Vacant",
  paymentHistory: { "2026-Jan": "Paid" | "Pending" | "Rent Only" | "None" },
  paymentTotals: { "2026-Jan": number },   // Total collected (rent+water+service)
  waterReadings: { "2026-Jan": number },
  waterRate?: number,
  waterMeterReset?: { "2026-Jan": boolean },
  isEvictionConfirmed?: boolean,
  noRevision?: boolean,
  lastRevision?: string,
  lastRent?: number,
  idProofUrl?: string,
}
```

### `rooms` — Optional overrides for static room metadata
Falls back to `IMMUTABLE_ROOMS_DATA` in `src/lib/constants.ts` if collection is empty.

### `expenses` — Building expenses
```ts
{ id, date, category, amount, note?, monthKey? }
```

### `authorizedUsers` — Staff allowlist
```ts
{ email } // doc ID = email
```

### `adminUsers` — Admin allowlist (write access + admin tools)
```ts
{ email }
```

### `viewerUsers` — Read-only viewers
```ts
{ email }
```

### `tenantUploadInvites` / `tenantUploadSubmissions`
Token-based system for tenants to self-upload ID proof documents.

### `adminSettings`
Admin-only configuration (e.g., admin email for settlement reports).

---

## 🔐 Security Model

- **Authentication:** Google Sign-In only (no password auth).
- **Authorization tiers:**
  - `adminUsers` → full read/write + admin tools
  - `authorizedUsers` (staff) → read/write on all app data
  - `viewerUsers` → read-only
  - Unauthenticated → denied everything
- **Native app locking:** On iOS, app locks on background → requires Face ID to re-open.
- **Auto-logout:** 15 minutes of inactivity logs out the user (web).
- **Firestore rules** in `firestore.rules` enforce all of the above server-side.

> ⚠️ **Note:** `vite.config.ts` currently hard-codes Firebase API keys and the Gemini key in the `define` block. These should be moved to `.env` variables to avoid exposing them in source code. The `.env.example` file exists for reference.

---

## 🚀 Development & Deployment

### Common commands
```bash
npm run dev              # Start local Vite dev server
npm run build            # Production build → dist/
npm run test             # Run Jest tests

# Firebase deploy
npm run deploy:live      # Build + deploy to production
npm run deploy:test      # Build + deploy to staging

# Capacitor iOS
npm run ios              # Build + sync + open Xcode
npm run cap:sync         # Build + cap sync (without opening Xcode)
```

### Environment
- Firebase config is injected at build time in `vite.config.ts`.
- `.env` file exists but `vite.config.ts` overrides most values via `define`.
- Path alias `@` maps to `src/`.

---

## 💡 Key Business Logic (`src/lib/`)

- **`IMMUTABLE_ROOMS_DATA`** — 12 fixed room objects (`G01`–`G13`, skipping one) stored in `constants.ts`. Rooms cannot be added or removed via UI.
- **Water bill computation** — `computeWaterForMonth()` in `utils.ts` calculates the water charge from meter readings (current − previous). Requires both current and previous readings.
- **Service charge** — A fixed `RENT_WATER_SERVICE_CHARGE` is added to every "Paid" month total.
- **Prorated rent** — First month rent is prorated if a tenant joins after the 1st. Uses `getProratedRent()` with optional manual deduction days via `ProratedRentDialog`.
- **Payment status cycle:** `Pending` → `Rent Only` → `Paid` → `None` (clicking cycles through).

---

## ⚠️ Known Issues / Areas to Watch

1. **Hard-coded API keys** in `vite.config.ts` — should be environment variables.
2. **Mixed JS/TSX** — most pages are `.jsx`, only core infrastructure is `.tsx`. Aim for consistent TypeScript.
3. **Duplicate `setLoadingState` calls** in `DataContext.tsx` (cosmetic bug, no functional impact).
4. **`@ts-ignore` comments** in DataContext for dynamic room object merging.
5. **`useAuth()` returns `undefined` safely** (commented-out strict check) — strict error should be re-enabled once stable.
6. **`index_legacy.html`** (461 KB) is a monolithic HTML file from before the React rewrite — kept as archive/reference only. Not used in production.

---

## 📄 Other Documentation

| File | Purpose |
|---|---|
| `DEPLOYMENT.md` | Deploy to live vs. test Firebase environments |
| `SECURITY.md` | Security rules, accessibility, XSS prevention checklist |
| `VERSION_4.0_MASTER_COPY.md` | V4.0 redesign spec and Firestore schema reference |
| `DASHBOARD_GUIDE.md` | Dashboard feature guide |
| `APPS_SCRIPT_DRIVE_UPLOAD_SETUP.md` | Google Apps Script for Drive file uploads |
| `DELETE_README.md` | Notes on deleting Firestore collections |
| `CHAT_SESSION_HANDOFF.md` | Session context handoff notes |
