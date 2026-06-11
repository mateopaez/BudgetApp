import { CurrencyPipe, DatePipe, TitleCasePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { Account, AccountType } from '../../core/models';
import { AccountService } from '../../core/services/account.service';
import { TransactionService } from '../../core/services/transaction.service';
import { computeAccountBalance } from '../../core/utils/balance.util';

@Component({
  selector: 'app-accounts',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    CurrencyPipe,
    DatePipe,
    TitleCasePipe,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
  ],
  template: `
    <div class="space-y-6">
      <div class="page-header">
        <h1 class="page-title">Accounts</h1>
        <p class="page-subtitle">Checking, savings, and credit cards</p>
      </div>

      <mat-card class="app-card">
        <mat-card-content>
          <form class="grid gap-4 sm:grid-cols-2" [formGroup]="form" (ngSubmit)="save()">
            <mat-form-field>
              <mat-label>Name</mat-label>
              <input matInput formControlName="name" />
            </mat-form-field>
            <mat-form-field>
              <mat-label>Type</mat-label>
              <mat-select formControlName="type">
                <mat-option value="checking">Checking</mat-option>
                <mat-option value="savings">Savings</mat-option>
                <mat-option value="credit_card">Credit Card</mat-option>
              </mat-select>
            </mat-form-field>
            <mat-form-field>
              <mat-label>Opening balance</mat-label>
              <input matInput type="number" step="0.01" formControlName="openingBalance" />
            </mat-form-field>
            <mat-form-field>
              <mat-label>Opening date</mat-label>
              <input matInput type="date" formControlName="openingDate" />
            </mat-form-field>
            <div class="flex flex-wrap gap-2 sm:col-span-2">
              <button mat-flat-button color="primary" type="submit">
                {{ editingId() ? 'Update' : 'Add' }} account
              </button>
              @if (editingId()) {
                <button mat-stroked-button type="button" (click)="cancelEdit()">Cancel</button>
              }
            </div>
          </form>
        </mat-card-content>
      </mat-card>

      <div class="space-y-3">
        @for (account of accounts(); track account.id) {
          <div class="app-list-row flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span
                  class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm"
                  [class]="typeBadgeClass(account.type)"
                >
                  <mat-icon class="!text-base">{{ typeIcon(account.type) }}</mat-icon>
                </span>
                <p class="truncate font-semibold text-midnight-900">{{ account.name }}</p>
              </div>
              <p class="mt-1 text-sm text-slate-500">
                {{ account.type | titlecase }} · opened {{ account.openingDate | date: 'mediumDate' }}
              </p>
              <p
                class="text-sm font-medium"
                [class]="balanceFor(account.id) < 0 ? 'text-red-600' : 'text-brand-700'"
              >
                Balance: {{ balanceFor(account.id) | currency }}
              </p>
            </div>
            <div class="flex shrink-0 gap-1 self-end sm:self-center">
              <button mat-icon-button (click)="edit(account)" aria-label="Edit account">
                <mat-icon>edit</mat-icon>
              </button>
              <button mat-icon-button color="warn" (click)="remove(account.id)" aria-label="Delete account">
                <mat-icon>delete</mat-icon>
              </button>
            </div>
          </div>
        } @empty {
          <p class="text-sm text-slate-500">No accounts yet. Add your first account above.</p>
        }
      </div>
    </div>
  `,
})
export class AccountsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly accountService = inject(AccountService);
  private readonly transactionService = inject(TransactionService);

  readonly accounts = toSignal(this.accountService.watchAccounts(), { initialValue: [] });
  private readonly transactions = toSignal(this.transactionService.watchAllTransactions(), {
    initialValue: [],
  });

  private readonly balances = computed(() => {
    const txs = this.transactions();
    return new Map(
      this.accounts().map((account) => [account.id, computeAccountBalance(account, txs)])
    );
  });

  balanceFor(accountId: string): number {
    return this.balances().get(accountId) ?? 0;
  }
  readonly editingId = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    type: ['checking' as AccountType, Validators.required],
    openingBalance: [0, Validators.required],
    openingDate: [new Date().toISOString().slice(0, 10), Validators.required],
  });

  typeIcon(type: AccountType): string {
    switch (type) {
      case 'checking':
        return 'account_balance';
      case 'savings':
        return 'savings';
      case 'credit_card':
        return 'credit_card';
    }
  }

  typeBadgeClass(type: AccountType): string {
    switch (type) {
      case 'checking':
        return 'bg-brand-100 text-brand-700';
      case 'savings':
        return 'bg-emerald-100 text-emerald-700';
      case 'credit_card':
        return 'bg-amber-100 text-amber-700';
    }
  }

  async save(): Promise<void> {
    if (this.form.invalid) return;
    const value = this.form.getRawValue();
    const input = {
      name: value.name,
      type: value.type,
      openingBalance: value.openingBalance,
      openingDate: new Date(value.openingDate),
    };
    const id = this.editingId();
    if (id) {
      await this.accountService.update(id, input);
    } else {
      await this.accountService.create(input);
    }
    this.cancelEdit();
  }

  edit(account: Account): void {
    this.editingId.set(account.id);
    this.form.patchValue({
      name: account.name,
      type: account.type,
      openingBalance: account.openingBalance,
      openingDate: account.openingDate.toISOString().slice(0, 10),
    });
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.form.reset({
      name: '',
      type: 'checking',
      openingBalance: 0,
      openingDate: new Date().toISOString().slice(0, 10),
    });
  }

  async remove(id: string): Promise<void> {
    if (confirm('Delete this account?')) {
      await this.accountService.remove(id);
    }
  }
}
