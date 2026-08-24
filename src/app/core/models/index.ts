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

export type BudgetPeriod = 'monthly' | 'weekly';

export interface CategoryBudget {
  id: string;
  categoryId: string;
  amount: number;
  period: BudgetPeriod;
  createdAt: Date;
  updatedAt: Date;
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
  /** Links a posted transaction back to a scheduled bill/paycheck. */
  scheduledItemId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CsvRow {
  [key: string]: string;
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

export type ScheduledKind = 'income' | 'expense';
export type ScheduleType = 'fixed' | 'monthly' | 'weekly';

export interface ScheduledItem {
  id: string;
  title: string;
  amount: number;
  kind: ScheduledKind;
  categoryId: string | null;
  accountId: string | null;
  scheduleType: ScheduleType;
  /** 1–31 for monthly; clamped to month length when expanding. */
  dayOfMonth: number | null;
  /** 0 = Sunday … 6 = Saturday for weekly. */
  dayOfWeek: number | null;
  /** Single occurrence for fixed schedules. */
  fixedDate: Date | null;
  startDate: Date;
  endDate: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScheduledItemInput {
  title: string;
  amount: number;
  kind: ScheduledKind;
  categoryId: string | null;
  accountId: string | null;
  scheduleType: ScheduleType;
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  fixedDate: Date | null;
  startDate: Date;
  endDate: Date | null;
  isActive: boolean;
}
