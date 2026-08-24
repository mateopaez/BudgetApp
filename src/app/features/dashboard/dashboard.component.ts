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
import {
  buildCategorySpendRows,
  UNCATEGORIZED_ID,
} from '../../core/utils/budget.util';
import { computeNetWorth } from '../../core/utils/balance-history.util';
import {
  DateRangePreset,
  formatDateParam,
  resolveDateRange,
} from '../../core/utils/date.util';
import { ChartBarComponent } from '../../shared/chart-bar/chart-bar.component';
import { ChartDonutComponent } from '../../shared/chart-donut/chart-donut.component';

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
    <div class="space-y-6">
      <!-- Header + period controls -->
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div class="page-header">
          <h1 class="page-title">Dashboard</h1>
          <p class="page-subtitle">
            {{ dateRange().label }} · net worth
            <a routerLink="/accounts" class="font-semibold text-brand-700 hover:underline">{{
              netWorth() | currency
            }}</a>
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <mat-slide-toggle
            [checked]="refundsOffset()"
            (change)="refundsOffset.set($event.checked)"
          >
            Refunds offset spending
          </mat-slide-toggle>
          <a mat-stroked-button routerLink="/calendar">Calendar</a>
        </div>
      </div>

      <div class="app-card p-4" [formGroup]="periodForm">
        <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
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
            <mat-form-field class="sm:col-span-2">
              <mat-label>Custom range</mat-label>
              <mat-date-range-input [rangePicker]="rangePicker">
                <input matStartDate formControlName="from" placeholder="Start" />
                <input matEndDate formControlName="to" placeholder="End" />
              </mat-date-range-input>
              <mat-datepicker-toggle matIconSuffix [for]="rangePicker" />
              <mat-date-range-picker #rangePicker />
              <mat-hint>Selecting dates switches to Custom range</mat-hint>
            </mat-form-field>
          </div>
          <p class="max-w-xs text-xs leading-relaxed text-slate-500 lg:pt-2">
            Monthly charts show each month inside the selected window. Drill down into one expense
            category to see its month-by-month trend.
          </p>
        </div>
      </div>

      <!-- Row 1: Totals + category drill-down -->
      <div class="grid gap-4 xl:grid-cols-2">
        <div class="app-card space-y-4 p-5">
          <h3 class="text-sm font-semibold uppercase tracking-wide text-brand-800">
            Total income, expenses &amp; savings
          </h3>
          <app-chart-bar
            [labels]="totalsBarLabels"
            [datasets]="totalsBarDatasets()"
          />
          <table class="w-full text-sm">
            <tbody class="divide-y divide-brand-100">
              <tr>
                <td class="py-2 font-medium text-emerald-700">Total income</td>
                <td class="py-2 text-right font-semibold text-emerald-700">
                  {{ summary().income | currency }}
                </td>
                <td class="py-2 pl-3 text-right text-slate-400">—</td>
              </tr>
              <tr>
                <td class="py-2 font-medium text-red-600">Total expenses</td>
                <td class="py-2 text-right font-semibold text-red-600">
                  {{ summary().expenses | currency }}
                </td>
                <td class="py-2 pl-3 text-right text-slate-500">
                  @if (summary().expensesPctOfIncome != null) {
                    {{ summary().expensesPctOfIncome! / 100 | percent: '1.1-1' }} of income
                  }
                </td>
              </tr>
              <tr>
                <td class="py-2 font-medium text-cyan-700">Total savings</td>
                <td
                  class="py-2 text-right font-semibold"
                  [class]="summary().savings < 0 ? 'text-red-600' : 'text-cyan-700'"
                >
                  {{ summary().savings | currency }}
                </td>
                <td class="py-2 pl-3 text-right text-slate-500">
                  @if (summary().savingsPctOfIncome != null) {
                    {{ summary().savingsPctOfIncome! / 100 | percent: '1.1-1' }} of income
                  }
                </td>
              </tr>
            </tbody>
          </table>
          <p class="text-xs text-slate-500">Savings = income − expenses for the selected period.</p>
        </div>

        <div class="app-card space-y-4 p-5">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 class="text-sm font-semibold uppercase tracking-wide text-brand-800">
              Expense drill-down
            </h3>
            <mat-form-field class="sm:w-56">
              <mat-label>Category</mat-label>
              <mat-select [value]="drillCategoryId()" (selectionChange)="drillCategoryId.set($event.value)">
                @for (opt of drillOptions(); track opt.id) {
                  <mat-option [value]="opt.id">{{ opt.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </div>
          <h4 class="text-base font-medium text-midnight-900">
            {{ drillCategoryName() }} by month
          </h4>
          <app-chart-bar
            [labels]="drillSeries().labels"
            [data]="drillSeries().values"
            color="#475569"
            [average]="drillSeries().average"
            averageLabel="Monthly average"
            averageColor="#1e3a8a"
          />
          <table class="w-full text-sm">
            <tbody class="divide-y divide-brand-100">
              <tr>
                <td class="py-2 text-slate-600">Total (period)</td>
                <td class="py-2 text-right font-semibold text-midnight-900">
                  {{ drillSeries().total | currency }}
                </td>
              </tr>
              <tr>
                <td class="py-2 text-slate-600">Monthly average</td>
                <td class="py-2 text-right font-semibold text-midnight-900">
                  {{ drillSeries().average | currency }}
                </td>
              </tr>
              <tr>
                <td class="py-2 text-slate-600">Monthly budget</td>
                <td class="py-2 text-right font-semibold text-midnight-900">
                  @if (drillBudget() != null) {
                    {{ drillBudget()! | currency }}
                  } @else {
                    <span class="font-normal text-slate-400">Not set</span>
                  }
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Row 2: Monthly income / expenses / savings -->
      <div class="grid gap-4 lg:grid-cols-3">
        <div class="app-card space-y-3 p-5">
          <h3 class="text-sm font-semibold uppercase tracking-wide text-emerald-800">
            Income by month
          </h3>
          <app-chart-bar
            [labels]="incomeSeries().labels"
            [data]="incomeSeries().values"
            color="#16a34a"
            [average]="incomeSeries().average"
            averageLabel="Average"
            averageColor="#1e3a8a"
          />
          <table class="w-full text-sm">
            <tbody class="divide-y divide-brand-100">
              <tr>
                <td class="py-2 text-slate-600">Monthly average</td>
                <td class="py-2 text-right font-medium">{{ incomeSeries().average | currency }}</td>
              </tr>
              <tr>
                <td class="py-2 text-slate-600">Period total</td>
                <td class="py-2 text-right font-medium">{{ incomeSeries().total | currency }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="app-card space-y-3 p-5">
          <h3 class="text-sm font-semibold uppercase tracking-wide text-red-800">
            Expenses by month
          </h3>
          <app-chart-bar
            [labels]="expenseSeries().labels"
            [data]="expenseSeries().values"
            color="#dc2626"
            [average]="expenseSeries().average"
            averageLabel="Average"
            averageColor="#1e3a8a"
          />
          <table class="w-full text-sm">
            <tbody class="divide-y divide-brand-100">
              <tr>
                <td class="py-2 text-slate-600">Monthly average</td>
                <td class="py-2 text-right font-medium">{{ expenseSeries().average | currency }}</td>
              </tr>
              <tr>
                <td class="py-2 text-slate-600">Period total</td>
                <td class="py-2 text-right font-medium">{{ expenseSeries().total | currency }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="app-card space-y-3 p-5">
          <h3 class="text-sm font-semibold uppercase tracking-wide text-cyan-800">
            Savings by month
          </h3>
          <app-chart-bar
            [labels]="savingsSeries().labels"
            [data]="savingsSeries().values"
            color="#06b6d4"
            [average]="savingsSeries().average"
            averageLabel="Average"
            averageColor="#1e3a8a"
          />
          <table class="w-full text-sm">
            <tbody class="divide-y divide-brand-100">
              <tr>
                <td class="py-2 text-slate-600">Monthly average</td>
                <td
                  class="py-2 text-right font-medium"
                  [class]="savingsSeries().average < 0 ? 'text-red-600' : ''"
                >
                  {{ savingsSeries().average | currency }}
                </td>
              </tr>
              <tr>
                <td class="py-2 text-slate-600">Period total</td>
                <td
                  class="py-2 text-right font-medium"
                  [class]="savingsSeries().total < 0 ? 'text-red-600' : ''"
                >
                  {{ savingsSeries().total | currency }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Row 3: Category donuts + breakdown table -->
      <div class="grid gap-4 xl:grid-cols-2">
        <app-chart-donut
          title="Expenses by category"
          [labels]="expenseDonutLabels()"
          [data]="expenseDonutData()"
          [categoryIds]="expenseDonutIds()"
          (categoryClick)="onExpenseCategoryClick($event)"
        />
        <app-chart-donut
          title="Income by category"
          [labels]="incomeDonutLabels()"
          [data]="incomeDonutData()"
          [categoryIds]="incomeDonutIds()"
          (categoryClick)="goToCategory($event, 'income')"
        />
      </div>

      <div class="app-card overflow-hidden">
        <div class="border-b border-brand-100 px-5 py-4">
          <h3 class="text-sm font-semibold uppercase tracking-wide text-brand-800">
            Category breakdown
          </h3>
          <p class="mt-1 text-xs text-slate-500">
            Expense categories for this period · click a row to open transactions
          </p>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[480px] text-sm">
            <thead class="bg-brand-50/60 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th class="px-4 py-2 font-medium">Category</th>
                <th class="px-4 py-2 font-medium">Spent</th>
                <th class="px-4 py-2 font-medium">Share</th>
                <th class="px-4 py-2 font-medium">Mo. avg</th>
                <th class="px-4 py-2 font-medium">Budget left</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-brand-100">
              @for (row of categoryRows(); track row.categoryId) {
                <tr
                  class="cursor-pointer transition-colors hover:bg-brand-50/50"
                  (click)="goToCategory(row.categoryId, 'expense')"
                >
                  <td class="px-4 py-2.5 font-medium text-midnight-900">{{ row.name }}</td>
                  <td class="px-4 py-2.5 text-red-600">{{ row.spent | currency }}</td>
                  <td class="px-4 py-2.5 text-slate-500">{{ row.percentOfTotal }}%</td>
                  <td class="px-4 py-2.5 text-slate-600">
                    {{ monthlyAvgFor(row.spent) | currency }}
                  </td>
                  <td class="px-4 py-2.5">
                    @if (row.remaining != null) {
                      <span [class]="row.remaining < 0 ? 'font-medium text-red-600' : 'text-emerald-700'">
                        {{ row.remaining | currency }}
                      </span>
                    } @else {
                      <span class="text-slate-400">—</span>
                    }
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="5" class="px-4 py-6 text-center text-slate-500">
                    No category spending in this period.
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
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
  private readonly dashboardService = inject(DashboardService);

  readonly refundsOffset = signal(false);
  readonly drillCategoryId = signal<string>('');
  readonly totalsBarLabels = ['Total'];

  readonly periodForm = this.fb.group({
    period: this.fb.nonNullable.control<DateRangePreset>('last_3_months'),
    from: this.fb.control<Date | null>(null),
    to: this.fb.control<Date | null>(null),
  });

  private readonly periodValues = toSignal(this.periodForm.valueChanges, {
    initialValue: this.periodForm.getRawValue(),
  });

  private readonly categories = toSignal(this.categoryService.watchCategories(), {
    initialValue: [],
  });
  private readonly budgets = toSignal(this.budgetService.watchBudgets(), { initialValue: [] });
  private readonly accounts = toSignal(this.accountService.watchAccounts(), { initialValue: [] });
  private readonly transactions = toSignal(this.transactionService.watchAllTransactions(), {
    initialValue: [],
  });

  constructor() {
    this.periodForm.get('from')?.valueChanges.subscribe(() => this.ensureCustomPeriod());
    this.periodForm.get('to')?.valueChanges.subscribe(() => this.ensureCustomPeriod());
  }

  readonly dateRange = computed(() => {
    const f = this.periodValues();
    return resolveDateRange(f.period ?? 'last_3_months', f.from, f.to);
  });

  readonly netWorth = computed(() => computeNetWorth(this.accounts(), this.transactions()));

  readonly summary = computed(() =>
    this.dashboardService.computePeriodSummary(
      this.transactions(),
      this.dateRange(),
      this.refundsOffset()
    )
  );

  readonly incomeSeries = computed(() =>
    this.dashboardService.computeMonthlySeries(
      this.transactions(),
      this.dateRange(),
      'income',
      this.refundsOffset()
    )
  );

  readonly expenseSeries = computed(() =>
    this.dashboardService.computeMonthlySeries(
      this.transactions(),
      this.dateRange(),
      'expenses',
      this.refundsOffset()
    )
  );

  readonly savingsSeries = computed(() =>
    this.dashboardService.computeMonthlySeries(
      this.transactions(),
      this.dateRange(),
      'savings',
      this.refundsOffset()
    )
  );

  readonly totalsBarDatasets = computed(() => {
    const s = this.summary();
    return [
      { label: 'Income', data: [s.income], color: '#16a34a' },
      { label: 'Expenses', data: [s.expenses], color: '#dc2626' },
      { label: 'Savings', data: [s.savings], color: '#06b6d4' },
    ];
  });

  readonly expenseSlices = computed(() =>
    this.dashboardService.computeExpenseByCategory(
      this.transactions(),
      this.categories(),
      this.dateRange(),
      this.refundsOffset()
    )
  );

  readonly incomeSlices = computed(() =>
    this.dashboardService.computeIncomeByCategory(
      this.transactions(),
      this.categories(),
      this.dateRange()
    )
  );

  readonly expenseDonutLabels = computed(() => this.expenseSlices().map((s) => s.name));
  readonly expenseDonutData = computed(() => this.expenseSlices().map((s) => s.amount));
  readonly expenseDonutIds = computed(() => this.expenseSlices().map((s) => s.categoryId));
  readonly incomeDonutLabels = computed(() => this.incomeSlices().map((s) => s.name));
  readonly incomeDonutData = computed(() => this.incomeSlices().map((s) => s.amount));
  readonly incomeDonutIds = computed(() => this.incomeSlices().map((s) => s.categoryId));

  readonly categoryRows = computed(() =>
    buildCategorySpendRows(
      this.transactions(),
      this.categories(),
      this.budgets(),
      this.dateRange(),
      { refundsOffset: this.refundsOffset(), budgetAs: 'monthly' }
    ).filter((r) => r.spent > 0 || r.budgetAmount != null)
  );

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
    if (!id) {
      return { labels: [] as string[], values: [] as number[], average: 0, total: 0, monthKeys: [] as string[] };
    }
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

  onExpenseCategoryClick(categoryId: string): void {
    this.drillCategoryId.set(categoryId);
  }

  goToCategory(categoryId: string, kind: 'expense' | 'income'): void {
    const range = this.dateRange();
    const queryParams: Record<string, string> = {
      period: 'custom',
      kind,
    };
    if (range.start) queryParams['from'] = formatDateParam(range.start);
    if (range.end) queryParams['to'] = formatDateParam(range.end);
    queryParams['categoryId'] =
      categoryId === UNCATEGORIZED_ID ? 'uncategorized' : categoryId;
    void this.router.navigate(['/transactions'], { queryParams });
  }

  private ensureCustomPeriod(): void {
    if (this.periodForm.get('period')?.value !== 'custom') {
      this.periodForm.patchValue({ period: 'custom' }, { emitEvent: true });
    }
  }
}
