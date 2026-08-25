import { Injectable, NgZone, inject } from '@angular/core';
import Papa from 'papaparse';
import { Category, ParsedImportRow, TransactionKind } from '../models';
import {
  ImportPreviewLine,
  ImportProfileConfig,
  ParsedCsvFile,
  RawCsvRow,
} from '../models/import.model';
import { mappingValidationError } from '../import/import-profiles';
import {
  normalizeImportDate,
  normalizeImportMerchant,
  resolveAmountFromRow,
} from '../utils/import-normalizers.util';
import { formatDateParam } from '../utils/date.util';
import { sha1 } from '../utils/hash.util';
import { CategoryService } from './category.service';

export interface ImportProgress {
  phase: 'parsing' | 'mapping' | 'deduplicating';
  progress: number;
  message: string;
}

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

@Injectable({ providedIn: 'root' })
export class ImportService {
  private readonly categoryService = inject(CategoryService);
  private readonly zone = inject(NgZone);

  parseCsvFile(file: File, onProgress?: (progress: ImportProgress) => void): Promise<ParsedCsvFile> {
    return new Promise((resolve, reject) => {
      this.zone.run(() => {
        onProgress?.({ phase: 'parsing', progress: 5, message: 'Reading CSV…' });
      });

      Papa.parse<RawCsvRow>(file, {
        header: true,
        skipEmptyLines: 'greedy',
        transformHeader: (header, index) => {
          const trimmed = String(header ?? '').trim();
          return trimmed || `Column ${index + 1}`;
        },
        complete: (results) => {
          this.zone.run(() => {
            try {
              const rows = (results.data ?? [])
                .map((row) => this.cleanRow(row))
                .filter((row) => Object.keys(row).length > 0);
              const headers = this.extractHeaders(results.meta.fields, rows[0]);

              onProgress?.({ phase: 'parsing', progress: 40, message: 'CSV read complete' });
              resolve({ headers, rows });
            } catch (err) {
              reject(err);
            }
          });
        },
        error: (err) => {
          this.zone.run(() => reject(err));
        },
      });
    });
  }

  private extractHeaders(fields: string[] | undefined | null, row?: RawCsvRow): string[] {
    const fromMeta = (fields ?? []).map((h) => String(h).trim()).filter(Boolean);
    if (fromMeta.length) {
      return this.dedupeHeaders(fromMeta);
    }
    const fromRow = Object.keys(row ?? {}).filter((key) => key && key !== '__parsed_extra');
    return this.dedupeHeaders(fromRow);
  }

  private dedupeHeaders(headers: string[]): string[] {
    const seen = new Map<string, number>();
    return headers.map((header) => {
      const count = seen.get(header) ?? 0;
      seen.set(header, count + 1);
      return count === 0 ? header : `${header}_${count}`;
    });
  }

  private cleanRow(row: RawCsvRow): RawCsvRow {
    const cleaned: RawCsvRow = {};
    for (const [key, value] of Object.entries(row ?? {})) {
      if (!key || key === '__parsed_extra') continue;
      cleaned[key] = value == null ? '' : String(value);
    }
    return cleaned;
  }

  previewRows(
    rows: RawCsvRow[],
    profile: ImportProfileConfig,
    limit = 5
  ): ImportPreviewLine[] {
    const validation = mappingValidationError(profile.mapping);
    if (validation) {
      return rows.slice(0, limit).map((_, rowIndex) => ({
        rowIndex,
        postedAt: null,
        merchant: '',
        amount: null,
        kind: null,
        error: validation,
      }));
    }

    return rows.slice(0, limit).map((row, rowIndex) => this.mapPreviewLine(row, rowIndex, profile));
  }

  async mapRows(
    rows: RawCsvRow[],
    accountId: string,
    categories: Category[],
    profile: ImportProfileConfig,
    onProgress?: (progress: ImportProgress) => void
  ): Promise<ParsedImportRow[]> {
    const validation = mappingValidationError(profile.mapping);
    if (validation) {
      throw new Error(validation);
    }

    const ccPaymentId = this.categoryService.getSystemCategoryId(categories, 'cc_payment');
    const refundId = this.categoryService.getSystemCategoryId(categories, 'refund');
    const mapped: ParsedImportRow[] = [];

    for (let i = 0; i < rows.length; i++) {
      const preview = this.mapPreviewLine(rows[i], i, profile);
      if (preview.error || preview.amount == null || !preview.postedAt || !preview.merchant) {
        continue;
      }

      const amount = preview.amount;
      const merchant = preview.merchant;
      const postedAt = preview.postedAt;
      const typeRaw = profile.mapping.type ? rows[i][profile.mapping.type] : null;
      const { kind, categoryId } = this.detectKind(
        amount,
        typeRaw,
        merchant,
        profile.detectCcPayments,
        ccPaymentId,
        refundId
      );

      const importHash = await sha1(
        `${accountId}${formatDateParam(postedAt)}${merchant}${amount}`
      );

      mapped.push({
        postedAt,
        merchant,
        description: profile.mapping.memo ? rows[i][profile.mapping.memo]?.trim() || null : null,
        amount,
        kind,
        categoryId,
        importHash,
        isDuplicate: false,
      });

      if (onProgress && rows.length > 0 && (i % 25 === 0 || i === rows.length - 1)) {
        const pct = 55 + Math.round(((i + 1) / rows.length) * 35);
        onProgress({
          phase: 'mapping',
          progress: pct,
          message: `Processing row ${i + 1} of ${rows.length}…`,
        });
        await yieldToUi();
      }
    }

    onProgress?.({ phase: 'deduplicating', progress: 92, message: 'Checking for duplicates…' });
    const hashes = mapped.map((r) => r.importHash);
    const existing = await this.categoryService.getExistingImportHashes(accountId, hashes);
    mapped.forEach((r) => {
      r.isDuplicate = existing.has(r.importHash);
    });

    onProgress?.({ phase: 'deduplicating', progress: 100, message: 'Ready to review' });
    return mapped;
  }

  private mapPreviewLine(
    row: RawCsvRow,
    rowIndex: number,
    profile: ImportProfileConfig
  ): ImportPreviewLine {
    const validation = mappingValidationError(profile.mapping);
    if (validation) {
      return {
        rowIndex,
        postedAt: null,
        merchant: '',
        amount: null,
        kind: null,
        error: validation,
      };
    }

    const amount = resolveAmountFromRow(row, profile.mapping, profile.amountSign);
    const postedAt = normalizeImportDate(
      profile.mapping.date ? row[profile.mapping.date] : null
    );
    const merchant = normalizeImportMerchant(
      profile.mapping.merchant ? row[profile.mapping.merchant] : null,
      profile.mapping.memo ? row[profile.mapping.memo] : null
    );

    if (amount == null) {
      return { rowIndex, postedAt, merchant, amount: null, kind: null, error: 'Invalid amount' };
    }
    if (!postedAt) {
      return { rowIndex, postedAt: null, merchant, amount, kind: null, error: 'Invalid date' };
    }
    if (!merchant) {
      return { rowIndex, postedAt, merchant: '', amount, kind: null, error: 'Missing merchant' };
    }

    const typeRaw = profile.mapping.type ? row[profile.mapping.type] : null;
    const { kind } = this.detectKind(amount, typeRaw, merchant, profile.detectCcPayments, null, null);

    return { rowIndex, postedAt, merchant, amount, kind, error: null };
  }

  private detectKind(
    amount: number,
    typeRaw: string | null | undefined,
    merchant: string,
    detectCcPayments: boolean,
    ccPaymentId: string | null,
    refundId: string | null
  ): { kind: TransactionKind; categoryId: string | null } {
    if (amount < 0) {
      return { kind: 'expense', categoryId: null };
    }

    if (detectCcPayments) {
      const type = (typeRaw ?? '').toUpperCase();
      const merchantUpper = merchant.toUpperCase();
      if (type === 'PAYMENT' || merchantUpper.includes('PAYMENT')) {
        return { kind: 'cc_payment', categoryId: ccPaymentId };
      }
    }

    return { kind: 'refund', categoryId: refundId };
  }
}
