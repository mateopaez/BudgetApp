# BudgetApp

Mobile-first personal budget tracker built with **Angular 19**, **Angular Material**, **Tailwind CSS**, and **Firebase** (Auth + Firestore).

## Step-by-step implementation plan

1. **Scaffold** — Angular standalone app, Tailwind v3 + Material, Firebase SDK via `@angular/fire`.
2. **Auth** — Email/password sign up, sign in, sign out; route guards for guest vs authenticated users.
3. **Data layer** — Firestore collections under `users/{uid}` with services for accounts, categories, transactions.
4. **Seed categories** — On first login, create 15 default categories + 2 system categories (`Credit Card Payment`, `Refund/Credit`).
5. **Accounts CRUD** — Checking, savings, and multiple credit cards.
6. **CSV import** — Client-side PapaParse; map rows to normalized transactions; preview + SHA-1 deduplication before write.
7. **Transactions** — Filter by account/month; edit category & description; delete; split expenses into line items.
8. **Dashboard** — Chart.js line charts for expenses, income (manual only), and savings account net change.
9. **Security** — Firestore rules restricting access to `users/{uid}/**` for the signed-in user only.
10. **Deploy** — Firebase Hosting or Vercel (SPA rewrites included).

## Project structure

```
BudgetApp/
├── firebase.json
├── firestore.rules
├── firestore.indexes.json
├── .firebaserc
├── vercel.json
├── tailwind.config.js
├── postcss.config.js
├── src/
│   ├── environments/
│   │   ├── environment.example.ts  # Template (committed)
│   │   ├── environment.ts          # Generated locally (gitignored)
│   │   └── environment.prod.ts     # Generated at build (gitignored)
│   ├── app/
│   │   ├── app.config.ts           # Firebase + offline persistence
│   │   ├── app.routes.ts
│   │   ├── core/
│   │   │   ├── guards/auth.guard.ts
│   │   │   ├── models/index.ts
│   │   │   ├── services/
│   │   │   │   ├── auth.service.ts
│   │   │   │   ├── account.service.ts
│   │   │   │   ├── category.service.ts
│   │   │   │   ├── transaction.service.ts
│   │   │   │   ├── import.service.ts
│   │   │   │   └── dashboard.service.ts
│   │   │   └── utils/
│   │   ├── features/
│   │   │   ├── auth/
│   │   │   ├── dashboard/
│   │   │   ├── accounts/
│   │   │   ├── import/
│   │   │   ├── transactions/
│   │   │   └── settings/
│   │   ├── layout/shell/
│   │   └── shared/chart-card/
│   ├── styles.scss                 # Tailwind directives + Material overrides
│   └── main.ts
└── README.md
```

## Firebase setup

1. Create a project at [Firebase Console](https://console.firebase.google.com).
2. Enable **Authentication → Email/Password**.
3. Create a **Firestore** database (start in production mode).
4. Register a **Web app** and note the Firebase config values (see [Environment variables](#environment-variables) below).
5. Update `.firebaserc` with your project ID.
6. Deploy rules and indexes:

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules,firestore:indexes
```

## Environment variables

Firebase config is **not committed**. It is generated at build/start time from environment variables via `scripts/generate-env.mjs`.

| Variable | Firebase config field |
|----------|----------------------|
| `FIREBASE_API_KEY` | `apiKey` |
| `FIREBASE_AUTH_DOMAIN` | `authDomain` |
| `FIREBASE_PROJECT_ID` | `projectId` |
| `FIREBASE_STORAGE_BUCKET` | `storageBucket` |
| `FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
| `FIREBASE_APP_ID` | `appId` |

### Local development

```bash
# One-time: link project and pull env vars from Vercel (creates .env.local, gitignored)
vercel link
vercel env pull .env.local

# Or copy .env.example → .env.local and fill values manually
```

`npm start` and `npm run build` run `env:generate` first, which reads `.env.local` (local) or Vercel-injected vars (CI/deploy).

See `src/environments/environment.example.ts` for the expected shape.

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:4200`.

## Build & deploy

### Firebase Hosting

```bash
npm run build
firebase deploy --only hosting
```

### Vercel (recommended for free static hosting)

1. Connect the GitHub repo to Vercel.
2. In **Project → Settings → Environment Variables**, add all six `FIREBASE_*` variables from [Environment variables](#environment-variables).
3. Mark each variable as **Sensitive** so values are hidden in logs and the dashboard.
4. Scope vars per environment as needed: **Production**, **Preview**, and **Development** (used by `vercel env pull`).
5. `vercel.json` sets build/output settings and SPA rewrites to `index.html`.

On deploy, Vercel injects env vars into the build; `prebuild` generates `environment.prod.ts` automatically — no secrets in the repo.

## Firestore data model

| Collection | Path | Key fields |
|------------|------|------------|
| User profile | `users/{uid}` | `email`, `createdAt` |
| Accounts | `users/{uid}/accounts/{id}` | `name`, `type`, `openingBalance`, `openingDate` |
| Categories | `users/{uid}/categories/{id}` | `name`, `isSystem`, `systemKey?` |
| Transactions | `users/{uid}/transactions/{id}` | `accountId`, `postedAt`, `description`, `amount`, `kind`, `categoryId`, `split?`, `importHash` |

### Transaction `kind` values

| Kind | Meaning |
|------|---------|
| `expense` | Negative amount spending |
| `income` | Manual income only (never from CC import) |
| `transfer` | Between accounts |
| `cc_payment` | Credit card payment (not income) |
| `refund` | Positive amount refund/credit |

## CSV import rules

Expected columns: `Description, Type, Card Holder Name, Date, Time, Amount`.

- `Amount < 0` → `expense` (category = null → **Inbox**)
- `Amount > 0` + `Type == PAYMENT` or description contains `PAYMENT` → `cc_payment` + system category
- `Amount > 0` otherwise → `refund` + system category

**Raw CSV files are never stored** — only parsed, normalized transaction documents are written to Firestore.

## Import de-duplication

Each import row gets:

```
importHash = sha1(accountId + postedAtISO + normalizedDescription + amount)
```

Before import, existing hashes for that account are queried (`importHash in [...]`). Rows with a matching hash are marked **Duplicate (skip)** in the preview and excluded from the batch write. Re-importing the same statement is safe.

## Offline persistence

Configured in `app.config.ts` using Firestore **persistent local cache** with multi-tab support:

```typescript
initializeFirestore(getApp(), {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});
```

This caches reads/writes locally (IndexedDB). The app works offline for previously loaded data; writes queue and sync when connectivity returns. Import deduplication still works online (queries existing hashes); offline re-import may create duplicates until sync completes — re-run import after reconnect to rely on hash checks.

## Free tier notes

Firebase Spark (free) includes:

- Auth: 50k MAU
- Firestore: 1 GiB storage, 50k reads / 20k writes per day
- Hosting: 10 GB/month

A personal budget app with periodic CSV imports typically stays within free limits. Vercel Hobby tier hosts the static Angular build for free.

## UI stack

- **Tailwind CSS** — layout, spacing, responsive mobile-first design
- **Angular Material** — forms, tables, sidenav, dialogs, toggles
- **Chart.js** — dashboard line charts

## MVP flows

1. **Auth** → Sign up / sign in
2. **Accounts** → Add checking, savings, credit cards
3. **Import** → Upload CC CSV, preview, confirm
4. **Transactions** → Filter, assign categories, split, delete
5. **Dashboard** → Monthly expense/income/savings charts
6. **Settings** → Manage categories; rules placeholder
