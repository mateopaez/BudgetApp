import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AccountService } from '../../core/services/account.service';
import { BudgetService } from '../../core/services/budget.service';
import { CategoryService } from '../../core/services/category.service';
import { DashboardService } from '../../core/services/dashboard.service';
import { ScheduledItemService } from '../../core/services/scheduled-item.service';
import { TransactionService } from '../../core/services/transaction.service';
import {
  buildCategorySpendRows,
  countUncategorizedExpenses,
  UNCATEGORIZED_ID,
} from '../../core/utils/budget.util';
import { computeAccountBalance, roundMoney } from '../../core/utils/balance.util';
import {
  endOfMonth,
  monthKey,
  startOfDay,
  startOfMonth,
} from '../../core/utils/date.util';
import {
  expandScheduledOccurrences,
  filterPostedScheduledOccurrences,
} from '../../core/utils/calendar.util';
import { planHorizonEnd } from '../../core/utils/plan.util';
import { pluralize } from '../../core/utils/format.util';
import { toLoadableSignal } from '../../core/utils/loadable-signal.util';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, RouterLink, MatButtonModule, MatIconModule],
  template: `
    <div class="page !space-y-10">
      <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div class="page-header">
          <p class="page-kicker">{{ monthLabel() }}</p>
          <h1 class="page-title">Home</h1>
          <p class="page-subtitle">A quiet read on spending, what’s due, and what needs a look.</p>
        </div>
        <a mat-flat-button color="primary" routerLink="/activity" [queryParams]="{ action: 'add' }">
          <mat-icon>add</mat-icon>
          Add transaction
        </a>
      </header>

      @if (initialLoading()) {
        <section class="empty-state animate-pulse" role="status" aria-live="polite">
          <p class="font-medium text-ink">Loading your overview…</p>
        </section>
      } @else if (loadError()) {
        <p class="status-banner status-banner--error" role="alert">{{ loadError() }}</p>
      } @else if (isNewUser()) {
        <section class="empty-state space-y-4">
          <h2 class="section-title">Start with what’s real</h2>
          <p class="mx-auto max-w-md text-sm leading-6 text-ink-muted">
            Add an account, then log a few transactions. Budgets and plans can wait until you’re ready.
          </p>
          <div class="flex flex-wrap items-center justify-center gap-2">
            <a mat-flat-button color="primary" routerLink="/accounts" [queryParams]="{ action: 'add' }">
              Add account
            </a>
            <a mat-stroked-button routerLink="/activity" [queryParams]="{ action: 'add' }">
              Add transaction
            </a>
          </div>
        </section>
      } @else {
        <!-- Spending summary -->
        <section aria-labelledby="spend-heading">
          <div class="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
            <h2 id="spend-heading" class="section-title">This month’s spending</h2>
            @if (comparisonHint(); as hint) {
              <a
                class="text-sm font-medium text-action no-underline hover:underline"
                routerLink="/insights"
              >
                {{ hint }}
              </a>
            }
          </div>

          <p class="mt-3 text-base leading-7 text-ink sm:text-lg">
            @if (totalBudgeted() > 0) {
              You’ve spent
              <span class="money font-semibold">{{ spent() | currency }}</span>
              of
              <span class="money font-semibold">{{ totalBudgeted() | currency }}</span>
              planned this month.
            } @else {
              You’ve spent
              <span class="money font-semibold">{{ spent() | currency }}</span>
              this month.
              <a class="font-medium text-action no-underline hover:underline" routerLink="/budgets">
                Set budgets
              </a>
              when you’re ready.
            }
          </p>

          @if (totalBudgeted() > 0) {
            <div class="mt-4">
              <div
                class="progress-track"
                role="progressbar"
                [attr.aria-valuenow]="spendProgressPct()"
                aria-valuemin="0"
                aria-valuemax="100"
                [attr.aria-label]="'Spending progress ' + spendProgressPct() + ' percent'"
              >
                <div
                  class="progress-fill"
                  [class.progress-fill--warn]="spendProgressPct() >= 80 && spendProgressPct() < 100"
                  [class.progress-fill--over]="spendProgressPct() >= 100"
                  [style.width.%]="Math.min(100, spendProgressPct())"
                ></div>
              </div>
              <p class="mt-2 text-sm text-ink-muted">
                @if (budgetRemaining() >= 0) {
                  <span class="money">{{ budgetRemaining() | currency }}</span> remaining of your
                  planned spending
                } @else {
                  <span class="money">{{ Math.abs(budgetRemaining()) | currency }}</span> over planned
                  spending
                }
              </p>
            </div>
          }

          <div class="mt-6 flex flex-wrap gap-x-8 gap-y-2 border-t border-line pt-4 text-sm">
            <div>
              <p class="kicker">Cash</p>
              <p class="money mt-1 font-semibold text-ink">{{ cashBalance() | currency }}</p>
            </div>
            <div>
              <p class="kicker">Credit owed</p>
              <p class="money mt-1 font-semibold text-ink">
                {{ creditOwed() | currency }}
              </p>
            </div>
            <div>
              <p class="kicker">Income this month</p>
              <p class="money mt-1 font-semibold text-finance-income">
                {{ income() | currency }}
              </p>
            </div>
          </div>
        </section>

        <!-- Needs attention -->
        @if (attentionItems().length) {
          <section aria-labelledby="attention-heading">
            <h2 id="attention-heading" class="section-title">Needs attention</h2>
            <ul class="list-shell mt-4 list-none p-0">
              @for (item of attentionItems(); track item.id) {
                <li>
                  <a
                    class="list-row flex items-start justify-between gap-3 no-underline transition-colors hover:bg-surface-muted70"
                    [routerLink]="item.route"
                    [queryParams]="item.queryParams"
                  >
                    <div>
                      <p class="font-medium text-ink">{{ item.title }}</p>
                      <p class="mt-0.5 text-sm text-ink-muted">{{ item.body }}</p>
                    </div>
                    <mat-icon class="!text-ink-soft">chevron_right</mat-icon>
                  </a>
                </li>
              }
            </ul>
          </section>
        }

        <!-- Coming up -->
        <section aria-labelledby="coming-heading">
          <div class="flex items-baseline justify-between gap-3">
            <h2 id="coming-heading" class="section-title">Coming up</h2>
            <a class="text-sm font-medium text-action no-underline hover:underline" routerLink="/plan">
              View plan
            </a>
          </div>
          @if (comingUp().length) {
            <ul class="mt-4 list-none space-y-0 border-t border-line p-0">
              @for (item of comingUp(); track item.id) {
                <li class="flex items-center justify-between gap-3 border-b border-line py-3">
                  <div class="min-w-0">
                    <p class="truncate font-medium text-ink">{{ item.title }}</p>
                    <p class="mt-0.5 text-sm text-ink-muted">
                      {{ item.date | date: 'EEE, MMM d' }}
                      ·
                      {{ item.kind === 'income' ? 'Paycheck' : 'Bill' }}
                    </p>
                  </div>
                  <p
                    class="money shrink-0 font-semibold"
                    [class.text-finance-income]="item.kind === 'income'"
                  >
                    {{ item.amount | currency }}
                  </p>
                </li>
              }
            </ul>
          } @else {
            <div class="empty-state mt-4 !py-8">
              <p class="text-sm text-ink-muted">No bills or paychecks on the horizon.</p>
              <a
                mat-stroked-button
                class="mt-3"
                routerLink="/plan"
                [queryParams]="{ action: 'add' }"
              >
                Add upcoming item
              </a>
            </div>
          }
        </section>

        <!-- Budget snapshot -->
        @if (budgetSnapshot().length) {
          <section aria-labelledby="budget-snap-heading">
            <div class="flex items-baseline justify-between gap-3">
              <h2 id="budget-snap-heading" class="section-title">Budgets to watch</h2>
              <a
                class="text-sm font-medium text-action no-underline hover:underline"
                routerLink="/budgets"
              >
                All budgets
              </a>
            </div>
            <ul class="mt-4 list-none space-y-4 p-0">
              @for (row of budgetSnapshot(); track row.categoryId) {
                <li>
                  <div class="flex items-baseline justify-between gap-3 text-sm">
                    <span class="font-medium text-ink">{{ row.name }}</span>
                    <span class="money text-ink-muted">
                      {{ row.spent | currency }}
                      @if (row.budgetAmount != null) {
                        <span> of {{ row.budgetAmount | currency }}</span>
                      }
                    </span>
                  </div>
                  @if (row.budgetAmount != null && row.budgetAmount > 0) {
                    <div class="progress-track mt-2">
                      <div
                        class="progress-fill"
                        [class.progress-fill--warn]="
                          (row.percentOfBudget ?? 0) >= 80 && (row.percentOfBudget ?? 0) < 100
                        "
                        [class.progress-fill--over]="(row.percentOfBudget ?? 0) >= 100"
                        [style.width.%]="Math.min(100, row.percentOfBudget ?? 0)"
                      ></div>
                    </div>
                    <p class="mt-1 text-xs text-ink-muted">
                      @if ((row.remaining ?? 0) >= 0) {
                        {{ row.remaining | currency }} left
                      } @else {
                        {{ Math.abs(row.remaining ?? 0) | currency }} over
                      }
                    </p>
                  }
                </li>
              }
            </ul>
          </section>
        }

        <!-- Recent activity -->
        <section aria-labelledby="recent-heading">
          <div class="flex items-baseline justify-between gap-3">
            <h2 id="recent-heading" class="section-title">Recent activity</h2>
            <a
              class="text-sm font-medium text-action no-underline hover:underline"
              routerLink="/activity"
            >
              View all
            </a>
          </div>
          @if (recentActivity().length) {
            <ul class="mt-4 list-none border-t border-line p-0">
              @for (tx of recentActivity(); track tx.id) {
                <li class="flex items-center justify-between gap-3 border-b border-line py-3">
                  <div class="min-w-0">
                    <p class="truncate font-medium text-ink">{{ tx.merchant }}</p>
                    <p class="mt-0.5 text-sm text-ink-muted">
                      {{ tx.postedAt | date: 'MMM d' }}
                      ·
                      {{ accountName(tx.accountId) }}
                      ·
                      {{ categoryName(tx) }}
                    </p>
                  </div>
                  <p
                    class="money shrink-0 font-semibold"
                    [class.tx-amount--in]="tx.amount > 0"
                    [class.tx-amount--out]="tx.amount <= 0"
                  >
                    {{ tx.amount | currency }}
                  </p>
                </li>
              }
            </ul>
          } @else {
            <div class="empty-state mt-4 !py-8">
              <p class="text-sm text-ink-muted">No transactions this month yet.</p>
              <a
                mat-flat-button
                color="primary"
                class="mt-3"
                routerLink="/activity"
                [queryParams]="{ action: 'add' }"
              >
                Add transaction
              </a>
            </div>
          }
        </section>

        <div class="flex flex-wrap gap-3 border-t border-line pt-6">
          @if (uncategorizedCount() > 0) {
            <a mat-stroked-button routerLink="/activity" [queryParams]="{ review: '1' }">
              Review {{ uncategorizedCount() }}
            </a>
          }
          @if (totalBudgeted() <= 0) {
            <a mat-stroked-button routerLink="/budgets">Set budgets</a>
          } @else {
            <a mat-stroked-button routerLink="/budgets">Edit budgets</a>
          }
        </div>
      }
    </div>
  `,
})
export class HomeComponent {
  private readonly accounts = inject(AccountService);
  private readonly categories = inject(CategoryService);
  private readonly budgets = inject(BudgetService);
  private readonly transactions = inject(TransactionService);
  private readonly scheduled = inject(ScheduledItemService);
  private readonly dashboard = inject(DashboardService);

  readonly Math = Math;

  private readonly now = new Date();
  private readonly year = this.now.getFullYear();
  private readonly month = this.now.getMonth() + 1;

  private readonly accountsLoad = toLoadableSignal(this.accounts.watchAccounts(), []);
  private readonly categoriesLoad = toLoadableSignal(this.categories.watchCategories(), []);
  private readonly budgetsLoad = toLoadableSignal(this.budgets.watchBudgets(), []);
  private readonly txLoad = toLoadableSignal(
    this.transactions.watchTransactions({ year: this.year, month: this.month }),
    []
  );
  private readonly allTxLoad = toLoadableSignal(this.transactions.watchAllTransactions(), []);
  private readonly scheduledLoad = toLoadableSignal(this.scheduled.watchScheduledItems(), []);

  readonly accountsList = computed(() => this.accountsLoad.value());
  readonly categoriesList = computed(() => this.categoriesLoad.value());
  readonly budgetsList = computed(() => this.budgetsLoad.value());
  readonly monthTx = computed(() => this.txLoad.value());
  readonly allTx = computed(() => this.allTxLoad.value());

  readonly initialLoading = computed(
    () =>
      this.accountsLoad.loading() ||
      this.categoriesLoad.loading() ||
      this.budgetsLoad.loading() ||
      this.txLoad.loading() ||
      this.scheduledLoad.loading()
  );

  readonly loadError = computed(
    () =>
      this.accountsLoad.error() ||
      this.categoriesLoad.error() ||
      this.budgetsLoad.error() ||
      this.txLoad.error() ||
      this.scheduledLoad.error()
  );

  readonly monthRange = computed(() => {
    const start = startOfMonth(this.year, this.month);
    const end = endOfMonth(this.year, this.month);
    return { start, end, label: start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) };
  });

  readonly monthLabel = computed(() => this.monthRange().label);

  readonly isNewUser = computed(
    () => this.accountsList().length === 0 && this.allTx().length === 0
  );

  private readonly periodSummary = computed(() =>
    this.dashboard.computePeriodSummary(this.monthTx(), this.monthRange())
  );

  readonly spent = computed(() => this.periodSummary().expenses);
  readonly income = computed(() => this.periodSummary().income);

  readonly spendRows = computed(() =>
    buildCategorySpendRows(
      this.monthTx(),
      this.categoriesList(),
      this.budgetsList(),
      this.monthRange(),
      { budgetAs: 'monthly', includeZero: false }
    )
  );

  readonly totalBudgeted = computed(() =>
    roundMoney(
      this.budgetsList()
        .filter((b) => b.period === 'monthly' || b.period === 'weekly')
        .reduce((sum, b) => {
          const monthly = b.period === 'weekly' ? b.amount * 4.33 : b.amount;
          return sum + monthly;
        }, 0)
    )
  );

  readonly budgetRemaining = computed(() => roundMoney(this.totalBudgeted() - this.spent()));

  readonly spendProgressPct = computed(() => {
    const planned = this.totalBudgeted();
    if (planned <= 0) return 0;
    return Math.round((this.spent() / planned) * 100);
  });

  readonly cashBalance = computed(() =>
    roundMoney(
      this.accountsList()
        .filter((a) => a.type === 'checking' || a.type === 'savings')
        .reduce((sum, a) => sum + computeAccountBalance(a, this.allTx()), 0)
    )
  );

  readonly creditOwed = computed(() => {
    const bal = roundMoney(
      this.accountsList()
        .filter((a) => a.type === 'credit_card')
        .reduce((sum, a) => sum + computeAccountBalance(a, this.allTx()), 0)
    );
    // Display as positive "owed" amount when balance is negative liability.
    return Math.abs(Math.min(0, bal));
  });

  readonly uncategorizedCount = computed(() =>
    countUncategorizedExpenses(this.monthTx(), this.monthRange())
  );

  readonly attentionItems = computed(() => {
    const items: Array<{
      id: string;
      title: string;
      body: string;
      route: string;
      queryParams?: Record<string, string>;
    }> = [];

    const unc = this.uncategorizedCount();
    if (unc > 0) {
      items.push({
        id: 'uncategorized',
        title: `Review ${unc} ${pluralize(unc, 'transaction')}`,
        body: 'Uncategorized spending is waiting for a category.',
        route: '/activity',
        queryParams: { review: '1' },
      });
    }

    for (const row of this.spendRows()) {
      if (row.categoryId === UNCATEGORIZED_ID) continue;
      if (row.percentOfBudget != null && row.percentOfBudget >= 90) {
        const over = (row.remaining ?? 0) < 0;
        items.push({
          id: `budget-${row.categoryId}`,
          title: over ? `${row.name} is over budget` : `${row.name} is nearly spent`,
          body: over
            ? `${Math.abs(row.remaining ?? 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' })} over the monthly target.`
            : `${row.remaining?.toLocaleString(undefined, { style: 'currency', currency: 'USD' })} left of ${row.budgetAmount?.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}.`,
          route: '/budgets',
        });
      }
    }

    return items.slice(0, 5);
  });

  readonly budgetSnapshot = computed(() =>
    this.spendRows()
      .filter(
        (r) =>
          r.categoryId !== UNCATEGORIZED_ID &&
          r.budgetAmount != null &&
          (r.percentOfBudget ?? 0) >= 70
      )
      .slice(0, 4)
  );

  readonly comingUp = computed(() => {
    const now = startOfDay(this.now);
    const end = planHorizonEnd(this.now, 1);
    const scheduled = expandScheduledOccurrences(this.scheduledLoad.value(), now, end);
    const pending = filterPostedScheduledOccurrences(scheduled, this.allTx());
    return pending.slice(0, 5);
  });

  readonly recentActivity = computed(() =>
    [...this.monthTx()]
      .sort((a, b) => b.postedAt.getTime() - a.postedAt.getTime())
      .slice(0, 6)
  );

  readonly comparisonHint = computed(() => {
    const all = this.allTx();
    if (!all.length) return null;

    const prev = new Date(this.year, this.month - 2, 1);
    const prevStart = startOfMonth(prev.getFullYear(), prev.getMonth() + 1);
    const prevEnd = endOfMonth(prev.getFullYear(), prev.getMonth() + 1);
    const prevSummary = this.dashboard.computePeriodSummary(all, {
      start: prevStart,
      end: prevEnd,
      label: monthKey(prev),
    });

    if (prevSummary.expenses <= 0 && this.spent() <= 0) return null;

    const delta = roundMoney(this.spent() - prevSummary.expenses);
    const prevLabel = prev.toLocaleDateString(undefined, { month: 'long' });

    if (Math.abs(delta) < 1) {
      return `Spending is about the same as ${prevLabel} — View comparison`;
    }
    if (delta < 0) {
      return `Spending is ${Math.abs(delta).toLocaleString(undefined, { style: 'currency', currency: 'USD' })} lower than ${prevLabel} — View comparison`;
    }
    return `Spending is ${delta.toLocaleString(undefined, { style: 'currency', currency: 'USD' })} higher than ${prevLabel} — View comparison`;
  });

  accountName(id: string): string {
    return this.accountsList().find((a) => a.id === id)?.name ?? 'Account';
  }

  categoryName(tx: { categoryId: string | null; split?: { length: number }; kind: string }): string {
    if (tx.kind === 'transfer') return 'Transfer';
    if (tx.kind === 'cc_payment') return 'Card payment';
    if (tx.split?.length) return 'Split';
    if (!tx.categoryId) return 'Uncategorized';
    return this.categoriesList().find((c) => c.id === tx.categoryId)?.name ?? 'Category';
  }
}
