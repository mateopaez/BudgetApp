import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { Category, Transaction } from '../../core/models';
import { AccountService } from '../../core/services/account.service';
import { CategoryService } from '../../core/services/category.service';
import { TransactionService } from '../../core/services/transaction.service';
import { SplitDialogComponent } from './split-dialog.component';
import {
  TransactionFormDialogComponent,
  TransactionFormResult,
} from './transaction-form-dialog.component';

type SortOption = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc' | 'merchant_asc';

@Component({
  selector: 'app-transactions',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    CurrencyPipe,
    DatePipe,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
  ],
  template: `
    <div class="space-y-6">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="page-header">
          <h1 class="page-title">Transactions</h1>
          <p class="page-subtitle">
            {{ transactions().length }} shown
            @if (filters.get('period')?.value === 'all') {
              · all time
            }
          </p>
        </div>
        <button mat-flat-button color="primary" class="shrink-0 self-start" (click)="openAdd()">
          <mat-icon>add</mat-icon>
          Add transaction
        </button>
      </div>

      <div class="app-card p-4">
        <form class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" [formGroup]="filters">
          <mat-form-field>
            <mat-label>Account</mat-label>
            <mat-select formControlName="accountId">
              <mat-option value="">All accounts</mat-option>
              @for (a of accounts(); track a.id) {
                <mat-option [value]="a.id">{{ a.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-form-field>
            <mat-label>Period</mat-label>
            <mat-select formControlName="period">
              <mat-option value="all">All time</mat-option>
              <mat-option value="month">Specific month</mat-option>
            </mat-select>
          </mat-form-field>

          @if (filters.get('period')?.value === 'month') {
            <mat-form-field>
              <mat-label>Month</mat-label>
              <input matInput type="month" formControlName="month" />
            </mat-form-field>
          }

          <mat-form-field>
            <mat-label>Sort by</mat-label>
            <mat-select formControlName="sort">
              <mat-option value="date_desc">Date (newest first)</mat-option>
              <mat-option value="date_asc">Date (oldest first)</mat-option>
              <mat-option value="amount_desc">Amount (high to low)</mat-option>
              <mat-option value="amount_asc">Amount (low to high)</mat-option>
              <mat-option value="merchant_asc">Merchant (A–Z)</mat-option>
            </mat-select>
          </mat-form-field>
        </form>
      </div>

      <div class="space-y-3">
        @for (tx of transactions(); track tx.id) {
          <div class="app-list-row">
            <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div class="min-w-0 flex-1">
                <div class="flex items-start gap-1">
                  @if (editingId() === tx.id) {
                    <mat-form-field class="min-w-0 flex-1">
                      <mat-label>Merchant</mat-label>
                      <input
                        matInput
                        [value]="editMerchant()"
                        (input)="editMerchant.set($any($event.target).value)"
                        (keydown.enter)="saveMerchant(tx.id)"
                        (keydown.escape)="cancelEditMerchant()"
                      />
                    </mat-form-field>
                    <button mat-icon-button color="primary" (click)="saveMerchant(tx.id)">
                      <mat-icon>check</mat-icon>
                    </button>
                    <button mat-icon-button (click)="cancelEditMerchant()">
                      <mat-icon>close</mat-icon>
                    </button>
                  } @else {
                    <p class="min-w-0 flex-1 font-medium text-midnight-900">{{ tx.merchant }}</p>
                    <button mat-icon-button class="shrink-0" (click)="startEditMerchant(tx)">
                      <mat-icon class="!text-base">edit</mat-icon>
                    </button>
                  }
                </div>
                @if (tx.description) {
                  <p class="mt-0.5 text-sm text-slate-500">{{ tx.description }}</p>
                }
                <p class="mt-1 text-sm text-slate-500">
                  {{ tx.postedAt | date: 'medium' }} · {{ accountName(tx.accountId) }} · {{ tx.kind }}
                  @if (isInbox(tx)) {
                    <span class="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                      Inbox
                    </span>
                  }
                </p>
                <p
                  class="mt-1 text-lg font-semibold"
                  [class]="tx.amount < 0 ? 'text-red-600' : 'text-brand-600'"
                >
                  {{ tx.amount | currency }}
                </p>
                @if (tx.split?.length) {
                  <ul class="mt-2 space-y-0.5 text-xs text-slate-500">
                    @for (line of tx.split; track $index) {
                      <li>{{ categoryName(line.categoryId) }}: {{ line.amount | currency }}</li>
                    }
                  </ul>
                }
              </div>

              <div class="flex w-full flex-col gap-3 lg:w-72 lg:shrink-0">
                <mat-form-field>
                  <mat-label>Category</mat-label>
                  <mat-select
                    [value]="categoryValue(tx)"
                    [compareWith]="compareIds"
                    (selectionChange)="updateCategory(tx.id, $event.value)"
                    [disabled]="tx.kind !== 'expense' && tx.kind !== 'income'"
                  >
                    <mat-option [value]="null">—</mat-option>
                    @for (c of selectableCategories(tx); track c.id) {
                      <mat-option [value]="c.id">{{ c.name }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
                <div class="flex flex-wrap gap-2">
                  <button mat-stroked-button (click)="openEdit(tx)">Edit</button>
                  @if (tx.kind === 'expense') {
                    <button mat-stroked-button (click)="openSplit(tx)">Split</button>
                  }
                  <button mat-icon-button color="warn" (click)="remove(tx.id)">
                    <mat-icon>delete</mat-icon>
                  </button>
                </div>
              </div>
            </div>
          </div>
        } @empty {
          <div class="app-card p-8 text-center">
            <p class="text-sm text-slate-500">No transactions match your filters.</p>
          </div>
        }
      </div>
    </div>
  `,
})
export class TransactionsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly accountService = inject(AccountService);
  private readonly categoryService = inject(CategoryService);
  private readonly transactionService = inject(TransactionService);
  private readonly dialog = inject(MatDialog);

  readonly accounts = toSignal(this.accountService.watchAccounts(), { initialValue: [] });
  readonly categories = toSignal(this.categoryService.watchCategories(), { initialValue: [] });
  private readonly allTransactions = toSignal(this.transactionService.watchAllTransactions(), {
    initialValue: [],
  });

  readonly editingId = signal<string | null>(null);
  readonly editMerchant = signal('');
  private readonly pendingCategories = signal<Record<string, string | null>>({});

  readonly filters = this.fb.nonNullable.group({
    accountId: [''],
    period: ['all' as 'all' | 'month'],
    month: [new Date().toISOString().slice(0, 7)],
    sort: ['date_desc' as SortOption],
  });

  private readonly filterValues = toSignal(this.filters.valueChanges, {
    initialValue: this.filters.getRawValue(),
  });

  readonly transactions = computed(() => {
    const f = this.filterValues();
    let list = [...this.allTransactions()];

    if (f.accountId) {
      list = list.filter((tx) => tx.accountId === f.accountId);
    }

    if (f.period === 'month') {
      const [year, month] = (f.month || '').split('-').map(Number);
      if (year && month) {
        list = list.filter((tx) => {
          const d = tx.postedAt;
          return d.getFullYear() === year && d.getMonth() + 1 === month;
        });
      }
    }

    return this.sortTransactions(list, f.sort ?? 'date_desc');
  });

  compareIds = (a: string | null, b: string | null): boolean => a === b;

  categoryValue(tx: Transaction): string | null {
    return this.pendingCategories()[tx.id] ?? tx.categoryId;
  }

  private sortTransactions(list: Transaction[], sort: SortOption): Transaction[] {
    const sorted = [...list];
    switch (sort) {
      case 'date_asc':
        return sorted.sort((a, b) => a.postedAt.getTime() - b.postedAt.getTime());
      case 'amount_desc':
        return sorted.sort((a, b) => b.amount - a.amount);
      case 'amount_asc':
        return sorted.sort((a, b) => a.amount - b.amount);
      case 'merchant_asc':
        return sorted.sort((a, b) => a.merchant.localeCompare(b.merchant));
      case 'date_desc':
      default:
        return sorted.sort((a, b) => b.postedAt.getTime() - a.postedAt.getTime());
    }
  }

  accountName(accountId: string): string {
    return this.accounts().find((a) => a.id === accountId)?.name ?? 'Unknown';
  }

  isInbox(tx: Transaction): boolean {
    return tx.kind === 'expense' && !tx.categoryId && !tx.split?.length;
  }

  categoryName(id: string): string {
    return this.categories().find((c) => c.id === id)?.name ?? 'Unknown';
  }

  selectableCategories(tx: Transaction): Category[] {
    if (tx.kind === 'income') {
      return this.categories().filter((c) => !c.isSystem);
    }
    return this.categories().filter((c) => !c.isSystem || c.systemKey === 'refund');
  }

  openAdd(): void {
    if (!this.accounts().length) {
      alert('Create an account first (Checking, Savings, or Credit Card).');
      return;
    }
    const ref = this.dialog.open(TransactionFormDialogComponent, {
      width: '95vw',
      maxWidth: '560px',
      data: { mode: 'add', accounts: this.accounts(), categories: this.categories() },
    });
    ref.afterClosed().subscribe((result: TransactionFormResult | undefined) => {
      if (result) void this.transactionService.create(result);
    });
  }

  openEdit(tx: Transaction): void {
    const ref = this.dialog.open(TransactionFormDialogComponent, {
      width: '95vw',
      maxWidth: '560px',
      data: {
        mode: 'edit',
        accounts: this.accounts(),
        categories: this.categories(),
        transaction: tx,
      },
    });
    ref.afterClosed().subscribe((result: TransactionFormResult | undefined) => {
      if (result) void this.transactionService.update(tx.id, result);
    });
  }

  startEditMerchant(tx: Transaction): void {
    this.editingId.set(tx.id);
    this.editMerchant.set(tx.merchant);
  }

  cancelEditMerchant(): void {
    this.editingId.set(null);
    this.editMerchant.set('');
  }

  async saveMerchant(id: string): Promise<void> {
    const merchant = this.editMerchant().trim();
    if (!merchant) return;
    await this.transactionService.update(id, { merchant });
    this.cancelEditMerchant();
  }

  async updateCategory(id: string, categoryId: string | null): Promise<void> {
    this.pendingCategories.update((map) => ({ ...map, [id]: categoryId }));
    try {
      await this.transactionService.update(id, { categoryId });
    } finally {
      this.pendingCategories.update((map) => {
        const next = { ...map };
        delete next[id];
        return next;
      });
    }
  }

  async remove(id: string): Promise<void> {
    if (confirm('Delete this transaction?')) {
      await this.transactionService.remove(id);
    }
  }

  openSplit(tx: Transaction): void {
    const ref = this.dialog.open(SplitDialogComponent, {
      width: '95vw',
      maxWidth: '640px',
      data: { transaction: tx, categories: this.categories() },
    });
    ref.afterClosed().subscribe((split) => {
      if (split) {
        void this.transactionService.update(tx.id, { split, categoryId: null });
      }
    });
  }
}
