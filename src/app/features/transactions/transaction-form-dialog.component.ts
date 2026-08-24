import { Component, inject, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Account, Category, Transaction, TransactionKind } from '../../core/models';
import {
  absoluteAmountForForm,
  amountHintForKind,
  signedAmountForKind,
} from '../../core/utils/amount.util';

export interface TransactionFormDialogData {
  mode: 'add' | 'edit';
  accounts: Account[];
  categories: Category[];
  transaction?: Transaction;
}

export interface TransactionFormResult {
  accountId: string;
  postedAt: Date;
  merchant: string;
  description: string | null;
  amount: number;
  kind: TransactionKind;
  categoryId: string | null;
}

@Component({
  selector: 'app-transaction-form-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
  ],
  template: `
    <h2 mat-dialog-title class="!pb-1 !text-ink">
      {{ data.mode === 'add' ? 'Add transaction' : 'Edit transaction' }}
    </h2>

    <mat-dialog-content>
      <p class="mb-5 text-sm leading-6 text-slate-600">
        {{ dialogCopy() }}
      </p>

      <form [formGroup]="form" class="space-y-5" novalidate>
        <section class="rounded-2xl border border-line bg-action-soft/40 p-4">
          <p class="kicker">Money movement</p>
          <div class="mt-3 grid gap-3 sm:grid-cols-[1fr_1.1fr]">
            <mat-form-field appearance="outline">
              <mat-label>Amount</mat-label>
              <input
                matInput
                type="number"
                inputmode="decimal"
                step="0.01"
                min="0.01"
                formControlName="amount"
                placeholder="0.00"
              />
              <mat-hint>{{ amountHint() }}</mat-hint>
              @if (form.controls.amount.hasError('required') && form.controls.amount.touched) {
                <mat-error>Amount is required.</mat-error>
              }
              @if (form.controls.amount.hasError('min') && form.controls.amount.touched) {
                <mat-error>Enter an amount greater than $0.</mat-error>
              }
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Kind</mat-label>
              <mat-select formControlName="kind">
                <mat-option value="expense">Expense</mat-option>
                <mat-option value="income">Income</mat-option>
                <mat-option value="transfer">Transfer</mat-option>
                <mat-option value="cc_payment">Credit card payment</mat-option>
                <mat-option value="refund">Refund / credit</mat-option>
              </mat-select>
              <mat-hint>{{ kindExplanation() }}</mat-hint>
            </mat-form-field>
          </div>
        </section>

        <section class="space-y-3">
          <p class="kicker">Who and where</p>
          <mat-form-field appearance="outline">
            <mat-label>Merchant or payee</mat-label>
            <input
              matInput
              formControlName="merchant"
              placeholder="e.g. Costco, Rent, Employer"
              autocomplete="off"
            />
            <mat-hint>Use the name you expect to search for later.</mat-hint>
            @if (form.controls.merchant.hasError('required') && form.controls.merchant.touched) {
              <mat-error>Merchant or payee is required.</mat-error>
            }
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Account</mat-label>
            <mat-select formControlName="accountId">
              @for (a of data.accounts; track a.id) {
                <mat-option [value]="a.id">{{ a.name }} ({{ accountLabel(a.type) }})</mat-option>
              }
            </mat-select>
            <mat-hint>The account whose balance should change.</mat-hint>
            @if (form.controls.accountId.hasError('required') && form.controls.accountId.touched) {
              <mat-error>Choose an account.</mat-error>
            }
          </mat-form-field>

          @if (showCategory()) {
            <mat-form-field appearance="outline">
              <mat-label>Category</mat-label>
              <mat-select formControlName="categoryId">
                <mat-option [value]="null">Leave uncategorized</mat-option>
                @for (c of selectableCategories(); track c.id) {
                  <mat-option [value]="c.id">{{ c.name }}</mat-option>
                }
              </mat-select>
              <mat-hint>Categories power budgets and spending reports.</mat-hint>
            </mat-form-field>
          }
        </section>

        <section class="space-y-3">
          <p class="kicker">When and notes</p>
          <div class="grid gap-3 sm:grid-cols-2">
            <mat-form-field appearance="outline">
              <mat-label>Date</mat-label>
              <input matInput type="date" formControlName="date" />
              @if (form.controls.date.hasError('required') && form.controls.date.touched) {
                <mat-error>Date is required.</mat-error>
              }
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Time</mat-label>
              <input matInput type="time" formControlName="time" />
              <mat-hint>Optional, used for same-day ordering.</mat-hint>
            </mat-form-field>
          </div>

          <mat-form-field appearance="outline">
            <mat-label>Description (optional)</mat-label>
            <input matInput formControlName="description" placeholder="Extra notes or details" />
          </mat-form-field>
        </section>
      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end" class="!px-6 !pb-5">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-flat-button color="primary" (click)="save()">
        {{ data.mode === 'add' ? 'Add transaction' : 'Save changes' }}
      </button>
    </mat-dialog-actions>
  `,
})
export class TransactionFormDialogComponent implements OnInit {
  readonly data = inject<TransactionFormDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<TransactionFormDialogComponent>);
  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.nonNullable.group({
    accountId: ['', Validators.required],
    date: [new Date().toISOString().slice(0, 10), Validators.required],
    time: [this.currentTime()],
    merchant: ['', Validators.required],
    description: [''],
    kind: ['expense' as TransactionKind, Validators.required],
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    categoryId: [null as string | null],
  });

  ngOnInit(): void {
    if (this.data.mode === 'edit' && this.data.transaction) {
      const tx = this.data.transaction;
      this.form.patchValue({
        accountId: tx.accountId,
        date: tx.postedAt.toISOString().slice(0, 10),
        time: tx.postedAt.toTimeString().slice(0, 5),
        merchant: tx.merchant,
        description: tx.description ?? '',
        kind: tx.kind,
        amount: absoluteAmountForForm(tx.amount),
        categoryId: tx.categoryId,
      });
    } else {
      const defaultAccount =
        this.data.accounts.find((a) => a.type === 'checking') ?? this.data.accounts[0];
      if (defaultAccount) {
        this.form.patchValue({ accountId: defaultAccount.id });
      }
    }

    this.form.controls.kind.valueChanges.subscribe((kind) => {
      if (kind !== 'expense' && kind !== 'income') {
        this.form.patchValue({ categoryId: null }, { emitEvent: false });
      }
    });
  }

  dialogCopy(): string {
    if (this.data.mode === 'edit') {
      return 'Keep the amount positive here. BudgetApp applies the correct sign based on transaction kind.';
    }
    return 'Record one money movement. Use imports for bulk activity and splits for purchases that belong to multiple categories.';
  }

  amountHint(): string {
    return amountHintForKind(this.form.controls.kind.value ?? 'expense');
  }

  kindExplanation(): string {
    switch (this.form.controls.kind.value) {
      case 'expense':
        return 'Money out. Saved as a negative amount.';
      case 'income':
        return 'Money in. Saved as a positive amount.';
      case 'transfer':
        return 'Movement between accounts. Category is not used.';
      case 'cc_payment':
        return 'Payment toward a credit card. Can be hidden from spending reports.';
      case 'refund':
        return 'Credit or refund. Can offset spending in reports.';
      default:
        return '';
    }
  }

  showCategory(): boolean {
    const kind = this.form.controls.kind.value;
    return kind === 'expense' || kind === 'income';
  }

  selectableCategories(): Category[] {
    const kind = this.form.controls.kind.value;
    if (kind === 'income' || kind === 'expense') {
      return this.data.categories.filter((c) => !c.isSystem);
    }
    return [];
  }

  accountLabel(type: Account['type']): string {
    switch (type) {
      case 'checking':
        return 'Checking';
      case 'savings':
        return 'Savings';
      case 'credit_card':
        return 'Credit card';
    }
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const postedAt = new Date(`${v.date}T${v.time || '00:00'}`);
    const description = v.description.trim() || null;
    this.dialogRef.close({
      accountId: v.accountId,
      postedAt,
      merchant: v.merchant.trim(),
      description,
      amount: signedAmountForKind(Number(v.amount), v.kind),
      kind: v.kind,
      categoryId: this.showCategory() ? v.categoryId : null,
    } satisfies TransactionFormResult);
  }

  private currentTime(): string {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }
}
