import { Injectable, inject } from '@angular/core';
import Papa from 'papaparse';
import { Category, CsvRow, ParsedImportRow } from '../models';
import { parsePostedAt } from '../utils/date.util';
import { normalizeDescription, sha1 } from '../utils/hash.util';
import { CategoryService } from './category.service';

@Injectable({ providedIn: 'root' })
export class ImportService {
  private readonly categoryService = inject(CategoryService);

  parseCsvFile(file: File): Promise<CsvRow[]> {
    return new Promise((resolve, reject) => {
      Papa.parse<CsvRow>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (result) => resolve(result.data),
        error: (err) => reject(err),
      });
    });
  }

  async mapRows(
    rows: CsvRow[],
    accountId: string,
    categories: Category[]
  ): Promise<ParsedImportRow[]> {
    const ccPaymentId = this.categoryService.getSystemCategoryId(categories, 'cc_payment');
    const refundId = this.categoryService.getSystemCategoryId(categories, 'refund');

    const mapped: ParsedImportRow[] = [];

    for (const row of rows) {
      const amount = parseFloat(String(row.Amount).replace(/,/g, ''));
      if (Number.isNaN(amount)) continue;

      const description = normalizeDescription(row.Description ?? '');
      const postedAt = parsePostedAt(row.Date, row.Time);
      const postedAtISO = postedAt.toISOString();
      const importHash = await sha1(`${accountId}${postedAtISO}${description}${amount}`);

      let kind: ParsedImportRow['kind'];
      let categoryId: string | null = null;

      if (amount < 0) {
        kind = 'expense';
        categoryId = null;
      } else {
        const type = (row.Type ?? '').toUpperCase();
        const descUpper = description.toUpperCase();
        if (type === 'PAYMENT' || descUpper.includes('PAYMENT')) {
          kind = 'cc_payment';
          categoryId = ccPaymentId;
        } else {
          kind = 'refund';
          categoryId = refundId;
        }
      }

      mapped.push({
        postedAt,
        description,
        amount,
        kind,
        categoryId,
        importHash,
        isDuplicate: false,
      });
    }

    const hashes = mapped.map((r) => r.importHash);
    const existing = await this.categoryService.getExistingImportHashes(accountId, hashes);
    mapped.forEach((r) => {
      r.isDuplicate = existing.has(r.importHash);
    });

    return mapped;
  }
}
