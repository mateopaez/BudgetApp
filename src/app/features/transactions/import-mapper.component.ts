import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTableModule } from '@angular/material/table';
import { remapProfileToHeaders, mappingValidationError } from '../../core/import/import-profiles';
import {
  ImportColumnMapping,
  ImportPreviewLine,
  ImportProfileConfig,
  RawCsvRow,
} from '../../core/models/import.model';
import { ImportProfileService } from '../../core/services/import-profile.service';
import { ImportService } from '../../core/services/import.service';

@Component({
  selector: 'app-import-mapper',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    CurrencyPipe,
    DatePipe,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatButtonModule,
    MatSlideToggleModule,
    MatTableModule,
  ],
  template: `
    <div class="space-y-4">
      <div class="grid gap-4 sm:grid-cols-2">
        <mat-form-field>
          <mat-label>Import format</mat-label>
          <mat-select [value]="profile().id" (selectionChange)="onPresetChange($event.value)">
            @for (preset of presets(); track preset.id) {
              <mat-option [value]="preset.id">{{ preset.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field>
          <mat-label>Amount convention</mat-label>
          <mat-select
            [value]="profile().amountSign"
            (selectionChange)="patchProfile({ amountSign: $event.value })"
          >
            <mat-option value="negative_expense">Negative = expense (credit cards)</mat-option>
            <mat-option value="positive_expense">Positive = expense (bank exports)</mat-option>
          </mat-select>
        </mat-form-field>
      </div>

      <mat-slide-toggle
        [checked]="profile().detectCcPayments"
        (change)="patchProfile({ detectCcPayments: $event.checked })"
      >
        Detect credit card payments from Type / merchant
      </mat-slide-toggle>

      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        @for (field of mappingFields; track field.key) {
          <mat-form-field>
            <mat-label>{{ field.label }}</mat-label>
            <mat-select
              [value]="profile().mapping[field.key]"
              (selectionChange)="updateMapping(field.key, $event.value)"
            >
              <mat-option [value]="null">— Not mapped —</mat-option>
              @for (header of headers(); track header) {
                <mat-option [value]="header">{{ header }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }
      </div>

      @if (mappingError()) {
        <p class="text-sm font-medium text-red-600">{{ mappingError() }}</p>
      }

      <div>
        <p class="mb-2 text-sm font-medium text-ink">Preview (first 5 rows)</p>
        <div class="overflow-x-auto rounded-xl border border-line">
          <table mat-table [dataSource]="previewLines()" class="w-full min-w-[640px]">
            <ng-container matColumnDef="row">
              <th mat-header-cell *matHeaderCellDef>#</th>
              <td mat-cell *matCellDef="let row">{{ row.rowIndex + 1 }}</td>
            </ng-container>
            <ng-container matColumnDef="postedAt">
              <th mat-header-cell *matHeaderCellDef>Date</th>
              <td mat-cell *matCellDef="let row">
                @if (row.postedAt) {
                  {{ row.postedAt | date: 'short' }}
                } @else {
                  —
                }
              </td>
            </ng-container>
            <ng-container matColumnDef="merchant">
              <th mat-header-cell *matHeaderCellDef>Merchant</th>
              <td mat-cell *matCellDef="let row" class="max-w-xs truncate">{{ row.merchant || '—' }}</td>
            </ng-container>
            <ng-container matColumnDef="amount">
              <th mat-header-cell *matHeaderCellDef>Amount</th>
              <td mat-cell *matCellDef="let row">
                @if (row.amount != null) {
                  {{ row.amount | currency }}
                } @else {
                  —
                }
              </td>
            </ng-container>
            <ng-container matColumnDef="kind">
              <th mat-header-cell *matHeaderCellDef>Kind</th>
              <td mat-cell *matCellDef="let row">{{ row.kind || '—' }}</td>
            </ng-container>
            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef>Status</th>
              <td mat-cell *matCellDef="let row">
                @if (row.error) {
                  <span class="font-medium text-red-600">{{ row.error }}</span>
                } @else {
                  <span class="font-medium text-brand-600">OK</span>
                }
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="previewColumns"></tr>
            <tr
              mat-row
              *matRowDef="let row; columns: previewColumns"
              [class.bg-red-50]="!!row.error"
            ></tr>
          </table>
        </div>
      </div>

      <div class="flex flex-wrap items-end gap-3">
        <mat-form-field class="min-w-[12rem] flex-1">
          <mat-label>Save as preset</mat-label>
          <input matInput [formControl]="saveNameControl" placeholder="My Chase CSV" />
        </mat-form-field>
        <button
          mat-stroked-button
          type="button"
          [disabled]="!saveNameControl.value.trim() || !!mappingError()"
          (click)="savePreset()"
        >
          Save preset
        </button>
        <button
          mat-flat-button
          color="primary"
          type="button"
          class="ml-auto"
          [disabled]="!!mappingError()"
          (click)="continueImport.emit(profile())"
        >
          Continue to full review
        </button>
      </div>
    </div>
  `,
})
export class ImportMapperComponent {
  private readonly fb = inject(FormBuilder);
  private readonly importService = inject(ImportService);
  private readonly profileService = inject(ImportProfileService);

  readonly headers = input.required<string[]>();
  readonly rows = input.required<RawCsvRow[]>();
  readonly initialProfile = input.required<ImportProfileConfig>();

  readonly continueImport = output<ImportProfileConfig>();
  readonly profileSaved = output<ImportProfileConfig>();

  readonly profile = signal<ImportProfileConfig>(this.initialProfile());
  readonly presets = signal(this.profileService.listSelectableProfiles());
  readonly previewColumns = ['row', 'postedAt', 'merchant', 'amount', 'kind', 'status'];

  readonly saveNameControl = this.fb.nonNullable.control('');

  readonly mappingFields: { key: keyof ImportColumnMapping; label: string }[] = [
    { key: 'date', label: 'Date (required)' },
    { key: 'merchant', label: 'Merchant / Description (required)' },
    { key: 'amount', label: 'Amount' },
    { key: 'debit', label: 'Debit' },
    { key: 'credit', label: 'Credit' },
    { key: 'time', label: 'Time' },
    { key: 'type', label: 'Type' },
    { key: 'memo', label: 'Memo / Notes' },
  ];

  readonly mappingError = computed(() => mappingValidationError(this.profile().mapping));

  readonly previewLines = computed((): ImportPreviewLine[] =>
    this.importService.previewRows(this.rows(), this.profile(), 5)
  );

  constructor() {
    effect(() => {
      const initial = this.profileService.clone(this.initialProfile());
      const headers = this.headers();
      this.profile.set(remapProfileToHeaders(initial, headers));
    });
  }

  onPresetChange(id: string): void {
    const preset = this.profileService.getProfileById(id);
    if (!preset) return;
    this.profile.set(remapProfileToHeaders(this.profileService.clone(preset), this.headers()));
  }

  patchProfile(patch: Partial<Pick<ImportProfileConfig, 'amountSign' | 'detectCcPayments'>>): void {
    this.profile.update((current) => ({ ...current, ...patch }));
  }

  updateMapping(key: keyof ImportColumnMapping, value: string | null): void {
    this.profile.update((current) => ({
      ...current,
      mapping: { ...current.mapping, [key]: value || null },
    }));
  }

  savePreset(): void {
    const name = this.saveNameControl.value.trim();
    if (!name || this.mappingError()) return;
    const saved = this.profileService.saveUserProfile(name, this.profile());
    this.presets.set(this.profileService.listSelectableProfiles());
    this.profile.set(saved);
    this.saveNameControl.reset('');
    this.profileSaved.emit(saved);
  }
}
