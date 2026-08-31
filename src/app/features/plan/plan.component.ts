import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { startWith } from 'rxjs/operators';
import { ScheduledItem, ScheduledItemInput, ScheduleType } from '../../core/models';
import { AccountService } from '../../core/services/account.service';
import { CategoryService } from '../../core/services/category.service';
import { ScheduledItemService } from '../../core/services/scheduled-item.service';
import { TransactionService } from '../../core/services/transaction.service';
import { signedAmountForKind } from '../../core/utils/amount.util';
import { roundMoney } from '../../core/utils/balance.util';
import {
  CalendarOccurrence,
  expandScheduledOccurrences,
  filterPostedScheduledOccurrences,
} from '../../core/utils/calendar.util';
import { startOfDay } from '../../core/utils/date.util';
import { toLoadableSignal } from '../../core/utils/loadable-signal.util';
import { clearOneShotQueryParams } from '../../core/utils/one-shot-query.util';
import { groupPlanOccurrences, planHorizonEnd } from '../../core/utils/plan.util';
import { confirmDialog } from '../../shared/confirm-dialog/confirm-dialog.component';
import { ModalSheetComponent } from '../../shared/modal-sheet/modal-sheet.component';

@Component({
  selector: 'app-plan',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    CurrencyPipe,
    DatePipe,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatCheckboxModule,
    MatMenuModule,
    MatSnackBarModule,
    ModalSheetComponent,
  ],
  template: `
    <div class="page !space-y-10">
      <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div class="page-header">
          <h1 class="page-title">Plan</h1>
          <p class="page-subtitle">
            What’s coming up — bills, paychecks, and other scheduled items.
          </p>
        </div>
        <button
          mat-flat-button
          color="primary"
          type="button"
          (click)="startNewItem()"
          [disabled]="sheetOpen() || initialLoading()"
        >
          <mat-icon>add</mat-icon>
          Add upcoming item
        </button>
      </header>

      @if (initialLoading()) {
        <section class="empty-state animate-pulse" role="status" aria-live="polite">
          <p class="font-medium text-ink">Loading your plan…</p>
          <p class="mt-1 text-sm text-ink-muted">Gathering bills, paychecks, and accounts.</p>
        </section>
      } @else if (loadError()) {
        <p class="status-banner status-banner--error" role="alert">{{ loadError() }}</p>
      } @else {
        @if (upcoming().length) {
          <section aria-labelledby="horizon-summary" class="border-b border-line pb-6">
            <h2 id="horizon-summary" class="sr-only">Upcoming summary</h2>
            <div class="flex flex-wrap gap-x-10 gap-y-3 text-sm">
              <div>
                <p class="kicker">Upcoming bills</p>
                <p class="money mt-1 text-xl font-semibold text-finance-expense">
                  {{ billsTotal() | currency }}
                </p>
              </div>
              <div>
                <p class="kicker">Upcoming income</p>
                <p class="money mt-1 text-xl font-semibold text-finance-income">
                  {{ incomeTotal() | currency }}
                </p>
              </div>
            </div>
          </section>
        }

        @if (buckets().length) {
          @for (bucket of buckets(); track bucket.id) {
            <section [attr.aria-labelledby]="'bucket-' + bucket.id">
              <h2 [id]="'bucket-' + bucket.id" class="section-title">{{ bucket.label }}</h2>
              <ul class="list-shell mt-4 list-none p-0">
                @for (occ of bucket.items; track occ.id) {
                  <li class="list-row">
                    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div class="min-w-0 flex-1">
                        <p class="truncate font-medium text-ink">{{ occ.title }}</p>
                        <p class="mt-0.5 text-sm text-ink-muted">
                          {{ occ.date | date: 'EEE, MMM d' }}
                          ·
                          {{ occ.kind === 'income' ? 'Paycheck' : 'Bill' }}
                          @if (occ.categoryId) {
                            · {{ categoryName(occ.categoryId) }}
                          }
                          ·
                          {{ accountName(occ.accountId) }}
                        </p>
                      </div>
                      <p
                        class="money shrink-0 text-base font-semibold sm:text-right"
                        [class.text-finance-income]="occ.kind === 'income'"
                        [class.tx-amount--out]="occ.kind === 'expense'"
                      >
                        {{ occ.amount | currency }}
                      </p>
                    </div>
                    <div class="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        mat-stroked-button
                        type="button"
                        class="!min-h-10"
                        [disabled]="postingId() === occ.id"
                        (click)="markPosted(occ)"
                      >
                        {{
                          postingId() === occ.id
                            ? 'Saving…'
                            : occ.kind === 'income'
                              ? 'Mark received'
                              : 'Mark paid'
                        }}
                      </button>
                      <button
                        mat-icon-button
                        type="button"
                        class="!min-h-10"
                        [matMenuTriggerFor]="planItemMenu"
                        (menuOpened)="menuOccurrence.set(occ)"
                        [attr.aria-label]="'More actions for ' + occ.title"
                      >
                        <mat-icon>more_vert</mat-icon>
                      </button>
                    </div>
                  </li>
                }
              </ul>
            </section>
          }
        } @else {
          <section class="empty-state space-y-4">
            <h2 class="section-title">Nothing scheduled yet</h2>
            <p class="mx-auto max-w-md text-sm leading-6 text-ink-muted">
              Add rent, subscriptions, paychecks, or one-time bills so you can see what’s coming
              before it hits.
            </p>
            <button mat-flat-button color="primary" type="button" (click)="startNewItem()">
              <mat-icon>add</mat-icon>
              Add upcoming item
            </button>
          </section>
        }
      }
    </div>

    <mat-menu #planItemMenu="matMenu">
      <button
        mat-menu-item
        type="button"
        (click)="menuOccurrence() && startEditSeries(menuOccurrence()!)"
      >
        <mat-icon>edit</mat-icon>
        <span>Edit series</span>
      </button>
      <button
        mat-menu-item
        type="button"
        (click)="menuOccurrence() && removeSeries(menuOccurrence()!)"
      >
        <mat-icon color="warn">delete</mat-icon>
        <span>Delete series</span>
      </button>
    </mat-menu>

    @if (sheetOpen()) {
      <app-modal-sheet
        [title]="editingId() ? 'Edit upcoming item' : 'Add upcoming item'"
        subtitle="Bills and paychecks stay on this timeline until you mark them paid or received."
        [ariaLabel]="editingId() ? 'Edit upcoming item' : 'Add upcoming item'"
        (closed)="cancelEdit()"
      >
        <form id="plan-schedule-form" class="space-y-5" [formGroup]="form" (ngSubmit)="saveItem()">
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
                <mat-select formControlName="kind">
                  <mat-option value="expense">Bill / expense</mat-option>
                  <mat-option value="income">Income / paycheck</mat-option>
                </mat-select>
              </mat-form-field>
            </div>
          </section>

          <section class="space-y-3 rounded-panel border border-line bg-surface-muted/40 p-4">
            <p class="kicker">Schedule</p>
            <mat-form-field appearance="outline">
              <mat-label>Schedule</mat-label>
              <mat-select formControlName="scheduleType">
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
                <mat-select formControlName="dayOfWeek">
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
          </section>

          <section class="space-y-3">
            <p class="kicker">Account and category</p>
            <mat-form-field appearance="outline">
              <mat-label>Account</mat-label>
              <mat-select formControlName="accountId">
                @for (a of accounts(); track a.id) {
                  <mat-option [value]="a.id">{{ a.name }}</mat-option>
                }
              </mat-select>
              <mat-hint>Needed when you mark an item paid or received</mat-hint>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Category (optional)</mat-label>
              <mat-select formControlName="categoryId">
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
          form="plan-schedule-form"
          [disabled]="form.invalid || saving()"
        >
          {{ saving() ? 'Saving…' : editingId() ? 'Save changes' : 'Add item' }}
        </button>
      </app-modal-sheet>
    }
  `,
})
export class PlanComponent {
  private readonly fb = inject(FormBuilder);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly scheduledService = inject(ScheduledItemService);
  private readonly transactionService = inject(TransactionService);
  private readonly accountService = inject(AccountService);
  private readonly categoryService = inject(CategoryService);

  readonly editingId = signal<string | null>(null);
  readonly showScheduleForm = signal(false);
  readonly sheetOpen = computed(() => this.showScheduleForm() || !!this.editingId());
  readonly saving = signal(false);
  readonly postingId = signal<string | null>(null);
  readonly menuOccurrence = signal<CalendarOccurrence | null>(null);

  private readonly accountState = toLoadableSignal(this.accountService.watchAccounts(), []);
  private readonly categoryState = toLoadableSignal(this.categoryService.watchCategories(), []);
  private readonly scheduledState = toLoadableSignal(
    this.scheduledService.watchScheduledItems(),
    []
  );
  private readonly transactionState = toLoadableSignal(
    this.transactionService.watchAllTransactions(),
    []
  );

  readonly accounts = this.accountState.value;
  readonly categories = this.categoryState.value;
  readonly scheduled = this.scheduledState.value;
  private readonly transactions = this.transactionState.value;

  readonly initialLoading = computed(() =>
    [
      this.accountState,
      this.categoryState,
      this.scheduledState,
      this.transactionState,
    ].some((state) => state.loading())
  );

  readonly loadError = computed(
    () =>
      [
        this.accountState,
        this.categoryState,
        this.scheduledState,
        this.transactionState,
      ]
        .map((state) => state.error())
        .find((message): message is string => !!message) ?? null
  );

  readonly userCategories = computed(() => this.categories().filter((c) => !c.isSystem));

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

  readonly upcoming = computed(() => {
    const now = new Date();
    const start = startOfDay(now);
    const end = planHorizonEnd(now);
    return filterPostedScheduledOccurrences(
      expandScheduledOccurrences(this.scheduled(), start, end),
      this.transactions()
    );
  });

  readonly buckets = computed(() => groupPlanOccurrences(this.upcoming()));

  readonly billsTotal = computed(() =>
    roundMoney(
      this.upcoming()
        .filter((occ) => occ.kind === 'expense')
        .reduce((sum, occ) => sum + Math.abs(occ.amount), 0)
    )
  );

  readonly incomeTotal = computed(() =>
    roundMoney(
      this.upcoming()
        .filter((occ) => occ.kind === 'income')
        .reduce((sum, occ) => sum + Math.abs(occ.amount), 0)
    )
  );

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

  accountName(id: string | null): string {
    if (!id) return 'No account';
    return this.accounts().find((a) => a.id === id)?.name ?? 'Account';
  }

  categoryName(id: string | null): string {
    if (!id) return 'Uncategorized';
    return this.categories().find((c) => c.id === id)?.name ?? 'Category';
  }

  private findSeries(itemId: string): ScheduledItem | undefined {
    return this.scheduled().find((item) => item.id === itemId);
  }

  startNewItem(): void {
    if (this.initialLoading()) {
      this.snack.open('Still loading. Try again in a moment.', 'Dismiss', { duration: 3000 });
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

  startEditSeries(occ: CalendarOccurrence): void {
    const item = this.findSeries(occ.itemId);
    if (!item) {
      this.snack.open('Could not find that scheduled series.', 'Dismiss', { duration: 4000 });
      return;
    }
    this.startEdit(item);
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
        this.snack.open('Updated upcoming item', 'OK', {
          duration: 2500,
          panelClass: ['snackbar-success'],
        });
      } else {
        await this.scheduledService.create(input);
        this.snack.open('Added to your plan', 'OK', {
          duration: 2500,
          panelClass: ['snackbar-success'],
        });
      }
      this.cancelEdit();
    } catch (err) {
      console.error(err);
      this.snack.open(
        'Could not save — check account selection and permissions',
        'Dismiss',
        { duration: 8000, panelClass: ['snackbar-error'] }
      );
    } finally {
      this.saving.set(false);
    }
  }

  async markPosted(occ: CalendarOccurrence): Promise<void> {
    if (this.postingId()) return;

    const accountId = occ.accountId;
    if (!accountId || !this.accounts().some((a) => a.id === accountId)) {
      const ref = this.snack.open(
        'This item needs an account before it can be posted.',
        'Edit series',
        { duration: 7000 }
      );
      ref.onAction().subscribe(() => this.startEditSeries(occ));
      return;
    }

    this.postingId.set(occ.id);
    try {
      await this.transactionService.create({
        accountId,
        postedAt: occ.date,
        merchant: occ.title,
        description: null,
        amount: signedAmountForKind(Math.abs(occ.amount), occ.kind),
        kind: occ.kind,
        categoryId: occ.categoryId,
        scheduledItemId: occ.itemId,
      });
      this.snack.open(
        occ.kind === 'income' ? 'Marked as received' : 'Marked as paid',
        'OK',
        { duration: 2500, panelClass: ['snackbar-success'] }
      );
    } catch (err) {
      console.error(err);
      this.snack.open('Could not post this item. Try again.', 'Dismiss', {
        duration: 6000,
        panelClass: ['snackbar-error'],
      });
    } finally {
      this.postingId.set(null);
    }
  }

  async removeSeries(occ: CalendarOccurrence): Promise<void> {
    const item = this.findSeries(occ.itemId);
    if (!item) {
      this.snack.open('Could not find that scheduled series.', 'Dismiss', { duration: 4000 });
      return;
    }

    const confirmed = await confirmDialog(this.dialog, {
      title: `Delete ${item.title}?`,
      message: 'This removes the scheduled bill or paycheck from future planning.',
      detail: 'Already-posted transactions remain in Activity unless you delete them separately.',
      confirmLabel: 'Delete series',
      tone: 'danger',
    });
    if (!confirmed) return;

    try {
      await this.scheduledService.remove(item.id);
      if (this.editingId() === item.id) this.cancelEdit();
      this.snack.open('Removed from your plan', 'OK', {
        duration: 2500,
        panelClass: ['snackbar-success'],
      });
    } catch (err) {
      console.error(err);
      this.snack.open('Could not delete item (permissions?)', 'Dismiss', {
        duration: 5000,
        panelClass: ['snackbar-error'],
      });
    }
  }
}
