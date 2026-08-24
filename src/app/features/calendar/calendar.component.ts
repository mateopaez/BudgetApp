import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import {
  CalendarEvent,
  CalendarViewMode,
  MatCalendarComponent,
} from 'ngx-m3-calendar';
import { startWith } from 'rxjs/operators';
import { ScheduledItem, ScheduledItemInput, ScheduleType } from '../../core/models';
import { AccountService } from '../../core/services/account.service';
import { CategoryService } from '../../core/services/category.service';
import { ScheduledItemService } from '../../core/services/scheduled-item.service';
import { TransactionService } from '../../core/services/transaction.service';
import { computeNetWorth } from '../../core/utils/balance-history.util';
import {
  CalendarOccurrence,
  dayKey,
  dayNet,
  expandScheduledOccurrences,
  transactionsAsOccurrences,
} from '../../core/utils/calendar.util';
import { endOfDay, startOfDay } from '../../core/utils/date.util';

interface CalendarEventData {
  source: 'scheduled' | 'transaction';
  amount: number;
  kind: 'income' | 'expense';
  itemId: string;
}

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    CurrencyPipe,
    DatePipe,
    MatCalendarComponent,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatCheckboxModule,
    MatSnackBarModule,
  ],
  template: `
    <div class="space-y-6">
      <div class="page-header">
        <h1 class="page-title">Calendar</h1>
        <p class="page-subtitle">
          Bills, paychecks, and transactions · net worth
          {{ netWorth() | currency }}
        </p>
      </div>

      <div class="app-card overflow-hidden p-2 sm:p-3">
        <mc-calendar
          [events]="calendarEvents()"
          [selectedDate]="selectedDate()"
          [viewMode]="viewMode()"
          [showViewToggle]="true"
          [weekStartsOn]="1"
          [startHour]="6"
          [endHour]="22"
          (dateSelected)="onDateSelected($event)"
          (viewModeChanged)="onViewModeChanged($event)"
          (eventClicked)="onEventClicked($event)"
        />
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <mat-card class="app-card">
          <mat-card-header>
            <mat-card-title class="!text-midnight-900">
              {{ selectedDate() | date: 'fullDate' }}
            </mat-card-title>
            <mat-card-subtitle>
              Day net {{ dayNetFor(selectedDate()) | currency }}
            </mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <ul
              class="m-0 list-none divide-y divide-brand-100 overflow-hidden rounded-xl border border-brand-100 p-0"
            >
              @for (occ of selectedDayOccurrences(); track occ.id) {
                <li class="flex items-center justify-between gap-3 px-4 py-3">
                  <div class="min-w-0">
                    <p class="truncate font-medium text-midnight-900">{{ occ.title }}</p>
                    <p class="text-xs text-slate-500">
                      {{ occ.kind }} ·
                      {{ occ.source === 'scheduled' ? 'Scheduled' : 'Actual' }}
                    </p>
                  </div>
                  <span
                    class="shrink-0 font-semibold"
                    [class.text-emerald-600]="occ.amount > 0"
                    [class.text-red-600]="occ.amount < 0"
                  >
                    {{ occ.amount | currency }}
                  </span>
                </li>
              } @empty {
                <li class="px-4 py-6 text-center text-sm text-slate-500">
                  Nothing on this day. Click a date on the calendar or add a bill below.
                </li>
              }
            </ul>

            <div class="mt-4">
              <p class="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                Upcoming 7 days (scheduled)
              </p>
              <ul class="m-0 list-none space-y-2 p-0">
                @for (occ of upcoming(); track occ.id) {
                  <li class="flex items-start justify-between gap-2 text-sm">
                    <div class="min-w-0">
                      <p class="truncate font-medium text-midnight-900">{{ occ.title }}</p>
                      <p class="text-xs text-slate-500">{{ occ.date | date: 'EEE, MMM d' }}</p>
                    </div>
                    <span
                      class="shrink-0 font-medium"
                      [class.text-emerald-600]="occ.amount > 0"
                      [class.text-red-600]="occ.amount < 0"
                    >
                      {{ occ.amount | currency }}
                    </span>
                  </li>
                } @empty {
                  <li class="text-sm text-slate-500">No upcoming scheduled items.</li>
                }
              </ul>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="app-card">
          <mat-card-header>
            <mat-card-title class="!text-base !text-midnight-900">
              {{ editingId() ? 'Edit scheduled item' : 'Add bill / paycheck' }}
            </mat-card-title>
            <mat-card-subtitle>
              Recurring items show on every matching date
            </mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <form class="flex flex-col gap-1" [formGroup]="form" (ngSubmit)="saveItem()">
              <mat-form-field>
                <mat-label>Title</mat-label>
                <input matInput formControlName="title" autocomplete="off" />
              </mat-form-field>

              <div class="grid grid-cols-1 gap-1 sm:grid-cols-2">
                <mat-form-field>
                  <mat-label>Amount</mat-label>
                  <input matInput type="number" step="0.01" min="0.01" formControlName="amount" />
                </mat-form-field>
                <mat-form-field>
                  <mat-label>Kind</mat-label>
                  <mat-select formControlName="kind" panelClass="calendar-select-panel">
                    <mat-option value="expense">Bill / expense</mat-option>
                    <mat-option value="income">Income</mat-option>
                  </mat-select>
                </mat-form-field>
              </div>

              <mat-form-field>
                <mat-label>Schedule</mat-label>
                <mat-select formControlName="scheduleType" panelClass="calendar-select-panel">
                  <mat-option value="monthly">Monthly on a day</mat-option>
                  <mat-option value="weekly">Weekly on a day</mat-option>
                  <mat-option value="fixed">One-time date</mat-option>
                </mat-select>
              </mat-form-field>

              @if (scheduleType() === 'monthly') {
                <mat-form-field>
                  <mat-label>Day of month</mat-label>
                  <input matInput type="number" min="1" max="31" formControlName="dayOfMonth" />
                </mat-form-field>
              }
              @if (scheduleType() === 'weekly') {
                <mat-form-field>
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
                <mat-form-field>
                  <mat-label>Date</mat-label>
                  <input matInput type="date" formControlName="fixedDate" />
                </mat-form-field>
              }

              <mat-form-field>
                <mat-label>Starts</mat-label>
                <input matInput type="date" formControlName="startDate" />
              </mat-form-field>

              <mat-form-field>
                <mat-label>Account (optional)</mat-label>
                <mat-select formControlName="accountId" panelClass="calendar-select-panel">
                  <mat-option value="">—</mat-option>
                  @for (a of accounts(); track a.id) {
                    <mat-option [value]="a.id">{{ a.name }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-form-field>
                <mat-label>Category (optional)</mat-label>
                <mat-select formControlName="categoryId" panelClass="calendar-select-panel">
                  <mat-option value="">—</mat-option>
                  @for (c of userCategories(); track c.id) {
                    <mat-option [value]="c.id">{{ c.name }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-checkbox formControlName="isActive" class="mb-2">Active</mat-checkbox>

              <div class="flex flex-wrap gap-2">
                <button mat-flat-button color="primary" type="submit" [disabled]="form.invalid || saving()">
                  {{ editingId() ? 'Save' : 'Add' }}
                </button>
                @if (editingId()) {
                  <button mat-button type="button" (click)="cancelEdit()">Cancel</button>
                }
              </div>
            </form>
          </mat-card-content>
        </mat-card>
      </div>

      <mat-card class="app-card">
        <mat-card-header>
          <mat-card-title class="!text-base !text-midnight-900">All scheduled</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <ul
            class="m-0 list-none divide-y divide-brand-100 overflow-hidden rounded-xl border border-brand-100 p-0"
          >
            @for (item of scheduled(); track item.id) {
              <li class="flex items-center gap-2 px-3 py-2.5">
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-medium text-midnight-900">
                    {{ item.title }}
                    @if (!item.isActive) {
                      <span class="ml-1 text-xs text-slate-400">(paused)</span>
                    }
                  </p>
                  <p class="text-xs text-slate-500">
                    {{ item.kind }} · {{ scheduleLabel(item) }} · {{ item.amount | currency }}
                  </p>
                </div>
                <button mat-icon-button type="button" (click)="startEdit(item)" aria-label="Edit">
                  <mat-icon>edit</mat-icon>
                </button>
                <button
                  mat-icon-button
                  color="warn"
                  type="button"
                  (click)="removeItem(item)"
                  aria-label="Delete"
                >
                  <mat-icon>delete</mat-icon>
                </button>
              </li>
            } @empty {
              <li class="px-4 py-5 text-center text-sm text-slate-500">
                Add rent, paycheck, or subscriptions above.
              </li>
            }
          </ul>
        </mat-card-content>
      </mat-card>
    </div>
  `,
})
export class CalendarComponent {
  private readonly fb = inject(FormBuilder);
  private readonly snack = inject(MatSnackBar);
  private readonly scheduledService = inject(ScheduledItemService);
  private readonly transactionService = inject(TransactionService);
  private readonly accountService = inject(AccountService);
  private readonly categoryService = inject(CategoryService);

  readonly selectedDate = signal(startOfDay(new Date()));
  readonly viewMode = signal<CalendarViewMode>('month');
  readonly editingId = signal<string | null>(null);
  readonly saving = signal(false);

  readonly accounts = toSignal(this.accountService.watchAccounts(), { initialValue: [] });
  readonly categories = toSignal(this.categoryService.watchCategories(), { initialValue: [] });
  readonly scheduled = toSignal(this.scheduledService.watchScheduledItems(), { initialValue: [] });
  private readonly transactions = toSignal(this.transactionService.watchAllTransactions(), {
    initialValue: [],
  });

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
    accountId: this.fb.nonNullable.control(''),
    categoryId: this.fb.nonNullable.control(''),
    isActive: this.fb.nonNullable.control(true),
  });

  readonly scheduleType = toSignal(
    this.form.controls.scheduleType.valueChanges.pipe(
      startWith(this.form.controls.scheduleType.value)
    ),
    { initialValue: this.form.controls.scheduleType.value }
  );

  /** Expand scheduled + txs across a wide window so month/week navigation stays populated. */
  private readonly occurrenceWindow = computed(() => {
    const anchor = this.selectedDate();
    const start = startOfDay(new Date(anchor.getFullYear(), anchor.getMonth() - 2, 1));
    const end = endOfDay(new Date(anchor.getFullYear(), anchor.getMonth() + 3, 0));
    const scheduled = expandScheduledOccurrences(this.scheduled(), start, end);
    const actual = transactionsAsOccurrences(this.transactions(), start, end);
    return [...scheduled, ...actual];
  });

  readonly calendarEvents = computed((): CalendarEvent[] =>
    this.occurrenceWindow().map((occ) => this.toCalendarEvent(occ))
  );

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
    return expandScheduledOccurrences(this.scheduled(), start, end);
  });

  onDateSelected(date: Date): void {
    this.selectedDate.set(startOfDay(date));
  }

  onViewModeChanged(mode: CalendarViewMode): void {
    this.viewMode.set(mode);
  }

  onEventClicked(event: CalendarEvent): void {
    const data = event.data as CalendarEventData | undefined;
    if (event.start) {
      this.selectedDate.set(startOfDay(new Date(event.start)));
    }
    if (data?.source === 'scheduled') {
      const item = this.scheduled().find((s) => s.id === data.itemId);
      if (item) this.startEdit(item);
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

  startEdit(item: ScheduledItem): void {
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
      accountId: item.accountId ?? '',
      categoryId: item.categoryId ?? '',
      isActive: item.isActive,
    });
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.form.reset({
      title: '',
      amount: null,
      kind: 'expense',
      scheduleType: 'monthly',
      dayOfMonth: 1,
      dayOfWeek: 1,
      fixedDate: '',
      startDate: new Date().toISOString().slice(0, 10),
      accountId: '',
      categoryId: '',
      isActive: true,
    });
  }

  async saveItem(): Promise<void> {
    if (this.form.invalid || this.saving()) return;
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
      } else {
        await this.scheduledService.create(input);
      }
      this.cancelEdit();
      this.snack.open('Saved scheduled item', 'OK', { duration: 2500 });
    } catch (err) {
      console.error(err);
      this.snack.open(
        'Could not save — deploy Firestore rules if this is a new collection: firebase deploy --only firestore:rules',
        'Dismiss',
        { duration: 8000 }
      );
    } finally {
      this.saving.set(false);
    }
  }

  async removeItem(item: ScheduledItem): Promise<void> {
    if (!confirm(`Delete “${item.title}”?`)) return;
    try {
      await this.scheduledService.remove(item.id);
      if (this.editingId() === item.id) this.cancelEdit();
    } catch (err) {
      console.error(err);
      this.snack.open('Could not delete item (permissions?)', 'Dismiss', { duration: 5000 });
    }
  }

  private toCalendarEvent(occ: CalendarOccurrence): CalendarEvent {
    const isIncome = occ.kind === 'income';
    const amountLabel = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(Math.abs(occ.amount));
    const prefix = occ.source === 'scheduled' ? '○ ' : '';
    return {
      id: occ.id,
      title: `${prefix}${occ.title} (${isIncome ? '+' : '−'}${amountLabel})`,
      start: occ.date,
      end: occ.date,
      isAllDay: true,
      color: isIncome ? '#dcfce7' : '#fee2e2',
      data: {
        source: occ.source,
        amount: occ.amount,
        kind: occ.kind,
        itemId: occ.itemId,
      } satisfies CalendarEventData,
    };
  }
}
