import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Category, CategoryBudget, CategoryGroup } from '../../core/models';
import { BudgetService } from '../../core/services/budget.service';
import { CategoryService } from '../../core/services/category.service';
import { OnboardingService } from '../../core/services/onboarding.service';
import { TransactionService } from '../../core/services/transaction.service';
import { roundMoney } from '../../core/utils/balance.util';
import { buildCategorySpendRows, CategorySpendRow } from '../../core/utils/budget.util';
import {
  groupCategoriesByBudgetGroup,
  resolveCategoryGroup,
} from '../../core/utils/category-group.util';
import { endOfMonth, startOfMonth } from '../../core/utils/date.util';
import { formatMonthYear, formatMoney } from '../../core/utils/format.util';
import { toLoadableSignal } from '../../core/utils/loadable-signal.util';
import { confirmDialog } from '../../shared/confirm-dialog/confirm-dialog.component';
import { ModalSheetComponent } from '../../shared/modal-sheet/modal-sheet.component';

interface BudgetRow {
  cat: Category;
  budget: CategoryBudget | null;
  spend: CategorySpendRow | null;
  spent: number;
  target: number | null;
  remaining: number | null;
  percentOfBudget: number | null;
}

interface BudgetGroupSection {
  group: CategoryGroup;
  label: string;
  tracked: BudgetRow[];
  untracked: BudgetRow[];
}

type BudgetStatus = 'On track' | 'Near limit' | 'Over' | 'Not started' | 'No target';

@Component({
  selector: 'app-budgets',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    CurrencyPipe,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatMenuModule,
    MatSnackBarModule,
    ModalSheetComponent,
  ],
  providers: [CurrencyPipe],
  template: `
    <div class="page !space-y-10">
      <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div class="page-header">
          <p class="page-kicker">Spending targets</p>
          <h1 class="page-title">Budgets</h1>
          <p class="page-subtitle">
            Monthly category targets — what you meant to spend, and how it’s going.
          </p>
        </div>
        @if (!sheetOpen() && !initialLoading()) {
          <button mat-flat-button color="primary" type="button" (click)="startAdd()">
            <mat-icon>add</mat-icon>
            {{ hasAnyBudget() ? 'Add budget' : 'Set a budget' }}
          </button>
        }
      </header>

      @if (initialLoading()) {
        <section class="empty-state animate-pulse" role="status" aria-live="polite">
          <p class="font-medium text-ink">Loading spending targets…</p>
          <p class="mt-1 text-sm text-ink-muted">Budgets and category spend will appear shortly.</p>
        </section>
      } @else if (loadError()) {
        <p class="status-banner status-banner--error" role="alert">{{ loadError() }}</p>
      } @else {
        <!-- Month selector -->
        <section class="flex items-center justify-between gap-3" aria-label="Budget month">
          <button
            mat-icon-button
            type="button"
            (click)="shiftMonth(-1)"
            aria-label="Previous month"
          >
            <mat-icon>chevron_left</mat-icon>
          </button>
          <div class="min-w-0 text-center">
            <h2 class="section-title truncate">{{ monthHeading() }}</h2>
            <p class="mt-0.5 text-sm text-ink-muted">Category spending for this calendar month</p>
          </div>
          <button
            mat-icon-button
            type="button"
            (click)="shiftMonth(1)"
            [disabled]="!canGoNext()"
            aria-label="Next month"
          >
            <mat-icon>chevron_right</mat-icon>
          </button>
        </section>

        <!-- Summary -->
        @if (hasAnyBudget()) {
          <section aria-labelledby="budget-summary-heading">
            <h2 id="budget-summary-heading" class="sr-only">Planned vs spent</h2>
            <p class="text-base leading-7 text-ink sm:text-lg">
              You’ve spent
              <span class="money font-semibold">{{ summary().spent | currency }}</span>
              of
              <span class="money font-semibold">{{ summary().planned | currency }}</span>
              planned this month.
            </p>
            <div class="mt-4">
              <div
                class="progress-track"
                role="progressbar"
                [attr.aria-valuenow]="summary().progressPct"
                aria-valuemin="0"
                aria-valuemax="100"
                [attr.aria-label]="'Overall spending progress ' + summary().progressPct + ' percent'"
              >
                <div
                  class="progress-fill"
                  [class.progress-fill--warn]="
                    summary().progressPct >= 80 && summary().progressPct < 100
                  "
                  [class.progress-fill--over]="summary().progressPct >= 100"
                  [style.width.%]="Math.min(100, summary().progressPct)"
                ></div>
              </div>
              <p class="mt-2 text-sm text-ink-muted">
                @if (summary().remaining >= 0) {
                  <span class="money">{{ summary().remaining | currency }}</span> remaining of your
                  spending targets
                } @else {
                  <span class="money">{{ Math.abs(summary().remaining) | currency }}</span> over
                  planned spending
                }
              </p>
            </div>
          </section>
        } @else {
          <section class="empty-state space-y-4">
            <h2 class="section-title">Set your first spending target</h2>
            <p class="mx-auto max-w-md text-sm leading-6 text-ink-muted">
              Pick a category and a monthly amount. You’ll see progress as expenses land.
            </p>
            <button mat-flat-button color="primary" type="button" (click)="startAdd()">
              Set a budget
            </button>
          </section>
        }

        <!-- Grouped categories -->
        @for (section of groupedSections(); track section.group) {
          <section [attr.aria-labelledby]="'group-' + section.group">
            <h2 [id]="'group-' + section.group" class="section-title">{{ section.label }}</h2>

            @if (section.tracked.length) {
              <ul class="list-shell mt-4 list-none p-0">
                @for (row of section.tracked; track row.cat.id) {
                  <li class="list-row space-y-3">
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <p class="font-medium text-ink">{{ row.cat.name }}</p>
                        <p class="mt-0.5 text-sm text-ink-muted">
                          <span class="money">{{ row.spent | currency }}</span>
                          spent of
                          <span class="money">{{ row.target | currency }}</span>
                          ·
                          @if (row.remaining != null && row.remaining < 0) {
                            <span class="money">{{ Math.abs(row.remaining) | currency }}</span> over
                          } @else if (row.remaining != null) {
                            <span class="money">{{ row.remaining | currency }}</span> left
                          }
                        </p>
                      </div>
                      <div class="flex shrink-0 items-center gap-1">
                        <span
                          class="text-xs font-medium"
                          [class.text-finance-expense]="statusLabel(row) === 'Over'"
                          [class.text-finance-warning]="statusLabel(row) === 'Near limit'"
                          [class.text-ink-muted]="
                            statusLabel(row) !== 'Over' && statusLabel(row) !== 'Near limit'
                          "
                        >
                          {{ statusLabel(row) }}
                        </span>
                        <button
                          mat-icon-button
                          type="button"
                          (click)="startEdit(row)"
                          [attr.aria-label]="'Edit budget for ' + row.cat.name"
                        >
                          <mat-icon>edit</mat-icon>
                        </button>
                        <button
                          mat-icon-button
                          type="button"
                          [matMenuTriggerFor]="budgetRowMenu"
                          (menuOpened)="menuBudgetRow.set(row)"
                          [attr.aria-label]="'More actions for ' + row.cat.name"
                        >
                          <mat-icon>more_vert</mat-icon>
                        </button>
                      </div>
                    </div>
                    @if (row.percentOfBudget != null) {
                      <div
                        class="progress-track"
                        role="progressbar"
                        [attr.aria-valuenow]="Math.min(row.percentOfBudget, 100)"
                        aria-valuemin="0"
                        aria-valuemax="100"
                        [attr.aria-label]="row.cat.name + ' progress'"
                      >
                        <div
                          class="progress-fill"
                          [class.progress-fill--warn]="
                            row.percentOfBudget >= 80 && row.percentOfBudget < 100
                          "
                          [class.progress-fill--over]="row.percentOfBudget >= 100"
                          [style.width.%]="Math.min(100, row.percentOfBudget)"
                        ></div>
                      </div>
                    }
                  </li>
                }
              </ul>
            }

            @if (section.untracked.length) {
              <div class="mt-3" [class.mt-4]="!section.tracked.length">
                <button
                  type="button"
                  class="flex w-full items-center justify-between gap-2 border-t border-line py-2.5 text-left text-sm font-medium text-ink-muted"
                  (click)="toggleUntracked(section.group)"
                  [attr.aria-expanded]="isUntrackedOpen(section.group)"
                >
                  <span>
                    {{ section.untracked.length }}
                    {{ section.untracked.length === 1 ? 'category' : 'categories' }}
                    without a target
                  </span>
                  <mat-icon class="!text-[20px]">
                    {{ isUntrackedOpen(section.group) ? 'expand_less' : 'expand_more' }}
                  </mat-icon>
                </button>
                @if (isUntrackedOpen(section.group)) {
                  <ul
                    class="list-none divide-y divide-line border-t border-line p-0"
                    aria-label="Categories without a budget"
                  >
                    @for (row of section.untracked; track row.cat.id) {
                      <li class="flex min-h-11 items-center gap-3 py-2.5">
                        <div class="min-w-0 flex-1">
                          <p class="truncate text-sm text-ink-muted">{{ row.cat.name }}</p>
                          @if (row.spent > 0) {
                            <p class="money text-xs text-ink-soft">{{ row.spent | currency }} spent</p>
                          }
                        </div>
                        <button
                          mat-stroked-button
                          type="button"
                          class="!min-h-9 !px-3 !text-sm"
                          (click)="startEdit(row)"
                        >
                          Set budget
                        </button>
                      </li>
                    }
                  </ul>
                }
              </div>
            }
          </section>
        }

        @if (!groupedSections().length) {
          <section class="empty-state">
            <p class="text-sm text-ink-muted">
              No categories yet. Add one when you set a budget, or seed defaults from Accounts.
            </p>
          </section>
        }
      }
    </div>

    <mat-menu #budgetRowMenu="matMenu">
      <button
        mat-menu-item
        type="button"
        (click)="menuBudgetRow() && archiveCategory(menuBudgetRow()!.cat)"
      >
        <mat-icon>inventory_2</mat-icon>
        <span>Archive category</span>
      </button>
    </mat-menu>

    @if (sheetOpen()) {
      <app-modal-sheet
        [title]="editingCategoryId() ? 'Edit budget' : 'Set a budget'"
        [subtitle]="sheetSubtitle()"
        [ariaLabel]="editingCategoryId() ? 'Edit budget' : 'Set a budget'"
        (closed)="cancelSheet()"
      >
        <form id="budget-form" class="space-y-5" [formGroup]="form" (ngSubmit)="save()">
          <section class="space-y-3">
            <p class="kicker">Category</p>
            <mat-form-field appearance="outline" class="w-full">
              <mat-label>Category name</mat-label>
              <input matInput formControlName="name" autocomplete="off" />
            </mat-form-field>
            <mat-form-field appearance="outline" class="w-full">
              <mat-label>Group</mat-label>
              <mat-select formControlName="group">
                <mat-option value="essentials">Essentials</mat-option>
                <mat-option value="lifestyle">Lifestyle</mat-option>
                <mat-option value="debt">Debt & obligations</mat-option>
                <mat-option value="other">Other</mat-option>
              </mat-select>
            </mat-form-field>
          </section>

          <section class="space-y-3 border-t border-line pt-4">
            <p class="kicker">Monthly target</p>
            <mat-form-field appearance="outline" class="w-full">
              <mat-label>Amount</mat-label>
              <span matTextPrefix class="pl-1 pr-1 text-ink-muted">$</span>
              <input matInput type="number" step="0.01" min="0" formControlName="amount" />
              <mat-hint>Leave at 0 to clear the target. Period is monthly.</mat-hint>
            </mat-form-field>
          </section>
        </form>

        <button modalActions mat-button type="button" (click)="cancelSheet()">Cancel</button>
        <button
          modalActions
          mat-flat-button
          color="primary"
          type="submit"
          form="budget-form"
          [disabled]="form.invalid || saving()"
        >
          {{ editingCategoryId() ? 'Save' : 'Set budget' }}
        </button>
      </app-modal-sheet>
    }
  `,
})
export class BudgetsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly categoryService = inject(CategoryService);
  private readonly budgetService = inject(BudgetService);
  private readonly transactionService = inject(TransactionService);
  private readonly onboarding = inject(OnboardingService);
  private readonly dialog = inject(MatDialog);
  private readonly currency = inject(CurrencyPipe);
  private readonly snack = inject(MatSnackBar);

  readonly Math = Math;
  readonly sheetOpen = signal(false);
  readonly editingCategoryId = signal<string | null>(null);
  readonly saving = signal(false);
  readonly openUntrackedGroups = signal<Set<CategoryGroup>>(new Set());
  readonly menuBudgetRow = signal<BudgetRow | null>(null);

  private readonly now = new Date();
  readonly selectedMonth = signal(
    new Date(this.now.getFullYear(), this.now.getMonth(), 1)
  );

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

  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    group: ['other' as CategoryGroup, Validators.required],
    amount: [0, [Validators.required, Validators.min(0)]],
  });

  readonly monthRange = computed(() => {
    const m = this.selectedMonth();
    const y = m.getFullYear();
    const month = m.getMonth() + 1;
    return {
      start: startOfMonth(y, month),
      end: endOfMonth(y, month),
      label: formatMonthYear(m),
    };
  });

  readonly monthHeading = computed(() => {
    const name = this.selectedMonth().toLocaleDateString(undefined, { month: 'long' });
    return `${name} spending plan`;
  });

  readonly canGoNext = computed(() => {
    const sel = this.selectedMonth();
    const cur = new Date(this.now.getFullYear(), this.now.getMonth(), 1);
    return sel < cur;
  });

  private readonly activeCategories = computed(() =>
    this.categories().filter((c) => !c.isSystem && !c.archivedAt)
  );

  readonly budgetRows = computed<BudgetRow[]>(() => {
    const cats = this.activeCategories();
    const spendRows = buildCategorySpendRows(
      this.transactions(),
      cats,
      this.budgets(),
      this.monthRange(),
      { includeZero: true, budgetAs: 'monthly' }
    );
    const spendById = new Map(spendRows.map((r) => [r.categoryId, r]));
    const budgetById = new Map(this.budgets().map((b) => [b.categoryId, b]));

    return cats.map((cat) => {
      const spend = spendById.get(cat.id) ?? null;
      const budget = budgetById.get(cat.id) ?? null;
      return {
        cat,
        budget,
        spend,
        spent: spend?.spent ?? 0,
        target: spend?.budgetAmount ?? null,
        remaining: spend?.remaining ?? null,
        percentOfBudget: spend?.percentOfBudget ?? null,
      };
    });
  });

  readonly hasAnyBudget = computed(() => this.budgetRows().some((r) => r.budget != null));

  readonly summary = computed(() => {
    const tracked = this.budgetRows().filter((r) => r.target != null && r.target > 0);
    const spent = roundMoney(tracked.reduce((sum, r) => sum + r.spent, 0));
    const planned = roundMoney(tracked.reduce((sum, r) => sum + (r.target ?? 0), 0));
    const remaining = roundMoney(planned - spent);
    const progressPct = planned > 0 ? Math.round((spent / planned) * 100) : 0;
    return { spent, planned, remaining, progressPct };
  });

  readonly groupedSections = computed<BudgetGroupSection[]>(() => {
    const rowsById = new Map(this.budgetRows().map((r) => [r.cat.id, r]));
    const groups = groupCategoriesByBudgetGroup(this.activeCategories());

    return groups
      .map((g) => {
        const rows = g.categories
          .map((c) => rowsById.get(c.id))
          .filter((r): r is BudgetRow => !!r);
        const tracked = rows
          .filter((r) => r.budget != null)
          .sort(
            (a, b) =>
              this.statusPriority(a) - this.statusPriority(b) ||
              b.spent - a.spent ||
              a.cat.name.localeCompare(b.cat.name)
          );
        const untracked = rows
          .filter((r) => r.budget == null)
          .sort((a, b) => b.spent - a.spent || a.cat.name.localeCompare(b.cat.name));
        return {
          group: g.group,
          label: g.label,
          tracked,
          untracked,
        };
      })
      .filter((g) => g.tracked.length > 0 || g.untracked.length > 0);
  });

  private readonly editingRow = computed(
    () => this.budgetRows().find((r) => r.cat.id === this.editingCategoryId()) ?? null
  );

  shiftMonth(delta: number): void {
    const m = this.selectedMonth();
    const next = new Date(m.getFullYear(), m.getMonth() + delta, 1);
    if (delta > 0) {
      const cur = new Date(this.now.getFullYear(), this.now.getMonth(), 1);
      if (next > cur) return;
    }
    this.selectedMonth.set(next);
  }

  statusLabel(row: BudgetRow): BudgetStatus {
    if (!row.budget || row.target == null) return 'No target';
    if (row.percentOfBudget == null) return 'Not started';
    if (row.percentOfBudget > 100) return 'Over';
    if (row.percentOfBudget >= 80) return 'Near limit';
    if (row.spent === 0) return 'Not started';
    return 'On track';
  }

  isUntrackedOpen(group: CategoryGroup): boolean {
    return this.openUntrackedGroups().has(group);
  }

  toggleUntracked(group: CategoryGroup): void {
    this.openUntrackedGroups.update((current) => {
      const next = new Set(current);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  private statusPriority(row: BudgetRow): number {
    const label = this.statusLabel(row);
    switch (label) {
      case 'Over':
        return 0;
      case 'Near limit':
        return 1;
      case 'On track':
        return 2;
      case 'Not started':
        return 3;
      default:
        return 4;
    }
  }

  sheetSubtitle(): string {
    const row = this.editingRow();
    if (!row) {
      return 'Name the category and set a monthly spending target.';
    }
    const spent = this.currency.transform(row.spent) ?? formatMoney(row.spent);
    return `${spent} spent in ${this.monthRange().label}`;
  }

  startAdd(): void {
    this.editingCategoryId.set(null);
    this.form.reset({ name: '', group: 'other', amount: 0 });
    this.sheetOpen.set(true);
  }

  startEdit(row: BudgetRow): void {
    this.editingCategoryId.set(row.cat.id);
    this.form.patchValue({
      name: row.cat.name,
      group: resolveCategoryGroup(row.cat),
      amount: row.budget?.amount ?? 0,
    });
    this.sheetOpen.set(true);
  }

  cancelSheet(): void {
    this.sheetOpen.set(false);
    this.editingCategoryId.set(null);
    this.form.reset({ name: '', group: 'other', amount: 0 });
  }

  async save(): Promise<void> {
    if (this.form.invalid || this.saving()) return;
    const { name, group, amount } = this.form.getRawValue();
    const trimmed = name.trim();
    if (!trimmed) return;

    this.saving.set(true);
    try {
      const categoryId = this.editingCategoryId();
      if (categoryId) {
        const row = this.editingRow();
        if (row) {
          const patch: { name?: string; group?: CategoryGroup } = {};
          if (trimmed !== row.cat.name) patch.name = trimmed;
          if (group !== resolveCategoryGroup(row.cat)) patch.group = group;
          if (Object.keys(patch).length) {
            await this.categoryService.update(categoryId, patch);
          }
        }
        await this.budgetService.upsert(categoryId, amount, 'monthly');
      } else {
        const newId = await this.categoryService.create(trimmed, { group });
        await this.budgetService.upsert(newId, amount, 'monthly');
      }

      this.cancelSheet();
      if (amount > 0) await this.onboarding.complete('budgets');
      this.snack.open(categoryId ? 'Budget updated.' : 'Budget set.', 'Dismiss', {
        duration: 3000,
        panelClass: ['snackbar-success'],
      });
    } catch {
      this.snack.open('Could not save budget. Try again.', 'Dismiss', { duration: 4000 });
    } finally {
      this.saving.set(false);
    }
  }

  async archiveCategory(cat: Category): Promise<void> {
    const confirmed = await confirmDialog(this.dialog, {
      title: `Archive ${cat.name}?`,
      message: 'This hides the category from budgets. Past transactions keep their category reference.',
      detail: 'You can still see historical spend in Insights and Activity.',
      confirmLabel: 'Archive',
      tone: 'danger',
    });
    if (!confirmed) return;

    try {
      await this.budgetService.remove(cat.id);
      await this.categoryService.archive(cat.id);
      this.snack.open(`${cat.name} archived.`, 'Dismiss', {
        duration: 3000,
        panelClass: ['snackbar-success'],
      });
    } catch {
      this.snack.open('Could not archive category. Try again.', 'Dismiss', { duration: 4000 });
    }
  }
}
