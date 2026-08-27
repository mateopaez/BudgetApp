export type RawCsvRow = Record<string, string>;

export type AmountSignConvention = 'negative_expense' | 'positive_expense';

export type ImportFieldKey =
  | 'date'
  | 'merchant'
  | 'amount'
  | 'withdrawal'
  | 'deposit'
  | 'type'
  | 'memo';

export interface ImportColumnMapping {
  date: string | null;
  merchant: string | null;
  amount: string | null;
  withdrawal: string | null;
  deposit: string | null;
  type: string | null;
  memo: string | null;
}

export interface ImportProfileConfig {
  id: string;
  name: string;
  isBuiltin: boolean;
  mapping: ImportColumnMapping;
  amountSign: AmountSignConvention;
  detectCcPayments: boolean;
}

export interface ParsedCsvFile {
  headers: string[];
  rows: RawCsvRow[];
}

export interface ImportPreviewLine {
  rowIndex: number;
  postedAt: Date | null;
  merchant: string;
  amount: number | null;
  kind: string | null;
  error: string | null;
}

export const EMPTY_IMPORT_MAPPING: ImportColumnMapping = {
  date: null,
  merchant: null,
  amount: null,
  withdrawal: null,
  deposit: null,
  type: null,
  memo: null,
};
