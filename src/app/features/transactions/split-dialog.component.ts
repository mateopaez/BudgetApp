import { CurrencyPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Category, SplitLine, Transaction } from '../../core/models';

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
  ],
  template: `
    <h2 mat-dialog-title class="!text-ink">Split transaction</h2>
    <mat-dialog-content>
      <p class="mb-4 rounded-lg bg-action-soft px-3 py-2 text-sm text-slate-600">
        Original: {{ data.transaction.merchant }} ({{ data.transaction.amount | currency }})
      </p>
      <form [formGroup]="form" class="space-y-3">
        <div formArrayName="lines" class="space-y-3">
          @for (line of lines.controls; track $index; let i = $index) {
            <div [formGroupName]="i" class="grid gap-2 sm:grid-cols-3">
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
                <input matInput type="number" step="0.01" formControlName="amount" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Note</mat-label>
                <input matInput formControlName="note" />
              </mat-form-field>
            </div>
          }
        </div>
        <button mat-stroked-button type="button" (click)="addLine()">Add line</button>
        @if (sumError()) {
          <p class="text-sm text-red-600">Split amounts must sum to {{ data.transaction.amount | currency }}</p>
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

  readonly form = this.fb.group({
    lines: this.fb.array([this.createLine(), this.createLine()]),
  });

  get lines(): FormArray {
    return this.form.get('lines') as FormArray;
  }

  expenseCategories(): Category[] {
    return this.data.categories.filter((c) => !c.isSystem);
  }

  sumError(): boolean {
    const total = this.lines.controls.reduce(
      (sum, c) => sum + (Number(c.get('amount')?.value) || 0),
      0
    );
    return Math.abs(total - this.data.transaction.amount) > 0.01;
  }

  addLine(): void {
    this.lines.push(this.createLine());
  }

  save(): void {
    const split: SplitLine[] = this.lines.controls.map((c) => ({
      categoryId: c.get('categoryId')!.value,
      amount: Number(c.get('amount')!.value),
      note: c.get('note')!.value || undefined,
    }));
    this.dialogRef.close(split);
  }

  private createLine() {
    return this.fb.group({
      categoryId: ['', Validators.required],
      amount: [0, Validators.required],
      note: [''],
    });
  }
}
