import { Injectable, inject } from '@angular/core';
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

  parseCsvFile(file: File, onProgress?: (progress: ImportProgress) => void): Promise<ParsedCsvFile> {
    return new Promise((resolve, reject) => {
      const rows: RawCsvRow[] = [];
      let headers: string[] = [];

      Papa.parse<RawCsvRow>(file, {
        header: true,
        skipEmptyLines: true,
        step: (results) => {
          if (!headers.length && results.meta.fields) {
            headers = results.meta.fields.filter(Boolean) as string[];
          }
          if (results.data) {
            rows.push(results.data);
          }
          if (onProgress && file.size > 0) {
            const pct = Math.min(40, Math.round((results.meta.cursor / file.size) * 40));
            onProgress({ phase: 'parsing', progress: pct, message: 'Reading CSV…' });
          }
        },
        complete: () => {
          onProgress?.({ phase: 'parsing', progress: 40, message: 'CSV read complete' });
          resolve({ headers, rows });
        },
        error: (err) => reject(err),
      });
    });
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
