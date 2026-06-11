import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { ParsedImportRow } from '../../core/models';
import { AccountService } from '../../core/services/account.service';
import { CategoryService } from '../../core/services/category.service';
import { ImportService } from '../../core/services/import.service';
import { TransactionService } from '../../core/services/transaction.service';

@Component({
  selector: 'app-import',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    CurrencyPipe,
    DatePipe,
    MatCardModule,
    MatFormFieldModule,
    MatSelectModule,
    MatButtonModule,
    MatTableModule,
  ],
  template: `
    <div class="space-y-6">
      <div class="page-header">
        <h1 class="page-title">Import CSV</h1>
        <p class="page-subtitle">
          Credit card CSV: Description (→ merchant), Type, Card Holder Name, Date, Time, Amount
        </p>
      </div>

      <mat-card class="app-card">
        <mat-card-content class="space-y-4">
          <form [formGroup]="form">
            <mat-form-field>
              <mat-label>Credit card account</mat-label>
              <mat-select formControlName="accountId">
                @for (a of creditCards(); track a.id) {
                  <mat-option [value]="a.id">{{ a.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </form>

          <label
            class="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-brand-200 bg-brand-50 p-8 text-center transition-colors hover:border-brand-400 hover:bg-brand-100/50"
          >
            <span class="font-medium text-midnight-900">Tap to upload CSV</span>
            <span class="mt-1 text-xs text-slate-500">Parsed client-side — raw file is not stored</span>
            <input type="file" accept=".csv" class="hidden" (change)="onFile($event)" />
          </label>

          @if (status()) {
            <p class="text-sm text-slate-600">{{ status() }}</p>
          }
        </mat-card-content>
      </mat-card>

      @if (preview().length) {
        <div class="app-card overflow-x-auto">
          <table mat-table [dataSource]="preview()" class="w-full min-w-[640px]">
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
            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row *matRowDef="let row; columns: columns"></tr>
          </table>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <button mat-flat-button color="primary" (click)="confirmImport()" [disabled]="importing()">
            Import {{ newCount() }} transactions
          </button>
          <p class="text-sm text-slate-500">
            {{ duplicateCount() }} duplicates will be skipped
          </p>
        </div>
      }
    </div>
  `,
})
export class ImportComponent {
  private readonly fb = inject(FormBuilder);
  private readonly accountService = inject(AccountService);
  private readonly categoryService = inject(CategoryService);
  private readonly importService = inject(ImportService);
  private readonly transactionService = inject(TransactionService);

  readonly columns = ['postedAt', 'merchant', 'amount', 'kind', 'status'];
  readonly accounts = toSignal(this.accountService.watchAccounts(), { initialValue: [] });
  readonly categories = toSignal(this.categoryService.watchCategories(), { initialValue: [] });

  readonly form = this.fb.nonNullable.group({
    accountId: ['', Validators.required],
  });

  readonly creditCards = computed(() =>
    this.accounts().filter((a) => a.type === 'credit_card')
  );

  readonly preview = signal<ParsedImportRow[]>([]);
  readonly status = signal<string | null>(null);
  readonly importing = signal(false);

  readonly newCount = computed(() => this.preview().filter((r) => !r.isDuplicate).length);
  readonly duplicateCount = computed(() => this.preview().filter((r) => r.isDuplicate).length);

  async onFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const accountId = this.form.value.accountId;
    if (!file || !accountId) {
      this.status.set('Select a credit card account first.');
      return;
    }

    this.status.set('Parsing CSV...');
    try {
      const rows = await this.importService.parseCsvFile(file);
      const mapped = await this.importService.mapRows(rows, accountId, this.categories());
      this.preview.set(mapped);
      this.status.set(`Parsed ${mapped.length} rows. Review before importing.`);
    } catch (e: unknown) {
      this.status.set(e instanceof Error ? e.message : 'Failed to parse CSV');
    }
  }

  async confirmImport(): Promise<void> {
    const accountId = this.form.value.accountId;
    if (!accountId || !this.preview().length) return;
    this.importing.set(true);
    try {
      const result = await this.transactionService.importBatch(accountId, this.preview());
      this.status.set(`Imported ${result.imported}, skipped ${result.skipped} duplicates.`);
      this.preview.set([]);
    } finally {
      this.importing.set(false);
    }
  }
}
