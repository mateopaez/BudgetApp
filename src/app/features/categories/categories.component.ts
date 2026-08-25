import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatDialog } from '@angular/material/dialog';
import { BudgetPeriod, Category, CategoryBudget } from '../../core/models';
import { BudgetService } from '../../core/services/budget.service';
import { CategoryService } from '../../core/services/category.service';
import { TransactionService } from '../../core/services/transaction.service';
import { buildCategorySpendRows } from '../../core/utils/budget.util';
import { resolveDateRange } from '../../core/utils/date.util';
import { confirmDialog } from '../../shared/confirm-dialog/confirm-dialog.component';
import { ModalSheetComponent } from '../../shared/modal-sheet/modal-sheet.component';

interface CategoryBudgetRow {
  cat: Category;
  budget: CategoryBudget | null;
  spent: number;
  remaining: number | null;
  percentOfBudget: number | null;
  monthlyBudgetAmount: number | null;
}

@Component({
  selector: 'app-categories',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    CurrencyPipe,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    ModalSheetComponent,
  ],
  providers: [CurrencyPipe],
  template: `
    <div class="space-y-6">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div class="page-header">
          <h1 class="page-title">Budgets</h1>
          <p class="page-subtitle">Set spending guardrails and see what needs attention this month</p>
        </div>
        @if (!categorySheetOpen()) {
          <button mat-flat-button color="primary" type="button" (click)="startAddCategory()">
            <mat-icon>add</mat-icon>
            Add category
          </button>
        }
      </div>

      <div class="grid gap-3 sm:grid-cols-3">
        <div class="metric">
          <p class="kicker">Spent this month</p>
          <p class="money mt-1 text-2xl font-semibold text-finance-expense">{{ budgetSummary().spent | currency }}</p>
        </div>
        <div class="metric">
          <p class="kicker">Monthly target</p>
          <p class="money mt-1 text-2xl font-semibold text-action">{{ budgetSummary().budgeted | currency }}</p>
          <p class="mt-1 text-xs text-ink-muted">Weekly budgets are converted to monthly pace.</p>
        </div>
        <div class="metric">
          <p class="kicker">Remaining</p>
          <p
            class="money mt-1 text-2xl font-semibold"
            [class]="budgetSummary().remaining < 0 ? 'text-red-600' : 'text-emerald-700'"
          >
            {{ abs(budgetSummary().remaining) | currency }}
          </p>
          <p class="mt-1 text-xs text-ink-muted">
            {{ budgetSummary().remaining < 0 ? 'Over target' : 'Left this month' }}
          </p>
        </div>
      </div>

      <mat-card class="app-card">
        <mat-card-header>
          <mat-card-title class="!text-ink">Budgets & categories</mat-card-title>
          <mat-card-subtitle>
            Tap edit to rename a category or adjust its budget. System categories are read-only.
          </mat-card-subtitle>
        </mat-card-header>
        <mat-card-content class="space-y-4">
          <ul class="m-0 list-none divide-y divide-line overflow-hidden rounded-xl border border-line p-0">
            @for (row of categoryRows(); track row.cat.id) {
              <li class="space-y-3 px-4 py-3">
                <div class="flex items-center gap-2">
                  <span class="min-w-0 flex-1 truncate font-medium text-ink">{{ row.cat.name }}</span>
                  @if (row.cat.isSystem) {
                    <span class="shrink-0 rounded-full bg-action-soft px-2.5 py-0.5 text-xs font-medium text-action">
                      System
                    </span>
                  } @else {
                    <button mat-icon-button (click)="startEditCategory(row)" [attr.aria-label]="'Edit category ' + row.cat.name">
                      <mat-icon>edit</mat-icon>
                    </button>
                    <button mat-icon-button color="warn" (click)="remove(row.cat)" [attr.aria-label]="'Delete category ' + row.cat.name">
                      <mat-icon>delete</mat-icon>
                    </button>
                  }
                </div>

                @if (!row.cat.isSystem) {
                  <div class="space-y-3">
                    <div class="min-w-0 space-y-1">
                      <div class="flex flex-wrap items-center gap-2">
                        <span
                          class="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                          [class]="budgetStatusClass(row)"
                        >
                          {{ budgetStatusLabel(row) }}
                        </span>
                        @if (row.budget?.period === 'weekly') {
                          <span class="text-xs text-ink-muted">{{ row.budget?.amount | currency }}/week</span>
                        }
                      </div>

                      @if (row.monthlyBudgetAmount != null) {
                        <p class="text-sm text-slate-600">
                          <span class="font-medium text-ink">{{ row.spent | currency }}</span>
                          spent this month of
                          <span class="font-medium text-ink">{{ row.monthlyBudgetAmount | currency }}</span>
                          target
                        </p>
                        @if (row.remaining != null) {
                          <p
                            class="text-sm font-medium"
                            [class]="row.remaining < 0 ? 'text-red-600' : 'text-emerald-700'"
                          >
                            @if (row.remaining < 0) {
                              {{ abs(row.remaining) | currency }} over target
                            } @else {
                              {{ row.remaining | currency }} left this month
                            }
                          </p>
                        }
                      } @else {
                        <p class="text-sm text-slate-500">
                          {{ row.spent | currency }} spent this month · no budget set
                        </p>
                      }
                    </div>

                    @if (row.monthlyBudgetAmount != null && row.percentOfBudget != null) {
                      <div class="space-y-1">
                        <mat-progress-bar
                          mode="determinate"
                          [value]="Math.min(row.percentOfBudget, 100)"
                          [color]="row.percentOfBudget > 100 ? 'warn' : 'primary'"
                          [attr.aria-label]="budgetProgressLabel(row)"
                        />
                        <p class="text-xs text-ink-muted">
                          {{ Math.min(row.percentOfBudget, 100) }}% of target used
                        </p>
                      </div>
                    }
                  </div>
                }
              </li>
            }
          </ul>
        </mat-card-content>
      </mat-card>
    </div>

    @if (categorySheetOpen()) {
      <app-modal-sheet
        [title]="editingCategoryId() ? 'Edit category' : 'Add category'"
        [subtitle]="categorySheetSubtitle()"
        [ariaLabel]="editingCategoryId() ? 'Edit category' : 'Add category'"
        (closed)="cancelCategorySheet()"
      >
        <form id="category-form" class="space-y-5" [formGroup]="categoryForm" (ngSubmit)="saveCategory()">
          <section class="space-y-3">
            <p class="kicker">Category</p>
            <mat-form-field appearance="outline" class="w-full">
              <mat-label>Category name</mat-label>
              <input matInput formControlName="name" autocomplete="off" />
            </mat-form-field>
          </section>

          <section class="rounded-2xl border border-line bg-action-soft/40 p-4">
            <p class="kicker">Budget</p>
            <div class="mt-3 grid gap-3 sm:grid-cols-2">
              <mat-form-field appearance="outline">
                <mat-label>Budget amount</mat-label>
                <input matInput type="number" step="0.01" min="0" formControlName="amount" />
                <mat-hint>Leave at 0 to skip budgeting for now.</mat-hint>
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Period</mat-label>
                <mat-select formControlName="period">
                  <mat-option value="monthly">Monthly</mat-option>
                  <mat-option value="weekly">Weekly</mat-option>
                </mat-select>
              </mat-form-field>
            </div>
          </section>
        </form>

        <button modalActions mat-button type="button" (click)="cancelCategorySheet()">Cancel</button>
        <button
          modalActions
          mat-flat-button
          color="primary"
          type="submit"
          form="category-form"
          [disabled]="categoryForm.invalid"
        >
          {{ editingCategoryId() ? 'Save changes' : 'Add category' }}
        </button>
      </app-modal-sheet>
    }
  `,
})
export class CategoriesComponent {
  private readonly fb = inject(FormBuilder);
  private readonly categoryService = inject(CategoryService);
  private readonly budgetService = inject(BudgetService);
  private readonly transactionService = inject(TransactionService);
  private readonly dialog = inject(MatDialog);
  private readonly currency = inject(CurrencyPipe);

  readonly categorySheetOpen = signal(false);
  readonly editingCategoryId = signal<string | null>(null);

  readonly editingCategory = computed(() =>
    this.categoryRows().find((row) => row.cat.id === this.editingCategoryId()) ?? null
  );

  readonly Math = Math;
  readonly abs = Math.abs;

  readonly categories = toSignal(this.categoryService.watchCategories(), { initialValue: [] });
  readonly budgets = toSignal(this.budgetService.watchBudgets(), { initialValue: [] });
  private readonly transactions = toSignal(this.transactionService.watchAllTransactions(), {
    initialValue: [],
  });

  readonly categoryForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
    amount: [0, [Validators.required, Validators.min(0)]],
    period: ['monthly' as BudgetPeriod, Validators.required],
  });

  private readonly monthRange = resolveDateRange('this_month');

  readonly categoryRows = computed<CategoryBudgetRow[]>(() => {
    const spendRows = buildCategorySpendRows(
      this.transactions(),
      this.categories(),
      this.budgets(),
      this.monthRange,
      { includeZero: true, budgetAs: 'monthly' }
    );
    const spendById = new Map(spendRows.map((r) => [r.categoryId, r]));
    const budgetById = new Map(this.budgets().map((b) => [b.categoryId, b]));

    return this.categories()
      .map((cat) => {
        const spend = spendById.get(cat.id);
        const budget = budgetById.get(cat.id);
        return {
          cat,
          budget: budget ?? null,
          spent: spend?.spent ?? 0,
          remaining: spend?.remaining ?? null,
          percentOfBudget: spend?.percentOfBudget ?? null,
          monthlyBudgetAmount: spend?.budgetAmount ?? null,
        };
      })
      .sort((a, b) => this.budgetPriority(a) - this.budgetPriority(b) || b.spent - a.spent || a.cat.name.localeCompare(b.cat.name));
  });

  readonly budgetSummary = computed(() => {
    const rows = this.categoryRows().filter((row) => !row.cat.isSystem && row.monthlyBudgetAmount != null);
    const spent = rows.reduce((sum, row) => sum + row.spent, 0);
    const budgeted = rows.reduce((sum, row) => sum + (row.monthlyBudgetAmount ?? 0), 0);
    return {
      spent,
      budgeted,
      remaining: budgeted - spent,
    };
  });

  budgetStatusLabel(row: CategoryBudgetRow): string {
    if (!row.budget) return row.spent > 0 ? 'No budget' : 'Not tracking';
    if (row.percentOfBudget == null) return 'Budget set';
    if (row.percentOfBudget > 100) return 'Over budget';
    if (row.percentOfBudget >= 80) return 'Near limit';
    if (row.spent === 0) return 'Not started';
    return 'On track';
  }

  budgetStatusClass(row: CategoryBudgetRow): string {
    const label = this.budgetStatusLabel(row);
    switch (label) {
      case 'Over budget':
        return 'bg-red-100 text-red-700';
      case 'Near limit':
        return 'bg-amber-100 text-amber-800';
      case 'On track':
        return 'bg-emerald-100 text-emerald-700';
      case 'No budget':
        return 'bg-slate-100 text-slate-700';
      default:
        return 'bg-action-soft text-action';
    }
  }

  budgetProgressLabel(row: CategoryBudgetRow): string {
    if (row.monthlyBudgetAmount == null || row.percentOfBudget == null) {
      return `${row.cat.name} has no budget target`;
    }
    return `${row.cat.name}: ${row.spent} spent of ${row.monthlyBudgetAmount} monthly target`;
  }

  private budgetPriority(row: CategoryBudgetRow): number {
    if (row.cat.isSystem) return 5;
    if (!row.budget) return row.spent > 0 ? 3 : 4;
    if ((row.percentOfBudget ?? 0) > 100) return 0;
    if ((row.percentOfBudget ?? 0) >= 80) return 1;
    return 2;
  }

  categorySheetSubtitle(): string {
    const row = this.editingCategory();
    if (!row) {
      return 'Name the category and optionally set a monthly or weekly budget.';
    }
    const spent = this.currency.transform(row.spent) ?? String(row.spent);
    return `${spent} spent this month`;
  }

  startAddCategory(): void {
    this.editingCategoryId.set(null);
    this.resetCategoryForm();
    this.categorySheetOpen.set(true);
  }

  startEditCategory(row: CategoryBudgetRow): void {
    this.editingCategoryId.set(row.cat.id);
    this.categoryForm.patchValue({
      name: row.cat.name,
      amount: row.budget?.amount ?? 0,
      period: row.budget?.period ?? 'monthly',
    });
    this.categorySheetOpen.set(true);
  }

  cancelCategorySheet(): void {
    this.categorySheetOpen.set(false);
    this.editingCategoryId.set(null);
    this.resetCategoryForm();
  }

  async saveCategory(): Promise<void> {
    if (this.categoryForm.invalid) return;
    const { name, amount, period } = this.categoryForm.getRawValue();
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const categoryId = this.editingCategoryId();
    if (categoryId) {
      const row = this.editingCategory();
      if (row && trimmedName !== row.cat.name) {
        await this.categoryService.update(categoryId, trimmedName);
      }
      await this.budgetService.upsert(categoryId, amount, period);
    } else {
      const newId = await this.categoryService.create(trimmedName);
      await this.budgetService.upsert(newId, amount, period);
    }

    this.cancelCategorySheet();
  }

  private resetCategoryForm(): void {
    this.categoryForm.reset({ name: '', amount: 0, period: 'monthly' });
  }

  async remove(cat: Category): Promise<void> {
    const confirmed = await confirmDialog(this.dialog, {
      title: `Delete ${cat.name}?`,
      message: 'This removes the category and its budget target.',
      detail: 'Transactions that used this category keep their stored reference, so review reports after deleting categories that are already in use.',
      confirmLabel: 'Delete category',
      tone: 'danger',
    });
    if (!confirmed) return;
    await this.budgetService.remove(cat.id);
    await this.categoryService.remove(cat.id);
  }
}
