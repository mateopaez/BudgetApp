import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  Component,
  OnInit,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Account, Category, Transaction } from '../../core/models';
import { TransactionService } from '../../core/services/transaction.service';
import { formatDateParam, parseDateParam, startOfDay } from '../../core/utils/date.util';
import { ModalSheetComponent } from '../../shared/modal-sheet/modal-sheet.component';

@Component({
  selector: 'app-transaction-review',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    CurrencyPipe,
    DatePipe,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSnackBarModule,
    ModalSheetComponent,
  ],
  template: `
    <app-modal-sheet
      [title]="sheetTitle()"
      [subtitle]="sheetSubtitle()"
      ariaLabel="Review uncategorized transactions"
      [closeOnBackdrop]="!saving()"
      (closed)="requestClose()"
    >
      @if (!queue().length) {
        <div class="space-y-4 py-4 text-center">
          <p class="section-title">You’re caught up</p>
          <p class="text-sm leading-6 text-ink-muted">
            Nice work. Uncategorized expenses in this batch are done — or saved for later.
          </p>
          <button mat-flat-button color="primary" type="button" (click)="requestClose()">
            Back to activity
          </button>
        </div>
      } @else {
        @if (current(); as tx) {
          <form id="review-form" class="space-y-4" [formGroup]="form" (ngSubmit)="saveAndNext()">
            <div class="border-b border-line pb-4">
              <p class="money text-2xl font-semibold text-ink">{{ tx.amount | currency }}</p>
              <p class="mt-1 text-sm text-ink-muted">
                {{ tx.postedAt | date: 'mediumDate' }}
                ·
                {{ accountLabel(tx.accountId) }}
              </p>
            </div>

            <mat-form-field appearance="outline">
              <mat-label>Merchant / description</mat-label>
              <input matInput formControlName="merchant" autocomplete="off" />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Category</mat-label>
              <mat-select formControlName="categoryId">
                @for (c of reviewCategories(); track c.id) {
                  <mat-option [value]="c.id">{{ c.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <details class="rounded-control border border-line bg-surface-muted/40 px-3 py-2">
              <summary class="cursor-pointer text-sm font-medium text-ink-muted">
                Account, date, and amount
              </summary>
              <div class="mt-3 grid gap-3 sm:grid-cols-2">
                <mat-form-field appearance="outline">
                  <mat-label>Account</mat-label>
                  <mat-select formControlName="accountId">
                    @for (a of accounts(); track a.id) {
                      <mat-option [value]="a.id">{{ a.name }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
                <mat-form-field appearance="outline">
                  <mat-label>Date</mat-label>
                  <input matInput type="date" formControlName="postedAt" />
                </mat-form-field>
                <mat-form-field appearance="outline" class="sm:col-span-2">
                  <mat-label>Amount</mat-label>
                  <input matInput type="number" step="0.01" formControlName="amountAbs" />
                  <mat-hint>Expenses are stored as outflows.</mat-hint>
                </mat-form-field>
              </div>
            </details>
          </form>
        }
      }

      @if (queue().length) {
        <ng-container modalActions>
          <button mat-button type="button" [disabled]="saving()" (click)="skip()">
            Skip for now
          </button>
          <button
            mat-flat-button
            color="primary"
            type="submit"
            form="review-form"
            [disabled]="form.invalid || saving()"
          >
            {{ saving() ? 'Saving…' : queue().length > 1 ? 'Save & next' : 'Save & finish' }}
          </button>
        </ng-container>
      }
    </app-modal-sheet>
  `,
})
export class TransactionReviewComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly txService = inject(TransactionService);
  private readonly snack = inject(MatSnackBar);

  readonly items = input.required<Transaction[]>();
  readonly accounts = input.required<Account[]>();
  readonly categories = input.required<Category[]>();
  readonly closed = output<void>();

  readonly queue = signal<Transaction[]>([]);
  readonly totalStarted = signal(0);
  readonly saving = signal(false);

  readonly form = this.fb.nonNullable.group({
    merchant: ['', Validators.required],
    categoryId: ['', Validators.required],
    accountId: ['', Validators.required],
    postedAt: ['', Validators.required],
    amountAbs: [0, [Validators.required, Validators.min(0.01)]],
  });

  readonly current = computed(() => this.queue()[0] ?? null);

  readonly reviewCategories = computed(() =>
    this.categories().filter((c) => !c.isSystem && !c.archivedAt)
  );

  readonly sheetTitle = computed(() => {
    if (!this.queue().length) return 'Review complete';
    const done = this.totalStarted() - this.queue().length + 1;
    return `Review ${done} of ${this.totalStarted()}`;
  });

  readonly sheetSubtitle = computed(() => {
    if (!this.queue().length) return undefined;
    return 'Categorize this expense, confirm the details, then move to the next.';
  });

  constructor() {
    effect(() => {
      const tx = this.current();
      if (!tx) return;
      this.form.reset({
        merchant: tx.merchant,
        categoryId: '',
        accountId: tx.accountId,
        postedAt: formatDateParam(tx.postedAt),
        amountAbs: Math.abs(tx.amount),
      });
    });
  }

  ngOnInit(): void {
    const list = [...this.items()];
    this.queue.set(list);
    this.totalStarted.set(list.length);
  }

  accountLabel(id: string): string {
    return this.accounts().find((a) => a.id === id)?.name ?? 'Account';
  }

  skip(): void {
    this.queue.update((q) => q.slice(1));
  }

  async saveAndNext(): Promise<void> {
    const tx = this.current();
    if (!tx || this.form.invalid || this.saving()) return;
    this.saving.set(true);
    const v = this.form.getRawValue();
    try {
      await this.txService.update(tx.id, {
        merchant: v.merchant.trim(),
        categoryId: v.categoryId,
        accountId: v.accountId,
        postedAt: startOfDay(parseDateParam(v.postedAt) ?? tx.postedAt),
        amount: -Math.abs(v.amountAbs),
        kind: 'expense',
      });
      this.queue.update((q) => q.slice(1));
    } catch {
      this.snack.open('Could not save this transaction.', 'Dismiss', {
        duration: 4000,
        panelClass: ['snackbar-error'],
      });
    } finally {
      this.saving.set(false);
    }
  }

  requestClose(): void {
    this.closed.emit();
  }
}
