import { AmountSignConvention, ImportColumnMapping, RawCsvRow } from '../models/import.model';
import { parsePostedAt, startOfDay } from './date.util';
import { normalizeMerchant } from './hash.util';

export function normalizeAmountRaw(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  let value = String(raw).trim();
  if (!value) return null;

  const negative = /^\(.*\)$/.test(value);
  value = value.replace(/^\(|\)$/g, '');
  value = value.replace(/[$€£¥]/g, '').replace(/\s/g, '');

  if (value.includes(',') && value.includes('.')) {
    value = value.replace(/,/g, '');
  } else if (value.includes(',') && !value.includes('.')) {
    const parts = value.split(',');
    value = parts.length === 2 && parts[1].length <= 2 ? `${parts[0]}.${parts[1]}` : value.replace(/,/g, '');
  }

  const parsed = parseFloat(value);
  if (Number.isNaN(parsed)) return null;
  return negative ? -Math.abs(parsed) : parsed;
}

export function applyAmountSignConvention(
  amount: number,
  convention: AmountSignConvention
): number {
  return convention === 'positive_expense' ? -amount : amount;
}

export function resolveAmountFromRow(
  row: RawCsvRow,
  mapping: ImportColumnMapping,
  convention: AmountSignConvention
): number | null {
  if (mapping.debit || mapping.credit) {
    const debitRaw = mapping.debit ? row[mapping.debit] : '';
    const creditRaw = mapping.credit ? row[mapping.credit] : '';
    const debit = normalizeAmountRaw(debitRaw);
    const credit = normalizeAmountRaw(creditRaw);

    if (debit != null && Math.abs(debit) > 0) {
      return -Math.abs(debit);
    }
    if (credit != null && Math.abs(credit) > 0) {
      return Math.abs(credit);
    }
    return null;
  }

  if (!mapping.amount) return null;
  const amount = normalizeAmountRaw(row[mapping.amount]);
  if (amount == null) return null;
  return applyAmountSignConvention(amount, convention);
}

/** Parse import date only (time-of-day is ignored). */
export function normalizeImportDate(dateRaw: string | undefined | null): Date | null {
  if (!dateRaw?.trim()) return null;

  const trimmed = dateRaw.trim();

  const slash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    const [, a, b, y] = slash;
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    let month = Number(a) - 1;
    let day = Number(b);
    if (Number(a) > 12 && Number(b) <= 12) {
      day = Number(a);
      month = Number(b) - 1;
    }
    const parsed = new Date(year, month, day);
    return Number.isNaN(parsed.getTime()) ? null : startOfDay(parsed);
  }

  const dashed = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dashed) {
    return parsePostedAt(`${dashed[1]}-${dashed[2]}-${dashed[3]}`);
  }

  const parsed = parsePostedAt(trimmed);
  if (parsed) return parsed;

  const fallback = new Date(trimmed);
  return Number.isNaN(fallback.getTime()) ? null : startOfDay(fallback);
}

export function normalizeImportMerchant(
  merchantRaw: string | undefined | null,
  memoRaw?: string | null
): string {
  const merchant = normalizeMerchant(merchantRaw ?? '');
  if (merchant) return merchant;
  return normalizeMerchant(memoRaw ?? '');
}
