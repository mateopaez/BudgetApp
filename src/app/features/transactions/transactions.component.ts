import { CurrencyPipe, DatePipe, DOCUMENT } from '@angular/common';
import { Component, computed, effect, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
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
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatMenuModule } from '@angular/material/menu';
import { fromEvent, merge } from 'rxjs';
import { Category, ParsedImportRow, Transaction } from '../../core/models';
import { AccountService } from '../../core/services/account.service';
import { CategoryService } from '../../core/services/category.service';
import { ImportProgress, ImportService } from '../../core/services/import.service';
import { ImportProfileService } from '../../core/services/import-profile.service';
import { profileFromHeaders, remapProfileToHeaders } from '../../core/import/import-profiles';
import { ImportProfileConfig, RawCsvRow } from '../../core/models/import.model';
import { TransactionService } from '../../core/services/transaction.service';
import { computeAccountBalance } from '../../core/utils/balance.util';
import { countUncategorizedExpenses } from '../../core/utils/budget.util';
import { DateRangePreset, formatDateParam, parseDateParam, resolveDateRange } from '../../core/utils/date.util';
import {
  clearOneShotQueryParams,
  OneShotQueryParam,
} from '../../core/utils/one-shot-query.util';
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
import { confirmDialog } from '../../shared/confirm-dialog/confirm-dialog.component';
import { ModalSheetComponent } from '../../shared/modal-sheet/modal-sheet.component';
import { toLoadableSignal } from '../../core/utils/loadable-signal.util';

type ImportStep = 'upload' | 'map' | 'review';
type ImportReviewFilter = 'all' | 'ready' | 'duplicates';

const IMPORT_REVIEW_PAGE_SIZE = 25;
const TRANSACTION_LIST_PAGE_SIZE = 25;

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
    MatSnackBarModule,
    MatMenuModule,
    ImportMapperComponent,
    ModalSheetComponent,
  ],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="page-header">
          <h1 class="page-title">Activity</h1>
          <p class="page-subtitle">
            Review, categorize, and import money activity ·
            {{ initialLoading() ? 'loading activity…' : transactions().length + ' shown · ' + dateRange().label }}
            @if (inboxCount() > 0) {
              ·
              <button
                type="button"
                class="rounded-full bg-finance-warningSoft px-2 py-0.5 text-xs font-semibold text-finance-warning hover:bg-finance-warningSoft"
                (click)="showInbox()"
              >
                Review {{ inboxCount() }} uncategorized
              </button>
            }
          </p>
        </div>
        <div class="flex shrink-0 flex-wrap gap-2 self-start">
          <button
            mat-stroked-button
            class="!hidden sm:!inline-flex"
            (click)="toggleImport()"
            [disabled]="initialLoading() || clearing() || importing()"
          >
            <mat-icon>upload_file</mat-icon>
            Import CSV
          </button>
          <button
            mat-stroked-button
            color="warn"
            type="button"
            (click)="clearAllTransactions()"
            [disabled]="initialLoading() || transactionCount() === 0 || clearing() || importing()"
          >
            <mat-icon>delete_sweep</mat-icon>
            {{ clearing() ? 'Clearing…' : 'Clear all' }}
          </button>
          <button
            mat-flat-button
            color="primary"
            class="!hidden sm:!inline-flex"
            (click)="openAdd()"
            [disabled]="initialLoading() || clearing() || importing()"
          >
            <mat-icon>add</mat-icon>
            Add transaction
          </button>
        </div>
      </div>

      @if (initialLoading()) {
        <section class="panel animate-pulse p-6" role="status" aria-live="polite">
          <p class="font-semibold text-ink">Loading activity…</p>
          <p class="mt-1 text-sm text-ink-muted">Waiting for transactions, accounts, and categories.</p>
        </section>
      }
      @if (loadError()) {
        <p class="rounded-2xl border border-finance-expense/20 bg-finance-expenseSoft p-4 text-sm text-finance-expense" role="alert">{{ loadError() }}</p>
      }
      <div class="contents" [class.hidden]="initialLoading()">
      @if (clearing()) {
        <div class="rounded-2xl border border-finance-warningSoft bg-finance-warningSoft p-4" role="status" aria-live="polite">
          <div class="mb-2 flex items-center justify-between gap-3">
            <div>
              <p class="font-semibold text-finance-warning">Clearing transactions…</p>
              <p class="mt-1 text-sm text-finance-warning">{{ clearProgress().message }}</p>
            </div>
            <span class="text-sm font-semibold text-finance-warning">{{ clearProgress().progress }}%</span>
          </div>
          <mat-progress-bar mode="determinate" [value]="clearProgress().progress" color="warn" aria-label="Clear transactions progress" [attr.aria-valuetext]="clearProgress().message" />
        </div>
      }

      @if (showImport()) {
        <mat-card class="app-card">
          <mat-card-content class="space-y-5">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="font-semibold text-ink">Import transactions</p>
                <p class="mt-1 max-w-2xl text-sm text-slate-500">
                  Upload a CSV, verify the column mapping, then review duplicates before anything is saved.
                </p>
              </div>
              <button
                mat-icon-button
                aria-label="Close import"
                (click)="closeImport()"
                [disabled]="parsing() || importing()"
              >
                <mat-icon>close</mat-icon>
              </button>
            </div>

            @if (!isOnline()) {
              <div
                class="rounded-2xl border-2 border-finance-warning bg-finance-warningSoft p-4 text-finance-warning"
                role="alert"
                aria-live="polite"
              >
                <p class="font-semibold">You are offline</p>
                <p class="mt-1 text-sm">
                  Duplicate checks may not include transactions saved on other devices. Re-importing
                  now can create duplicates. Reconnect before importing whenever possible.
                </p>
              </div>
            }

            @if (parsing() || importing()) {
              <div
                class="rounded-2xl border border-action/30 bg-action-soft p-5"
                role="status"
                aria-live="polite"
              >
                <div class="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p class="font-semibold text-ink">
                      @if (parsing()) {
                        Reading CSV…
                      } @else if (importStep() === 'review') {
                        Importing transactions…
                      } @else {
                        Preparing review…
                      }
                    </p>
                    <p class="mt-1 text-sm text-slate-600">{{ importProgress().message }}</p>
                  </div>
                  <span class="text-sm font-semibold text-action">{{ importProgress().progress }}%</span>
                </div>
                <mat-progress-bar mode="determinate" [value]="importProgress().progress" aria-label="Import progress" [attr.aria-valuetext]="importProgress().message" />
                <p class="mt-3 text-xs text-slate-500">
                  Keep this tab open until the import finishes.
                </p>
              </div>
            } @else {
              <div class="grid gap-2 sm:grid-cols-3" aria-label="Import steps">
                <div class="rounded-2xl border px-3 py-2" [class]="importStepClass('upload')">
                  <p class="text-xs font-semibold uppercase tracking-wide">Step 1</p>
                  <p class="text-sm font-semibold">Upload</p>
                </div>
                <div class="rounded-2xl border px-3 py-2" [class]="importStepClass('map')">
                  <p class="text-xs font-semibold uppercase tracking-wide">Step 2</p>
                  <p class="text-sm font-semibold">Map columns</p>
                </div>
                <div class="rounded-2xl border px-3 py-2" [class]="importStepClass('review')">
                  <p class="text-xs font-semibold uppercase tracking-wide">Step 3</p>
                  <p class="text-sm font-semibold">Review</p>
                </div>
              </div>

              <form [formGroup]="importForm" class="rounded-2xl border border-line bg-white p-4">
                <mat-form-field>
                  <mat-label>Import into account</mat-label>
                  <mat-select formControlName="accountId" (selectionChange)="onImportAccountChange()">
                    @for (a of accounts(); track a.id) {
                      <mat-option [value]="a.id">{{ a.name }} ({{ a.type }})</mat-option>
                    }
                  </mat-select>
                  <mat-hint>Transactions will be attached to this account.</mat-hint>
                </mat-form-field>
              </form>

              @if (importStep() === 'upload') {
                <label
                  class="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-line bg-action-soft/60 p-8 text-center transition-colors hover:border-action hover:bg-action-soft"
                  [class.pointer-events-none]="importForm.invalid"
                  [class.opacity-60]="importForm.invalid"
                >
                  <mat-icon class="!mb-2 !h-8 !w-8 !text-3xl !text-action">upload_file</mat-icon>
                  <span class="font-semibold text-ink">
                    {{ importForm.invalid ? 'Choose an account first' : 'Upload CSV file' }}
                  </span>
                  <span class="mt-1 max-w-sm text-sm text-slate-500">
                    CSV files are parsed in your browser. Only confirmed transactions are saved.
                  </span>
                  <input
                    #csvInput
                    type="file"
                    accept=".csv"
                    class="hidden"
                    [disabled]="importForm.invalid"
                    (change)="onImportFile($event)"
                  />
                </label>
              }

              @if (importStep() === 'map') {
                @if (csvHeaders().length) {
                  <app-import-mapper
                    [headers]="csvHeaders()"
                    [rows]="rawCsvRows()"
                    [initialProfile]="importProfile()"
                    (continueImport)="onContinueMapping($event)"
                  />
                  <button mat-button type="button" (click)="resetImportFile()">Choose a different file</button>
                } @else {
                  <div class="rounded-2xl border border-finance-warningSoft bg-finance-warningSoft p-4">
                    <p class="font-semibold text-finance-warning">We couldn't find column headers in this CSV.</p>
                    <p class="mt-1 text-sm text-finance-warning">
                      Make sure the first row contains labels like Date, Description, and Amount, then upload again.
                    </p>
                    <button mat-stroked-button type="button" class="!mt-3" (click)="resetImportFile()">
                      Choose a different file
                    </button>
                  </div>
                }
                @if (importStatus()) {
                  <p class="text-sm text-slate-600">{{ importStatus() }}</p>
                }
              }

              @if (importStep() === 'review' && importPreview().length) {
                <div class="space-y-4 rounded-2xl border border-line bg-white p-4">
                  <div class="grid gap-3 sm:grid-cols-3">
                    <div class="metric">
                      <p class="kicker">Rows reviewed</p>
                      <p class="money mt-1 text-2xl font-semibold text-ink">{{ importPreview().length }}</p>
                    </div>
                    <div class="metric">
                      <p class="kicker">Ready to import</p>
                      <p class="money mt-1 text-2xl font-semibold text-action">{{ importNewCount() }}</p>
                    </div>
                    <div class="metric">
                      <p class="kicker">Duplicates skipped</p>
                      <p class="money mt-1 text-2xl font-semibold text-finance-warning">{{ importDuplicateCount() }}</p>
                    </div>
                  </div>

                  <div class="flex flex-wrap items-center gap-3">
                    <button mat-stroked-button type="button" (click)="backToMapping()">Back to mapping</button>
                    <button
                      mat-flat-button
                      color="primary"
                      (click)="confirmImport()"
                      [disabled]="importNewCount() === 0"
                    >
                      Import {{ importNewCount() }} new transactions
                    </button>
                    <p class="text-sm text-slate-500" role="status" aria-live="polite">
                      {{ importDuplicateCount() }} duplicates will be skipped automatically.
                    </p>
                  </div>
                </div>

                <div class="space-y-3 rounded-2xl border border-line bg-white p-4">
                  <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div class="flex flex-wrap gap-2">
                      <button
                        mat-stroked-button
                        type="button"
                        [color]="importReviewFilter() === 'all' ? 'primary' : undefined"
                        (click)="setImportReviewFilter('all')"
                      >
                        All ({{ importPreview().length }})
                      </button>
                      <button
                        mat-stroked-button
                        type="button"
                        [color]="importReviewFilter() === 'ready' ? 'primary' : undefined"
                        (click)="setImportReviewFilter('ready')"
                      >
                        Ready ({{ importNewCount() }})
                      </button>
                      <button
                        mat-stroked-button
                        type="button"
                        [color]="importReviewFilter() === 'duplicates' ? 'primary' : undefined"
                        (click)="setImportReviewFilter('duplicates')"
                      >
                        Duplicates ({{ importDuplicateCount() }})
                      </button>
                    </div>
                    <p class="text-sm text-slate-500">
                      Showing {{ importReviewRangeLabel() }} of {{ importReviewFiltered().length }}
                    </p>
                  </div>

                  <div class="space-y-2 sm:hidden">
                    @for (row of importReviewPageRows(); track row.importHash) {
                      <div class="rounded-2xl border border-line bg-surface p-4">
                        <div class="flex items-start justify-between gap-3">
                          <div class="min-w-0">
                            <p class="truncate font-semibold text-ink">{{ row.merchant }}</p>
                            <p class="mt-1 text-xs text-ink-muted">
                              {{ row.postedAt | date: 'mediumDate' }} · {{ row.kind }}
                            </p>
                          </div>
                          <p class="money shrink-0 font-semibold" [class]="row.amount < 0 ? 'text-finance-expense' : 'text-action'">
                            {{ row.amount | currency }}
                          </p>
                        </div>
                        <p
                          class="mt-3 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold"
                          [class]="row.isDuplicate ? 'bg-finance-warningSoft text-finance-warning' : 'bg-action-soft text-action'"
                        >
                          {{ row.isDuplicate ? 'Already imported — will skip' : 'Ready to import' }}
                        </p>
                      </div>
                    }
                  </div>

                  <div class="hidden overflow-x-auto rounded-xl border border-line sm:block">
                    <table mat-table [dataSource]="importReviewPageRows()" class="w-full min-w-[640px]">
                      <ng-container matColumnDef="postedAt">
                        <th mat-header-cell *matHeaderCellDef>Date</th>
                        <td mat-cell *matCellDef="let row">{{ row.postedAt | date: 'mediumDate' }}</td>
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
                            [class]="row.isDuplicate ? 'text-finance-warning' : 'text-action'"
                          >
                            {{ row.isDuplicate ? 'Already imported — will skip' : 'Ready to import' }}
                          </span>
                        </td>
                      </ng-container>
                      <tr mat-header-row *matHeaderRowDef="importColumns"></tr>
                      <tr mat-row *matRowDef="let row; columns: importColumns"></tr>
                    </table>
                  </div>

                  <div class="flex flex-wrap items-center justify-between gap-3">
                    <p class="text-sm text-slate-500">
                      Page {{ importReviewPage() + 1 }} of {{ importReviewPageCount() }}
                    </p>
                    <div class="flex gap-2">
                      <button
                        mat-stroked-button
                        type="button"
                        [disabled]="importReviewPage() === 0"
                        (click)="prevImportReviewPage()"
                      >
                        Previous
                      </button>
                      <button
                        mat-stroked-button
                        type="button"
                        [disabled]="importReviewPage() >= importReviewPageCount() - 1"
                        (click)="nextImportReviewPage()"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>
              }

              @if (importStatus() && importStep() === 'upload') {
                <div class="rounded-2xl border border-finance-expenseSoft bg-finance-expenseSoft p-4">
                  <p class="font-semibold text-finance-expense">{{ importStatus() }}</p>
                </div>
              }
            }
          </mat-card-content>
        </mat-card>
      }

      <div class="flex items-center gap-3 sm:hidden">
        <button
          mat-stroked-button
          type="button"
          class="!inline-flex !min-h-11 !w-auto !shrink-0 !items-center !gap-2"
          (click)="mobileFiltersOpen.set(true)"
          [attr.aria-label]="'Open filters. ' + filterSummary()"
        >
          <mat-icon>tune</mat-icon>
          Filters
          @if (activeFilterCount() > 0) {
            <span class="rounded-full bg-action px-2 py-0.5 text-xs text-white">{{ activeFilterCount() }}</span>
          }
        </button>
        <p class="min-w-0 truncate text-sm text-ink-muted">{{ filterSummary() }}</p>
      </div>

      <div class="app-card hidden p-4 sm:block" [formGroup]="filters">
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <mat-form-field class="sm:col-span-2 lg:col-span-4">
            <mat-label>Search merchant or notes</mat-label>
            <input matInput formControlName="search" placeholder="e.g. Costco, rent, payroll" />
          </mat-form-field>

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

        <div class="mt-4 flex flex-wrap items-center gap-4 border-t border-line pt-4">
          <mat-slide-toggle formControlName="hideCcAndRefunds">
            Hide CC payments &amp; refunds
          </mat-slide-toggle>
        </div>
      </div>

      <div class="flex flex-wrap gap-3">
        <div class="rounded-xl border border-finance-expenseSoft bg-finance-expenseSoft px-4 py-3">
          <p class="text-xs font-medium uppercase tracking-wide text-finance-expense">Expenses</p>
          <p class="text-lg font-semibold text-finance-expense">{{ summary().expenses | currency }}</p>
        </div>
        <div class="rounded-xl border border-line bg-action-soft px-4 py-3">
          <p class="text-xs font-medium uppercase tracking-wide text-action">Income</p>
          <p class="text-lg font-semibold text-action">{{ summary().income | currency }}</p>
        </div>
        <div class="rounded-xl border border-line bg-surface px-4 py-3">
          <p class="text-xs font-medium uppercase tracking-wide text-ink-muted">Net (in range)</p>
          <p
            class="text-lg font-semibold"
            [class]="summary().net < 0 ? 'text-finance-expense' : summary().net > 0 ? 'text-action' : 'text-ink-muted'"
          >
            {{ summary().net | currency }}
          </p>
        </div>
        @if (selectedAccountBalance() !== null) {
          <div class="rounded-xl border border-finance-incomeSoft bg-finance-incomeSoft px-4 py-3">
            <p class="text-xs font-medium uppercase tracking-wide text-finance-income">Balance today</p>
            <p
              class="text-lg font-semibold"
              [class]="selectedAccountBalance()! < 0 ? 'text-finance-expense' : 'text-finance-income'"
            >
              {{ selectedAccountBalance()! | currency }}
            </p>
          </div>
          <div class="rounded-xl border border-line bg-surface-muted px-4 py-3">
            <p class="text-xs font-medium uppercase tracking-wide text-ink-muted">Activity in range</p>
            <p
              class="text-lg font-semibold"
              [class]="filteredNetActivity() < 0 ? 'text-finance-expense' : filteredNetActivity() > 0 ? 'text-action' : 'text-ink-muted'"
            >
              {{ filteredNetActivity() | currency }}
            </p>
          </div>
        }
      </div>

      <div class="list-shell">
        @if (transactions().length) {
          <div class="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
            <p class="text-sm text-slate-500" role="status" aria-live="polite">
              Showing {{ listRangeLabel() }} of {{ transactions().length }}
            </p>
            <div class="flex gap-2">
              <button
                mat-stroked-button
                type="button"
                [disabled]="listPage() === 0"
                (click)="prevListPage()"
              >
                Previous
              </button>
              <button
                mat-stroked-button
                type="button"
                [disabled]="listPage() >= listPageCount() - 1"
                (click)="nextListPage()"
              >
                Next
              </button>
            </div>
          </div>
        }

        @for (tx of pagedTransactions(); track tx.id) {
          <div
            class="list-row transition-colors hover:bg-action-soft/30"
            [class.bg-finance-warningSoft]="isInbox(tx)"
          >
            <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_15rem_7rem_auto] lg:items-center">
              <div class="min-w-0">
                <div class="flex min-w-0 items-start gap-2">
                  <span
                    class="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm"
                    [class]="kindBadgeClass(tx)"
                    aria-hidden="true"
                  >
                    <mat-icon class="!text-base">{{ kindIcon(tx) }}</mat-icon>
                  </span>

                  <div class="min-w-0 flex-1">
                    @if (editingId() === tx.id) {
                      <div class="flex items-start gap-1">
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
                        <button mat-icon-button color="primary" (click)="saveMerchant(tx.id)" aria-label="Save merchant">
                          <mat-icon>check</mat-icon>
                        </button>
                        <button mat-icon-button (click)="cancelEditMerchant()" aria-label="Cancel merchant edit">
                          <mat-icon>close</mat-icon>
                        </button>
                      </div>
                    } @else {
                      <div class="flex min-w-0 items-center gap-2">
                        <p class="min-w-0 truncate font-semibold text-ink">{{ tx.merchant }}</p>
                        @if (isInbox(tx)) {
                          <span class="shrink-0 rounded-full bg-finance-warningSoft px-2 py-0.5 text-xs font-medium text-finance-warning">
                            Review
                          </span>
                        }
                      </div>
                    }

                    <p class="mt-0.5 truncate text-sm text-ink-muted">
                      {{ tx.postedAt | date: 'mediumDate' }} · {{ accountName(tx.accountId) }} · {{ kindLabel(tx) }}
                    </p>
                    @if (tx.description) {
                      <p class="mt-0.5 truncate text-sm text-slate-500">{{ tx.description }}</p>
                    }
                    @if (tx.split?.length) {
                      <p class="mt-1 text-xs font-medium text-action">Split across {{ tx.split!.length }} categories</p>
                    }
                  </div>
                </div>
              </div>

              <div class="lg:justify-self-stretch">
                @if (tx.kind === 'expense' || tx.kind === 'income') {
                  <button
                    mat-stroked-button
                    type="button"
                    class="!flex !min-h-11 !w-full !justify-between sm:!hidden"
                    (click)="openMobileCategory(tx)"
                    [disabled]="isCategoryPending(tx.id)"
                    [attr.aria-label]="'Categorize ' + tx.merchant + '. Current category: ' + transactionCategoryName(tx)"
                  >
                    <span class="truncate">{{ isCategoryPending(tx.id) ? 'Saving…' : transactionCategoryName(tx) }}</span>
                    <mat-icon>sell</mat-icon>
                  </button>
                  <mat-form-field class="compact-field !hidden sm:!block">
                    <mat-label>Category</mat-label>
                    <mat-select
                      [value]="categoryValue(tx)"
                      [compareWith]="compareIds"
                      (selectionChange)="updateCategory(tx.id, $event.value)"
                      [disabled]="isCategoryPending(tx.id)"
                    >
                      <mat-option [value]="null">Uncategorized</mat-option>
                      @for (c of selectableCategories(tx); track c.id) {
                        <mat-option [value]="c.id">{{ c.name }}</mat-option>
                      }
                    </mat-select>
                    @if (isCategoryPending(tx.id)) {
                      <mat-hint>Saving…</mat-hint>
                    }
                  </mat-form-field>
                } @else {
                  <span class="inline-flex min-h-11 items-center rounded-xl border border-line bg-surface-muted px-3 text-sm text-ink-muted">
                    No category
                  </span>
                }
              </div>

              <p class="money text-left text-lg font-semibold lg:text-right" [class]="amountClass(tx)">
                {{ tx.amount | currency }}
              </p>

              <div class="hidden items-center gap-1 sm:flex lg:justify-end">
                @if (editingId() !== tx.id) {
                  <button mat-icon-button (click)="startEditMerchant(tx)" [attr.aria-label]="'Rename ' + tx.merchant">
                    <mat-icon>drive_file_rename_outline</mat-icon>
                  </button>
                }
                <button mat-icon-button (click)="openEdit(tx)" [attr.aria-label]="'Edit ' + tx.merchant">
                  <mat-icon>edit</mat-icon>
                </button>
                @if (tx.kind === 'expense') {
                  <button mat-icon-button (click)="openSplit(tx)" [attr.aria-label]="'Split ' + tx.merchant">
                    <mat-icon>call_split</mat-icon>
                  </button>
                }
                <button mat-icon-button color="warn" (click)="remove(tx.id)" [attr.aria-label]="'Delete ' + tx.merchant">
                  <mat-icon>delete</mat-icon>
                </button>
              </div>
              <div class="flex justify-end sm:hidden">
                <button
                  mat-icon-button
                  type="button"
                  [matMenuTriggerFor]="transactionMenu"
                  [attr.aria-label]="'More actions for ' + tx.merchant"
                >
                  <mat-icon>more_vert</mat-icon>
                </button>
                <mat-menu #transactionMenu="matMenu">
                  @if (editingId() !== tx.id) {
                    <button mat-menu-item type="button" (click)="startEditMerchant(tx)">
                      <mat-icon>drive_file_rename_outline</mat-icon>
                      <span>Rename</span>
                    </button>
                  }
                  <button mat-menu-item type="button" (click)="openEdit(tx)">
                    <mat-icon>edit</mat-icon>
                    <span>Edit details</span>
                  </button>
                  @if (tx.kind === 'expense') {
                    <button mat-menu-item type="button" (click)="openSplit(tx)">
                      <mat-icon>call_split</mat-icon>
                      <span>Split transaction</span>
                    </button>
                  }
                  <button mat-menu-item type="button" (click)="remove(tx.id)">
                    <mat-icon color="warn">delete</mat-icon>
                    <span>Delete</span>
                  </button>
                </mat-menu>
              </div>
            </div>
          </div>
        } @empty {
          <div class="panel m-0 rounded-none border-0 p-8 text-center shadow-none">
            <p class="font-semibold text-ink">{{ emptyStateTitle() }}</p>
            <p class="mx-auto mt-1 max-w-md text-sm text-ink-muted">{{ emptyStateBody() }}</p>
            <div class="mt-4 flex flex-wrap justify-center gap-2">
              @if (hasActiveFilters()) {
                <button mat-stroked-button (click)="clearFilters()">Clear filters</button>
              }
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
        }

        @if (transactions().length > transactionListPageSize) {
          <div class="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
            <p class="text-sm text-slate-500">
              Page {{ listPage() + 1 }} of {{ listPageCount() }}
            </p>
            <div class="flex gap-2">
              <button
                mat-stroked-button
                type="button"
                [disabled]="listPage() === 0"
                (click)="prevListPage()"
              >
                Previous
              </button>
              <button
                mat-stroked-button
                type="button"
                [disabled]="listPage() >= listPageCount() - 1"
                (click)="nextListPage()"
              >
                Next
              </button>
            </div>
          </div>
        }
      </div>
      </div>
    </div>

    @if (mobileFiltersOpen()) {
      <app-modal-sheet
        title="Filters"
        [subtitle]="filterSummary()"
        ariaLabel="Activity filters"
        (closed)="mobileFiltersOpen.set(false)"
      >
        <form id="mobile-filter-form" class="grid gap-3" [formGroup]="filters">
          <mat-form-field>
            <mat-label>Search merchant or notes</mat-label>
            <input matInput formControlName="search" placeholder="e.g. Costco, rent, payroll" />
          </mat-form-field>
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
            <mat-form-field>
              <mat-label>Custom range</mat-label>
              <mat-date-range-input [rangePicker]="mobileRangePicker">
                <input matStartDate formControlName="from" placeholder="Start" />
                <input matEndDate formControlName="to" placeholder="End" />
              </mat-date-range-input>
              <mat-datepicker-toggle matIconSuffix [for]="mobileRangePicker" />
              <mat-date-range-picker #mobileRangePicker />
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
          <mat-slide-toggle formControlName="hideCcAndRefunds">Hide CC payments &amp; refunds</mat-slide-toggle>
        </form>
        <button modalActions mat-button type="button" (click)="clearFilters()">Reset</button>
        <button modalActions mat-flat-button color="primary" type="button" (click)="mobileFiltersOpen.set(false)">Show results</button>
      </app-modal-sheet>
    }

    @if (mobileCategoryTransaction(); as tx) {
      <app-modal-sheet
        title="Choose category"
        [subtitle]="tx.merchant"
        [ariaLabel]="'Categorize ' + tx.merchant"
        (closed)="mobileCategoryTransaction.set(null)"
      >
        <div class="grid gap-2">
          <button
            mat-stroked-button
            type="button"
            class="!min-h-11 !justify-start"
            [color]="categoryValue(tx) === null ? 'primary' : undefined"
            (click)="chooseMobileCategory(tx, null)"
          >
            Uncategorized
          </button>
          @for (category of selectableCategories(tx); track category.id) {
            <button
              mat-stroked-button
              type="button"
              class="!min-h-11 !justify-start"
              [color]="categoryValue(tx) === category.id ? 'primary' : undefined"
              (click)="chooseMobileCategory(tx, category.id)"
            >
              {{ category.name }}
            </button>
          }
        </div>
        <button modalActions mat-button type="button" (click)="mobileCategoryTransaction.set(null)">Cancel</button>
      </app-modal-sheet>
    }
  `,
})
export class TransactionsComponent implements OnInit {
  readonly transactionListPageSize = TRANSACTION_LIST_PAGE_SIZE;

  private readonly fb = inject(FormBuilder);
  private readonly accountService = inject(AccountService);
  private readonly categoryService = inject(CategoryService);
  private readonly importService = inject(ImportService);
  private readonly importProfileService = inject(ImportProfileService);
  private readonly transactionService = inject(TransactionService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly window = inject(DOCUMENT).defaultView;
  readonly isOnline = signal(this.window?.navigator.onLine ?? true);

  private readonly accountState = toLoadableSignal(this.accountService.watchAccounts(), []);
  private readonly categoryState = toLoadableSignal(this.categoryService.watchCategories(), []);
  private readonly transactionState = toLoadableSignal(
    this.transactionService.watchAllTransactions(),
    []
  );
  readonly accounts = this.accountState.value;
  readonly categories = this.categoryState.value;
  private readonly allTransactions = this.transactionState.value;
  readonly initialLoading = computed(
    () =>
      this.accountState.loading() ||
      this.categoryState.loading() ||
      this.transactionState.loading()
  );
  readonly loadError = computed(
    () =>
      this.accountState.error() ??
      this.categoryState.error() ??
      this.transactionState.error()
  );
  readonly transactionCount = computed(() => this.allTransactions().length);

  readonly importColumns = ['postedAt', 'merchant', 'amount', 'kind', 'status'];
  readonly importStep = signal<ImportStep>('upload');
  readonly csvHeaders = signal<string[]>([]);
  readonly rawCsvRows = signal<RawCsvRow[]>([]);
  readonly importProfile = signal<ImportProfileConfig>(profileFromHeaders([]));
  readonly showImport = signal(false);
  readonly parsing = signal(false);
  readonly importing = signal(false);
  readonly clearing = signal(false);
  readonly importPreview = signal<ParsedImportRow[]>([]);
  readonly importReviewFilter = signal<ImportReviewFilter>('all');
  readonly importReviewPage = signal(0);
  readonly importStatus = signal<string | null>(null);
  readonly importProgress = signal<ImportProgress>({
    phase: 'parsing',
    progress: 0,
    message: 'Starting…',
  });
  readonly clearProgress = signal({ progress: 0, message: 'Starting…' });

  private resetImportState(): void {
    this.importStep.set('upload');
    this.csvHeaders.set([]);
    this.rawCsvRows.set([]);
    this.importPreview.set([]);
    this.importReviewFilter.set('all');
    this.importReviewPage.set(0);
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

  readonly importReviewFiltered = computed(() => {
    const rows = this.importPreview();
    switch (this.importReviewFilter()) {
      case 'ready':
        return rows.filter((r) => !r.isDuplicate);
      case 'duplicates':
        return rows.filter((r) => r.isDuplicate);
      default:
        return rows;
    }
  });

  readonly importReviewPageCount = computed(() =>
    Math.max(1, Math.ceil(this.importReviewFiltered().length / IMPORT_REVIEW_PAGE_SIZE))
  );

  readonly importReviewPageRows = computed(() => {
    const page = Math.min(this.importReviewPage(), this.importReviewPageCount() - 1);
    const start = page * IMPORT_REVIEW_PAGE_SIZE;
    return this.importReviewFiltered().slice(start, start + IMPORT_REVIEW_PAGE_SIZE);
  });

  readonly importReviewRangeLabel = computed(() => {
    const total = this.importReviewFiltered().length;
    if (!total) return '0–0';
    const page = Math.min(this.importReviewPage(), this.importReviewPageCount() - 1);
    const start = page * IMPORT_REVIEW_PAGE_SIZE + 1;
    const end = Math.min(total, start + IMPORT_REVIEW_PAGE_SIZE - 1);
    return `${start}–${end}`;
  });

  setImportReviewFilter(filter: ImportReviewFilter): void {
    this.importReviewFilter.set(filter);
    this.importReviewPage.set(0);
  }

  prevImportReviewPage(): void {
    this.importReviewPage.update((page) => Math.max(0, page - 1));
  }

  nextImportReviewPage(): void {
    this.importReviewPage.update((page) => Math.min(this.importReviewPageCount() - 1, page + 1));
  }

  readonly importForm = this.fb.nonNullable.group({
    accountId: ['', Validators.required],
  });

  readonly editingId = signal<string | null>(null);
  readonly editMerchant = signal('');
  private readonly pendingCategories = signal<Record<string, string | null>>({});
  readonly mobileFiltersOpen = signal(false);
  readonly mobileCategoryTransaction = signal<Transaction | null>(null);

  readonly filters = this.fb.group({
    search: this.fb.nonNullable.control(''),
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
  readonly activeFilterCount = computed(() => {
    const f = this.filterValues();
    return [
      !!(f.search ?? '').trim(),
      !!f.accountId,
      f.period !== 'all',
      f.kind !== 'all',
      !!f.categoryId,
      !!f.hideCcAndRefunds,
      f.sort !== 'date_desc',
    ].filter(Boolean).length;
  });
  readonly filterSummary = computed(() => {
    const f = this.filterValues();
    const parts = [this.dateRange().label];
    if (f.accountId) parts.push(this.accountName(f.accountId));
    if (f.kind && f.kind !== 'all') parts.push(f.kind.replace('_', ' '));
    if (f.categoryId === 'uncategorized') {
      parts.push('Uncategorized');
    } else if (f.categoryId) {
      parts.push(this.categoryName(f.categoryId));
    }
    if ((f.search ?? '').trim()) parts.push(`“${f.search!.trim()}”`);
    return parts.join(' · ');
  });

  readonly dateRange = computed(() => {
    const f = this.filterValues();
    return resolveDateRange(f.period ?? 'all', f.from, f.to);
  });

  readonly transactions = computed(() => {
    const f = this.filterValues();
    let list = filterTransactions(this.allTransactions(), this.dateRange(), {
      accountId: f.accountId ?? '',
      kind: f.kind ?? 'all',
      categoryId: f.categoryId ?? '',
      hideCcAndRefunds: !!f.hideCcAndRefunds,
      sort: f.sort ?? 'date_desc',
    });
    const query = (f.search ?? '').trim().toLowerCase();
    if (query) {
      list = list.filter((tx) =>
        [tx.merchant, tx.description ?? '', this.accountName(tx.accountId), tx.kind]
          .join(' ')
          .toLowerCase()
          .includes(query)
      );
    }
    return list;
  });

  readonly listPage = signal(0);

  readonly listPageCount = computed(() =>
    Math.max(1, Math.ceil(this.transactions().length / TRANSACTION_LIST_PAGE_SIZE))
  );

  readonly pagedTransactions = computed(() => {
    const page = Math.min(this.listPage(), this.listPageCount() - 1);
    const start = page * TRANSACTION_LIST_PAGE_SIZE;
    return this.transactions().slice(start, start + TRANSACTION_LIST_PAGE_SIZE);
  });

  readonly listRangeLabel = computed(() => {
    const total = this.transactions().length;
    if (!total) return '0–0';
    const page = Math.min(this.listPage(), this.listPageCount() - 1);
    const start = page * TRANSACTION_LIST_PAGE_SIZE + 1;
    const end = Math.min(total, start + TRANSACTION_LIST_PAGE_SIZE - 1);
    return `${start}–${end}`;
  });

  constructor() {
    if (this.window) {
      merge(fromEvent(this.window, 'online'), fromEvent(this.window, 'offline'))
        .pipe(takeUntilDestroyed())
        .subscribe(() => this.isOnline.set(this.window?.navigator.onLine ?? true));
    }

    effect(() => {
      this.filterValues();
      this.listPage.set(0);
    });
  }

  prevListPage(): void {
    this.listPage.update((page) => Math.max(0, page - 1));
  }

  nextListPage(): void {
    this.listPage.update((page) => Math.min(this.listPageCount() - 1, page + 1));
  }

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
        search: q.get('search') ?? '',
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

    this.route.queryParamMap.subscribe((params) => {
      const handledOneShotParams: OneShotQueryParam[] = [];
      if (params.get('import') === '1') {
        this.showImport.set(true);
        this.prefillImportAccount();
        handledOneShotParams.push('import');
      }
      if (params.get('action') === 'add') {
        queueMicrotask(() => this.openAdd());
        handledOneShotParams.push('action');
      }
      if (handledOneShotParams.length) {
        void clearOneShotQueryParams(this.router, this.route, handledOneShotParams);
      }
    });

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
          search: v.search || null,
          accountId: v.accountId || null,
          period: v.period === 'all' ? null : v.period,
          from: v.period === 'custom' && v.from ? formatDateParam(v.from) : null,
          to: v.period === 'custom' && v.to ? formatDateParam(v.to) : null,
          kind: v.kind === 'all' ? null : v.kind,
          categoryId: v.categoryId || null,
          hideCc: v.hideCcAndRefunds ? '1' : null,
          sort: v.sort === 'date_desc' ? null : v.sort,
          action: null,
          import: null,
        },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    });
  }

  importStepClass(step: ImportStep): string {
    const order: ImportStep[] = ['upload', 'map', 'review'];
    const current = order.indexOf(this.importStep());
    const target = order.indexOf(step);
    if (target < current) return 'border-action bg-action-soft text-action';
    if (target === current) return 'border-action bg-white text-action shadow-panel';
    return 'border-line bg-surface text-ink-muted';
  }

  private isDateRangePreset(value: string): value is DateRangePreset {
    return ['all', 'this_month', 'last_30_days', 'last_3_months', 'ytd', 'custom'].includes(value);
  }

  private isKindFilter(value: string): value is KindFilter {
    return ['all', 'expense', 'income', 'transfer', 'cc_payment', 'refund'].includes(value);
  }

  compareIds = (a: string | null, b: string | null): boolean => a === b;

  categoryValue(tx: Transaction): string | null {
    const pending = this.pendingCategories();
    return Object.prototype.hasOwnProperty.call(pending, tx.id) ? pending[tx.id] : tx.categoryId;
  }

  transactionCategoryName(tx: Transaction): string {
    const categoryId = this.categoryValue(tx);
    return categoryId ? this.categoryName(categoryId) : 'Uncategorized';
  }

  openMobileCategory(tx: Transaction): void {
    this.mobileCategoryTransaction.set(tx);
  }

  async chooseMobileCategory(tx: Transaction, categoryId: string | null): Promise<void> {
    this.mobileCategoryTransaction.set(null);
    await this.updateCategory(tx.id, categoryId);
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
    this.snack.open(`${this.transactions().length} uncategorized transaction results.`, 'Dismiss', {
      duration: 2500,
    });
  }

  clearFilters(): void {
    this.filters.patchValue({
      search: '',
      accountId: '',
      period: 'all',
      from: null,
      to: null,
      kind: 'all',
      categoryId: '',
      hideCcAndRefunds: false,
      sort: 'date_desc',
    });
    this.snack.open(`Filters cleared. ${this.transactions().length} transactions shown.`, 'Dismiss', {
      duration: 2500,
    });
  }

  categoryName(id: string): string {
    return this.categories().find((c) => c.id === id)?.name ?? 'Unknown';
  }

  isCategoryPending(id: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.pendingCategories(), id);
  }

  hasActiveFilters(): boolean {
    const f = this.filterValues();
    return !!(
      (f.search ?? '').trim() ||
      f.accountId ||
      f.period !== 'all' ||
      f.from ||
      f.to ||
      f.kind !== 'all' ||
      f.categoryId ||
      f.hideCcAndRefunds ||
      f.sort !== 'date_desc'
    );
  }

  emptyStateTitle(): string {
    if (!this.transactionCount()) return 'No transactions yet';
    if (this.filterValues().categoryId === 'uncategorized') return 'No transactions need review';
    return 'No activity matches these filters';
  }

  emptyStateBody(): string {
    if (!this.transactionCount()) {
      return 'Import a CSV or add a transaction manually to start tracking spending, income, and balances.';
    }
    if (this.filterValues().categoryId === 'uncategorized') {
      return 'Everything in this view is categorized. Clear filters to return to all activity.';
    }
    return 'Try clearing filters, widening the date range, or searching for a different merchant.';
  }

  kindLabel(tx: Transaction): string {
    switch (tx.kind) {
      case 'cc_payment':
        return 'Credit card payment';
      case 'refund':
        return 'Refund';
      default:
        return tx.kind.charAt(0).toUpperCase() + tx.kind.slice(1);
    }
  }

  kindIcon(tx: Transaction): string {
    switch (tx.kind) {
      case 'income':
        return 'south_west';
      case 'expense':
        return 'north_east';
      case 'transfer':
        return 'sync_alt';
      case 'cc_payment':
        return 'credit_card';
      case 'refund':
        return 'undo';
    }
  }

  kindBadgeClass(tx: Transaction): string {
    switch (tx.kind) {
      case 'income':
        return 'bg-finance-incomeSoft text-finance-income';
      case 'expense':
        return 'bg-finance-expenseSoft text-finance-expense';
      case 'refund':
        return 'bg-sky-100 text-sky-700';
      case 'cc_payment':
        return 'bg-finance-warningSoft text-finance-warning';
      case 'transfer':
        return 'bg-surface-muted text-ink-muted';
    }
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
    this.importReviewFilter.set('all');
    this.importReviewPage.set(0);
    this.importStatus.set(null);
  }

  backToMapping(): void {
    this.importStep.set('map');
    this.importPreview.set([]);
    this.importReviewFilter.set('all');
    this.importReviewPage.set(0);
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
      const headers = parsed.headers;
      this.csvHeaders.set(headers);
      this.rawCsvRows.set(parsed.rows);

      if (!headers.length) {
        this.importStep.set('map');
        this.importStatus.set(null);
        return;
      }

      const saved = this.importProfileService.getLastUsedForAccount(accountId);
      const profile = saved
        ? remapProfileToHeaders(this.importProfileService.clone(saved), headers)
        : profileFromHeaders(headers);
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
      this.importReviewFilter.set('all');
      this.importReviewPage.set(0);
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
    const rows = this.importPreview();
    const readyCount = rows.filter((r) => !r.isDuplicate).length;

    this.importing.set(true);
    this.updateImportProgress({
      phase: 'mapping',
      progress: 0,
      message: `Saving 0 of ${readyCount} transactions…`,
    });

    try {
      const result = await this.transactionService.importBatch(accountId, rows, (done, total) => {
        const pct = total === 0 ? 100 : Math.round((done / total) * 100);
        this.updateImportProgress({
          phase: 'mapping',
          progress: pct,
          message:
            done >= total
              ? `Saved ${total} transaction${total === 1 ? '' : 's'}. Finishing…`
              : `Saving ${done} of ${total} transactions…`,
        });
      });
      this.filters.patchValue({ accountId });
      this.closeImport();
      const count = result.imported;
      this.snack.open(
        `${count} transaction${count === 1 ? '' : 's'} imported`,
        'Dismiss',
        { duration: 4000, panelClass: ['snackbar-success'] }
      );
    } catch (e: unknown) {
      this.snack.open(
        e instanceof Error ? e.message : 'Import failed. Please try again.',
        'Dismiss',
        { duration: 5000, panelClass: ['snackbar-error'] }
      );
    } finally {
      this.importing.set(false);
    }
  }

  openAdd(): void {
    if (!this.accounts().length) {
      const ref = this.snack.open('Add an account before recording transactions.', 'Add account', {
        duration: 6000,
      });
      ref.onAction().subscribe(() => void this.router.navigate(['/accounts']));
      return;
    }
    const ref = this.dialog.open(TransactionFormDialogComponent, {
      width: '95vw',
      maxWidth: '560px',
      panelClass: ['app-dialog-panel', 'app-transaction-dialog'],
      data: { mode: 'add', accounts: this.accounts(), categories: this.categories() },
    });
    ref.afterClosed().subscribe((result: TransactionFormResult | undefined) => {
      if (!result) return;
      void this.transactionService.create(result).then(() => {
        this.snack.open('Transaction added.', 'Dismiss', {
          duration: 2500,
          panelClass: ['snackbar-success'],
        });
      });
    });
  }

  openEdit(tx: Transaction): void {
    const ref = this.dialog.open(TransactionFormDialogComponent, {
      width: '95vw',
      maxWidth: '560px',
      panelClass: ['app-dialog-panel', 'app-transaction-dialog'],
      data: {
        mode: 'edit',
        accounts: this.accounts(),
        categories: this.categories(),
        transaction: tx,
      },
    });
    ref.afterClosed().subscribe((result: TransactionFormResult | undefined) => {
      if (!result) return;
      void this.transactionService.update(tx.id, result).then(() => {
        this.snack.open('Transaction updated.', 'Dismiss', {
          duration: 2500,
          panelClass: ['snackbar-success'],
        });
      });
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
    this.snack.open('Merchant updated.', 'Dismiss', {
      duration: 2500,
      panelClass: ['snackbar-success'],
    });
  }

  async updateCategory(id: string, categoryId: string | null): Promise<void> {
    this.pendingCategories.update((map) => ({ ...map, [id]: categoryId }));
    try {
      await this.transactionService.update(id, { categoryId });
    } catch (e: unknown) {
      console.error('Failed to update category', e);
      this.snack.open(
        e instanceof Error ? e.message : 'Could not save category. Please try again.',
        'Dismiss',
        { duration: 5000, panelClass: ['snackbar-error'] }
      );
    } finally {
      this.pendingCategories.update((map) => {
        const next = { ...map };
        delete next[id];
        return next;
      });
    }
  }

  async remove(id: string): Promise<void> {
    const confirmed = await confirmDialog(this.dialog, {
      title: 'Delete transaction?',
      message: 'This removes the transaction from balances, budgets, and reports.',
      detail: 'This action cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!confirmed) return;
    await this.transactionService.remove(id);
    this.snack.open('Transaction deleted.', 'Dismiss', {
      duration: 3000,
      panelClass: ['snackbar-success'],
    });
  }

  async clearAllTransactions(): Promise<void> {
    const ids = this.allTransactions().map((tx) => tx.id);
    if (ids.length === 0) {
      this.snack.open('No transactions to clear.', 'Dismiss', { duration: 3000 });
      return;
    }

    const confirmed = await confirmDialog(this.dialog, {
      title: 'Clear all transactions?',
      message: `This permanently deletes all ${ids.length} transactions so you can re-import a clean CSV.`,
      detail: 'Accounts, categories, budgets, and scheduled items are kept. This cannot be undone.',
      confirmLabel: 'Delete all',
      tone: 'danger',
    });
    if (!confirmed) return;

    this.clearing.set(true);
    this.clearProgress.set({
      progress: 0,
      message: `Deleting 0 of ${ids.length} transactions…`,
    });

    try {
      // Delete what the UI already knows about first (reliable path).
      await this.transactionService.removeMany(ids, (done, total) => {
        const pct = total === 0 ? 100 : Math.min(90, Math.round((done / total) * 90));
        this.clearProgress.set({
          progress: pct,
          message: `Deleting ${done} of ${total} transactions…`,
        });
      });

      this.clearProgress.set({
        progress: 92,
        message: 'Checking for any remaining transactions…',
      });

      // Sweep any leftovers that weren't in the live query snapshot.
      const swept = await this.transactionService.removeAll((deleted) => {
        this.clearProgress.set({
          progress: Math.min(99, 92 + Math.min(7, deleted)),
          message:
            deleted > 0
              ? `Removed ${deleted} remaining transaction${deleted === 1 ? '' : 's'}…`
              : 'Checking for any remaining transactions…',
        });
      });

      this.clearProgress.set({ progress: 100, message: 'Done.' });
      const total = Math.max(ids.length, swept);
      this.snack.open(`Deleted ${total} transaction${total === 1 ? '' : 's'}.`, 'Dismiss', {
        duration: 4000,
        panelClass: ['snackbar-success'],
      });
    } catch (e: unknown) {
      console.error('Failed to clear transactions', e);
      this.snack.open(
        e instanceof Error ? e.message : 'Failed to clear transactions. Check the console for details.',
        'Dismiss',
        { duration: 8000, panelClass: ['snackbar-error'] }
      );
    } finally {
      this.clearing.set(false);
    }
  }

  openSplit(tx: Transaction): void {
    const ref = this.dialog.open(SplitDialogComponent, {
      width: '95vw',
      maxWidth: '640px',
      panelClass: ['app-dialog-panel', 'app-transaction-dialog'],
      data: { transaction: tx, categories: this.categories() },
    });
    ref.afterClosed().subscribe((split) => {
      if (split) {
        void this.transactionService.update(tx.id, { split, categoryId: null });
      }
    });
  }
}
