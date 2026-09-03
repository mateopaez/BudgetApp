import { Component, computed, inject, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { startWith } from 'rxjs/operators';
import { Account, Category, Transaction, TransactionKind } from '../../core/models';
import {
  absoluteAmountForForm,
  amountHintForKind,
  signedAmountForKind,
} from '../../core/utils/amount.util';
import { formatDateParam, parseDateParam, startOfDay } from '../../core/utils/date.util';

export interface TransactionFormDialogData {
  mode: 'add' | 'edit';
  accounts: Account[];
  categories: Category[];
  transaction?: Transaction;
}

export interface TransactionFormResult {
  accountId: string;
  /** Destination / credit card for dual-leg transfer or CC payment (add mode). */
  counterpartyAccountId?: string | null;
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
      <p class="mb-5 text-sm leading-6 text-ink-muted">
        {{ dialogCopy() }}
      </p>

      <form [formGroup]="form" class="space-y-5" novalidate>
        <section class="rounded-panel border border-line bg-action-soft40 p-4">
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

          @if (needsCounterparty()) {
            <div class="grid gap-3 sm:grid-cols-2">
              <mat-form-field appearance="outline">
                <mat-label>{{ fromAccountLabel() }}</mat-label>
                <mat-select formControlName="accountId">
                  @for (a of fromAccounts(); track a.id) {
                    <mat-option [value]="a.id">{{ a.name }} ({{ accountLabel(a.type) }})</mat-option>
                  }
                </mat-select>
                @if (form.controls.accountId.hasError('required') && form.controls.accountId.touched) {
                  <mat-error>Choose an account.</mat-error>
                }
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>{{ toAccountLabel() }}</mat-label>
                <mat-select formControlName="counterpartyAccountId">
                  @for (a of toAccounts(); track a.id) {
                    <mat-option [value]="a.id">{{ a.name }} ({{ accountLabel(a.type) }})</mat-option>
                  }
                </mat-select>
                @if (
                  form.controls.counterpartyAccountId.hasError('required') &&
                  form.controls.counterpartyAccountId.touched
                ) {
                  <mat-error>Choose a destination.</mat-error>
                }
              </mat-form-field>
            </div>
            <p class="text-sm text-ink-muted">
              Both accounts update. This does not count as spending or income.
            </p>
          } @else {
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
          }

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
          <mat-form-field appearance="outline" class="w-full">
            <mat-label>Date</mat-label>
            <input matInput type="date" formControlName="date" />
            @if (form.controls.date.hasError('required') && form.controls.date.touched) {
              <mat-error>Date is required.</mat-error>
            }
          </mat-form-field>

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
    counterpartyAccountId: ['' as string],
    date: [formatDateParam(new Date()), Validators.required],
    merchant: ['', Validators.required],
    description: [''],
    kind: ['expense' as TransactionKind, Validators.required],
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    categoryId: [null as string | null],
  });

  private readonly formValues = toSignal(
    this.form.valueChanges.pipe(startWith(this.form.getRawValue())),
    { initialValue: this.form.getRawValue() }
  );

  readonly kind = computed(() => this.formValues().kind ?? 'expense');

  ngOnInit(): void {
    if (this.data.mode === 'edit' && this.data.transaction) {
      const tx = this.data.transaction;
      this.form.patchValue({
        accountId: tx.accountId,
        date: formatDateParam(tx.postedAt),
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
      const defaultCard = this.data.accounts.find((a) => a.type === 'credit_card');
      if (defaultCard) {
        this.form.patchValue({ counterpartyAccountId: defaultCard.id });
      }
    }

    this.form.controls.kind.valueChanges.subscribe((kind) => {
      if (kind !== 'expense' && kind !== 'income') {
        this.form.patchValue({ categoryId: null }, { emitEvent: false });
      }
      this.syncCounterpartyValidators(kind);
      if (kind === 'cc_payment' || kind === 'transfer') {
        this.ensureDualAccountDefaults(kind);
      }
    });

    this.syncCounterpartyValidators(this.form.controls.kind.value);
  }

  private syncCounterpartyValidators(kind: TransactionKind): void {
    const ctrl = this.form.controls.counterpartyAccountId;
    if (this.data.mode === 'add' && (kind === 'transfer' || kind === 'cc_payment')) {
      ctrl.setValidators([Validators.required]);
    } else {
      ctrl.clearValidators();
      ctrl.setValue('', { emitEvent: false });
    }
    ctrl.updateValueAndValidity({ emitEvent: false });
  }

  private ensureDualAccountDefaults(kind: TransactionKind): void {
    const cash =
      this.data.accounts.find((a) => a.type === 'checking') ??
      this.data.accounts.find((a) => a.type === 'savings');
    const card = this.data.accounts.find((a) => a.type === 'credit_card');

    if (kind === 'cc_payment') {
      if (cash && !this.form.controls.accountId.value) {
        this.form.patchValue({ accountId: cash.id }, { emitEvent: false });
      }
      if (card) {
        this.form.patchValue({ counterpartyAccountId: card.id }, { emitEvent: false });
      }
    } else if (kind === 'transfer') {
      const from = this.form.controls.accountId.value || cash?.id || '';
      this.form.patchValue({ accountId: from }, { emitEvent: false });
      const to =
        this.data.accounts.find((a) => a.id !== from && a.type !== 'credit_card') ??
        this.data.accounts.find((a) => a.id !== from);
      if (to) {
        this.form.patchValue({ counterpartyAccountId: to.id }, { emitEvent: false });
      }
    }
  }

  needsCounterparty(): boolean {
    return (
      this.data.mode === 'add' &&
      (this.kind() === 'transfer' || this.kind() === 'cc_payment')
    );
  }

  fromAccountLabel(): string {
    return this.kind() === 'cc_payment' ? 'Pay from' : 'From account';
  }

  toAccountLabel(): string {
    return this.kind() === 'cc_payment' ? 'Credit card' : 'To account';
  }

  fromAccounts(): Account[] {
    if (this.kind() === 'cc_payment') {
      return this.data.accounts.filter((a) => a.type === 'checking' || a.type === 'savings');
    }
    const toId = this.formValues().counterpartyAccountId;
    return this.data.accounts.filter((a) => a.id !== toId);
  }

  toAccounts(): Account[] {
    if (this.kind() === 'cc_payment') {
      return this.data.accounts.filter((a) => a.type === 'credit_card');
    }
    const fromId = this.formValues().accountId;
    return this.data.accounts.filter((a) => a.id !== fromId);
  }

  dialogCopy(): string {
    if (this.data.mode === 'edit') {
      return 'Keep the amount positive here. Ledger applies the correct sign based on transaction kind.';
    }
    return 'Record one money movement. Use imports for bulk activity and splits for purchases that belong to multiple categories.';
  }

  amountHint(): string {
    const kind = this.kind();
    const leg = this.needsCounterparty() ? 'from' : 'single';
    return amountHintForKind(kind, leg);
  }

  kindExplanation(): string {
    switch (this.kind()) {
      case 'expense':
        return 'Money out. Saved as a negative amount.';
      case 'income':
        return 'Money in. Saved as a positive amount.';
      case 'transfer':
        return 'Moves money between two accounts. Not counted as spending or income.';
      case 'cc_payment':
        return 'Pays a card from cash. Not counted as spending or income.';
      default:
        return '';
    }
  }

  showCategory(): boolean {
    const kind = this.kind();
    return kind === 'expense' || kind === 'income';
  }

  selectableCategories(): Category[] {
    const kind = this.kind();
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
    if (
      this.needsCounterparty() &&
      (!v.counterpartyAccountId || v.counterpartyAccountId === v.accountId)
    ) {
      this.form.controls.counterpartyAccountId.setErrors({ required: true });
      this.form.controls.counterpartyAccountId.markAsTouched();
      return;
    }

    const postedAt = parseDateParam(v.date) ?? startOfDay(new Date());
    const description = v.description.trim() || null;
    const abs = Number(v.amount);
    const leg = this.needsCounterparty() ? 'from' : 'single';

    this.dialogRef.close({
      accountId: v.accountId,
      counterpartyAccountId: this.needsCounterparty() ? v.counterpartyAccountId : null,
      postedAt,
      merchant: v.merchant.trim(),
      description,
      amount: signedAmountForKind(abs, v.kind, leg),
      kind: v.kind,
      categoryId: this.showCategory() ? v.categoryId : null,
    } satisfies TransactionFormResult);
  }
}
