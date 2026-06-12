import { Injectable, inject } from '@angular/core';
import Papa from 'papaparse';
import { Category, CsvRow, ParsedImportRow } from '../models';
import { parsePostedAt } from '../utils/date.util';
import { normalizeMerchant, sha1 } from '../utils/hash.util';
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

  parseCsvFile(file: File, onProgress?: (progress: ImportProgress) => void): Promise<CsvRow[]> {
    return new Promise((resolve, reject) => {
      const rows: CsvRow[] = [];
      Papa.parse<CsvRow>(file, {
        header: true,
        skipEmptyLines: true,
        step: (results) => {
          if (results.data) {
            rows.push(results.data);
          }
          if (onProgress && file.size > 0) {
            const pct = Math.min(55, Math.round((results.meta.cursor / file.size) * 55));
            onProgress({ phase: 'parsing', progress: pct, message: 'Reading CSV…' });
          }
        },
        complete: () => {
          onProgress?.({ phase: 'parsing', progress: 55, message: 'CSV read complete' });
          resolve(rows);
        },
        error: (err) => reject(err),
      });
    });
  }

  async mapRows(
    rows: CsvRow[],
    accountId: string,
    categories: Category[],
    onProgress?: (progress: ImportProgress) => void
  ): Promise<ParsedImportRow[]> {
    const ccPaymentId = this.categoryService.getSystemCategoryId(categories, 'cc_payment');
    const refundId = this.categoryService.getSystemCategoryId(categories, 'refund');

    const mapped: ParsedImportRow[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const amount = parseFloat(String(row.Amount).replace(/,/g, ''));
      if (Number.isNaN(amount)) continue;

      const merchant = normalizeMerchant(row.Description ?? '');
      if (!merchant) continue;

      const postedAt = parsePostedAt(row.Date, row.Time);
      const postedAtISO = postedAt.toISOString();
      const importHash = await sha1(`${accountId}${postedAtISO}${merchant}${amount}`);

      let kind: ParsedImportRow['kind'];
      let categoryId: string | null = null;

      if (amount < 0) {
        kind = 'expense';
        categoryId = null;
      } else {
        const type = (row.Type ?? '').toUpperCase();
        const merchantUpper = merchant.toUpperCase();
        if (type === 'PAYMENT' || merchantUpper.includes('PAYMENT')) {
          kind = 'cc_payment';
          categoryId = ccPaymentId;
        } else {
          kind = 'refund';
          categoryId = refundId;
        }
      }

      mapped.push({
        postedAt,
        merchant,
        description: null,
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
}
