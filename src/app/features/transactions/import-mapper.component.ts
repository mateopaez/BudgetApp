import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
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
    <div class="space-y-5">
      <div class="rounded-2xl border border-line bg-white p-4">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p class="font-semibold text-ink">Map your CSV columns</p>
            <p class="mt-1 text-sm text-slate-500">
              Confirm the required fields first. Optional fields improve descriptions and payment detection.
            </p>
          </div>
          <div class="rounded-xl border px-3 py-2" [class]="mappingError() ? 'border-red-100 bg-red-50' : previewErrorCount() ? 'border-amber-100 bg-amber-50' : 'border-emerald-100 bg-emerald-50'">
            <p class="text-xs font-semibold uppercase tracking-wide" [class]="mappingError() ? 'text-red-700' : previewErrorCount() ? 'text-amber-700' : 'text-emerald-700'">
              Mapping check
            </p>
            <p class="text-sm font-semibold" [class]="mappingError() ? 'text-red-700' : previewErrorCount() ? 'text-amber-700' : 'text-emerald-700'">
              @if (mappingError()) {
                Needs setup
              } @else if (previewErrorCount()) {
                {{ previewErrorCount() }} preview issues
              } @else {
                Looks ready
              }
            </p>
          </div>
        </div>
      </div>

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

      <div class="space-y-3">
        <div>
          <p class="kicker">Required mapping</p>
          <div class="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            @for (field of requiredMappingFields; track field.key) {
              <mat-form-field>
                <mat-label>{{ field.label }}</mat-label>
                <mat-select
                  [value]="profile().mapping[field.key]"
                  (selectionChange)="updateMapping(field.key, $event.value)"
                >
                  <mat-option [value]="null">Not mapped</mat-option>
                  @for (header of headers(); track $index) {
                    <mat-option [value]="header">{{ header }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
            }
          </div>
        </div>

        <div>
          <p class="kicker">Optional mapping</p>
          <div class="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            @for (field of optionalMappingFields; track field.key) {
              <mat-form-field>
                <mat-label>{{ field.label }}</mat-label>
                <mat-select
                  [value]="profile().mapping[field.key]"
                  (selectionChange)="updateMapping(field.key, $event.value)"
                >
                  <mat-option [value]="null">Not mapped</mat-option>
                  @for (header of headers(); track $index) {
                    <mat-option [value]="header">{{ header }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
            }
          </div>
        </div>
      </div>

      @if (mappingError()) {
        <p class="text-sm font-medium text-red-600">{{ mappingError() }}</p>
      }

      <div>
        <div class="mb-2 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p class="text-sm font-semibold text-ink">Preview first 5 rows</p>
            <p class="text-xs text-slate-500">
              {{ previewOkCount() }} look ready · {{ previewErrorCount() }} need attention
            </p>
          </div>
        </div>
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
                  {{ row.postedAt | date: 'mediumDate' }}
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
                  <span class="font-medium text-action">Ready</span>
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

  /** Resets when parent headers/profile change; stays writable for local mapping edits. */
  readonly profile = linkedSignal({
    source: () => ({
      initial: this.initialProfile(),
      headers: this.headers(),
    }),
    computation: ({ initial, headers }) =>
      remapProfileToHeaders(this.profileService.clone(initial), headers),
  });
  readonly presets = signal(this.profileService.listSelectableProfiles());
  readonly previewColumns = ['row', 'postedAt', 'merchant', 'amount', 'kind', 'status'];

  readonly saveNameControl = this.fb.nonNullable.control('');

  readonly requiredMappingFields: { key: keyof ImportColumnMapping; label: string }[] = [
    { key: 'date', label: 'Date' },
    { key: 'merchant', label: 'Merchant or description' },
    { key: 'amount', label: 'Single amount column' },
    { key: 'debit', label: 'Debit column' },
    { key: 'credit', label: 'Credit column' },
  ];

  readonly optionalMappingFields: { key: keyof ImportColumnMapping; label: string }[] = [
    { key: 'type', label: 'Type' },
    { key: 'memo', label: 'Memo or notes' },
  ];

  readonly mappingError = computed(() => mappingValidationError(this.profile().mapping));

  readonly previewLines = computed((): ImportPreviewLine[] =>
    this.importService.previewRows(this.rows(), this.profile(), 5)
  );

  readonly previewErrorCount = computed(() => this.previewLines().filter((row) => !!row.error).length);
  readonly previewOkCount = computed(() => this.previewLines().filter((row) => !row.error).length);

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
