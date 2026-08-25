import { CurrencyPipe, PercentPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { BudgetService } from '../../core/services/budget.service';
import { CategoryService } from '../../core/services/category.service';
import { AccountService } from '../../core/services/account.service';
import { DashboardService } from '../../core/services/dashboard.service';
import { TransactionService } from '../../core/services/transaction.service';
import { ScheduledItemService } from '../../core/services/scheduled-item.service';
import { Transaction } from '../../core/models';
import { buildCategorySpendRows, UNCATEGORIZED_ID } from '../../core/utils/budget.util';
import { computeNetWorth } from '../../core/utils/balance-history.util';
import { computeAccountBalance, roundMoney } from '../../core/utils/balance.util';
import { DateRangePreset, formatDateParam, resolveDateRange, startOfDay } from '../../core/utils/date.util';
import { expandScheduledOccurrences, filterPostedScheduledOccurrences } from '../../core/utils/calendar.util';
import { ChartBarComponent } from '../../shared/chart-bar/chart-bar.component';
import { ChartDonutComponent } from '../../shared/chart-donut/chart-donut.component';
import { toLoadableSignal } from '../../core/utils/loadable-signal.util';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    CurrencyPipe,
    PercentPipe,
    RouterLink,
    MatSlideToggleModule,
    MatFormFieldModule,
    MatSelectModule,
    MatDatepickerModule,
    MatInputModule,
    MatButtonModule,
    ChartBarComponent,
    ChartDonutComponent,
  ],
  template: `
    <div class="page-stack">
      <header class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div class="page-header">
          <p class="kicker">{{ dateRange().label }}</p>
          <h1 class="page-title">Home</h1>
          <p class="page-subtitle">A calm read on where your money stands and what needs attention.</p>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <a mat-stroked-button routerLink="/calendar">See what’s due</a>
          <a mat-flat-button color="primary" routerLink="/transactions">Review activity</a>
        </div>
      </header>

      @if (initialLoading()) {
        <section class="panel animate-pulse p-6" role="status" aria-live="polite">
          <p class="font-semibold text-ink">Loading your financial overview…</p>
          <p class="mt-1 text-sm text-ink-muted">Waiting for your accounts, activity, and plans.</p>
        </section>
      }
      @if (loadError()) {
        <p class="rounded-2xl border border-finance-expense/20 bg-finance-expenseSoft p-4 text-sm text-finance-expense" role="alert">
          {{ loadError() }}
        </p>
      }
      <div class="contents" [class.hidden]="initialLoading()">
      <section class="panel overflow-hidden p-0">
        <div class="grid gap-0 lg:grid-cols-[1.35fr_0.65fr]">
          <div class="p-4 sm:p-6">
            <div class="flex items-center justify-between gap-3">
              <p class="kicker">Money snapshot</p>
              <a class="inline-flex min-h-11 items-center text-sm font-semibold text-action no-underline hover:underline" routerLink="/accounts" aria-label="View and manage accounts">
                Accounts
              </a>
            </div>
            <div class="mt-2 flex items-end justify-between gap-3">
              <div>
                <p class="text-sm text-ink-muted">Net worth today</p>
                <p class="money text-2xl font-semibold text-ink sm:text-4xl">{{ netWorth() | currency }}</p>
              </div>
              <p class="hidden max-w-sm text-sm leading-6 text-ink-muted sm:block">
                Includes account opening balances plus posted transactions. Credit card balances are treated as liabilities.
              </p>
            </div>

            <div class="mt-4 grid grid-cols-3 gap-2 sm:mt-6 sm:gap-3">
              <div class="rounded-xl border border-line bg-surface px-2 py-3 sm:p-4">
                <p class="kicker">Cash</p>
                <p class="money mt-1 text-sm font-semibold text-ink sm:text-xl">{{ cashBalance() | currency }}</p>
                <p class="mt-1 hidden text-xs text-ink-muted sm:block">Checking + savings</p>
              </div>
              <div class="rounded-xl border border-line bg-surface px-2 py-3 sm:p-4">
                <p class="kicker">Credit cards</p>
                <p class="money mt-1 text-sm font-semibold text-ink sm:text-xl" [class.text-finance-expense]="creditCardBalance() < 0">
                  {{ creditCardBalance() | currency }}
                </p>
                <p class="mt-1 hidden text-xs text-ink-muted sm:block">Current liability balance</p>
              </div>
              <div class="rounded-xl border border-line bg-surface px-2 py-3 sm:p-4">
                <p class="kicker">Period net</p>
                <p class="money mt-1 text-sm font-semibold sm:text-xl" [class.text-finance-expense]="summary().savings < 0" [class.text-finance-income]="summary().savings >= 0">
                  {{ summary().savings | currency }}
                </p>
                <p class="mt-1 hidden text-xs text-ink-muted sm:block">Income minus spending</p>
              </div>
            </div>
          </div>

          <aside class="border-t border-line bg-[#fffcf7] p-5 sm:p-6 lg:border-l lg:border-t-0">
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="kicker">Needs attention</p>
                <h2 class="mt-1 text-lg font-semibold tracking-[-0.02em] text-ink">Next best actions</h2>
              </div>
            </div>
            <div class="mt-4">
              @for (action of nextActions(); track action.title; let first = $first) {
                <a
                  class="block min-h-11 no-underline transition"
                  [class]="first
                    ? 'rounded-2xl border border-action/30 bg-action-soft p-4 hover:border-action'
                    : 'border-t border-line px-1 py-3 hover:bg-action-soft/30'"
                  [routerLink]="action.route"
                  [queryParams]="action.queryParams"
                >
                  <p class="font-semibold text-ink">{{ action.title }}</p>
                  <p class="mt-1 text-sm text-ink-muted">{{ action.body }}</p>
                </a>
              } @empty {
                <div class="rounded-2xl border border-line bg-surface p-4">
                  <p class="font-semibold text-ink">Nothing urgent</p>
                  <p class="mt-1 text-sm text-ink-muted">Your activity is categorized, budgets are calm, and nothing is due in the next week.</p>
                </div>
              }
            </div>
          </aside>
        </div>
      </section>

      <section class="panel p-4 sm:p-5" [formGroup]="periodForm">
        <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <mat-form-field>
              <mat-label>Time period</mat-label>
              <mat-select formControlName="period">
                <mat-option value="this_month">This month</mat-option>
                <mat-option value="last_30_days">Last 30 days</mat-option>
                <mat-option value="last_3_months">Last 3 months</mat-option>
                <mat-option value="ytd">Year to date</mat-option>
                <mat-option value="custom">Custom range</mat-option>
              </mat-select>
            </mat-form-field>
            @if (periodValues().period === 'custom') {
              <mat-form-field class="sm:col-span-2">
                <mat-label>Custom range</mat-label>
                <mat-date-range-input [rangePicker]="rangePicker">
                  <input matStartDate formControlName="from" placeholder="Start" />
                  <input matEndDate formControlName="to" placeholder="End" />
                </mat-date-range-input>
                <mat-datepicker-toggle matIconSuffix [for]="rangePicker" />
                <mat-date-range-picker #rangePicker />
              </mat-form-field>
            }
          </div>
          <mat-slide-toggle [checked]="refundsOffset()" (change)="refundsOffset.set($event.checked)">
            Refunds offset spending
          </mat-slide-toggle>
        </div>
      </section>

      <section class="grid gap-4 lg:grid-cols-3">
        <div class="metric">
          <p class="kicker">Income</p>
          <p class="amount-lg mt-1 text-finance-income">{{ summary().income | currency }}</p>
          <p class="mt-1 text-xs text-ink-muted">Money in during {{ dateRange().label }}</p>
        </div>
        <div class="metric">
          <p class="kicker">Spending</p>
          <p class="amount-lg mt-1 text-finance-expense">{{ summary().expenses | currency }}</p>
          <p class="mt-1 text-xs text-ink-muted">
            @if (summary().expensesPctOfIncome != null) {
              {{ summary().expensesPctOfIncome! / 100 | percent: '1.0-1' }} of income
            } @else {
              No income in this period
            }
          </p>
        </div>
        <div class="metric">
          <p class="kicker">Saved</p>
          <p class="amount-lg mt-1" [class.text-finance-expense]="summary().savings < 0" [class.text-finance-saving]="summary().savings >= 0">
            {{ summary().savings | currency }}
          </p>
          <p class="mt-1 text-xs text-ink-muted">
            @if (summary().savingsPctOfIncome != null) {
              {{ summary().savingsPctOfIncome! / 100 | percent: '1.0-1' }} of income
            } @else {
              Income minus spending
            }
          </p>
        </div>
      </section>

      <section class="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div class="panel p-5">
          <div class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p class="kicker">Trend</p>
              <h2 class="text-lg font-semibold tracking-[-0.02em] text-ink">Income, spending, and savings</h2>
            </div>
            <p class="text-xs text-ink-muted">Monthly view inside the selected period</p>
          </div>
          <app-chart-bar [labels]="incomeSeries().labels" [datasets]="monthlyOverviewDatasets()" />
        </div>

        <div class="panel p-5">
          <div class="mb-4 flex items-start justify-between gap-4">
            <div>
              <p class="kicker">Top spending</p>
              <h2 class="text-lg font-semibold tracking-[-0.02em] text-ink">Categories to watch</h2>
            </div>
            <a class="inline-flex min-h-11 items-center text-sm font-semibold text-action hover:underline" routerLink="/categories">Budgets</a>
          </div>
          <p class="mb-3 text-sm text-ink-muted">Choose a category here or in the donut to update the monthly breakdown below.</p>
          <div class="space-y-3">
            @for (row of topCategoryRows(); track row.categoryId) {
              <button
                type="button"
                class="min-h-11 w-full rounded-2xl border bg-surface p-4 text-left transition hover:border-action/50 hover:bg-action-soft/30"
                [class.border-action]="effectiveDrillId() === row.categoryId"
                [class.border-line]="effectiveDrillId() !== row.categoryId"
                [attr.aria-pressed]="effectiveDrillId() === row.categoryId"
                (click)="drillCategoryId.set(row.categoryId)"
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="font-semibold text-ink">{{ row.name }}</p>
                    <p class="mt-1 text-sm text-ink-muted">{{ row.percentOfTotal }}% of spending · monthly avg {{ monthlyAvgFor(row.spent) | currency }}</p>
                  </div>
                  <p class="money font-semibold text-finance-expense">{{ row.spent | currency }}</p>
                </div>
                @if (row.remaining != null) {
                  <p class="mt-2 text-sm" [class.text-finance-expense]="row.remaining < 0" [class.text-finance-income]="row.remaining >= 0">
                    {{ row.remaining < 0 ? 'Over by' : 'Left' }} {{ abs(row.remaining) | currency }}
                  </p>
                }
              </button>
            } @empty {
              <div class="rounded-2xl border border-line bg-surface-raised p-5 text-sm text-ink-muted">
                No category spending in this period yet. Add a transaction or import a CSV to start seeing trends.
              </div>
            }
          </div>
        </div>
      </section>

      <section class="grid gap-4 xl:grid-cols-2">
        <div class="panel space-y-4 p-5">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p class="kicker">Drill down</p>
              <h2 class="text-lg font-semibold tracking-[-0.02em] text-ink">{{ drillCategoryName() }} by month</h2>
            </div>
            <mat-form-field class="sm:w-56">
              <mat-label>Category</mat-label>
              <mat-select [value]="effectiveDrillId()" (selectionChange)="drillCategoryId.set($event.value)">
                @for (opt of drillOptions(); track opt.id) {
                  <mat-option [value]="opt.id">{{ opt.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </div>
          @if (effectiveDrillId()) {
            <a
              class="inline-flex min-h-11 items-center text-sm font-semibold text-action hover:underline"
              routerLink="/transactions"
              [queryParams]="categoryActivityQueryParams(effectiveDrillId())"
            >
              Open {{ drillCategoryName() }} activity
            </a>
          }
          <app-chart-bar
            [labels]="drillSeries().labels"
            [data]="drillSeries().values"
            color="#475569"
            [average]="drillSeries().average"
            averageLabel="Monthly average"
            averageColor="#0F766E"
          />
          <div class="grid gap-3 sm:grid-cols-3">
            <div class="metric"><p class="kicker">Period total</p><p class="amount-lg mt-1">{{ drillSeries().total | currency }}</p></div>
            <div class="metric"><p class="kicker">Monthly avg</p><p class="amount-lg mt-1">{{ drillSeries().average | currency }}</p></div>
            <div class="metric"><p class="kicker">Budget</p><p class="amount-lg mt-1">{{ drillBudget() != null ? (drillBudget() | currency) : 'Not set' }}</p></div>
          </div>
        </div>

        <app-chart-donut
          title="Spending share"
          [labels]="expenseDonutLabels()"
          [data]="expenseDonutData()"
          [categoryIds]="expenseDonutIds()"
          (categoryClick)="onExpenseCategoryClick($event)"
        />
      </section>
      </div>
    </div>
  `,
})
export class DashboardComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly categoryService = inject(CategoryService);
  private readonly budgetService = inject(BudgetService);
  private readonly accountService = inject(AccountService);
  private readonly transactionService = inject(TransactionService);
  private readonly scheduledService = inject(ScheduledItemService);
  private readonly dashboardService = inject(DashboardService);

  readonly refundsOffset = signal(false);
  readonly drillCategoryId = signal<string>('');

  readonly periodForm = this.fb.group({
    period: this.fb.nonNullable.control<DateRangePreset>('last_3_months'),
    from: this.fb.control<Date | null>(null),
    to: this.fb.control<Date | null>(null),
  });

  readonly periodValues = toSignal(this.periodForm.valueChanges, {
    initialValue: this.periodForm.getRawValue(),
  });

  private readonly categoryState = toLoadableSignal(this.categoryService.watchCategories(), []);
  private readonly budgetState = toLoadableSignal(this.budgetService.watchBudgets(), []);
  private readonly accountState = toLoadableSignal(this.accountService.watchAccounts(), []);
  private readonly transactionState = toLoadableSignal(
    this.transactionService.watchAllTransactions(),
    []
  );
  private readonly scheduledState = toLoadableSignal(
    this.scheduledService.watchScheduledItems(),
    []
  );
  private readonly categories = this.categoryState.value;
  private readonly budgets = this.budgetState.value;
  private readonly accounts = this.accountState.value;
  private readonly transactions = this.transactionState.value;
  private readonly scheduledItems = this.scheduledState.value;
  readonly initialLoading = computed(() =>
    [
      this.categoryState,
      this.budgetState,
      this.accountState,
      this.transactionState,
      this.scheduledState,
    ].some((state) => state.loading())
  );
  readonly loadError = computed(
    () =>
      [
        this.categoryState,
        this.budgetState,
        this.accountState,
        this.transactionState,
        this.scheduledState,
      ]
        .map((state) => state.error())
        .find((message): message is string => !!message) ?? null
  );

  constructor() {
    this.periodForm.get('from')?.valueChanges.subscribe(() => this.ensureCustomPeriod());
    this.periodForm.get('to')?.valueChanges.subscribe(() => this.ensureCustomPeriod());
  }

  readonly dateRange = computed(() => {
    const f = this.periodValues();
    return resolveDateRange(f.period ?? 'last_3_months', f.from, f.to);
  });

  readonly accountBalances = computed(() =>
    this.accounts().map((account) => ({
      account,
      balance: computeAccountBalance(account, this.transactions()),
    }))
  );

  readonly netWorth = computed(() => computeNetWorth(this.accounts(), this.transactions()));
  readonly accountCount = computed(() => this.accounts().length);
  readonly transactionCount = computed(() => this.transactions().length);
  readonly cashBalance = computed(() =>
    this.accountBalances()
      .filter((row) => row.account.type === 'checking' || row.account.type === 'savings')
      .reduce((sum, row) => sum + row.balance, 0)
  );
  readonly creditCardBalance = computed(() =>
    this.accountBalances()
      .filter((row) => row.account.type === 'credit_card')
      .reduce((sum, row) => sum + row.balance, 0)
  );

  readonly summary = computed(() =>
    this.dashboardService.computePeriodSummary(this.transactions(), this.dateRange(), this.refundsOffset())
  );

  readonly incomeSeries = computed(() =>
    this.dashboardService.computeMonthlySeries(this.transactions(), this.dateRange(), 'income', this.refundsOffset())
  );
  readonly expenseSeries = computed(() =>
    this.dashboardService.computeMonthlySeries(this.transactions(), this.dateRange(), 'expenses', this.refundsOffset())
  );
  readonly savingsSeries = computed(() =>
    this.dashboardService.computeMonthlySeries(this.transactions(), this.dateRange(), 'savings', this.refundsOffset())
  );

  readonly monthlyOverviewDatasets = computed(() => [
    { label: 'Income', data: this.incomeSeries().values, color: 'var(--color-income)' },
    { label: 'Spending', data: this.expenseSeries().values, color: 'var(--color-expense)' },
    { label: 'Saved', data: this.savingsSeries().values, color: 'var(--color-saving)' },
  ]);

  readonly expenseSlices = computed(() =>
    this.dashboardService.computeExpenseByCategory(
      this.transactions(),
      this.categories(),
      this.dateRange(),
      this.refundsOffset()
    )
  );

  readonly incomeSlices = computed(() =>
    this.dashboardService.computeIncomeByCategory(this.transactions(), this.categories(), this.dateRange())
  );

  readonly expenseDonutLabels = computed(() => this.expenseSlices().map((s) => s.name));
  readonly expenseDonutData = computed(() => this.expenseSlices().map((s) => s.amount));
  readonly expenseDonutIds = computed(() => this.expenseSlices().map((s) => s.categoryId));
  readonly incomeDonutLabels = computed(() => this.incomeSlices().map((s) => s.name));
  readonly incomeDonutData = computed(() => this.incomeSlices().map((s) => s.amount));
  readonly incomeDonutIds = computed(() => this.incomeSlices().map((s) => s.categoryId));

  readonly categoryRows = computed(() =>
    buildCategorySpendRows(this.transactions(), this.categories(), this.budgets(), this.dateRange(), {
      refundsOffset: this.refundsOffset(),
      budgetAs: 'monthly',
    }).filter((r) => r.spent > 0 || r.budgetAmount != null)
  );

  readonly topCategoryRows = computed(() => this.categoryRows().filter((r) => r.spent > 0).slice(0, 5));
  readonly overBudgetRows = computed(() => this.categoryRows().filter((r) => r.remaining != null && r.remaining < 0));
  readonly uncategorizedCount = computed(() =>
    this.transactions().filter((tx) => this.isUncategorizedExpenseInRange(tx)).length
  );

  readonly upcomingScheduled = computed(() => {
    const start = startOfDay(new Date());
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return filterPostedScheduledOccurrences(
      expandScheduledOccurrences(this.scheduledItems(), start, end),
      this.transactions()
    );
  });

  readonly upcomingScheduledCount = computed(() => this.upcomingScheduled().length);
  readonly nextScheduledItem = computed(() => this.upcomingScheduled()[0] ?? null);
  readonly upcomingScheduledNet = computed(() =>
    roundMoney(this.upcomingScheduled().reduce((sum, item) => sum + item.amount, 0))
  );
  readonly nextActions = computed(() => {
    const actions: {
      title: string;
      body: string;
      route: string;
      queryParams?: Record<string, string>;
    }[] = [];
    if (this.accountCount() === 0) {
      actions.push({
        title: 'Add your first account',
        body: 'Start with checking so balances and reports have context.',
        route: '/accounts',
      });
    }
    if (this.accountCount() > 0 && this.transactionCount() === 0) {
      actions.push({
        title: 'Import recent activity',
        body: 'Bring in a CSV or add your first transaction manually.',
        route: '/transactions',
        queryParams: { import: '1' },
      });
    }
    if (this.uncategorizedCount() > 0) {
      actions.push({
        title: `Review ${this.uncategorizedCount()} uncategorized in selected period`,
        body: 'Activity opens to this exact period so the review count matches.',
        route: '/transactions',
        queryParams: this.uncategorizedQueryParams(),
      });
    }
    if (this.overBudgetRows().length > 0) {
      const count = this.overBudgetRows().length;
      actions.push({
        title: `${count} budget ${count === 1 ? 'category is' : 'categories are'} over`,
        body: 'Check monthly limits before more spending.',
        route: '/categories',
      });
    }
    if (this.upcomingScheduledCount() > 0) {
      const count = this.upcomingScheduledCount();
      const next = this.nextScheduledItem();
      actions.push({
        title: `${count} upcoming ${count === 1 ? 'item' : 'items'}`,
        body: next
          ? `Next: ${next.title} on ${new Intl.DateTimeFormat('en-US', {
              month: 'short',
              day: 'numeric',
            }).format(next.date)} · net ${this.currencyText(this.upcomingScheduledNet())}`
          : 'Review bills and paychecks due soon.',
        route: '/calendar',
      });
    }
    return actions;
  });

  readonly drillOptions = computed(() => {
    const fromSpend = this.expenseSlices().map((s) => ({ id: s.categoryId, name: s.name }));
    if (fromSpend.length) return fromSpend;
    return this.categories()
      .filter((c) => !c.isSystem)
      .map((c) => ({ id: c.id, name: c.name }));
  });

  readonly effectiveDrillId = computed(() => {
    const options = this.drillOptions();
    const selected = this.drillCategoryId();
    if (selected && options.some((o) => o.id === selected)) return selected;
    return options[0]?.id ?? '';
  });

  readonly drillCategoryName = computed(
    () => this.drillOptions().find((o) => o.id === this.effectiveDrillId())?.name ?? 'Category'
  );

  readonly drillSeries = computed(() => {
    const id = this.effectiveDrillId();
    if (!id) return { labels: [] as string[], values: [] as number[], average: 0, total: 0, monthKeys: [] as string[] };
    return this.dashboardService.computeCategoryMonthlySeries(
      this.transactions(),
      id,
      this.dateRange(),
      this.refundsOffset()
    );
  });

  readonly drillBudget = computed(() => {
    const id = this.effectiveDrillId();
    if (!id || id === UNCATEGORIZED_ID) return null;
    return this.budgets().find((b) => b.categoryId === id)?.amount ?? null;
  });

  readonly monthCount = computed(() => Math.max(1, this.expenseSeries().labels.length));

  monthlyAvgFor(spent: number): number {
    return Math.round((spent / this.monthCount()) * 100) / 100;
  }

  abs(value: number): number {
    return Math.abs(value);
  }

  uncategorizedQueryParams(): Record<string, string> {
    const range = this.dateRange();
    const queryParams: Record<string, string> = { period: 'custom', kind: 'expense', categoryId: 'uncategorized' };
    if (range.start) queryParams['from'] = formatDateParam(range.start);
    if (range.end) queryParams['to'] = formatDateParam(range.end);
    return queryParams;
  }

  categoryActivityQueryParams(categoryId: string): Record<string, string> {
    const range = this.dateRange();
    const queryParams: Record<string, string> = {
      period: 'custom',
      kind: 'expense',
      categoryId: categoryId === UNCATEGORIZED_ID ? 'uncategorized' : categoryId,
    };
    if (range.start) queryParams['from'] = formatDateParam(range.start);
    if (range.end) queryParams['to'] = formatDateParam(range.end);
    return queryParams;
  }

  onExpenseCategoryClick(categoryId: string): void {
    this.drillCategoryId.set(categoryId);
  }

  goToCategory(categoryId: string, kind: 'expense' | 'income'): void {
    const range = this.dateRange();
    const queryParams: Record<string, string> = { period: 'custom', kind };
    if (range.start) queryParams['from'] = formatDateParam(range.start);
    if (range.end) queryParams['to'] = formatDateParam(range.end);
    queryParams['categoryId'] = categoryId === UNCATEGORIZED_ID ? 'uncategorized' : categoryId;
    void this.router.navigate(['/transactions'], { queryParams });
  }

  private ensureCustomPeriod(): void {
    if (this.periodForm.get('period')?.value !== 'custom') {
      this.periodForm.patchValue({ period: 'custom' }, { emitEvent: true });
    }
  }

  private currencyText(value: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  }

  private isUncategorizedExpenseInRange(tx: Transaction): boolean {
    if (tx.kind !== 'expense' || tx.categoryId || tx.split?.length) return false;
    const range = this.dateRange();
    const afterStart = !range.start || tx.postedAt >= range.start;
    const beforeEnd = !range.end || tx.postedAt <= range.end;
    return afterStart && beforeEnd;
  }
}
