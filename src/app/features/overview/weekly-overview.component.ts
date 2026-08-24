import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { BudgetService } from '../../core/services/budget.service';
import { CategoryService } from '../../core/services/category.service';
import { ScheduledItemService } from '../../core/services/scheduled-item.service';
import { TransactionService } from '../../core/services/transaction.service';
import {
  buildCategorySpendRows,
  computePeriodTotals,
  UNCATEGORIZED_ID,
  WEEKS_PER_MONTH,
} from '../../core/utils/budget.util';
import { expandScheduledOccurrences } from '../../core/utils/calendar.util';
import { daysRemainingInWeek, resolveCurrentWeek } from '../../core/utils/date.util';
import { roundMoney } from '../../core/utils/balance.util';

@Component({
  selector: 'app-weekly-overview',
  standalone: true,
  imports: [
    CurrencyPipe,
    DatePipe,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatProgressBarModule,
  ],
  template: `
    <div class="space-y-6">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="page-header">
          <h1 class="page-title">This week</h1>
          <p class="page-subtitle">
            {{ weekRange().label }} · {{ daysLeft() }} day{{ daysLeft() === 1 ? '' : 's' }} left
          </p>
        </div>
        <a mat-stroked-button routerLink="/dashboard">Back to dashboard</a>
      </div>

      <div class="grid gap-3 sm:grid-cols-3">
        <div class="rounded-xl border border-red-100 bg-red-50 px-4 py-3">
          <p class="text-xs font-medium uppercase tracking-wide text-red-700">Spent this week</p>
          <p class="text-xl font-semibold text-red-600">{{ totals().spent | currency }}</p>
        </div>
        <div class="rounded-xl border border-brand-100 bg-brand-50 px-4 py-3">
          <p class="text-xs font-medium uppercase tracking-wide text-brand-700">Weekly budget</p>
          <p class="text-xl font-semibold text-brand-700">{{ weeklyBudgetTotal() | currency }}</p>
          <p class="mt-0.5 text-xs text-slate-500">Monthly budgets ÷ {{ weeksPerMonth }}</p>
        </div>
        <div
          class="rounded-xl border px-4 py-3"
          [class]="
            remainingBudget() < 0
              ? 'border-red-100 bg-red-50'
              : 'border-emerald-100 bg-emerald-50'
          "
        >
          <p
            class="text-xs font-medium uppercase tracking-wide"
            [class]="remainingBudget() < 0 ? 'text-red-700' : 'text-emerald-700'"
          >
            {{ remainingBudget() < 0 ? 'Over budget' : 'Remaining' }}
          </p>
          <p
            class="text-xl font-semibold"
            [class]="remainingBudget() < 0 ? 'text-red-600' : 'text-emerald-700'"
          >
            {{ abs(remainingBudget()) | currency }}
          </p>
        </div>
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        <div class="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p class="text-xs font-medium uppercase tracking-wide text-slate-500">Income this week</p>
          <p class="text-lg font-semibold text-brand-600">{{ totals().income | currency }}</p>
          @if (expectedIncome() > 0) {
            <p class="mt-0.5 text-xs text-slate-500">
              Expected scheduled: {{ expectedIncome() | currency }}
            </p>
          }
        </div>
        <div class="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p class="text-xs font-medium uppercase tracking-wide text-slate-500">Net this week</p>
          <p
            class="text-lg font-semibold"
            [class]="totals().net < 0 ? 'text-red-600' : 'text-brand-600'"
          >
            {{ totals().net | currency }}
          </p>
          @if (expectedBills() > 0) {
            <p class="mt-0.5 text-xs text-slate-500">
              Expected bills: {{ expectedBills() | currency }}
            </p>
          }
        </div>
      </div>

      @if (upcomingScheduled().length) {
        <mat-card class="app-card">
          <mat-card-header>
            <mat-card-title class="!text-midnight-900">Expected this week</mat-card-title>
            <mat-card-subtitle>
              From calendar ·
              <a routerLink="/calendar" class="text-brand-700 underline">Manage</a>
            </mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <ul class="m-0 list-none divide-y divide-brand-100 overflow-hidden rounded-xl border border-brand-100 p-0">
              @for (occ of upcomingScheduled(); track occ.id) {
                <li class="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <div class="min-w-0">
                    <p class="truncate font-medium text-midnight-900">{{ occ.title }}</p>
                    <p class="text-xs text-slate-500">{{ occ.date | date: 'EEE' }}</p>
                  </div>
                  <span
                    class="shrink-0 font-medium"
                    [class.text-emerald-600]="occ.amount > 0"
                    [class.text-red-600]="occ.amount < 0"
                  >
                    {{ occ.amount | currency }}
                  </span>
                </li>
              }
            </ul>
          </mat-card-content>
        </mat-card>
      }

      <mat-card class="app-card">
        <mat-card-header>
          <mat-card-title class="!text-midnight-900">Categories this week</mat-card-title>
          <mat-card-subtitle>
            Weekly caps from weekly budgets, or monthly ÷ {{ weeksPerMonth }}
          </mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <ul class="divide-y divide-brand-100 overflow-hidden rounded-xl border border-brand-100">
            @for (row of categoryRows(); track row.categoryId) {
              <li class="space-y-2 px-4 py-3" [class.bg-red-50]="row.remaining != null && row.remaining < 0">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <span class="font-medium text-midnight-900">{{ row.name }}</span>
                  <span class="text-sm" [class]="row.remaining != null && row.remaining < 0 ? 'font-medium text-red-600' : 'text-slate-600'">
                    @if (row.budgetAmount != null) {
                      {{ row.spent | currency }} / {{ row.budgetAmount | currency }}
                      @if (row.remaining != null && row.remaining < 0) {
                        · {{ abs(row.remaining) | currency }} over
                      }
                    } @else {
                      {{ row.spent | currency }} spent
                    }
                  </span>
                </div>
                @if (row.percentOfBudget != null) {
                  <mat-progress-bar
                    mode="determinate"
                    [value]="min(row.percentOfBudget, 100)"
                    [color]="row.percentOfBudget > 100 ? 'warn' : 'primary'"
                  />
                }
              </li>
            } @empty {
              <li class="px-4 py-6 text-center text-sm text-slate-500">
                No spending this week yet. Set budgets on the Categories page to track progress.
              </li>
            }
          </ul>
        </mat-card-content>
      </mat-card>
    </div>
  `,
})
export class WeeklyOverviewComponent {
  private readonly categoryService = inject(CategoryService);
  private readonly budgetService = inject(BudgetService);
  private readonly transactionService = inject(TransactionService);
  private readonly scheduledService = inject(ScheduledItemService);

  readonly weeksPerMonth = WEEKS_PER_MONTH;
  readonly abs = Math.abs;
  readonly min = Math.min;

  private readonly categories = toSignal(this.categoryService.watchCategories(), {
    initialValue: [],
  });
  private readonly budgets = toSignal(this.budgetService.watchBudgets(), { initialValue: [] });
  private readonly transactions = toSignal(this.transactionService.watchAllTransactions(), {
    initialValue: [],
  });
  private readonly scheduled = toSignal(this.scheduledService.watchScheduledItems(), {
    initialValue: [],
  });

  readonly weekRange = computed(() => resolveCurrentWeek());
  readonly daysLeft = computed(() => daysRemainingInWeek());

  readonly totals = computed(() =>
    computePeriodTotals(this.transactions(), [], this.weekRange(), false)
  );

  readonly upcomingScheduled = computed(() => {
    const range = this.weekRange();
    if (!range.start || !range.end) return [];
    return expandScheduledOccurrences(this.scheduled(), range.start, range.end);
  });

  readonly expectedIncome = computed(() =>
    roundMoney(
      this.upcomingScheduled()
        .filter((o) => o.kind === 'income')
        .reduce((sum, o) => sum + o.amount, 0)
    )
  );

  readonly expectedBills = computed(() =>
    roundMoney(
      this.upcomingScheduled()
        .filter((o) => o.kind === 'expense')
        .reduce((sum, o) => sum + Math.abs(o.amount), 0)
    )
  );

  readonly categoryRows = computed(() =>
    buildCategorySpendRows(
      this.transactions(),
      this.categories(),
      this.budgets(),
      this.weekRange(),
      { budgetAs: 'weekly', includeZero: true }
    ).filter((r) =>
      r.categoryId === UNCATEGORIZED_ID ? r.spent > 0 : r.spent > 0 || r.budgetAmount != null
    )
  );

  readonly weeklyBudgetTotal = computed(() =>
    roundMoney(
      this.budgets().reduce((sum, b) => {
        const weekly =
          b.period === 'weekly' ? b.amount : roundMoney(b.amount / WEEKS_PER_MONTH);
        return sum + weekly;
      }, 0)
    )
  );

  readonly remainingBudget = computed(() =>
    roundMoney(this.weeklyBudgetTotal() - this.totals().spent)
  );
}
