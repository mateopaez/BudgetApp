import { CurrencyPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Category, SplitLine, Transaction } from '../../core/models';
import { roundMoney } from '../../core/utils/balance.util';

export interface SplitDialogData {
  transaction: Transaction;
  categories: Category[];
}

@Component({
  selector: 'app-split-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    CurrencyPipe,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
  ],
  template: `
    <h2 mat-dialog-title class="!text-ink">Split transaction</h2>
    <mat-dialog-content>
      <div class="mb-5 rounded-2xl border border-line bg-canvas p-4">
        <p class="text-sm font-semibold text-ink">{{ data.transaction.merchant }}</p>
        <div class="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <p class="kicker">Original</p>
            <p class="money text-lg font-semibold text-ink">{{ targetAmount | currency }}</p>
          </div>
          <div>
            <p class="kicker">Assigned</p>
            <p class="money text-lg font-semibold text-ink">{{ assignedTotal() | currency }}</p>
          </div>
          <div>
            <p class="kicker">Remaining</p>
            <p
              class="money text-lg font-semibold"
              [class]="remainingAmount() === 0 ? 'text-finance-income' : remainingAmount() < 0 ? 'text-finance-expense' : 'text-finance-warning'"
            >
              {{ remainingAmount() | currency }}
            </p>
          </div>
        </div>
        <p class="mt-3 text-xs leading-5 text-ink-muted">
          Enter positive amounts. BudgetApp saves the split with the correct expense sign.
        </p>
      </div>

      <form [formGroup]="form" class="space-y-3">
        <div formArrayName="lines" class="space-y-3">
          @for (line of lines.controls; track $index; let i = $index) {
            <div [formGroupName]="i" class="rounded-2xl border border-line bg-surface p-3">
              <div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem_auto] sm:items-start">
                <mat-form-field appearance="outline">
                  <mat-label>Category</mat-label>
                  <mat-select formControlName="categoryId">
                    @for (c of expenseCategories(); track c.id) {
                      <mat-option [value]="c.id">{{ c.name }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>

                <mat-form-field appearance="outline">
                  <mat-label>Amount</mat-label>
                  <input matInput type="number" min="0" step="0.01" formControlName="amount" />
                </mat-form-field>

                <button
                  mat-icon-button
                  type="button"
                  class="!mt-1"
                  [disabled]="lines.length <= 2"
                  [attr.aria-label]="'Remove split line ' + (i + 1)"
                  (click)="removeLine(i)"
                >
                  <mat-icon>remove_circle_outline</mat-icon>
                </button>
              </div>

              <div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                <mat-form-field appearance="outline">
                  <mat-label>Note</mat-label>
                  <input matInput formControlName="note" />
                </mat-form-field>

                <button
                  mat-stroked-button
                  type="button"
                  class="!h-14"
                  [disabled]="remainingAmount() <= 0"
                  (click)="assignRemaining(i)"
                >
                  Assign remaining
                </button>
              </div>
            </div>
          }
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button mat-stroked-button type="button" (click)="addLine()">Add line</button>
          <button mat-stroked-button type="button" (click)="splitEvenly()">Split evenly</button>
        </div>

        @if (sumError()) {
          <p class="rounded-xl border border-finance-expenseSoft bg-finance-expenseSoft px-3 py-2 text-sm text-finance-expense">
            @if (remainingAmount() > 0) {
              Assign {{ remainingAmount() | currency }} more before saving.
            } @else {
              Split is {{ overAmount() | currency }} over the original amount.
            }
          </p>
        } @else {
          <p class="rounded-xl border border-finance-incomeSoft bg-finance-incomeSoft px-3 py-2 text-sm text-finance-income">
            Fully allocated.
          </p>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-flat-button color="primary" [disabled]="form.invalid || sumError()" (click)="save()">
        Save split
      </button>
    </mat-dialog-actions>
  `,
})
export class SplitDialogComponent {
  readonly data = inject<SplitDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<SplitDialogComponent>);
  private readonly fb = inject(FormBuilder);

  readonly targetAmount = Math.abs(this.data.transaction.amount);

  readonly form = this.fb.group({
    lines: this.fb.array([this.createLine(), this.createLine()]),
  });

  get lines(): FormArray {
    return this.form.get('lines') as FormArray;
  }

  assignedTotal(): number {
    return roundMoney(
      this.lines.controls.reduce((sum, c) => sum + Math.abs(Number(c.get('amount')?.value) || 0), 0)
    );
  }

  remainingAmount(): number {
    return roundMoney(this.targetAmount - this.assignedTotal());
  }

  overAmount(): number {
    return roundMoney(Math.abs(Math.min(0, this.remainingAmount())));
  }

  expenseCategories(): Category[] {
    return this.data.categories.filter((c) => !c.isSystem);
  }

  sumError(): boolean {
    return Math.abs(this.remainingAmount()) > 0.01;
  }

  addLine(): void {
    this.lines.push(this.createLine());
  }

  removeLine(index: number): void {
    if (this.lines.length <= 2) return;
    this.lines.removeAt(index);
  }

  assignRemaining(index: number): void {
    const remaining = this.remainingAmount();
    if (remaining <= 0) return;
    const control = this.lines.at(index).get('amount');
    const current = Math.abs(Number(control?.value) || 0);
    control?.setValue(roundMoney(current + remaining));
  }

  splitEvenly(): void {
    const count = this.lines.length;
    if (!count) return;
    const base = Math.floor((this.targetAmount / count) * 100) / 100;
    let assigned = 0;
    this.lines.controls.forEach((line, index) => {
      const value = index === count - 1 ? roundMoney(this.targetAmount - assigned) : base;
      assigned = roundMoney(assigned + value);
      line.get('amount')?.setValue(value);
    });
  }

  save(): void {
    const sign = this.data.transaction.amount < 0 ? -1 : 1;
    const split: SplitLine[] = this.lines.controls.map((c) => ({
      categoryId: c.get('categoryId')!.value,
      amount: roundMoney(Math.abs(Number(c.get('amount')!.value)) * sign),
      note: c.get('note')!.value || undefined,
    }));
    this.dialogRef.close(split);
  }

  private createLine() {
    return this.fb.group({
      categoryId: ['', Validators.required],
      amount: [0, [Validators.required, Validators.min(0.01)]],
      note: [''],
    });
  }
}
