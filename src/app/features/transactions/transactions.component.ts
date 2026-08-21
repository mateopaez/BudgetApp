import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTableModule } from '@angular/material/table';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog } from '@angular/material/dialog';
import { Category, ParsedImportRow, Transaction } from '../../core/models';
import { AccountService } from '../../core/services/account.service';
import { CategoryService } from '../../core/services/category.service';
import { ImportProgress, ImportService } from '../../core/services/import.service';
import { ImportProfileService } from '../../core/services/import-profile.service';
import { profileFromHeaders } from '../../core/import/import-profiles';
import { ImportProfileConfig, RawCsvRow } from '../../core/models/import.model';
import { TransactionService } from '../../core/services/transaction.service';
import { computeAccountBalance } from '../../core/utils/balance.util';
import { countUncategorizedExpenses } from '../../core/utils/budget.util';
import { DateRangePreset, formatDateParam, parseDateParam, resolveDateRange } from '../../core/utils/date.util';
import {
  computeNetActivity,
  computeTransactionSummary,
  filterTransactions,
  KindFilter,
  SortOption,
  transactionAmountClass,
} from '../../core/utils/transaction-filters.util';
import { SplitDialogComponent } from './split-dialog.component';
import {
  TransactionFormDialogComponent,
  TransactionFormResult,
} from './transaction-form-dialog.component';
import { ImportMapperComponent } from './import-mapper.component';

type ImportStep = 'upload' | 'map' | 'review';

@Component({
  selector: 'app-transactions',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    CurrencyPipe,
    DatePipe,
    MatCardModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatSlideToggleModule,
    MatTableModule,
    MatDatepickerModule,
    ImportMapperComponent,
  ],
  template: `
    <div class="space-y-6">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="page-header">
          <h1 class="page-title">Transactions</h1>
          <p class="page-subtitle">
            {{ transactions().length }} shown · {{ dateRange().label }}
            @if (inboxCount() > 0) {
              ·
              <button
                type="button"
                class="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 hover:bg-amber-200"
                (click)="showInbox()"
              >
                {{ inboxCount() }} in inbox
              </button>
            }
          </p>
        </div>
        <div class="flex shrink-0 flex-wrap gap-2 self-start">
          <button mat-stroked-button (click)="toggleImport()">
            <mat-icon>upload_file</mat-icon>
            Import CSV
          </button>
          <button mat-flat-button color="primary" (click)="openAdd()">
            <mat-icon>add</mat-icon>
            Add transaction
          </button>
        </div>
      </div>

      @if (showImport()) {
        <mat-card class="app-card">
          <mat-card-content class="space-y-4">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="font-medium text-midnight-900">Import CSV</p>
                <p class="mt-1 text-xs text-slate-500">
                  Map your bank's columns, preview rows, then import — parsed client-side only
                </p>
              </div>
              <button mat-icon-button aria-label="Close import" (click)="closeImport()">
                <mat-icon>close</mat-icon>
              </button>
            </div>

            <form [formGroup]="importForm">
              <mat-form-field>
                <mat-label>Account</mat-label>
                <mat-select formControlName="accountId" (selectionChange)="onImportAccountChange()">
                  @for (a of accounts(); track a.id) {
                    <mat-option [value]="a.id">{{ a.name }} ({{ a.type }})</mat-option>
                  }
                </mat-select>
              </mat-form-field>
            </form>

            @if (importStep() === 'upload') {
              <label
                class="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-brand-200 bg-brand-50 p-8 text-center transition-colors hover:border-brand-400 hover:bg-brand-100/50"
                [class.pointer-events-none]="parsing()"
                [class.opacity-60]="parsing()"
              >
                <span class="font-medium text-midnight-900">Tap to upload CSV</span>
                <span class="mt-1 text-xs text-slate-500">Raw file is not stored</span>
                <input
                  #csvInput
                  type="file"
                  accept=".csv"
                  class="hidden"
                  [disabled]="parsing()"
                  (change)="onImportFile($event)"
                />
              </label>
            }

            @if (importStep() === 'map' && csvHeaders().length) {
              <app-import-mapper
                [headers]="csvHeaders()"
                [rows]="rawCsvRows()"
                [initialProfile]="importProfile()"
                (continueImport)="onContinueMapping($event)"
              />
              <button mat-button type="button" (click)="resetImportFile()">Choose a different file</button>
            }

            @if (parsing() || importing()) {
              <div class="space-y-2">
                <div class="flex items-center justify-between text-sm text-slate-600">
                  <span>{{ importProgress().message }}</span>
                  <span>{{ importProgress().progress }}%</span>
                </div>
                <mat-progress-bar mode="determinate" [value]="importProgress().progress" />
              </div>
            } @else if (importStatus()) {
              <p class="text-sm text-slate-600">{{ importStatus() }}</p>
            }
          </mat-card-content>
        </mat-card>

        @if (importStep() === 'review' && importPreview().length) {
          <div class="app-card overflow-x-auto">
            <table mat-table [dataSource]="importPreview()" class="w-full min-w-[640px]">
              <ng-container matColumnDef="postedAt">
                <th mat-header-cell *matHeaderCellDef>Date</th>
                <td mat-cell *matCellDef="let row">{{ row.postedAt | date: 'short' }}</td>
              </ng-container>
              <ng-container matColumnDef="merchant">
                <th mat-header-cell *matHeaderCellDef>Merchant</th>
                <td mat-cell *matCellDef="let row" class="max-w-xs truncate">{{ row.merchant }}</td>
              </ng-container>
              <ng-container matColumnDef="amount">
                <th mat-header-cell *matHeaderCellDef>Amount</th>
                <td mat-cell *matCellDef="let row">{{ row.amount | currency }}</td>
              </ng-container>
              <ng-container matColumnDef="kind">
                <th mat-header-cell *matHeaderCellDef>Kind</th>
                <td mat-cell *matCellDef="let row">{{ row.kind }}</td>
              </ng-container>
              <ng-container matColumnDef="status">
                <th mat-header-cell *matHeaderCellDef>Status</th>
                <td mat-cell *matCellDef="let row">
                  <span
                    class="font-medium"
                    [class]="row.isDuplicate ? 'text-amber-600' : 'text-brand-600'"
                  >
                    {{ row.isDuplicate ? 'Duplicate (skip)' : 'New' }}
                  </span>
                </td>
              </ng-container>
              <tr mat-header-row *matHeaderRowDef="importColumns"></tr>
              <tr mat-row *matRowDef="let row; columns: importColumns"></tr>
            </table>
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <button mat-stroked-button type="button" (click)="backToMapping()">Back to mapping</button>
            <button mat-flat-button color="primary" (click)="confirmImport()" [disabled]="importing()">
              Import {{ importNewCount() }} transactions
            </button>
            <p class="text-sm text-slate-500">
              {{ importDuplicateCount() }} duplicates will be skipped
            </p>
          </div>
        }
      }

      <div class="app-card p-4" [formGroup]="filters">
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <mat-form-field>
            <mat-label>Account</mat-label>
            <mat-select formControlName="accountId">
              <mat-option value="">All accounts</mat-option>
              @for (a of accounts(); track a.id) {
                <mat-option [value]="a.id">{{ a.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-form-field>
            <mat-label>Date range</mat-label>
            <mat-select formControlName="period">
              <mat-option value="all">All time</mat-option>
              <mat-option value="this_month">This month</mat-option>
              <mat-option value="last_30_days">Last 30 days</mat-option>
              <mat-option value="last_3_months">Last 3 months</mat-option>
              <mat-option value="ytd">Year to date</mat-option>
              <mat-option value="custom">Custom range</mat-option>
            </mat-select>
          </mat-form-field>

          @if (filters.get('period')?.value === 'custom') {
            <mat-form-field class="sm:col-span-2">
              <mat-label>Custom range</mat-label>
              <mat-date-range-input [rangePicker]="rangePicker">
                <input matStartDate formControlName="from" placeholder="Start" />
                <input matEndDate formControlName="to" placeholder="End" />
              </mat-date-range-input>
              <mat-datepicker-toggle matIconSuffix [for]="rangePicker" />
              <mat-date-range-picker #rangePicker />
            </mat-form-field>
          }

          <mat-form-field>
            <mat-label>Kind</mat-label>
            <mat-select formControlName="kind">
              <mat-option value="all">All kinds</mat-option>
              <mat-option value="expense">Expenses</mat-option>
              <mat-option value="income">Income</mat-option>
              <mat-option value="transfer">Transfers</mat-option>
              <mat-option value="cc_payment">CC payments</mat-option>
              <mat-option value="refund">Refunds</mat-option>
            </mat-select>
          </mat-form-field>

          <mat-form-field>
            <mat-label>Category</mat-label>
            <mat-select formControlName="categoryId">
              <mat-option value="">All categories</mat-option>
              <mat-option value="uncategorized">Uncategorized (inbox)</mat-option>
              @for (c of userCategories(); track c.id) {
                <mat-option [value]="c.id">{{ c.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-form-field>
            <mat-label>Sort by</mat-label>
            <mat-select formControlName="sort">
              <mat-option value="date_desc">Date (newest first)</mat-option>
              <mat-option value="date_asc">Date (oldest first)</mat-option>
              <mat-option value="kind_then_date_desc">Kind, then date</mat-option>
              <mat-option value="amount_desc">Amount (high to low)</mat-option>
              <mat-option value="amount_asc">Amount (low to high)</mat-option>
              <mat-option value="merchant_asc">Merchant (A–Z)</mat-option>
            </mat-select>
          </mat-form-field>
        </div>

        <div class="mt-4 flex flex-wrap items-center gap-4 border-t border-brand-100 pt-4">
          <mat-slide-toggle formControlName="hideCcAndRefunds">
            Hide CC payments &amp; refunds
          </mat-slide-toggle>
        </div>
      </div>

      <div class="flex flex-wrap gap-3">
        <div class="rounded-xl border border-red-100 bg-red-50 px-4 py-3">
          <p class="text-xs font-medium uppercase tracking-wide text-red-700">Expenses</p>
          <p class="text-lg font-semibold text-red-600">{{ summary().expenses | currency }}</p>
        </div>
        <div class="rounded-xl border border-brand-100 bg-brand-50 px-4 py-3">
          <p class="text-xs font-medium uppercase tracking-wide text-brand-700">Income</p>
          <p class="text-lg font-semibold text-brand-600">{{ summary().income | currency }}</p>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p class="text-xs font-medium uppercase tracking-wide text-slate-500">Net (in range)</p>
          <p
            class="text-lg font-semibold"
            [class]="summary().net < 0 ? 'text-red-600' : summary().net > 0 ? 'text-brand-600' : 'text-slate-600'"
          >
            {{ summary().net | currency }}
          </p>
        </div>
        @if (selectedAccountBalance() !== null) {
          <div class="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
            <p class="text-xs font-medium uppercase tracking-wide text-emerald-700">Balance today</p>
            <p
              class="text-lg font-semibold"
              [class]="selectedAccountBalance()! < 0 ? 'text-red-600' : 'text-emerald-700'"
            >
              {{ selectedAccountBalance()! | currency }}
            </p>
          </div>
          <div class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p class="text-xs font-medium uppercase tracking-wide text-slate-500">Activity in range</p>
            <p
              class="text-lg font-semibold"
              [class]="filteredNetActivity() < 0 ? 'text-red-600' : filteredNetActivity() > 0 ? 'text-brand-600' : 'text-slate-600'"
            >
              {{ filteredNetActivity() | currency }}
            </p>
          </div>
        }
      </div>

      <div class="space-y-3">
        @for (tx of transactions(); track tx.id) {
          <div class="app-list-row">
            <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div class="min-w-0 flex-1">
                <div class="flex items-start gap-1">
                  @if (editingId() === tx.id) {
                    <mat-form-field class="min-w-0 flex-1">
                      <mat-label>Merchant</mat-label>
                      <input
                        matInput
                        [value]="editMerchant()"
                        (input)="editMerchant.set($any($event.target).value)"
                        (keydown.enter)="saveMerchant(tx.id)"
                        (keydown.escape)="cancelEditMerchant()"
                      />
                    </mat-form-field>
                    <button mat-icon-button color="primary" (click)="saveMerchant(tx.id)">
                      <mat-icon>check</mat-icon>
                    </button>
                    <button mat-icon-button (click)="cancelEditMerchant()">
                      <mat-icon>close</mat-icon>
                    </button>
                  } @else {
                    <p class="min-w-0 flex-1 font-medium text-midnight-900">{{ tx.merchant }}</p>
                    <button mat-icon-button class="shrink-0" (click)="startEditMerchant(tx)">
                      <mat-icon class="!text-base">edit</mat-icon>
                    </button>
                  }
                </div>
                @if (tx.description) {
                  <p class="mt-0.5 text-sm text-slate-500">{{ tx.description }}</p>
                }
                <p class="mt-1 text-sm text-slate-500">
                  {{ tx.postedAt | date: 'medium' }} · {{ accountName(tx.accountId) }} · {{ tx.kind }}
                  @if (isInbox(tx)) {
                    <span class="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                      Inbox
                    </span>
                  }
                </p>
                <p class="mt-1 text-lg font-semibold" [class]="amountClass(tx)">
                  {{ tx.amount | currency }}
                </p>
                @if (tx.split?.length) {
                  <ul class="mt-2 space-y-0.5 text-xs text-slate-500">
                    @for (line of tx.split; track $index) {
                      <li>{{ categoryName(line.categoryId) }}: {{ line.amount | currency }}</li>
                    }
                  </ul>
                }
              </div>

              <div class="flex w-full flex-col gap-3 lg:w-72 lg:shrink-0">
                <mat-form-field>
                  <mat-label>Category</mat-label>
                  <mat-select
                    [value]="categoryValue(tx)"
                    [compareWith]="compareIds"
                    (selectionChange)="updateCategory(tx.id, $event.value)"
                    [disabled]="tx.kind !== 'expense' && tx.kind !== 'income'"
                  >
                    <mat-option [value]="null">—</mat-option>
                    @for (c of selectableCategories(tx); track c.id) {
                      <mat-option [value]="c.id">{{ c.name }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
                <div class="flex flex-wrap gap-2">
                  <button mat-stroked-button (click)="openEdit(tx)">Edit</button>
                  @if (tx.kind === 'expense') {
                    <button mat-stroked-button (click)="openSplit(tx)">Split</button>
                  }
                  <button mat-icon-button color="warn" (click)="remove(tx.id)">
                    <mat-icon>delete</mat-icon>
                  </button>
                </div>
              </div>
            </div>
          </div>
        } @empty {
          <div class="app-card p-8 text-center">
            <p class="text-sm text-slate-500">No transactions match your filters.</p>
          </div>
        }
      </div>
    </div>
  `,
})
export class TransactionsComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly accountService = inject(AccountService);
  private readonly categoryService = inject(CategoryService);
  private readonly importService = inject(ImportService);
  private readonly importProfileService = inject(ImportProfileService);
  private readonly transactionService = inject(TransactionService);
  private readonly dialog = inject(MatDialog);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly accounts = toSignal(this.accountService.watchAccounts(), { initialValue: [] });
  readonly categories = toSignal(this.categoryService.watchCategories(), { initialValue: [] });
  private readonly allTransactions = toSignal(this.transactionService.watchAllTransactions(), {
    initialValue: [],
  });

  readonly importColumns = ['postedAt', 'merchant', 'amount', 'kind', 'status'];
  readonly importStep = signal<ImportStep>('upload');
  readonly csvHeaders = signal<string[]>([]);
  readonly rawCsvRows = signal<RawCsvRow[]>([]);
  readonly importProfile = signal<ImportProfileConfig>(profileFromHeaders([]));
  readonly showImport = signal(false);
  readonly parsing = signal(false);
  readonly importing = signal(false);
  readonly importPreview = signal<ParsedImportRow[]>([]);
  readonly importStatus = signal<string | null>(null);
  readonly importProgress = signal<ImportProgress>({
    phase: 'parsing',
    progress: 0,
    message: 'Starting…',
  });

  private resetImportState(): void {
    this.importStep.set('upload');
    this.csvHeaders.set([]);
    this.rawCsvRows.set([]);
    this.importPreview.set([]);
    this.importStatus.set(null);
    this.parsing.set(false);
    this.importing.set(false);
  }

  onImportAccountChange(): void {
    const accountId = this.importForm.value.accountId;
    if (!accountId) return;
    const saved = this.importProfileService.getLastUsedForAccount(accountId);
    if (saved && this.csvHeaders().length) {
      this.importProfile.set(saved);
    }
  }
  readonly importNewCount = computed(() => this.importPreview().filter((r) => !r.isDuplicate).length);
  readonly importDuplicateCount = computed(() =>
    this.importPreview().filter((r) => r.isDuplicate).length
  );

  readonly importForm = this.fb.nonNullable.group({
    accountId: ['', Validators.required],
  });

  readonly editingId = signal<string | null>(null);
  readonly editMerchant = signal('');
  private readonly pendingCategories = signal<Record<string, string | null>>({});

  readonly filters = this.fb.group({
    accountId: this.fb.nonNullable.control(''),
    period: this.fb.nonNullable.control<DateRangePreset>('all'),
    from: this.fb.control<Date | null>(null),
    to: this.fb.control<Date | null>(null),
    kind: this.fb.nonNullable.control<KindFilter>('all'),
    categoryId: this.fb.nonNullable.control(''),
    hideCcAndRefunds: this.fb.nonNullable.control(false),
    sort: this.fb.nonNullable.control<SortOption>('date_desc'),
  });

  private readonly filterValues = toSignal(this.filters.valueChanges, {
    initialValue: this.filters.getRawValue(),
  });

  readonly userCategories = computed(() => this.categories().filter((c) => !c.isSystem));

  readonly dateRange = computed(() => {
    const f = this.filterValues();
    return resolveDateRange(f.period ?? 'all', f.from, f.to);
  });

  readonly transactions = computed(() => {
    const f = this.filterValues();
    return filterTransactions(this.allTransactions(), this.dateRange(), {
      accountId: f.accountId ?? '',
      kind: f.kind ?? 'all',
      categoryId: f.categoryId ?? '',
      hideCcAndRefunds: !!f.hideCcAndRefunds,
      sort: f.sort ?? 'date_desc',
    });
  });

  readonly inboxCount = computed(() =>
    countUncategorizedExpenses(this.allTransactions(), this.dateRange())
  );

  readonly summary = computed(() => computeTransactionSummary(this.transactions()));

  readonly selectedAccountBalance = computed(() => {
    const accountId = this.filterValues().accountId;
    if (!accountId) return null;
    const account = this.accounts().find((a) => a.id === accountId);
    if (!account) return null;
    return computeAccountBalance(account, this.allTransactions());
  });

  readonly filteredNetActivity = computed(() => computeNetActivity(this.transactions()));

  readonly amountClass = transactionAmountClass;

  ngOnInit(): void {
    const q = this.route.snapshot.queryParamMap;
    const period = (q.get('period') as DateRangePreset | null) ?? 'all';
    const kind = (q.get('kind') as KindFilter | null) ?? 'all';

    this.filters.patchValue(
      {
        accountId: q.get('accountId') ?? '',
        period: this.isDateRangePreset(period) ? period : 'all',
        from: parseDateParam(q.get('from')),
        to: parseDateParam(q.get('to')),
        kind: this.isKindFilter(kind) ? kind : 'all',
        categoryId: q.get('categoryId') ?? '',
        hideCcAndRefunds: q.get('hideCc') === '1',
        sort: (q.get('sort') as SortOption) ?? 'date_desc',
      },
      { emitEvent: true }
    );

    this.filters.get('period')?.valueChanges.subscribe((period) => {
      if (period !== 'custom') return;
      const from = this.filters.get('from')?.value;
      const to = this.filters.get('to')?.value;
      if (from && to) return;
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 29);
      this.filters.patchValue({ from: start, to: end }, { emitEvent: true });
    });

    this.filters.valueChanges.subscribe((v) => {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: {
          accountId: v.accountId || null,
          period: v.period === 'all' ? null : v.period,
          from: v.period === 'custom' && v.from ? formatDateParam(v.from) : null,
          to: v.period === 'custom' && v.to ? formatDateParam(v.to) : null,
          kind: v.kind === 'all' ? null : v.kind,
          categoryId: v.categoryId || null,
          hideCc: v.hideCcAndRefunds ? '1' : null,
          sort: v.sort === 'date_desc' ? null : v.sort,
        },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    });
  }

  private isDateRangePreset(value: string): value is DateRangePreset {
    return ['all', 'this_month', 'last_30_days', 'last_3_months', 'ytd', 'custom'].includes(value);
  }

  private isKindFilter(value: string): value is KindFilter {
    return ['all', 'expense', 'income', 'transfer', 'cc_payment', 'refund'].includes(value);
  }

  compareIds = (a: string | null, b: string | null): boolean => a === b;

  categoryValue(tx: Transaction): string | null {
    return this.pendingCategories()[tx.id] ?? tx.categoryId;
  }

  accountName(accountId: string): string {
    return this.accounts().find((a) => a.id === accountId)?.name ?? 'Unknown';
  }

  isInbox(tx: Transaction): boolean {
    return tx.kind === 'expense' && !tx.categoryId && !tx.split?.length;
  }

  showInbox(): void {
    this.filters.patchValue({
      categoryId: 'uncategorized',
      kind: 'expense',
    });
  }

  categoryName(id: string): string {
    return this.categories().find((c) => c.id === id)?.name ?? 'Unknown';
  }

  selectableCategories(tx: Transaction): Category[] {
    if (tx.kind === 'income') {
      return this.categories().filter((c) => !c.isSystem);
    }
    return this.categories().filter((c) => !c.isSystem || c.systemKey === 'refund');
  }

  toggleImport(): void {
    this.showImport.update((open) => !open);
    if (this.showImport()) {
      this.prefillImportAccount();
    }
  }

  closeImport(): void {
    this.showImport.set(false);
    this.resetImportState();
  }

  resetImportFile(): void {
    this.importStep.set('upload');
    this.csvHeaders.set([]);
    this.rawCsvRows.set([]);
    this.importPreview.set([]);
    this.importStatus.set(null);
  }

  backToMapping(): void {
    this.importStep.set('map');
    this.importPreview.set([]);
    this.importStatus.set(null);
  }

  private prefillImportAccount(): void {
    const filterAccountId = this.filters.get('accountId')?.value;
    if (filterAccountId && this.accounts().some((a) => a.id === filterAccountId)) {
      this.importForm.patchValue({ accountId: filterAccountId });
      this.onImportAccountChange();
    } else if (this.accounts().length === 1) {
      this.importForm.patchValue({ accountId: this.accounts()[0].id });
    }
  }

  private updateImportProgress(progress: ImportProgress): void {
    this.importProgress.set(progress);
  }

  async onImportFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const accountId = this.importForm.value.accountId;
    if (!file || !accountId) {
      this.importStatus.set('Select an account first.');
      input.value = '';
      return;
    }

    this.parsing.set(true);
    this.importPreview.set([]);
    this.importStatus.set(null);
    this.updateImportProgress({ phase: 'parsing', progress: 0, message: 'Reading CSV…' });

    try {
      const parsed = await this.importService.parseCsvFile(file, (p) => this.updateImportProgress(p));
      if (!parsed.headers.length) {
        throw new Error('No column headers found in CSV.');
      }

      this.csvHeaders.set(parsed.headers);
      this.rawCsvRows.set(parsed.rows);

      const saved = this.importProfileService.getLastUsedForAccount(accountId);
      const profile = saved ?? profileFromHeaders(parsed.headers);
      this.importProfile.set(profile);
      this.importStep.set('map');
      this.importStatus.set(`${parsed.rows.length} rows loaded. Map your columns below.`);
    } catch (e: unknown) {
      this.importStatus.set(e instanceof Error ? e.message : 'Failed to parse CSV');
      this.importStep.set('upload');
    } finally {
      this.parsing.set(false);
      input.value = '';
    }
  }

  async onContinueMapping(profile: ImportProfileConfig): Promise<void> {
    const accountId = this.importForm.value.accountId;
    if (!accountId || !this.rawCsvRows().length) return;

    this.importing.set(true);
    this.importStatus.set(null);
    this.updateImportProgress({ phase: 'mapping', progress: 45, message: 'Mapping all rows…' });

    try {
      const mapped = await this.importService.mapRows(
        this.rawCsvRows(),
        accountId,
        this.categories(),
        profile,
        (p) => this.updateImportProgress(p)
      );
      this.importProfile.set(profile);
      this.importProfileService.rememberForAccount(accountId, profile);
      this.importPreview.set(mapped);
      this.importStep.set('review');
      this.importStatus.set(
        `Mapped ${mapped.length} of ${this.rawCsvRows().length} rows. Review before importing.`
      );
    } catch (e: unknown) {
      this.importStatus.set(e instanceof Error ? e.message : 'Failed to map rows');
    } finally {
      this.importing.set(false);
    }
  }

  async confirmImport(): Promise<void> {
    const accountId = this.importForm.value.accountId;
    if (!accountId || !this.importPreview().length) return;
    this.importing.set(true);
    try {
      const result = await this.transactionService.importBatch(accountId, this.importPreview());
      this.importStatus.set(`Imported ${result.imported}, skipped ${result.skipped} duplicates.`);
      this.importPreview.set([]);
      this.filters.patchValue({ accountId });
    } finally {
      this.importing.set(false);
    }
  }

  openAdd(): void {
    if (!this.accounts().length) {
      alert('Create an account first (Checking, Savings, or Credit Card).');
      return;
    }
    const ref = this.dialog.open(TransactionFormDialogComponent, {
      width: '95vw',
      maxWidth: '560px',
      data: { mode: 'add', accounts: this.accounts(), categories: this.categories() },
    });
    ref.afterClosed().subscribe((result: TransactionFormResult | undefined) => {
      if (result) void this.transactionService.create(result);
    });
  }

  openEdit(tx: Transaction): void {
    const ref = this.dialog.open(TransactionFormDialogComponent, {
      width: '95vw',
      maxWidth: '560px',
      data: {
        mode: 'edit',
        accounts: this.accounts(),
        categories: this.categories(),
        transaction: tx,
      },
    });
    ref.afterClosed().subscribe((result: TransactionFormResult | undefined) => {
      if (result) void this.transactionService.update(tx.id, result);
    });
  }

  startEditMerchant(tx: Transaction): void {
    this.editingId.set(tx.id);
    this.editMerchant.set(tx.merchant);
  }

  cancelEditMerchant(): void {
    this.editingId.set(null);
    this.editMerchant.set('');
  }

  async saveMerchant(id: string): Promise<void> {
    const merchant = this.editMerchant().trim();
    if (!merchant) return;
    await this.transactionService.update(id, { merchant });
    this.cancelEditMerchant();
  }

  async updateCategory(id: string, categoryId: string | null): Promise<void> {
    this.pendingCategories.update((map) => ({ ...map, [id]: categoryId }));
    try {
      await this.transactionService.update(id, { categoryId });
    } finally {
      this.pendingCategories.update((map) => {
        const next = { ...map };
        delete next[id];
        return next;
      });
    }
  }

  async remove(id: string): Promise<void> {
    if (confirm('Delete this transaction?')) {
      await this.transactionService.remove(id);
    }
  }

  openSplit(tx: Transaction): void {
    const ref = this.dialog.open(SplitDialogComponent, {
      width: '95vw',
      maxWidth: '640px',
      data: { transaction: tx, categories: this.categories() },
    });
    ref.afterClosed().subscribe((split) => {
      if (split) {
        void this.transactionService.update(tx.id, { split, categoryId: null });
      }
    });
  }
}
