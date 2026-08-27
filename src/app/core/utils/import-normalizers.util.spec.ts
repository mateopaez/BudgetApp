import {
  applyAmountSignConvention,
  normalizeAmountRaw,
  normalizeImportDate,
  normalizeImportMerchant,
  resolveAmountFromRow,
} from './import-normalizers.util';
import { EMPTY_IMPORT_MAPPING } from '../models/import.model';

describe('import normalizers', () => {
  it('parses parenthesized and currency amounts', () => {
    expect(normalizeAmountRaw('($12.50)')).toBe(-12.5);
    expect(normalizeAmountRaw('$1,234.56')).toBe(1234.56);
    expect(normalizeAmountRaw('25,99')).toBe(25.99);
  });

  it('flips sign for positive_expense convention', () => {
    expect(applyAmountSignConvention(42.5, 'positive_expense')).toBe(-42.5);
    expect(applyAmountSignConvention(-10, 'negative_expense')).toBe(-10);
  });

  it('resolves withdrawal and deposit columns', () => {
    const row = { Withdrawal: '15.00', Deposit: '' };
    const mapping = { ...EMPTY_IMPORT_MAPPING, withdrawal: 'Withdrawal', deposit: 'Deposit' };
    expect(resolveAmountFromRow(row, mapping, 'negative_expense')).toBe(-15);
  });

  it('parses common date formats as local midnight', () => {
    const iso = normalizeImportDate('2026-03-15');
    expect(iso?.getFullYear()).toBe(2026);
    expect(iso?.getHours()).toBe(0);
    expect(normalizeImportDate('03/15/2026')?.getMonth()).toBe(2);
    expect(normalizeImportDate('15/03/2026')?.getDate()).toBe(15);
  });

  it('ignores time-of-day in ISO-like strings', () => {
    const parsed = normalizeImportDate('2026-03-15T14:30:00');
    expect(parsed?.getHours()).toBe(0);
    expect(parsed?.getMinutes()).toBe(0);
  });

  it('uses memo when merchant is empty', () => {
    expect(normalizeImportMerchant('', 'Coffee shop')).toBe('Coffee shop');
  });
});
