import { Component, inject, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Account, Category, Transaction, TransactionKind } from '../../core/models';

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
    <h2 mat-dialog-title class="!text-midnight-900">
      {{ data.mode === 'add' ? 'Add transaction' : 'Edit transaction' }}
    </h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="grid gap-4 pt-2 sm:grid-cols-2">
        <mat-form-field appearance="outline" class="sm:col-span-2">
          <mat-label>Account</mat-label>
          <mat-select formControlName="accountId">
            @for (a of data.accounts; track a.id) {
              <mat-option [value]="a.id">{{ a.name }} ({{ a.type }})</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Date</mat-label>
          <input matInput type="date" formControlName="date" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Time</mat-label>
          <input matInput type="time" formControlName="time" />
        </mat-form-field>

        <mat-form-field appearance="outline" class="sm:col-span-2">
          <mat-label>Merchant</mat-label>
          <input matInput formControlName="merchant" placeholder="e.g. Amazon, Whole Foods, Employer" />
          <mat-hint>Store, vendor, employer, or payee</mat-hint>
        </mat-form-field>

        <mat-form-field appearance="outline" class="sm:col-span-2">
          <mat-label>Description (optional)</mat-label>
          <input matInput formControlName="description" placeholder="Extra notes or details" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Amount</mat-label>
          <input matInput type="number" step="0.01" formControlName="amount" />
          <mat-hint>Negative = expense/outflow, positive = income/credit</mat-hint>
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
        </mat-form-field>

        @if (showCategory()) {
          <mat-form-field appearance="outline" class="sm:col-span-2">
            <mat-label>Category</mat-label>
            <mat-select formControlName="categoryId">
              <mat-option [value]="null">— None —</mat-option>
              @for (c of selectableCategories(); track c.id) {
                <mat-option [value]="c.id">{{ c.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-flat-button color="primary" [disabled]="form.invalid" (click)="save()">
        {{ data.mode === 'add' ? 'Add' : 'Save' }}
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
    time: ['12:00'],
    merchant: ['', Validators.required],
    description: [''],
    amount: [0, Validators.required],
    kind: ['expense' as TransactionKind, Validators.required],
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
        amount: tx.amount,
        kind: tx.kind,
        categoryId: tx.categoryId,
      });
    } else if (this.data.accounts.length === 1) {
      this.form.patchValue({ accountId: this.data.accounts[0].id });
    }
  }

  showCategory(): boolean {
    const kind = this.form.get('kind')?.value;
    return kind === 'expense' || kind === 'income';
  }

  selectableCategories(): Category[] {
    const kind = this.form.get('kind')?.value;
    if (kind === 'income') {
      return this.data.categories.filter((c) => !c.isSystem);
    }
    if (kind === 'expense') {
      return this.data.categories.filter((c) => !c.isSystem);
    }
    return [];
  }

  save(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const postedAt = new Date(`${v.date}T${v.time || '00:00'}`);
    const description = v.description.trim() || null;
    this.dialogRef.close({
      accountId: v.accountId,
      postedAt,
      merchant: v.merchant.trim(),
      description,
      amount: v.amount,
      kind: v.kind,
      categoryId: this.showCategory() ? v.categoryId : null,
    } satisfies TransactionFormResult);
  }
}
