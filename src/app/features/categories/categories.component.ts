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
  ],
  template: `
    <div class="space-y-6">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div class="page-header">
          <h1 class="page-title">Budgets</h1>
          <p class="page-subtitle">Set monthly guardrails and keep category spending easy to understand</p>
        </div>
        @if (!showAddCategory()) {
          <button mat-flat-button color="primary" type="button" (click)="showAddCategory.set(true)">
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
          <p class="kicker">Budgeted</p>
          <p class="money mt-1 text-2xl font-semibold text-action">{{ budgetSummary().budgeted | currency }}</p>
        </div>
        <div class="metric">
          <p class="kicker">Remaining</p>
          <p
            class="money mt-1 text-2xl font-semibold"
            [class]="budgetSummary().remaining < 0 ? 'text-red-600' : 'text-emerald-700'"
          >
            {{ budgetSummary().remaining | currency }}
          </p>
        </div>
      </div>

      <mat-card class="app-card">
        <mat-card-header>
          <mat-card-title class="!text-ink">Budgets & categories</mat-card-title>
          <mat-card-subtitle>
            Rename or remove categories. Set a budget to track monthly or weekly caps. System
            categories are read-only.
          </mat-card-subtitle>
        </mat-card-header>
        <mat-card-content class="space-y-4">
          @if (showAddCategory()) {
            <form class="rounded-2xl border border-line bg-action-soft/40 p-4" [formGroup]="addForm" (ngSubmit)="addCategory()">
              <div class="mb-3">
                <p class="font-semibold text-ink">Add category</p>
                <p class="text-sm text-slate-500">Use categories for spending groups you want to review or budget.</p>
              </div>
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start">
                <mat-form-field class="flex-1">
                  <mat-label>Category name</mat-label>
                  <input matInput formControlName="name" autocomplete="off" />
                </mat-form-field>
                <div class="flex gap-2">
                  <button mat-flat-button color="primary" type="submit" class="shrink-0">Add</button>
                  <button mat-stroked-button type="button" (click)="cancelAddCategory()">Cancel</button>
                </div>
              </div>
            </form>
          }

          <ul class="m-0 list-none divide-y divide-line overflow-hidden rounded-xl border border-line p-0">
            @for (row of categoryRows(); track row.cat.id) {
              <li class="space-y-3 px-4 py-3">
                <div class="flex items-center gap-2">
                  @if (editingId() === row.cat.id) {
                    <mat-form-field class="flex-1">
                      <mat-label>Category name</mat-label>
                      <input
                        matInput
                        [value]="editName()"
                        (input)="editName.set($any($event.target).value)"
                        (keydown.enter)="saveEdit(row.cat.id)"
                        (keydown.escape)="cancelEdit()"
                      />
                    </mat-form-field>
                    <button mat-icon-button color="primary" (click)="saveEdit(row.cat.id)" aria-label="Save">
                      <mat-icon>check</mat-icon>
                    </button>
                    <button mat-icon-button (click)="cancelEdit()" aria-label="Cancel">
                      <mat-icon>close</mat-icon>
                    </button>
                  } @else {
                    <span class="min-w-0 flex-1 truncate font-medium text-ink">{{ row.cat.name }}</span>
                    @if (row.cat.isSystem) {
                      <span class="shrink-0 rounded-full bg-action-soft px-2.5 py-0.5 text-xs font-medium text-action">
                        System
                      </span>
                    } @else {
                      <button mat-icon-button (click)="startEdit(row.cat)" aria-label="Edit category">
                        <mat-icon>edit</mat-icon>
                      </button>
                      <button mat-icon-button color="warn" (click)="remove(row.cat)" aria-label="Delete category">
                        <mat-icon>delete</mat-icon>
                      </button>
                    }
                  }
                </div>

                @if (!row.cat.isSystem) {
                  @if (budgetEditingId() === row.cat.id) {
                    <form
                      class="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-start"
                      [formGroup]="budgetForm"
                      (ngSubmit)="saveBudget(row.cat.id)"
                    >
                      <mat-form-field>
                        <mat-label>Budget amount</mat-label>
                        <input matInput type="number" step="0.01" min="0" formControlName="amount" />
                      </mat-form-field>
                      <mat-form-field>
                        <mat-label>Period</mat-label>
                        <mat-select formControlName="period">
                          <mat-option value="monthly">Monthly</mat-option>
                          <mat-option value="weekly">Weekly</mat-option>
                        </mat-select>
                      </mat-form-field>
                      <button mat-flat-button color="primary" type="submit" class="!mt-1">Save</button>
                      <button mat-button type="button" class="!mt-1" (click)="cancelBudgetEdit()">Cancel</button>
                    </form>
                  } @else {
                    <div class="space-y-2">
                      <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
                        @if (row.budget) {
                          <span class="text-slate-600">
                            {{ row.spent | currency }} of {{ row.budget.amount | currency }}
                            {{ row.budget.period }}
                            @if (row.remaining != null) {
                              ·
                              <span [class]="row.remaining < 0 ? 'text-red-600 font-medium' : 'text-emerald-700'">
                                @if (row.remaining < 0) {
                                  {{ abs(row.remaining) | currency }} over
                                } @else {
                                  {{ row.remaining | currency }} left
                                }
                              </span>
                            }
                          </span>
                        } @else {
                          <span class="text-slate-500">No budget set · {{ row.spent | currency }} spent this month</span>
                        }
                        <button mat-stroked-button type="button" (click)="startBudgetEdit(row.cat, row.budget)">
                          {{ row.budget ? 'Edit budget' : 'Set budget' }}
                        </button>
                      </div>
                      @if (row.budget && row.percentOfBudget != null) {
                        <mat-progress-bar
                          mode="determinate"
                          [value]="Math.min(row.percentOfBudget, 100)"
                          [color]="row.percentOfBudget > 100 ? 'warn' : 'primary'"
                        />
                      }
                    </div>
                  }
                }
              </li>
            }
          </ul>
        </mat-card-content>
      </mat-card>
    </div>
  `,
})
export class CategoriesComponent {
  private readonly fb = inject(FormBuilder);
  private readonly categoryService = inject(CategoryService);
  private readonly budgetService = inject(BudgetService);
  private readonly transactionService = inject(TransactionService);
  private readonly dialog = inject(MatDialog);

  readonly showAddCategory = signal(false);

  readonly Math = Math;
  readonly abs = Math.abs;

  readonly categories = toSignal(this.categoryService.watchCategories(), { initialValue: [] });
  readonly budgets = toSignal(this.budgetService.watchBudgets(), { initialValue: [] });
  private readonly transactions = toSignal(this.transactionService.watchAllTransactions(), {
    initialValue: [],
  });

  readonly editingId = signal<string | null>(null);
  readonly editName = signal('');
  readonly budgetEditingId = signal<string | null>(null);

  readonly addForm = this.fb.nonNullable.group({ name: ['', Validators.required] });
  readonly budgetForm = this.fb.nonNullable.group({
    amount: [0, [Validators.required, Validators.min(0)]],
    period: ['monthly' as BudgetPeriod, Validators.required],
  });

  private readonly monthRange = resolveDateRange('this_month');

  readonly categoryRows = computed(() => {
    const spendRows = buildCategorySpendRows(
      this.transactions(),
      this.categories(),
      this.budgets(),
      this.monthRange,
      { includeZero: true, budgetAs: 'as_configured' }
    );
    const spendById = new Map(spendRows.map((r) => [r.categoryId, r]));
    const budgetById = new Map(this.budgets().map((b) => [b.categoryId, b]));

    return this.categories().map((cat) => {
      const spend = spendById.get(cat.id);
      const budget = budgetById.get(cat.id);
      return {
        cat,
        budget: budget ?? null,
        spent: spend?.spent ?? 0,
        remaining: spend?.remaining ?? null,
        percentOfBudget: spend?.percentOfBudget ?? null,
      };
    });
  });

  readonly budgetSummary = computed(() => {
    const rows = this.categoryRows().filter((row) => !row.cat.isSystem && row.budget);
    const spent = rows.reduce((sum, row) => sum + row.spent, 0);
    const budgeted = rows.reduce((sum, row) => sum + (row.budget?.amount ?? 0), 0);
    return {
      spent,
      budgeted,
      remaining: budgeted - spent,
    };
  });

  async addCategory(): Promise<void> {
    if (this.addForm.invalid) return;
    await this.categoryService.create(this.addForm.value.name!);
    this.addForm.reset({ name: '' });
    this.showAddCategory.set(false);
  }

  cancelAddCategory(): void {
    this.addForm.reset({ name: '' });
    this.showAddCategory.set(false);
  }

  startEdit(cat: Category): void {
    this.editingId.set(cat.id);
    this.editName.set(cat.name);
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.editName.set('');
  }

  async saveEdit(id: string): Promise<void> {
    const name = this.editName().trim();
    if (!name) return;
    await this.categoryService.update(id, name);
    this.cancelEdit();
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

  startBudgetEdit(cat: Category, budget: CategoryBudget | null): void {
    this.budgetEditingId.set(cat.id);
    this.budgetForm.patchValue({
      amount: budget?.amount ?? 0,
      period: budget?.period ?? 'monthly',
    });
  }

  cancelBudgetEdit(): void {
    this.budgetEditingId.set(null);
  }

  async saveBudget(categoryId: string): Promise<void> {
    if (this.budgetForm.invalid) return;
    const { amount, period } = this.budgetForm.getRawValue();
    await this.budgetService.upsert(categoryId, amount, period);
    this.cancelBudgetEdit();
  }
}
