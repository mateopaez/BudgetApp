import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { BudgetPeriod, Category, CategoryBudget } from '../../core/models';
import { BudgetService } from '../../core/services/budget.service';
import { CategoryService } from '../../core/services/category.service';
import { TransactionService } from '../../core/services/transaction.service';
import { buildCategorySpendRows } from '../../core/utils/budget.util';
import { resolveDateRange } from '../../core/utils/date.util';
import { toLoadableSignal } from '../../core/utils/loadable-signal.util';
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

interface TrackedCategoryBudgetRow extends CategoryBudgetRow {
  budget: CategoryBudget;
}

@Component({
  selector: 'app-categories',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    CurrencyPipe,
    DatePipe,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatSnackBarModule,
    ModalSheetComponent,
  ],
  providers: [CurrencyPipe],
  template: `
    <div class="page-stack">
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

      @if (initialLoading()) {
        <section class="panel animate-pulse p-6" role="status" aria-live="polite">
          <p class="font-semibold text-ink">Loading budgets and categories…</p>
          <p class="mt-1 text-sm text-ink-muted">Your targets will appear after the first update.</p>
        </section>
      }
      @if (loadError()) {
        <p class="rounded-2xl border border-finance-expense/20 bg-finance-expenseSoft p-4 text-sm text-finance-expense" role="alert">{{ loadError() }}</p>
      }
      <div class="contents" [class.hidden]="initialLoading()">
      <section class="flex items-center gap-3 rounded-2xl border border-line bg-action-soft/50 px-4 py-3" aria-label="Budget month">
        <mat-icon class="text-action" aria-hidden="true">calendar_month</mat-icon>
        <div>
          <p class="font-semibold text-ink">{{ currentMonth() | date: 'MMMM yyyy' }}</p>
          <p class="text-sm text-ink-muted">Budgets and spending below are for the current calendar month.</p>
        </div>
      </section>

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
            [class]="budgetSummary().remaining < 0 ? 'text-finance-expense' : 'text-finance-income'"
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
        <mat-card-content class="space-y-6">
          @if (trackedRows().length) {
            <section aria-labelledby="tracked-categories-title">
              <div class="mb-3">
                <h3 id="tracked-categories-title" class="font-semibold text-ink">Tracked budgets</h3>
                <p class="text-sm text-ink-muted">Categories with an active monthly or weekly target.</p>
              </div>
              <ul class="m-0 list-none divide-y divide-line overflow-hidden rounded-xl border border-line p-0">
                @for (row of trackedRows(); track row.cat.id) {
                  <li class="space-y-3 px-4 py-3">
                    <div class="flex items-center gap-2">
                      <span class="min-w-0 flex-1 truncate font-medium text-ink">{{ row.cat.name }}</span>
                      <button mat-icon-button (click)="startEditCategory(row)" [attr.aria-label]="'Edit category ' + row.cat.name">
                        <mat-icon>edit</mat-icon>
                      </button>
                      <button mat-icon-button color="warn" (click)="remove(row.cat)" [attr.aria-label]="'Delete category ' + row.cat.name">
                        <mat-icon>delete</mat-icon>
                      </button>
                    </div>

                    <div class="min-w-0 space-y-1">
                      <div class="flex flex-wrap items-center gap-2">
                        <span class="rounded-full px-2.5 py-0.5 text-xs font-semibold" [class]="budgetStatusClass(row)">
                          {{ budgetStatusLabel(row) }}
                        </span>
                        @if (row.budget.period === 'weekly') {
                          <span class="text-xs text-ink-muted">{{ row.budget.amount | currency }}/week</span>
                        }
                      </div>
                      <p class="text-sm text-ink-muted">
                        <span class="font-medium text-ink">{{ row.spent | currency }}</span>
                        spent of
                        <span class="font-medium text-ink">{{ row.monthlyBudgetAmount | currency }}</span>
                        this month
                      </p>
                      @if (row.remaining != null) {
                        <p class="text-sm font-medium" [class]="row.remaining < 0 ? 'text-finance-expense' : 'text-finance-income'">
                          @if (row.remaining < 0) {
                            {{ abs(row.remaining) | currency }} over target
                          } @else {
                            {{ row.remaining | currency }} left this month
                          }
                        </p>
                      }
                    </div>

                    @if (row.percentOfBudget != null) {
                      <div class="space-y-1">
                        <mat-progress-bar
                          mode="determinate"
                          [value]="Math.min(row.percentOfBudget, 100)"
                          [color]="row.percentOfBudget > 100 ? 'warn' : 'primary'"
                          [attr.aria-label]="budgetProgressLabel(row)"
                        />
                        <p class="text-xs text-ink-muted">{{ Math.min(row.percentOfBudget, 100) }}% of target used</p>
                      </div>
                    }
                  </li>
                }
              </ul>
            </section>
          } @else {
            <section class="rounded-2xl border border-dashed border-action/40 bg-action-soft/40 p-5 text-center">
              <mat-icon class="!h-9 !w-9 !text-4xl text-action" aria-hidden="true">track_changes</mat-icon>
              <h3 class="mt-2 font-semibold text-ink">Set your first budget target</h3>
              <p class="mx-auto mt-1 max-w-md text-sm text-ink-muted">
                Add a category or edit an existing one, then set a monthly or weekly amount to start tracking progress.
              </p>
              <button mat-flat-button color="primary" type="button" class="!mt-4" (click)="startAddCategory()">
                Add a tracked category
              </button>
            </section>
          }

          @if (untrackedRows().length) {
            <section aria-labelledby="untracked-categories-title">
              <div class="mb-3">
                <h3 id="untracked-categories-title" class="font-semibold text-ink">Not tracked</h3>
                <p class="text-sm text-ink-muted">Compact categories without a budget target.</p>
              </div>
              <ul class="m-0 list-none divide-y divide-line overflow-hidden rounded-xl border border-line p-0">
                @for (row of untrackedRows(); track row.cat.id) {
                  <li class="flex min-h-11 items-center gap-2 px-4 py-2">
                    <span class="min-w-0 flex-1 truncate font-medium text-ink">{{ row.cat.name }}</span>
                    <span class="text-sm text-ink-muted">{{ row.spent | currency }} spent</span>
                    <button mat-icon-button (click)="startEditCategory(row)" [attr.aria-label]="'Set budget or edit ' + row.cat.name">
                      <mat-icon>edit</mat-icon>
                    </button>
                    <button mat-icon-button color="warn" (click)="remove(row.cat)" [attr.aria-label]="'Delete category ' + row.cat.name">
                      <mat-icon>delete</mat-icon>
                    </button>
                  </li>
                }
              </ul>
            </section>
          }

          @if (systemRows().length) {
            <section aria-labelledby="system-categories-title">
              <h3 id="system-categories-title" class="mb-3 font-semibold text-ink">Built-in categories</h3>
              <ul class="m-0 flex list-none flex-wrap gap-2 p-0">
                @for (row of systemRows(); track row.cat.id) {
                  <li class="inline-flex min-h-11 items-center rounded-full bg-surface-muted px-3 text-sm text-ink-muted">
                    {{ row.cat.name }} · read-only
                  </li>
                }
              </ul>
            </section>
          }
        </mat-card-content>
      </mat-card>
      </div>
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
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);

  readonly categorySheetOpen = signal(false);
  readonly editingCategoryId = signal<string | null>(null);

  readonly editingCategory = computed(() =>
    this.categoryRows().find((row) => row.cat.id === this.editingCategoryId()) ?? null
  );

  readonly Math = Math;
  readonly abs = Math.abs;
  readonly currentMonth = signal(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

  private readonly categoryState = toLoadableSignal(this.categoryService.watchCategories(), []);
  private readonly budgetState = toLoadableSignal(this.budgetService.watchBudgets(), []);
  private readonly transactionState = toLoadableSignal(
    this.transactionService.watchAllTransactions(),
    []
  );
  readonly categories = this.categoryState.value;
  readonly budgets = this.budgetState.value;
  private readonly transactions = this.transactionState.value;
  readonly initialLoading = computed(
    () =>
      this.categoryState.loading() ||
      this.budgetState.loading() ||
      this.transactionState.loading()
  );
  readonly loadError = computed(
    () =>
      this.categoryState.error() ??
      this.budgetState.error() ??
      this.transactionState.error()
  );

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
  readonly trackedRows = computed<TrackedCategoryBudgetRow[]>(() =>
    this.categoryRows().filter(
      (row): row is TrackedCategoryBudgetRow => !row.cat.isSystem && row.budget !== null
    )
  );
  readonly untrackedRows = computed(() =>
    this.categoryRows().filter((row) => !row.cat.isSystem && row.budget === null)
  );
  readonly systemRows = computed(() => this.categoryRows().filter((row) => row.cat.isSystem));

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
        return 'bg-finance-expenseSoft text-finance-expense';
      case 'Near limit':
        return 'bg-finance-warningSoft text-finance-warning';
      case 'On track':
        return 'bg-finance-incomeSoft text-finance-income';
      case 'No budget':
        return 'bg-surface-muted text-ink-muted';
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
    this.snack.open(categoryId ? 'Category and budget updated.' : 'Category added.', 'Dismiss', {
      duration: 3000,
      panelClass: ['snackbar-success'],
    });
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
    const ref = this.snack.open(
      `${cat.name} deleted. Review Activity for transactions that may now show unknown category context.`,
      'Review Activity',
      { duration: 8000 }
    );
    ref.onAction().subscribe(() => void this.router.navigate(['/transactions']));
  }
}
