export type AccountType = 'checking' | 'savings' | 'credit_card';
export type TransactionKind = 'expense' | 'income' | 'transfer' | 'cc_payment' | 'refund';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  openingBalance: number;
  openingDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Category {
  id: string;
  name: string;
  isSystem: boolean;
  systemKey?: 'cc_payment' | 'refund';
  createdAt: Date;
}

export interface SplitLine {
  categoryId: string;
  amount: number;
  note?: string;
}

export interface Transaction {
  id: string;
  accountId: string;
  postedAt: Date;
  merchant: string;
  description: string | null;
  amount: number;
  kind: TransactionKind;
  categoryId: string | null;
  split?: SplitLine[];
  importHash?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CsvRow {
  Description: string;
  Type: string;
  'Card Holder Name': string;
  Date: string;
  Time: string;
  Amount: string;
}

export interface ParsedImportRow {
  postedAt: Date;
  merchant: string;
  description: string | null;
  amount: number;
  kind: TransactionKind;
  categoryId: string | null;
  importHash: string;
  isDuplicate: boolean;
}

export const DEFAULT_CATEGORIES = [
  'Groceries',
  'Dining',
  'Transport',
  'Shopping',
  'Entertainment',
  'Utilities',
  'Rent/Mortgage',
  'Insurance',
  'Health',
  'Travel',
  'Subscriptions',
  'Education',
  'Gifts/Donations',
  'Fees/Interest',
  'Other',
] as const;

export const SYSTEM_CATEGORIES = [
  { name: 'Credit Card Payment', systemKey: 'cc_payment' as const },
  { name: 'Refund/Credit', systemKey: 'refund' as const },
];

export const DEFAULT_ACCOUNTS = [
  { name: 'Checking', type: 'checking' as const },
  { name: 'Savings', type: 'savings' as const },
  { name: 'Credit Card', type: 'credit_card' as const },
] as const;
