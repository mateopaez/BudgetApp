import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import {
  CalendarEvent,
  MatCalendarComponent,
} from 'ngx-m3-calendar';
import { startWith } from 'rxjs/operators';
import { ScheduledItem, ScheduledItemInput, ScheduleType } from '../../core/models';
import { AccountService } from '../../core/services/account.service';
import { BudgetService } from '../../core/services/budget.service';
import { CategoryService } from '../../core/services/category.service';
import { ScheduledItemService } from '../../core/services/scheduled-item.service';
import { OnboardingService } from '../../core/services/onboarding.service';
import { TransactionService } from '../../core/services/transaction.service';
import { signedAmountForKind } from '../../core/utils/amount.util';
import { roundMoney } from '../../core/utils/balance.util';
import { computeNetWorth } from '../../core/utils/balance-history.util';
import { computePeriodTotals, WEEKS_PER_MONTH } from '../../core/utils/budget.util';
import {
  CalendarOccurrence,
  dayKey,
  dayNet,
  expandScheduledOccurrences,
  filterPostedScheduledOccurrences,
  resolveScheduledPostingDate,
  transactionsAsOccurrences,
  weekDays,
} from '../../core/utils/calendar.util';
import { endOfDay, formatDateParam, resolveCurrentWeek, startOfDay } from '../../core/utils/date.util';
import { clearOneShotQueryParams } from '../../core/utils/one-shot-query.util';
import { toLoadableSignal } from '../../core/utils/loadable-signal.util';
import { confirmDialog } from '../../shared/confirm-dialog/confirm-dialog.component';
import { ModalSheetComponent } from '../../shared/modal-sheet/modal-sheet.component';

interface DaySummaryData {
  type: 'day-summary';
  dateKey: string;
  count: number;
}

type CalendarView = 'month' | 'week';

/** Max items shown per day in the week grid before “+ N more”. */
const WEEK_DAY_VISIBLE_CAP = 5;

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    CurrencyPipe,
    DatePipe,
    RouterLink,
    MatCalendarComponent,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatCheckboxModule,
    MatSnackBarModule,
    ModalSheetComponent,
  ],
  template: `
    <div class="calendar-page flex flex-col gap-6">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div class="page-header">
          <h1 class="page-title">Plan</h1>
          <p class="page-subtitle">
            Bills, paychecks, and transactions · net worth
            {{ netWorth() | currency }}
          </p>
        </div>
        <button mat-flat-button color="primary" type="button" class="!hidden sm:!inline-flex" (click)="startNewItem()" [disabled]="scheduleSheetOpen() || initialLoading()">
          <mat-icon>add</mat-icon>
          Add bill or paycheck
        </button>
      </div>

      @if (initialLoading()) {
        <section class="panel animate-pulse p-6" role="status" aria-live="polite">
          <p class="font-semibold text-ink">Loading your plan…</p>
          <p class="mt-1 text-sm text-ink-muted">Waiting for schedules, accounts, and posted activity.</p>
        </section>
      }
      @if (loadError()) {
        <p class="rounded-2xl border border-finance-expenseA20 bg-finance-expenseSoft p-4 text-sm text-finance-expense" role="alert">{{ loadError() }}</p>
      }
      <div class="contents" [class.hidden]="initialLoading()">
      <section class="panel">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div class="p-4">
            <p class="kicker">This week</p>
            <h2 class="mt-1 text-xl font-semibold tracking-[-0.02em] text-ink">
              {{ weekSummaryTitle() }}
            </h2>
            <p class="mt-1 text-sm text-ink-muted">{{ weekSummaryDetail() }}</p>
          </div>

          @if (nextUpcoming()) {
            <div class="rounded-2xl border border-line bg-surface px-4 py-3 lg:min-w-72">
              <p class="text-xs font-semibold uppercase tracking-wide text-ink-muted">Next scheduled</p>
              <div class="mt-2 flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="truncate font-semibold text-ink">{{ nextUpcoming()!.title }}</p>
                  <p class="text-sm text-ink-muted">{{ nextUpcoming()!.date | date: 'EEE, MMM d' }}</p>
                </div>
                <p
                  class="money shrink-0 font-semibold"
                  [class.text-finance-income]="nextUpcoming()!.amount > 0"
                  [class.text-finance-expense]="nextUpcoming()!.amount < 0"
                >
                  {{ nextUpcoming()!.amount | currency }}
                </p>
              </div>
            </div>
          }
        </div>

        <div class="mt-4 grid grid-cols-2 gap-2 sm:mt-5 sm:gap-3 lg:grid-cols-4">
          <div class="metric !p-3 sm:!p-4">
            <p class="kicker">Upcoming bills</p>
            <p class="money mt-1 text-2xl font-semibold text-finance-expense">
              {{ upcomingBillsTotal() | currency }}
            </p>
            <p class="mt-1 text-xs text-ink-muted">Next 7 days</p>
          </div>
          <div class="metric !p-3 sm:!p-4">
            <p class="kicker">Upcoming income</p>
            <p class="money mt-1 text-2xl font-semibold text-finance-income">
              {{ upcomingIncomeTotal() | currency }}
            </p>
            <p class="mt-1 text-xs text-ink-muted">Next 7 days</p>
          </div>
          <div
            class="metric !p-3 sm:!p-4"
            [class.bg-finance-expenseSoft]="upcomingNet() < 0"
            [class.border-finance-expenseSoft]="upcomingNet() < 0"
            [class.bg-finance-incomeSoft]="upcomingNet() >= 0"
            [class.border-finance-incomeSoft]="upcomingNet() >= 0"
          >
            <p class="kicker">Scheduled net</p>
            <p
              class="money mt-1 text-2xl font-semibold"
              [class.text-finance-expense]="upcomingNet() < 0"
              [class.text-finance-income]="upcomingNet() >= 0"
            >
              {{ upcomingNet() | currency }}
            </p>
            <p class="mt-1 text-xs text-ink-muted">Bills minus income due soon</p>
          </div>
          <div class="metric !p-3 sm:!p-4">
            <p class="kicker">Active schedules</p>
            <p class="mt-1 text-2xl font-semibold text-ink">{{ activeScheduledCount() }}</p>
            <p class="mt-1 text-xs text-ink-muted">Bills and paychecks being tracked</p>
          </div>
        </div>
      </section>

      <div class="app-card overflow-hidden p-3 sm:p-4">
        <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <div
              class="inline-flex overflow-hidden rounded-lg border border-line bg-surface shadow-panel"
              role="group"
              aria-label="Plan view"
            >
              <button
                type="button"
                class="min-h-11 px-4 py-2 text-sm font-semibold transition-colors"
                [class.bg-action]="viewMode() === 'month'"
                [class.text-surface]="viewMode() === 'month'"
                [class.bg-surface]="viewMode() !== 'month'"
                [class.text-ink-muted]="viewMode() !== 'month'"
                (click)="setView('month')"
              >
                Month
              </button>
              <button
                type="button"
                class="min-h-11 border-l border-line px-4 py-2 text-sm font-semibold transition-colors"
                [class.bg-action]="viewMode() === 'week'"
                [class.text-surface]="viewMode() === 'week'"
                [class.bg-surface]="viewMode() !== 'week'"
                [class.text-ink-muted]="viewMode() !== 'week'"
                (click)="setView('week')"
              >
                Week
              </button>
            </div>
            <div class="grid grid-cols-[44px_1fr_44px] items-center gap-2 sm:flex">
              <button mat-icon-button type="button" (click)="shiftPeriod(-1)" aria-label="Previous">
                <mat-icon>chevron_left</mat-icon>
              </button>
              <button mat-stroked-button type="button" (click)="goToday()">Today</button>
              <button mat-icon-button type="button" (click)="shiftPeriod(1)" aria-label="Next">
                <mat-icon>chevron_right</mat-icon>
              </button>
            </div>
          </div>
          <p class="text-sm font-semibold text-ink">{{ periodLabel() }}</p>
        </div>

        @if (viewMode() === 'month') {
          <mc-calendar
            class="calendar-month-only"
            [events]="calendarEvents()"
            [selectedDate]="selectedDate()"
            [viewMode]="'month'"
            [showViewToggle]="false"
            [weekStartsOn]="1"
            (dateSelected)="onDateSelected($event)"
            (eventClicked)="onEventClicked($event)"
          />
        } @else {
          <div class="mb-4 grid grid-cols-3 gap-2 sm:gap-3">
            <div class="rounded-xl border border-finance-expenseSoft bg-finance-expenseSoft px-2 py-3 sm:px-4">
              <p class="text-xs font-medium uppercase tracking-wide text-finance-expense">Spent this week</p>
              <p class="money text-sm font-semibold text-finance-expense sm:text-xl">{{ weekTotals().spent | currency }}</p>
            </div>
            <div class="rounded-xl border border-line bg-action-soft px-2 py-3 sm:px-4">
              <p class="text-xs font-medium uppercase tracking-wide text-action">Weekly budget</p>
              <p class="money text-sm font-semibold text-action sm:text-xl">{{ weeklyBudgetTotal() | currency }}</p>
              <p class="mt-0.5 hidden text-xs text-ink-muted sm:block">Monthly budgets ÷ {{ weeksPerMonth }}</p>
            </div>
            <div
              class="rounded-xl border px-2 py-3 sm:px-4"
              [class]="
                remainingBudget() < 0
                  ? 'border-finance-expenseSoft bg-finance-expenseSoft'
                  : 'border-finance-incomeSoft bg-finance-incomeSoft'
              "
            >
              <p
                class="text-xs font-medium uppercase tracking-wide"
                [class]="remainingBudget() < 0 ? 'text-finance-expense' : 'text-finance-income'"
              >
                {{ remainingBudget() < 0 ? 'Over budget' : 'Remaining' }}
              </p>
              <p
                class="money text-sm font-semibold sm:text-xl"
                [class]="remainingBudget() < 0 ? 'text-finance-expense' : 'text-finance-income'"
              >
                {{ abs(remainingBudget()) | currency }}
              </p>
            </div>
          </div>

          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            @for (day of weekCells(); track dayKey(day)) {
              <div
                class="flex max-h-80 min-h-[12rem] flex-col rounded-xl border border-line bg-surface p-3 shadow-panel transition-shadow"
                [class]="weekDayColumnClass(day)"
              >
                <button
                  type="button"
                  class="mb-2 min-h-11 w-full text-left"
                  (click)="selectDay(day)"
                >
                  <p class="text-xs font-medium uppercase tracking-wide text-ink-muted">
                    {{ day | date: 'EEE' }}
                  </p>
                  <div class="flex items-baseline justify-between gap-2">
                    <p class="text-lg font-semibold text-ink">{{ day | date: 'd' }}</p>
                    <p
                      class="text-xs font-semibold"
                      [class.text-finance-income]="dayNetFor(day) > 0"
                      [class.text-finance-expense]="dayNetFor(day) < 0"
                      [class.text-ink-soft]="dayNetFor(day) === 0"
                    >
                      {{ dayNetFor(day) | currency }}
                    </p>
                  </div>
                </button>

                <ul class="m-0 min-h-0 flex-1 list-none space-y-1.5 overflow-y-auto p-0">
                  @for (occ of visibleWeekItems(day); track occ.id) {
                    <li
                      class="rounded-md px-2 py-1.5 text-xs leading-snug"
                      [class]="occChipClass(occ)"
                    >
                      <p class="truncate font-medium">{{ occ.title }}</p>
                      <p class="font-semibold">{{ occ.amount | currency }}</p>
                    </li>
                  } @empty {
                    <li class="py-4 text-center text-xs text-ink-soft">No activity</li>
                  }
                </ul>

                @if (weekOverflowCount(day) > 0) {
                  <button
                    type="button"
                    class="mt-2 min-h-11 w-full rounded-md py-1.5 text-xs font-medium text-action hover:bg-action-soft"
                    (click)="selectDay(day)"
                  >
                    + {{ weekOverflowCount(day) }} more
                  </button>
                }
              </div>
            }
          </div>
        }
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <mat-card class="app-card">
          <mat-card-header>
            <mat-card-title class="!text-ink">
              {{ selectedDate() | date: 'fullDate' }}
            </mat-card-title>
            <mat-card-subtitle>
              {{ selectedDayOccurrences().length }} item{{
                selectedDayOccurrences().length === 1 ? '' : 's'
              }}
              · net {{ dayNetFor(selectedDate()) | currency }}
            </mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <ul
              class="m-0 list-none divide-y divide-line overflow-hidden rounded-xl border border-line p-0"
            >
              @for (occ of selectedDayOccurrences(); track occ.id) {
                <li class="flex items-center justify-between gap-3 px-4 py-3">
                  <div class="min-w-0">
                    <p class="truncate font-medium text-ink">{{ occ.title }}</p>
                    <p class="text-xs text-ink-muted">
                      {{ occ.kind }} ·
                      {{ occ.source === 'scheduled' ? 'Scheduled — not posted yet' : 'Posted transaction' }}
                    </p>
                  </div>
                  <span
                    class="shrink-0 font-semibold"
                    [class.text-finance-income]="occ.amount > 0"
                    [class.text-finance-expense]="occ.amount < 0"
                  >
                    {{ occ.amount | currency }}
                  </span>
                </li>
              } @empty {
                <li class="px-4 py-6 text-center text-sm text-ink-muted">
                  Nothing planned or posted for this day.
                </li>
              }
            </ul>

            @if (selectedDayOccurrences().length) {
              <a
                mat-stroked-button
                class="mt-3"
                [routerLink]="['/transactions']"
                [queryParams]="transactionsLinkParams()"
              >
                Open in Transactions
              </a>
            }

            <div class="mt-4">
              <p class="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
                Upcoming 7 days (scheduled)
              </p>
              <ul class="m-0 list-none space-y-2 p-0">
                @for (occ of upcoming(); track occ.id) {
                  <li class="flex items-start justify-between gap-2 text-sm">
                    <div class="min-w-0">
                      <p class="truncate font-medium text-ink">{{ occ.title }}</p>
                      <p class="text-xs text-ink-muted">{{ occ.date | date: 'EEE, MMM d' }}</p>
                    </div>
                    <span
                      class="shrink-0 font-medium"
                      [class.text-finance-income]="occ.amount > 0"
                      [class.text-finance-expense]="occ.amount < 0"
                    >
                      {{ occ.amount | currency }}
                    </span>
                  </li>
                } @empty {
                  <li class="rounded-xl border border-line bg-surface px-3 py-3 text-sm text-ink-muted">
                    Nothing scheduled in the next 7 days. Add bills, subscriptions, or income to plan ahead.
                  </li>
                }
              </ul>
            </div>
          </mat-card-content>
        </mat-card>

        <section class="space-y-3">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h2 class="text-base font-semibold text-ink">Scheduled bills & paychecks</h2>
              <p class="text-sm text-ink-muted">{{ activeScheduledCount() }} active · {{ scheduled().length }} total</p>
            </div>
            @if (!scheduleSheetOpen()) {
              <button mat-flat-button color="primary" type="button" (click)="startNewItem()">
                <mat-icon>add</mat-icon>
                Add item
              </button>
            }
          </div>

          <mat-card class="app-card">
            <mat-card-content>
              <p class="mb-3 rounded-xl border border-line bg-action-soft40 px-3 py-2 text-sm text-ink-muted">
                Saving an active schedule posts its next occurrence to Activity with the due date.
                A posted (fulfilled) occurrence replaces the planned one so it is not counted twice.
                Deleting the schedule does not remove transactions already posted.
              </p>
          <ul
            class="m-0 list-none divide-y divide-line overflow-hidden rounded-xl border border-line p-0"
          >
            @for (item of scheduled(); track item.id) {
              <li class="flex items-center gap-2 px-3 py-2.5">
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-medium text-ink">
                    {{ item.title }}
                    @if (!item.isActive) {
                      <span class="ml-1 text-xs text-ink-soft">(paused)</span>
                    }
                  </p>
                  <p class="text-xs text-ink-muted">
                    {{ item.kind }} · {{ scheduleLabel(item) }} · {{ item.amount | currency }}
                  </p>
                </div>
                <button mat-icon-button type="button" (click)="startEdit(item)" [attr.aria-label]="'Edit ' + item.title">
                  <mat-icon>edit</mat-icon>
                </button>
                <button
                  mat-icon-button
                  color="warn"
                  type="button"
                  (click)="removeItem(item)"
                  [attr.aria-label]="'Delete ' + item.title"
                >
                  <mat-icon>delete</mat-icon>
                </button>
              </li>
            } @empty {
              <li class="px-4 py-5 text-center text-sm text-ink-muted">
                No scheduled items yet. Add rent, paychecks, subscriptions, or one-time bills to plan ahead.
              </li>
            }
          </ul>
            </mat-card-content>
          </mat-card>
        </section>
      </div>
      </div>
    </div>

    @if (scheduleSheetOpen()) {
      <app-modal-sheet
        [title]="editingId() ? 'Edit scheduled item' : 'Add bill / paycheck'"
        subtitle="Saving an active item posts its next occurrence to Activity. Posted (fulfilled) occurrences remain there even if this schedule is later deleted."
        [ariaLabel]="editingId() ? 'Edit scheduled item' : 'Add bill or paycheck'"
        (closed)="cancelEdit()"
      >
        <form id="schedule-form" class="space-y-5" [formGroup]="form" (ngSubmit)="saveItem()">
          <section class="space-y-3">
            <p class="kicker">What and how much</p>
            <mat-form-field appearance="outline">
              <mat-label>Title</mat-label>
              <input matInput formControlName="title" autocomplete="off" />
            </mat-form-field>
            <div class="grid gap-3 sm:grid-cols-[1fr_1.1fr]">
              <mat-form-field appearance="outline">
                <mat-label>Amount</mat-label>
                <input matInput type="number" step="0.01" min="0.01" formControlName="amount" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Kind</mat-label>
                <mat-select formControlName="kind" panelClass="calendar-select-panel">
                  <mat-option value="expense">Bill / expense</mat-option>
                  <mat-option value="income">Income</mat-option>
                </mat-select>
              </mat-form-field>
            </div>
          </section>

          <section class="rounded-2xl border border-line bg-action-soft40 p-4">
            <p class="kicker">Schedule</p>
            <div class="mt-3 space-y-3">
              <mat-form-field appearance="outline">
                <mat-label>Schedule</mat-label>
                <mat-select formControlName="scheduleType" panelClass="calendar-select-panel">
                  <mat-option value="monthly">Monthly on a day</mat-option>
                  <mat-option value="weekly">Weekly on a day</mat-option>
                  <mat-option value="fixed">One-time date</mat-option>
                </mat-select>
              </mat-form-field>

              @if (scheduleType() === 'monthly') {
                <mat-form-field appearance="outline">
                  <mat-label>Day of month</mat-label>
                  <input matInput type="number" min="1" max="31" formControlName="dayOfMonth" />
                </mat-form-field>
              }
              @if (scheduleType() === 'weekly') {
                <mat-form-field appearance="outline">
                  <mat-label>Weekday</mat-label>
                  <mat-select formControlName="dayOfWeek" panelClass="calendar-select-panel">
                    <mat-option [value]="1">Monday</mat-option>
                    <mat-option [value]="2">Tuesday</mat-option>
                    <mat-option [value]="3">Wednesday</mat-option>
                    <mat-option [value]="4">Thursday</mat-option>
                    <mat-option [value]="5">Friday</mat-option>
                    <mat-option [value]="6">Saturday</mat-option>
                    <mat-option [value]="0">Sunday</mat-option>
                  </mat-select>
                </mat-form-field>
              }
              @if (scheduleType() === 'fixed') {
                <mat-form-field appearance="outline">
                  <mat-label>Date</mat-label>
                  <input matInput type="date" formControlName="fixedDate" />
                </mat-form-field>
              }

              <mat-form-field appearance="outline">
                <mat-label>Starts</mat-label>
                <input matInput type="date" formControlName="startDate" />
              </mat-form-field>
            </div>
          </section>

          <section class="space-y-3">
            <p class="kicker">Account and category</p>
            <mat-form-field appearance="outline">
              <mat-label>Account</mat-label>
              <mat-select formControlName="accountId" panelClass="calendar-select-panel">
                @for (a of accounts(); track a.id) {
                  <mat-option [value]="a.id">{{ a.name }}</mat-option>
                }
              </mat-select>
              <mat-hint>Required — posts a transaction that updates balances</mat-hint>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Category (optional)</mat-label>
              <mat-select formControlName="categoryId" panelClass="calendar-select-panel">
                <mat-option value="">—</mat-option>
                @for (c of userCategories(); track c.id) {
                  <mat-option [value]="c.id">{{ c.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <mat-checkbox formControlName="isActive">Active</mat-checkbox>
          </section>
        </form>

        <button modalActions mat-button type="button" (click)="cancelEdit()">Cancel</button>
        <button
          modalActions
          mat-flat-button
          color="primary"
          type="submit"
          form="schedule-form"
          [disabled]="form.invalid || saving()"
        >
          {{ saving() ? 'Saving…' : editingId() ? 'Save changes' : 'Add item' }}
        </button>
      </app-modal-sheet>
    }
  `,
  styles: `
    /* Month grid only — we provide our own header and week list view. */
    :host ::ng-deep .calendar-month-only .calendar__header {
      display: none;
    }
  `,
})
export class CalendarComponent {
  private readonly fb = inject(FormBuilder);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly scheduledService = inject(ScheduledItemService);
  private readonly onboarding = inject(OnboardingService);
  private readonly transactionService = inject(TransactionService);
  private readonly accountService = inject(AccountService);
  private readonly categoryService = inject(CategoryService);
  private readonly budgetService = inject(BudgetService);

  readonly selectedDate = signal(startOfDay(new Date()));
  readonly viewMode = signal<CalendarView>('month');
  readonly editingId = signal<string | null>(null);
  readonly showScheduleForm = signal(false);
  readonly scheduleSheetOpen = computed(() => this.showScheduleForm() || !!this.editingId());
  readonly saving = signal(false);

  readonly dayKey = dayKey;
  readonly weeksPerMonth = WEEKS_PER_MONTH;
  readonly abs = Math.abs;

  private readonly accountState = toLoadableSignal(this.accountService.watchAccounts(), []);
  private readonly categoryState = toLoadableSignal(this.categoryService.watchCategories(), []);
  private readonly scheduledState = toLoadableSignal(
    this.scheduledService.watchScheduledItems(),
    []
  );
  private readonly budgetState = toLoadableSignal(this.budgetService.watchBudgets(), []);
  private readonly transactionState = toLoadableSignal(
    this.transactionService.watchAllTransactions(),
    []
  );
  readonly accounts = this.accountState.value;
  readonly categories = this.categoryState.value;
  readonly scheduled = this.scheduledState.value;
  private readonly budgets = this.budgetState.value;
  private readonly transactions = this.transactionState.value;
  readonly initialLoading = computed(() =>
    [
      this.accountState,
      this.categoryState,
      this.scheduledState,
      this.budgetState,
      this.transactionState,
    ].some((state) => state.loading())
  );
  readonly loadError = computed(
    () =>
      [
        this.accountState,
        this.categoryState,
        this.scheduledState,
        this.budgetState,
        this.transactionState,
      ]
        .map((state) => state.error())
        .find((message): message is string => !!message) ?? null
  );

  readonly userCategories = computed(() => this.categories().filter((c) => !c.isSystem));
  readonly netWorth = computed(() => computeNetWorth(this.accounts(), this.transactions()));

  readonly form = this.fb.group({
    title: this.fb.nonNullable.control('', Validators.required),
    amount: this.fb.control<number | null>(null, [Validators.required, Validators.min(0.01)]),
    kind: this.fb.nonNullable.control<'income' | 'expense'>('expense', Validators.required),
    scheduleType: this.fb.nonNullable.control<ScheduleType>('monthly', Validators.required),
    dayOfMonth: this.fb.control<number | null>(1),
    dayOfWeek: this.fb.control<number | null>(1),
    fixedDate: this.fb.nonNullable.control(''),
    startDate: this.fb.nonNullable.control(
      new Date().toISOString().slice(0, 10),
      Validators.required
    ),
    accountId: this.fb.nonNullable.control('', Validators.required),
    categoryId: this.fb.nonNullable.control(''),
    isActive: this.fb.nonNullable.control(true),
  });

  readonly scheduleType = toSignal(
    this.form.controls.scheduleType.valueChanges.pipe(
      startWith(this.form.controls.scheduleType.value)
    ),
    { initialValue: this.form.controls.scheduleType.value }
  );

  private readonly occurrenceWindow = computed(() => {
    const anchor = this.selectedDate();
    const start = startOfDay(new Date(anchor.getFullYear(), anchor.getMonth() - 2, 1));
    const end = endOfDay(new Date(anchor.getFullYear(), anchor.getMonth() + 3, 0));
    const txs = this.transactions();
    const scheduled = filterPostedScheduledOccurrences(
      expandScheduledOccurrences(this.scheduled(), start, end),
      txs
    );
    const actual = transactionsAsOccurrences(txs, start, end);
    return [...scheduled, ...actual];
  });

  /** One summary chip per day for the month/week grid (“3 transactions”). */
  readonly calendarEvents = computed((): CalendarEvent[] => {
    const byDay = new Map<string, CalendarOccurrence[]>();
    for (const occ of this.occurrenceWindow()) {
      const key = dayKey(occ.date);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(occ);
    }

    return [...byDay.entries()].map(([dateKey, occs]) => {
      const count = occs.length;
      const net = dayNet(occs);
      const label =
        count === 1 ? '1 transaction' : `${count} transactions`;
      return {
        id: `day:${dateKey}`,
        title: label,
        start: occs[0].date,
        end: occs[0].date,
        isAllDay: true,
        color: net >= 0 ? '#e6f4ec' : '#f8e8e8',
        data: { type: 'day-summary', dateKey, count } satisfies DaySummaryData,
      };
    });
  });

  readonly selectedDayOccurrences = computed(() => {
    const key = dayKey(this.selectedDate());
    return this.occurrenceWindow()
      .filter((o) => dayKey(o.date) === key)
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  });

  readonly upcoming = computed(() => {
    const start = startOfDay(new Date());
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return filterPostedScheduledOccurrences(
      expandScheduledOccurrences(this.scheduled(), start, end),
      this.transactions()
    ).sort((a, b) => a.date.getTime() - b.date.getTime());
  });

  readonly nextUpcoming = computed(() => this.upcoming()[0] ?? null);

  readonly upcomingBillsTotal = computed(() =>
    roundMoney(
      this.upcoming()
        .filter((occ) => occ.amount < 0)
        .reduce((sum, occ) => sum + Math.abs(occ.amount), 0)
    )
  );

  readonly upcomingIncomeTotal = computed(() =>
    roundMoney(
      this.upcoming()
        .filter((occ) => occ.amount > 0)
        .reduce((sum, occ) => sum + occ.amount, 0)
    )
  );

  readonly upcomingNet = computed(() =>
    roundMoney(this.upcoming().reduce((sum, occ) => sum + occ.amount, 0))
  );

  readonly activeScheduledCount = computed(() => this.scheduled().filter((item) => item.isActive).length);

  readonly weekRange = computed(() => resolveCurrentWeek(this.selectedDate()));

  readonly weekStart = computed(() => this.weekRange().start ?? this.selectedDate());

  readonly weekCells = computed(() => weekDays(this.weekStart()));

  readonly weekTotals = computed(() =>
    computePeriodTotals(this.transactions(), [], this.weekRange())
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
    roundMoney(this.weeklyBudgetTotal() - this.weekTotals().spent)
  );

  readonly weekSummaryTitle = computed(() => {
    const remaining = this.remainingBudget();
    if (this.weeklyBudgetTotal() <= 0) {
      return 'Plan this week around scheduled cashflow';
    }
    if (remaining < 0) {
      return `${this.formatMoney(Math.abs(remaining))} over weekly budget`;
    }
    return `${this.formatMoney(remaining)} left in weekly budget`;
  });

  readonly weekSummaryDetail = computed(() => {
    const upcoming = this.upcoming();
    if (!upcoming.length) {
      return 'Nothing scheduled in the next 7 days.';
    }
    const bills = upcoming.filter((occ) => occ.amount < 0).length;
    const income = upcoming.filter((occ) => occ.amount > 0).length;
    const pieces = [
      bills ? `${bills} bill${bills === 1 ? '' : 's'}` : null,
      income ? `${income} income item${income === 1 ? '' : 's'}` : null,
    ].filter(Boolean);
    return `${pieces.join(' and ')} scheduled in the next 7 days.`;
  });

  readonly periodLabel = computed(() => {
    if (this.viewMode() === 'month') {
      return this.selectedDate().toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
      });
    }
    const days = this.weekCells();
    const fmt = (d: Date, withYear: boolean) =>
      d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        ...(withYear ? { year: 'numeric' } : {}),
      });
    const sameYear = days[0].getFullYear() === days[6].getFullYear();
    return `${fmt(days[0], !sameYear)} – ${fmt(days[6], true)}`;
  });

  constructor() {
    this.route.queryParamMap.subscribe((params) => {
      if (params.get('action') !== 'add') return;
      queueMicrotask(() => this.startNewItem());
      void clearOneShotQueryParams(this.router, this.route, ['action']);
    });

    effect(() => {
      const accounts = this.accounts();
      if (this.form.controls.accountId.value || !accounts.length) return;
      const checking = accounts.find((a) => a.type === 'checking') ?? accounts[0];
      this.form.patchValue({ accountId: checking.id });
    });
  }

  private formatMoney(value: number): string {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(value);
  }

  transactionsLinkParams(): Record<string, string> {
    const day = formatDateParam(this.selectedDate());
    return { period: 'custom', from: day, to: day };
  }

  onDateSelected(date: Date): void {
    this.selectedDate.set(startOfDay(date));
  }

  setView(view: CalendarView): void {
    this.viewMode.set(view);
  }

  shiftPeriod(dir: number): void {
    const d = new Date(this.selectedDate());
    if (this.viewMode() === 'month') {
      d.setMonth(d.getMonth() + dir);
    } else {
      d.setDate(d.getDate() + dir * 7);
    }
    this.selectedDate.set(startOfDay(d));
  }

  goToday(): void {
    this.selectedDate.set(startOfDay(new Date()));
  }

  selectDay(day: Date): void {
    this.selectedDate.set(startOfDay(day));
  }

  isSelected(day: Date): boolean {
    return dayKey(day) === dayKey(this.selectedDate());
  }

  isToday(day: Date): boolean {
    return dayKey(day) === dayKey(new Date());
  }

  occurrencesFor(day: Date): CalendarOccurrence[] {
    const key = dayKey(day);
    return this.occurrenceWindow()
      .filter((o) => dayKey(o.date) === key)
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  }

  visibleWeekItems(day: Date): CalendarOccurrence[] {
    return this.occurrencesFor(day).slice(0, WEEK_DAY_VISIBLE_CAP);
  }

  weekOverflowCount(day: Date): number {
    const total = this.occurrencesFor(day).length;
    return Math.max(0, total - WEEK_DAY_VISIBLE_CAP);
  }

  occChipClass(occ: CalendarOccurrence): string {
    if (occ.source === 'scheduled') {
      return occ.kind === 'income'
        ? 'border border-dashed border-finance-income bg-finance-incomeSoft text-finance-income'
        : 'border border-dashed border-finance-expense bg-finance-expenseSoft text-finance-expense';
    }
    return occ.kind === 'income'
      ? 'bg-finance-incomeSoft text-finance-income'
      : 'bg-finance-expenseSoft text-finance-expense';
  }

  weekDayColumnClass(day: Date): string {
    const parts: string[] = [];
    if (this.isSelected(day)) {
      parts.push('ring-2 ring-action-a60 border-action');
    }
    if (this.isToday(day)) {
      parts.push('bg-action-soft');
    }
    return parts.join(' ');
  }

  onEventClicked(event: CalendarEvent): void {
    const data = event.data as DaySummaryData | undefined;
    if (data?.type === 'day-summary' || event.start) {
      this.selectedDate.set(startOfDay(new Date(event.start)));
    }
  }

  dayNetFor(day: Date): number {
    const key = dayKey(day);
    return dayNet(this.occurrenceWindow().filter((o) => dayKey(o.date) === key));
  }

  scheduleLabel(item: ScheduledItem): string {
    if (item.scheduleType === 'fixed' && item.fixedDate) {
      return item.fixedDate.toLocaleDateString();
    }
    if (item.scheduleType === 'monthly' && item.dayOfMonth != null) {
      return `Monthly on ${item.dayOfMonth}`;
    }
    if (item.scheduleType === 'weekly' && item.dayOfWeek != null) {
      const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return `Weekly on ${names[item.dayOfWeek]}`;
    }
    return item.scheduleType;
  }

  startNewItem(): void {
    if (this.initialLoading()) {
      this.snack.open('Accounts are still loading. Try again in a moment.', 'Dismiss', {
        duration: 3000,
      });
      return;
    }
    if (!this.accounts().length) {
      const ref = this.snack.open(
        'Add an account before scheduling a bill or paycheck.',
        'Go to Accounts',
        { duration: 7000 }
      );
      ref.onAction().subscribe(() => void this.router.navigate(['/accounts']));
      return;
    }
    this.cancelEdit();
    this.showScheduleForm.set(true);
  }

  startEdit(item: ScheduledItem): void {
    this.showScheduleForm.set(true);
    this.editingId.set(item.id);
    this.form.patchValue({
      title: item.title,
      amount: item.amount,
      kind: item.kind,
      scheduleType: item.scheduleType,
      dayOfMonth: item.dayOfMonth,
      dayOfWeek: item.dayOfWeek,
      fixedDate: item.fixedDate ? item.fixedDate.toISOString().slice(0, 10) : '',
      startDate: item.startDate.toISOString().slice(0, 10),
      accountId: item.accountId ?? this.form.controls.accountId.value,
      categoryId: item.categoryId ?? '',
      isActive: item.isActive,
    });
  }

  cancelEdit(): void {
    this.showScheduleForm.set(false);
    this.editingId.set(null);
    const defaultAccount =
      this.accounts().find((a) => a.type === 'checking')?.id ?? this.accounts()[0]?.id ?? '';
    this.form.reset({
      title: '',
      amount: null,
      kind: 'expense',
      scheduleType: 'monthly',
      dayOfMonth: 1,
      dayOfWeek: 1,
      fixedDate: '',
      startDate: new Date().toISOString().slice(0, 10),
      accountId: defaultAccount,
      categoryId: '',
      isActive: true,
    });
  }

  async saveItem(): Promise<void> {
    const accountId = this.form.controls.accountId.value;
    if (
      this.form.invalid ||
      this.saving() ||
      !this.accounts().some((account) => account.id === accountId)
    ) {
      if (!this.accounts().length) {
        if (!this.editingId()) await this.onboarding.complete('plan');
      this.cancelEdit();
        const ref = this.snack.open(
          'This schedule needs an account. Add one, then try again.',
          'Go to Accounts',
          { duration: 7000 }
        );
        ref.onAction().subscribe(() => void this.router.navigate(['/accounts']));
      } else {
        this.form.markAllAsTouched();
      }
      return;
    }
    this.saving.set(true);
    const v = this.form.getRawValue();
    const input: ScheduledItemInput = {
      title: v.title,
      amount: Number(v.amount),
      kind: v.kind,
      scheduleType: v.scheduleType,
      dayOfMonth: v.scheduleType === 'monthly' ? Number(v.dayOfMonth) : null,
      dayOfWeek: v.scheduleType === 'weekly' ? Number(v.dayOfWeek) : null,
      fixedDate:
        v.scheduleType === 'fixed' && v.fixedDate
          ? startOfDay(new Date(`${v.fixedDate}T00:00:00`))
          : null,
      startDate: startOfDay(new Date(`${v.startDate}T00:00:00`)),
      endDate: null,
      accountId: v.accountId || null,
      categoryId: v.categoryId || null,
      isActive: v.isActive,
    };

    try {
      const id = this.editingId();
      if (id) {
        await this.scheduledService.update(id, input);
        this.snack.open('Updated scheduled item', 'OK', {
          duration: 2500,
          panelClass: ['snackbar-success'],
        });
      } else {
        const scheduledId = await this.scheduledService.create(input);
        const postingDate = resolveScheduledPostingDate({
          id: scheduledId,
          title: input.title,
          amount: input.amount,
          kind: input.kind,
          categoryId: input.categoryId,
          accountId: input.accountId,
          scheduleType: input.scheduleType,
          dayOfMonth: input.dayOfMonth,
          dayOfWeek: input.dayOfWeek,
          fixedDate: input.fixedDate,
          startDate: input.startDate,
          endDate: input.endDate,
          isActive: input.isActive,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        if (postingDate && v.accountId) {
          await this.transactionService.create({
            accountId: v.accountId,
            postedAt: postingDate,
            merchant: v.title.trim(),
            description: 'Posted from calendar schedule',
            amount: signedAmountForKind(Number(v.amount), v.kind),
            kind: v.kind,
            categoryId: v.categoryId || null,
            scheduledItemId: scheduledId,
          });
          const ref = this.snack.open(
            `Saved and posted ${v.kind} to Transactions · balances updated`,
            'View',
            { duration: 4000, panelClass: ['snackbar-success'] }
          );
          ref.onAction().subscribe(() => {
            void this.router.navigate(['/transactions'], {
              queryParams: {
                period: 'custom',
                from: formatDateParam(postingDate),
                to: formatDateParam(postingDate),
              },
            });
          });
        } else {
          this.snack.open('Saved scheduled item', 'OK', {
            duration: 2500,
            panelClass: ['snackbar-success'],
          });
        }
      }
      this.cancelEdit();
    } catch (err) {
      console.error(err);
      this.snack.open(
        'Could not save — check account selection and Firestore permissions',
        'Dismiss',
        { duration: 8000, panelClass: ['snackbar-error'] }
      );
    } finally {
      this.saving.set(false);
    }
  }

  async removeItem(item: ScheduledItem): Promise<void> {
    const confirmed = await confirmDialog(this.dialog, {
      title: `Delete ${item.title}?`,
      message: 'This removes the scheduled bill or paycheck from future planning.',
      detail: 'Already-posted transactions remain in Activity unless you delete them separately.',
      confirmLabel: 'Delete scheduled item',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await this.scheduledService.remove(item.id);
      if (this.editingId() === item.id) this.cancelEdit();
    } catch (err) {
      console.error(err);
      this.snack.open('Could not delete item (permissions?)', 'Dismiss', {
        duration: 5000,
        panelClass: ['snackbar-error'],
      });
    }
  }
}
