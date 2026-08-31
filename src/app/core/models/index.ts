export type AccountType = 'checking' | 'savings' | 'credit_card';
export type TransactionKind = 'expense' | 'income' | 'transfer' | 'cc_payment';

/** Everyday budget grouping for Budgets UI. Optional on existing docs. */
export type CategoryGroup = 'essentials' | 'lifestyle' | 'debt' | 'other';

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
  systemKey?: 'cc_payment';
  /** Optional; inferred from name when missing for backwards compatibility. */
  group?: CategoryGroup;
  /** Optional display order within a group. */
  sortOrder?: number;
  archivedAt?: Date | null;
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
  /**
   * Optional link to the paired leg of a transfer or CC payment.
   * Existing single-leg rows remain valid without this field.
   */
  linkedTransactionId?: string | null;
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

/** Seed metadata for default categories (name → group). */
export const DEFAULT_CATEGORY_GROUPS: Record<(typeof DEFAULT_CATEGORIES)[number], CategoryGroup> = {
  Groceries: 'essentials',
  Dining: 'lifestyle',
  Transport: 'essentials',
  Shopping: 'lifestyle',
  Entertainment: 'lifestyle',
  Utilities: 'essentials',
  'Rent/Mortgage': 'essentials',
  Insurance: 'essentials',
  Health: 'essentials',
  Travel: 'lifestyle',
  Subscriptions: 'lifestyle',
  Education: 'other',
  'Gifts/Donations': 'other',
  'Fees/Interest': 'debt',
  Other: 'other',
};

export const CATEGORY_GROUP_LABELS: Record<CategoryGroup, string> = {
  essentials: 'Essentials',
  lifestyle: 'Lifestyle',
  debt: 'Debt & obligations',
  other: 'Other',
};

export const CATEGORY_GROUP_ORDER: CategoryGroup[] = [
  'essentials',
  'lifestyle',
  'debt',
  'other',
];

export const SYSTEM_CATEGORIES = [
  { name: 'Credit Card Payment', systemKey: 'cc_payment' as const },
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
