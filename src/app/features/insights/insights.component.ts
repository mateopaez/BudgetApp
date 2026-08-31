import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { BudgetService } from '../../core/services/budget.service';
import { CategoryService } from '../../core/services/category.service';
import { DashboardService } from '../../core/services/dashboard.service';
import { TransactionService } from '../../core/services/transaction.service';
import { roundMoney } from '../../core/utils/balance.util';
import { budgetForPeriod } from '../../core/utils/budget.util';
import {
  computeCategoryMoMDeltas,
  driverBlurb,
  formatPercentChange,
  fullMonthRange,
  isSameCalendarMonth,
  shiftMonth,
  spendingComparisonSummary,
  topCategoryDrivers,
  trailingMonthRange,
} from '../../core/utils/insights.util';
import { formatMoney } from '../../core/utils/format.util';
import { toLoadableSignal } from '../../core/utils/loadable-signal.util';
import { ChartBarComponent } from '../../shared/chart-bar/chart-bar.component';

type TrailingMonths = 3 | 6 | 12;

@Component({
  selector: 'app-insights',
  standalone: true,
  imports: [
    CurrencyPipe,
    RouterLink,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    ChartBarComponent,
  ],
  template: `
    <div class="page !space-y-10">
      <header class="page-header">
        <p class="page-kicker">Secondary analysis</p>
        <h1 class="page-title">Insights</h1>
        <p class="page-subtitle">
          How this month compares — spending, categories, and cashflow. Transfers and card payments
          are excluded from income and spending.
        </p>
      </header>

      @if (initialLoading()) {
        <section class="empty-state animate-pulse" role="status" aria-live="polite">
          <p class="font-medium text-ink">Loading comparison…</p>
        </section>
      } @else if (loadError()) {
        <p class="status-banner status-banner--error" role="alert">{{ loadError() }}</p>
      } @else if (isEmpty()) {
        <section class="empty-state space-y-4">
          <h2 class="section-title">Not enough activity yet</h2>
          <p class="mx-auto max-w-md text-sm leading-6 text-ink-muted">
            Log a few expenses across months to see trends and category changes.
          </p>
          <a mat-flat-button color="primary" routerLink="/activity" [queryParams]="{ action: 'add' }">
            Add transaction
          </a>
        </section>
      } @else {
        <!-- Controls -->
        <section class="space-y-4" aria-label="Comparison controls">
          <div class="flex items-center justify-between gap-3">
            <button
              mat-icon-button
              type="button"
              (click)="shiftCompareMonth(-1)"
              aria-label="Earlier comparison month"
            >
              <mat-icon>chevron_left</mat-icon>
            </button>
            <div class="min-w-0 text-center">
              <p class="text-sm text-ink-muted">Comparing</p>
              <p class="section-title truncate">
                {{ currentMonthLabel() }} vs {{ compareMonthLabel() }}
              </p>
            </div>
            <button
              mat-icon-button
              type="button"
              (click)="shiftCompareMonth(1)"
              [disabled]="!canShiftCompareForward()"
              aria-label="Later comparison month"
            >
              <mat-icon>chevron_right</mat-icon>
            </button>
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <p class="text-sm text-ink-muted">Trend window</p>
            <mat-button-toggle-group
              [value]="trailingMonths()"
              (change)="onTrailingChange($event.value)"
              aria-label="Trailing months for trend"
            >
              <mat-button-toggle [value]="3">3 mo</mat-button-toggle>
              <mat-button-toggle [value]="6">6 mo</mat-button-toggle>
              <mat-button-toggle [value]="12">12 mo</mat-button-toggle>
            </mat-button-toggle-group>
          </div>
        </section>

        <!-- Plain-language summary -->
        <section aria-labelledby="summary-heading">
          <h2 id="summary-heading" class="sr-only">Spending summary</h2>
          <p class="text-base leading-7 text-ink sm:text-lg">{{ summaryText() }}</p>
          @if (isPartialCurrent()) {
            <p class="mt-2 text-sm text-ink-muted">
              {{ currentMonthLabel() }} is still in progress — totals will grow as the month continues.
            </p>
          }
          @if (topDrivers().length) {
            <p class="mt-3 text-sm text-ink-muted">
              Largest shifts:
              @for (d of topDrivers(); track d.categoryId; let last = $last) {
                <span>{{ driverBlurb(d) }}</span
                >@if (!last) {
                  <span>; </span>
                }
              }
            </p>
          }
        </section>

        <!-- 1. Monthly spending trend -->
        <section aria-labelledby="trend-heading" class="space-y-4">
          <div>
            <h2 id="trend-heading" class="section-title">Monthly spending</h2>
            <p class="mt-1 text-sm text-ink-muted">
              @if (hasPlannedSeries() && isPartialPlan()) {
                Expenses only over the last {{ trailingMonths() }} months. The planned line is a
                partial plan ({{ plannedByMonth() | currency }} from categories with targets — not a
                full monthly budget).
              } @else if (hasPlannedSeries()) {
                Expenses only over the last {{ trailingMonths() }} months, with planned totals when
                budgets exist.
              } @else {
                Expenses only over the last {{ trailingMonths() }} months.
              }
            </p>
          </div>
          <app-chart-bar
            [labels]="trendLabels()"
            [datasets]="trendDatasets()"
            [average]="trendAverage()"
            averageLabel="Avg spending"
          />
          <ul class="list-shell list-none p-0" aria-label="Monthly spending table">
            @for (row of trendTable(); track row.key) {
              <li class="list-row flex items-center justify-between gap-3 text-sm">
                <span class="font-medium text-ink">{{ row.label }}</span>
                <span class="money text-ink-muted">
                  {{ row.spent | currency }}
                  @if (row.planned != null) {
                    <span class="text-ink-soft">
                      /
                      {{ row.planned | currency }}
                      {{ isPartialPlan() ? 'partial plan' : 'planned' }}
                    </span>
                  }
                </span>
              </li>
            }
          </ul>
        </section>

        <!-- 2. Category comparison -->
        <section aria-labelledby="category-heading" class="space-y-4">
          <div>
            <h2 id="category-heading" class="section-title">Category changes</h2>
            <p class="mt-1 text-sm text-ink-muted">
              Sorted by largest dollar change between {{ currentMonthLabel() }} and
              {{ compareMonthLabel() }}.
            </p>
          </div>
          @if (categoryDeltas().length) {
            <ul class="list-shell list-none p-0">
              @for (row of categoryDeltas(); track row.categoryId) {
                <li
                  class="list-row"
                  [class.opacity-60]="row.isSmall"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <p class="font-medium text-ink">{{ row.name }}</p>
                      <p class="mt-0.5 text-sm text-ink-muted">
                        <span class="money">{{ row.current | currency }}</span>
                        now ·
                        <span class="money">{{ row.compare | currency }}</span>
                        before
                      </p>
                    </div>
                    <div class="shrink-0 text-right">
                      <p
                        class="money font-semibold"
                        [class.text-finance-expense]="row.dollarChange > 0"
                        [class.text-finance-income]="row.dollarChange < 0"
                        [class.text-ink-muted]="row.dollarChange === 0"
                      >
                        {{ formatSigned(row.dollarChange) }}
                      </p>
                      @if (percentLabel(row.percentChange); as pct) {
                        <p class="text-xs text-ink-soft">{{ pct }}</p>
                      }
                    </div>
                  </div>
                </li>
              }
            </ul>
          } @else {
            <div class="empty-state !py-8">
              <p class="text-sm text-ink-muted">No category spending to compare in these months.</p>
            </div>
          }
        </section>

        <!-- 3. Monthly cashflow -->
        <section aria-labelledby="cashflow-heading" class="space-y-4">
          <div>
            <h2 id="cashflow-heading" class="section-title">Monthly cashflow</h2>
            <p class="mt-1 text-sm text-ink-muted">
              Income, spending, and net (income − spending). Transfers and credit card payments are
              not counted as income or spending.
            </p>
          </div>
          <app-chart-bar [labels]="cashflowLabels()" [datasets]="cashflowDatasets()" />
          <ul class="list-shell list-none p-0" aria-label="Cashflow by month">
            @for (row of cashflowTable(); track row.key) {
              <li class="list-row space-y-1 text-sm">
                <div class="flex items-center justify-between gap-3">
                  <span class="font-medium text-ink">{{ row.label }}</span>
                  <span
                    class="money font-semibold"
                    [class.text-finance-income]="row.net >= 0"
                    [class.text-finance-expense]="row.net < 0"
                  >
                    {{ row.net | currency }}
                  </span>
                </div>
                <p class="text-ink-muted">
                  In <span class="money">{{ row.income | currency }}</span>
                  · Out <span class="money">{{ row.expenses | currency }}</span>
                </p>
              </li>
            }
          </ul>
        </section>

        <!-- 4. Balances note -->
        <p class="border-t border-line pt-6 text-sm text-ink-muted">
          Account balances live on
          <a class="font-medium text-action no-underline hover:underline" routerLink="/accounts"
            >Accounts</a
          >
          — balance history is not shown here yet.
        </p>
      }
    </div>
  `,
})
export class InsightsComponent {
  private readonly dashboard = inject(DashboardService);
  private readonly categoryService = inject(CategoryService);
  private readonly budgetService = inject(BudgetService);
  private readonly transactionService = inject(TransactionService);

  readonly driverBlurb = driverBlurb;
  readonly percentLabel = formatPercentChange;

  private readonly now = new Date();
  /** Primary month being inspected (defaults to current calendar month). */
  readonly focusMonth = signal(new Date(this.now.getFullYear(), this.now.getMonth(), 1));
  /** Month to compare against (defaults to previous month). */
  readonly compareMonth = signal(
    new Date(this.now.getFullYear(), this.now.getMonth() - 1, 1)
  );
  readonly trailingMonths = signal<TrailingMonths>(6);

  private readonly categoryState = toLoadableSignal(this.categoryService.watchCategories(), []);
  private readonly budgetState = toLoadableSignal(this.budgetService.watchBudgets(), []);
  private readonly transactionState = toLoadableSignal(
    this.transactionService.watchAllTransactions(),
    []
  );

  private readonly categories = this.categoryState.value;
  private readonly budgets = this.budgetState.value;
  private readonly transactions = this.transactionState.value;

  readonly initialLoading = computed(
    () =>
      this.categoryState.loading() ||
      this.budgetState.loading() ||
      this.transactionState.loading()
  );

  readonly loadError = computed(
    () =>
      this.categoryState.error() ??
      this.budgetState.error() ??
      this.transactionState.error()
  );

  readonly isEmpty = computed(() => this.transactions().length === 0);

  readonly currentMonthLabel = computed(() =>
    this.focusMonth().toLocaleDateString(undefined, { month: 'long' })
  );
  readonly compareMonthLabel = computed(() =>
    this.compareMonth().toLocaleDateString(undefined, { month: 'long' })
  );

  readonly isPartialCurrent = computed(() => isSameCalendarMonth(this.focusMonth(), this.now));

  private readonly currentRange = computed(() => fullMonthRange(this.focusMonth()));
  private readonly compareRange = computed(() => fullMonthRange(this.compareMonth()));

  private readonly trendRange = computed(() =>
    trailingMonthRange(this.focusMonth(), this.trailingMonths())
  );

  private readonly currentSummary = computed(() =>
    this.dashboard.computePeriodSummary(this.transactions(), this.currentRange())
  );
  private readonly compareSummary = computed(() =>
    this.dashboard.computePeriodSummary(this.transactions(), this.compareRange())
  );

  readonly summaryText = computed(() =>
    spendingComparisonSummary(
      this.currentSummary().expenses,
      this.compareSummary().expenses,
      this.focusMonth(),
      this.compareMonth(),
      { isPartialCurrentMonth: this.isPartialCurrent() }
    )
  );

  private readonly currentByCategory = computed(() =>
    this.dashboard.computeExpenseByCategory(
      this.transactions(),
      this.categories(),
      this.currentRange()
    )
  );

  private readonly compareByCategory = computed(() =>
    this.dashboard.computeExpenseByCategory(
      this.transactions(),
      this.categories(),
      this.compareRange()
    )
  );

  readonly categoryDeltas = computed(() =>
    computeCategoryMoMDeltas(
      this.currentByCategory().map((c) => ({
        categoryId: c.categoryId,
        name: c.name,
        amount: c.amount,
      })),
      this.compareByCategory().map((c) => ({
        categoryId: c.categoryId,
        name: c.name,
        amount: c.amount,
      }))
    )
  );

  readonly topDrivers = computed(() => topCategoryDrivers(this.categoryDeltas(), 3));

  private readonly expenseSeries = computed(() =>
    this.dashboard.computeMonthlySeries(this.transactions(), this.trendRange(), 'expenses')
  );

  private readonly incomeSeries = computed(() =>
    this.dashboard.computeMonthlySeries(this.transactions(), this.trendRange(), 'income')
  );

  private readonly savingsSeries = computed(() =>
    this.dashboard.computeMonthlySeries(this.transactions(), this.trendRange(), 'savings')
  );

  readonly plannedByMonth = computed(() => {
    const budgets = this.budgets();
    if (!budgets.length) return null;
    let planned = 0;
    for (const b of budgets) {
      const monthly = budgetForPeriod(b, 'monthly');
      if (monthly != null && monthly > 0) planned += monthly;
    }
    planned = roundMoney(planned);
    if (planned <= 0) return null;
    return planned;
  });

  readonly hasPlannedSeries = computed(() => this.plannedByMonth() != null);

  /** True when budgeted targets cover only a slice of typical spending. */
  readonly isPartialPlan = computed(() => {
    const planned = this.plannedByMonth();
    if (planned == null) return false;
    const avg = this.expenseSeries().average;
    if (avg > 0 && planned / avg < 0.5) return true;
    const budgetedCats = this.budgets().filter((b) => (budgetForPeriod(b, 'monthly') ?? 0) > 0)
      .length;
    const spendCats = this.categories().filter((c) => !c.isSystem && !c.archivedAt).length;
    return spendCats > 0 && budgetedCats / spendCats < 0.5;
  });

  readonly trendLabels = computed(() => this.expenseSeries().labels);

  readonly trendDatasets = computed(() => {
    const spent = this.expenseSeries();
    const datasets: { label: string; data: number[]; color: string }[] = [
      {
        label: 'Spending',
        data: spent.values,
        color: 'var(--chart-series-1)',
      },
    ];
    const planned = this.plannedByMonth();
    if (planned != null) {
      datasets.push({
        label: this.isPartialPlan() ? 'Partial plan' : 'Planned',
        data: spent.labels.map(() => planned),
        color: 'var(--chart-series-2)',
      });
    }
    return datasets;
  });

  readonly trendAverage = computed(() => {
    const series = this.expenseSeries();
    return series.values.length ? series.average : null;
  });

  readonly trendTable = computed(() => {
    const spent = this.expenseSeries();
    const planned = this.plannedByMonth();
    return spent.monthKeys.map((key, i) => ({
      key,
      label: formatMonthFromKey(key),
      spent: spent.values[i] ?? 0,
      planned,
    }));
  });

  readonly cashflowLabels = computed(() => this.incomeSeries().labels);

  readonly cashflowDatasets = computed(() => [
    {
      label: 'Income',
      data: this.incomeSeries().values,
      color: 'var(--chart-series-2)',
    },
    {
      label: 'Spending',
      data: this.expenseSeries().values,
      color: 'var(--chart-series-1)',
    },
    {
      label: 'Net',
      data: this.savingsSeries().values,
      color: 'var(--chart-series-3)',
    },
  ]);

  readonly cashflowTable = computed(() => {
    const income = this.incomeSeries();
    const expenses = this.expenseSeries();
    const net = this.savingsSeries();
    return income.monthKeys.map((key, i) => ({
      key,
      label: formatMonthFromKey(key),
      income: income.values[i] ?? 0,
      expenses: expenses.values[i] ?? 0,
      net: net.values[i] ?? 0,
    }));
  });

  onTrailingChange(value: TrailingMonths | null): void {
    if (value === 3 || value === 6 || value === 12) {
      this.trailingMonths.set(value);
    }
  }

  shiftCompareMonth(delta: number): void {
    // Move both focus and compare together so we always compare consecutive months.
    const nextFocus = shiftMonth(this.focusMonth(), delta);
    const cur = new Date(this.now.getFullYear(), this.now.getMonth(), 1);
    if (nextFocus > cur) return;
    this.focusMonth.set(nextFocus);
    this.compareMonth.set(shiftMonth(nextFocus, -1));
  }

  canShiftCompareForward(): boolean {
    const next = shiftMonth(this.focusMonth(), 1);
    const cur = new Date(this.now.getFullYear(), this.now.getMonth(), 1);
    return next <= cur;
  }

  formatSigned(amount: number): string {
    if (amount > 0) return `+${formatMoney(amount)}`;
    if (amount < 0) return `−${formatMoney(Math.abs(amount))}`;
    return formatMoney(0);
  }
}

function formatMonthFromKey(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
  });
}
