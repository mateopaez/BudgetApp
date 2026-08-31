# BudgetApp frontend redesign

Ground-up IA and UI redesign for a calm personal ledger. Existing Firestore collections and financial rules are preserved; UI and flows are rebuilt around clarity over density.

## Status

V1 redesign implemented: shell/nav, design system, Home, Activity (+ review), Plan timeline, Budgets, Accounts, Insights. Legacy routes redirect. Additive model fields (`Category.group`, `linkedTransactionId`) with compatibility inference.

## Information architecture

| Area | Route | Purpose | Primary action |
|------|-------|---------|----------------|
| Home | `/home` | How am I doing right now? | Add transaction |
| Activity | `/activity` | What happened? | Add transaction |
| Plan | `/plan` | What is coming up? | Add upcoming item |
| Budgets | `/budgets` | What did I intend to spend? | Set / edit budgets |
| Accounts | `/accounts` | Where is my money? | Add account |
| Insights | `/insights` | How does this month compare? | (secondary) |

Legacy paths redirect: `dashboard`→`home`, `transactions`→`activity`, `calendar`→`plan`, `categories`→`budgets`.

### Navigation

- **Mobile bottom tabs:** Home, Activity, Plan, Budgets
- **Mobile more menu:** Accounts, Insights, Sign out
- **Desktop side nav:** Home, Activity, Plan, Budgets, Accounts, Insights

## Component map

```
layout/shell/                 App chrome, nav, quick-add
features/home/                Spending summary, attention, coming up, recent
features/transactions/        Activity register, review sheet, CSV import
features/plan/                Timeline of bills/paychecks
features/budgets/             Monthly category targets by group
features/accounts/            Cash vs credit owed
features/insights/            MoM spending, category delta, cashflow
shared/                       Charts, confirm dialog, modal sheet
```

## Data model

**Preserve (no breaking changes):**

- `users/{uid}/accounts|categories|transactions|budgets|scheduledItems`
- Transaction kinds: `expense | income | transfer | cc_payment`
- Budgets keyed by `categoryId` (monthly targets in UI; weekly storage tolerated)
- Scheduled items with fixed/monthly/weekly recurrence

**Additive / compatibility:**

| Change | Approach |
|--------|----------|
| Category `group` | Optional: `essentials \| lifestyle \| debt \| other`. Unset → inferred from name |
| Transfer link | Optional `linkedTransactionId`; existing single-leg transfers still work |
| Refund kind | Continue coercing legacy `refund` → `income` on read |
| Insights | Computed client-side; no new collection |

**Financial rules (unchanged):**

- Spending/budgets count `expense` only (splits attributed per line)
- Transfers and CC payments excluded from income/spending
- Balances = opening + Σ amounts on/after opening date
- UI does not label totals as “net worth”

## Design system

Editorial ledger: cool neutrals, deep forest accent (`#1B4D3E`), Source Serif 4 + IBM Plex Sans, tabular money, borders/whitespace over card grids.

## Migration

Idempotent client-side only: account/category seed, name→group inference, refund→income coerce.
