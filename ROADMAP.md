# BudgetApp roadmap

Actionable breakdown of project ideas, grounded in the current codebase (Angular 19 + Firestore). Items are ordered roughly by dependency and impact — earlier sections unblock later ones.

**Legend:** `- [ ]` = not started · `- [x]` = done (update as you ship)

---

## 1. Transactions UI improvements

**Current state:** `transactions.component.ts` loads all transactions client-side, filters by account + month (or all time), and sorts by date/amount/merchant. There is no filter by `kind` (income vs expense). The list is a flat card layout with no running totals or balance context.

**Goal:** Make the transactions page useful for reviewing spending vs income, with filters that match how you actually think about money.

### 1a. Income vs expense filtering & sorting

- [x] Add a **Kind** filter to the filter bar: `All` | `Expenses` | `Income` | `Transfers` | `CC payments` | `Refunds`
- [x] Extend `sort` options with **Kind** groupings (e.g. expenses first, then income) or a secondary sort key
- [x] Show **summary chips** above the list for the active filter set:
  - Total expenses (sum of negative `expense` amounts)
  - Total income (sum of positive `income` amounts)
  - Net change (income + expenses in range)
- [x] Color-code list rows consistently: red for outflows, green for inflows, neutral for transfers/CC payments
- [x] Add a **quick toggle** “Hide CC payments & refunds” (common when reviewing discretionary spending)

**Files:** `transactions.component.ts`, possibly extract filter logic to `core/utils/transaction-filters.util.ts`

**Acceptance:** Filtering to “Expenses only” hides income/refund rows; summary totals update and match manual sum of visible rows.

### 1b. Balance correctness & opening-date cutoff

**Current state:** `computeAccountBalance()` in `balance.util.ts` sums **all** transactions for an account: `openingBalance + Σ(amount)`. Accounts have `openingDate`, but transactions before that date are still included — this is likely the “old transactions interfere with modern balance” issue.

- [ ] Update `computeAccountBalance()` to only include transactions where `postedAt >= account.openingDate`
- [ ] Apply the same cutoff anywhere balances or net activity are shown (`accounts.component.ts`, any future dashboard widgets)
- [ ] On the Transactions page, when an account filter is active, show **“Balance as of today”** and **“Net activity in filter range”** as two separate numbers (avoid conflating period spending with account balance)
- [ ] Add a one-time **“Reconcile opening balance”** helper on Accounts: “My balance on [openingDate] was $X” — document that imported history before that date should be excluded or opening balance adjusted
- [ ] Write unit tests for `computeAccountBalance()` covering: empty txs, pre-opening txs ignored, mixed kinds

**Files:** `balance.util.ts`, `accounts.component.ts`, `transactions.component.ts`, `balance.util.spec.ts` (new)

**Acceptance:** Account with `openingDate = 2025-01-01` and a 2024 transaction does not change displayed balance.

### 1c. Date range lookup (replace month-only)

**Current state:** Filter `period` is `all | month` with a month picker (`YYYY-MM`). No custom start/end.

- [ ] Replace month picker with a **date range** control: presets (`This month`, `Last 30 days`, `Last 3 months`, `YTD`, `All time`) + custom start/end date inputs
- [ ] Store selected range in URL query params (`?from=…&to=…`) so filters survive refresh
- [ ] Optionally push range filtering into `TransactionService.watchTransactions()` with Firestore `where('postedAt', '>=', …)` for large datasets (today everything is client-filtered via `watchAllTransactions()`)
- [ ] Show the active range in the page subtitle (“42 transactions · Jan 1 – Mar 31, 2026”)

**Files:** `transactions.component.ts`, `transaction.service.ts`, `date.util.ts`

**Acceptance:** Custom range Feb 10 – Feb 20 only shows transactions in that window; “All time” shows everything.

---

## 2. Flexible CSV import (any bank format)

**Current state:** `CsvRow` and `ImportService.mapRows()` expect fixed columns: `Description, Type, Card Holder Name, Date, Time, Amount`. README documents this single format.

**Goal:** Import from Chase, Amex, bank exports, etc. without code changes per bank.

### 2a. Column mapping UI

- [ ] After file upload, parse headers only and show a **mapping step**: user assigns each required field (`date`, `amount`, `description`/`merchant`) to a CSV column
- [ ] Optional fields: `time`, `type`, `memo`, `category` (pre-fill if present)
- [ ] Remember last mapping **per account** in `localStorage` or Firestore `users/{uid}/importProfiles/{id}`
- [ ] Preview 5 mapped rows before full parse; highlight rows that fail validation

**Files:** `import.service.ts`, `transactions.component.ts` (import panel), new `import-mapper.component.ts` or inline wizard step

### 2b. Pluggable row normalizers

- [ ] Replace hardcoded `CsvRow` type with `Record<string, string>` raw rows
- [ ] Extract `mapRows()` into: `normalizeAmount(raw)` (handle `$`, parentheses, EU decimals), `normalizeDate(raw, format hint)`, `normalizeMerchant(raw)`
- [ ] Support **amount sign conventions**: config toggle “negative = expense” vs “positive = expense” (some banks invert)
- [ ] Support **date formats**: auto-detect `MM/DD/YYYY`, `DD/MM/YYYY`, `YYYY-MM-DD`, ISO
- [ ] Keep existing kind-detection rules (payment/refund) but make them overridable per import profile

**Files:** `import.service.ts`, `models/index.ts`, `date.util.ts`, new `import-normalizers.util.ts`

### 2c. Import profile presets

- [ ] Ship 2–3 built-in presets (your current format + common alternatives) selectable before upload
- [ ] Allow saving a user-defined preset as “My Chase CSV”, “My Amex CSV”

**Acceptance:** A CSV with headers `Transaction Date, Description, Debit, Credit` maps successfully without editing TypeScript.

---

## 3. Category budgets

**Current state:** Categories are name-only (`Category` model). No budget amounts or periods.

**Goal:** Set a monthly (or weekly) spending cap per category and track progress.

### 3a. Data model

- [ ] Extend `Category` or add `users/{uid}/budgets/{categoryId}` with: `amount`, `period` (`monthly` | `weekly`), `rollover` (bool, optional later)
- [ ] CRUD on Categories page or new Budgets section: set/edit/remove budget per category
- [ ] Default: categories without a budget are uncapped (not $0)

**Files:** `models/index.ts`, new `budget.service.ts`, `firestore.rules`, `categories.component.ts`

### 3b. Spend calculation

- [ ] Add `computeCategorySpend(transactions, categoryId, dateRange)` — sum `expense` amounts where `categoryId` matches (handle splits: attribute each split line to its category)
- [ ] Decide refund behavior: refunds reduce category spend (mirror dashboard “refunds offset spending” toggle?)

**Files:** new `budget.util.ts`, reuse from dashboard/weekly overview

### 3c. UI surfacing

- [ ] Categories page: show budget amount + progress bar per category
- [ ] Transactions inbox badge when uncategorized expenses exist in current period
- [ ] Optional: warn when assigning a category that would exceed budget

**Acceptance:** Groceries budget $400/month shows $287 spent with 72% progress bar on March 15.

---

## 4. Dashboard overhaul (per-category spending)

**Current state:** Dashboard shows 3 line charts (expenses, income, savings by month). No category breakdown, no current-period snapshot.

**Goal:** At-a-glance answer: “Where is my money going?”

### 4a. Current period summary cards

- [ ] Top row: **Total spent**, **Total income**, **Net**, **Savings change** for selected period (default: current month)
- [ ] Period selector shared with transactions (month / custom range)

**Files:** `dashboard.component.ts`, `dashboard.service.ts`

### 4b. Category breakdown chart

- [ ] Donut or horizontal bar chart: spending by category for selected period
- [ ] Click category → navigate to Transactions with category + date filters pre-applied
- [ ] “Uncategorized” slice for inbox expenses
- [ ] Table beneath chart: category, amount, % of total, budget remaining (after §3)

**Files:** `dashboard.component.ts`, `chart-card.component.ts` (extend or add `chart-donut.component.ts`)

### 4c. Trends per category (later)

- [ ] Stacked bar or multi-line: top 5 categories over last 6 months
- [ ] Compare current month vs prior month per category (↑↓ indicators)

**Acceptance:** Dashboard shows March groceries $287 / $400 budget in category section.

---

## 5. Calendar & upcoming bills

**Current state:** No calendar, no recurring/fixed-date items. All data is historical transactions.

**Goal:** See what’s coming — paychecks, rent, subscriptions — in week or month view.

### 5a. Recurring / scheduled items model

- [ ] New collection `users/{uid}/scheduledItems/{id}`:
  - `title`, `amount`, `kind` (`income` | `expense`), `categoryId?`, `accountId?`
  - `schedule`: `fixed` (specific dates) | `recurring` (monthly on day N, weekly on day N)
  - `nextDate`, `endDate?`, `isActive`
- [ ] CRUD UI: “Add bill”, “Add paycheck”

**Files:** new `scheduled-item.service.ts`, `models/index.ts`, `firestore.rules`, new `calendar.component.ts`

### 5b. Calendar views

- [ ] **Month view**: grid with dots/amounts on days; click day for detail list
- [ ] **Week view**: 7-column agenda with totals per day
- [ ] Toggle between views; default to current week/month
- [ ] Merge **actual transactions** (solid) and **scheduled** (outlined/dashed) on the same calendar

### 5c. Reminders & cash-flow projection (stretch)

- [ ] “Upcoming this week” sidebar: next 7 days of scheduled items + estimated running balance
- [ ] Optional browser notification / email (much later)

**Acceptance:** Rent on the 1st and paycheck on the 15th appear every month; user can switch week/month view.

---

## 6. Balance comparison

**Current state:** Each account shows a single computed balance. No historical snapshots or cross-account net worth.

**Goal:** Compare balances over time or across accounts.

### 6a. Net worth snapshot

- [ ] **Net worth** = Σ(checking + savings) − Σ(credit card balances) — define sign convention for CC (positive balance = amount owed)
- [ ] Show on Dashboard as a headline number

### 6b. Balance over time chart

- [ ] For each day/week in range, reconstruct balance from `openingBalance` + transactions up to that date (respect `openingDate` cutoff)
- [ ] Line chart per account or stacked net worth
- [ ] Compare two dates: “Jan 1 vs today” delta

**Files:** new `balance-history.util.ts`, `dashboard.component.ts`

### 6c. Account comparison table

- [ ] Side-by-side: account name, balance today, change MTD, change YTD

**Acceptance:** Chart shows checking balance rising after paycheck days.

---

## 7. Weekly overview (over/under budget)

**Depends on:** §3 Category budgets

**Goal:** Monday-morning view: “How am I doing this week?”

- [ ] Define **week** boundary (ISO week Mon–Sun vs Sun–Sat — pick one, make configurable later)
- [ ] New route `/overview` or dashboard tab: **This week**
  - Total spent vs weekly budget (monthly budget ÷ 4.33, or explicit weekly budgets later)
  - Per-category: spent / budget / remaining with over-budget highlighted red
  - Days remaining in week
- [ ] Show income received this week vs expected (if scheduled items exist)
- [ ] Optional: compare to **same week last month** (spend pace)

**Files:** new `weekly-overview.component.ts` or extend `dashboard.component.ts`, `budget.util.ts`

**Acceptance:** Dining over $50 weekly budget shows red with “$12 over” on Thursday.

---

## 8. Debts owed (liability tracking)

**Current state:** Credit cards are accounts with balances, but no APR, minimum payment, or “who you owe” framing.

**Goal:** Track debts separately from day-to-day spending.

### 8a. Debt accounts model

- [ ] Option A: extend `Account` with `debt` type + fields `apr`, `minimumPayment`, `dueDay`
- [ ] Option B: separate `users/{uid}/debts/{id}` linked to optional `accountId`
- [ ] Fields: `creditor`, `balance`, `apr`, `minPayment`, `dueDate` (day of month), `notes`

### 8b. Debts page UI

- [ ] List debts: balance, APR, minimum due, days until due
- [ ] Total debt summary at top
- [ ] Link “Make payment” → pre-filled expense transaction on linked account
- [ ] Optional: sync balance from linked credit card account’s computed balance

**Files:** `models/index.ts`, new `debts.component.ts`, `account.service.ts` or `debt.service.ts`

**Acceptance:** User sees $2,400 on Visa, 22% APR, $75 min due on the 28th.

---

## 9. Spending recommendations

**Depends on:** §3 Budgets, §4 Category dashboard (need categorized history)

**Goal:** Simple, explainable nudges — not full AI.

### 9a. Rule-based insights (MVP)

- [ ] Compute 3-month rolling average spend per category
- [ ] Generate messages from templates:
  - Category > 120% of budget → “You’ve spent 20% over your Dining budget this month”
  - Category spend up 30% vs prior month → “Takeout is up $45 vs last month”
  - Uncategorized > 10% of total spend → “Categorize 12 inbox items to improve insights”
  - High APR debt + discretionary overspend → “Dining is $X over budget; paying extra on [debt] saves $Y interest” (after §8 + §10)
- [ ] Show on Dashboard as a **Insights** card; dismiss per insight (localStorage)

**Files:** new `insights.service.ts`, `dashboard.component.ts`

### 9b. Smarter recommendations (later)

- [ ] User-defined priorities: mark categories as “necessity” vs “discretionary”
- [ ] Suggest reallocation: “Reduce Entertainment by $30 to cover Groceries overspend”
- [ ] Optional LLM summary over aggregated numbers only (privacy-sensitive — keep on-device or user opt-in)

**Acceptance:** Dashboard shows at least one insight when dining exceeds budget.

---

## 10. Debt calculator

**Depends on:** §8 Debts owed (needs balance, APR, payment inputs)

**Goal:** Answer “If I pay $X/month, when am I debt-free?” and compare scenarios.

### 10a. Amortization engine

- [ ] Pure function: `simulatePayoff(principal, apr, monthlyPayment)` → `{ months, totalInterest, payoffDate, schedule[] }`
- [ ] Handle edge cases: payment ≤ monthly interest (never pays off — show warning), payment = minimum, lump-sum extra payment events
- [ ] Unit tests with known scenarios (e.g. $1000 @ 18% APR, $100/mo)

**Files:** new `debt-calculator.util.ts`, `debt-calculator.util.spec.ts`

### 10b. Calculator UI

- [ ] Inputs: balance, APR, current monthly payment
- [ ] Slider or input: “What if I pay $X instead?”
- [ ] Output: payoff date, months saved vs current payment, total interest difference
- [ ] Side-by-side compare: **$75/mo vs $150/mo** table
- [ ] “Apply as goal” → save target payment on debt record (§8)

**Files:** new `debt-calculator.component.ts`, linked from Debts page

**Acceptance:** Increasing payment from $75 → $150 shows earlier payoff date and lower total interest.

---

## Suggested build order


| Phase                | Items      | Rationale                        |
| -------------------- | ---------- | -------------------------------- |
| **A — Foundation**   | 1a, 1b, 1c | Fixes daily UX and balance trust |
| **B — Data in**      | 2          | Easier onboarding from any bank  |
| **C — Planning**     | 3, 4, 7    | Budgets + visibility             |
| **D — Forecasting**  | 5, 6       | Calendar + balance history       |
| **E — Debt**         | 8, 10      | Liability focus                  |
| **F — Intelligence** | 9          | Needs categorized history        |


---

## Quick wins (< 1 day each)

- [ ] 1a: Kind filter + summary chips on Transactions
- [ ] 1b: Respect `openingDate` in `computeAccountBalance()`
- [ ] 1c: “Last 30 days” preset (keep month picker, add presets first)
- [ ] 4a: Summary cards on Dashboard for current month
- [ ] 9a: Single insight — “X uncategorized transactions in inbox”

---

*Last updated: June 2026 · Source ideas: `/todos` page (`project-ideas.ts`)*