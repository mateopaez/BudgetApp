import { ScheduledItemInput, TransactionKind } from '../models';
import { signedAmountForKind } from './amount.util';
import { startOfDay } from './date.util';

export type DemoAccountKey = 'checking' | 'savings' | 'credit_card';
export type DemoScheduleKey = 'paycheck' | 'rent';

export interface DemoTxDraft {
  accountKey: DemoAccountKey;
  postedAt: Date;
  merchant: string;
  description: string | null;
  amount: number;
  kind: TransactionKind;
  /** Category name from DEFAULT_CATEGORIES, or null for Inbox/uncategorized. */
  categoryName: string | null;
  scheduleKey?: DemoScheduleKey;
}

export interface DemoSeedPlan {
  openingDate: Date;
  openings: Record<DemoAccountKey, number>;
  schedules: { key: DemoScheduleKey; input: ScheduledItemInput }[];
  transactions: DemoTxDraft[];
}

interface ExpenseTemplate {
  merchant: string;
  categoryName: string | null;
  min: number;
  max: number;
  accountKey: DemoAccountKey;
  /** 0–1 chance this template fires on a given candidate day. */
  chance: number;
}

const EXPENSE_TEMPLATES: ExpenseTemplate[] = [
  { merchant: 'Whole Foods', categoryName: 'Groceries', min: 28, max: 95, accountKey: 'checking', chance: 0.22 },
  { merchant: "Trader Joe's", categoryName: 'Groceries', min: 22, max: 72, accountKey: 'checking', chance: 0.18 },
  { merchant: 'Safeway', categoryName: null, min: 18, max: 64, accountKey: 'checking', chance: 0.12 },
  { merchant: 'Blue Bottle Coffee', categoryName: 'Dining', min: 5, max: 14, accountKey: 'credit_card', chance: 0.28 },
  { merchant: 'Chipotle', categoryName: 'Dining', min: 11, max: 18, accountKey: 'credit_card', chance: 0.16 },
  { merchant: 'Local Bistro', categoryName: null, min: 24, max: 68, accountKey: 'credit_card', chance: 0.1 },
  { merchant: 'Uber', categoryName: 'Transport', min: 9, max: 32, accountKey: 'credit_card', chance: 0.14 },
  { merchant: 'Shell Gas', categoryName: 'Transport', min: 35, max: 62, accountKey: 'checking', chance: 0.08 },
  { merchant: 'Target', categoryName: 'Shopping', min: 16, max: 85, accountKey: 'credit_card', chance: 0.1 },
  { merchant: 'Amazon', categoryName: null, min: 12, max: 79, accountKey: 'credit_card', chance: 0.18 },
  { merchant: 'Netflix', categoryName: 'Subscriptions', min: 15.49, max: 15.49, accountKey: 'credit_card', chance: 0 },
  { merchant: 'Spotify', categoryName: 'Subscriptions', min: 11.99, max: 11.99, accountKey: 'credit_card', chance: 0 },
  { merchant: 'PG&E', categoryName: 'Utilities', min: 85, max: 140, accountKey: 'checking', chance: 0 },
  { merchant: 'State Farm', categoryName: 'Insurance', min: 128, max: 128, accountKey: 'checking', chance: 0 },
  { merchant: 'CVS Pharmacy', categoryName: 'Health', min: 8, max: 42, accountKey: 'checking', chance: 0.06 },
  { merchant: 'AMC Theatres', categoryName: 'Entertainment', min: 14, max: 36, accountKey: 'credit_card', chance: 0.05 },
  { merchant: 'Corner Market', categoryName: null, min: 6, max: 28, accountKey: 'checking', chance: 0.1 },
];

const PAYCHECK_AMOUNT = 3200;
const RENT_AMOUNT = 1850;

/** Deterministic 0–1 from integer seed (mulberry32-ish). */
export function demoRand(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function moneyBetween(seed: number, min: number, max: number): number {
  if (min === max) return Math.round(min * 100) / 100;
  const n = min + demoRand(seed) * (max - min);
  return Math.round(n * 100) / 100;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return startOfDay(d);
}

function monthsBack(from: Date, months: number): Date {
  const d = startOfDay(from);
  d.setMonth(d.getMonth() - months);
  // Align to the 1st so the first month includes rent + paycheck.
  return startOfDay(new Date(d.getFullYear(), d.getMonth(), 1));
}

/**
 * Builds a reproducible ~3-month demo dataset: mixed categorized/uncategorized
 * spending, monthly paycheck + rent (with matching schedules), and everyday activity.
 */
export function buildDemoSeedPlan(now: Date = new Date()): DemoSeedPlan {
  const today = startOfDay(now);
  const openingDate = monthsBack(today, 3);
  const rangeEnd = today;

  const schedules: DemoSeedPlan['schedules'] = [
    {
      key: 'paycheck',
      input: {
        title: 'Paycheck',
        amount: PAYCHECK_AMOUNT,
        kind: 'income',
        categoryId: null,
        accountId: null, // filled by service
        scheduleType: 'monthly',
        dayOfMonth: 15,
        dayOfWeek: null,
        fixedDate: null,
        startDate: openingDate,
        endDate: null,
        isActive: true,
      },
    },
    {
      key: 'rent',
      input: {
        title: 'Rent',
        amount: RENT_AMOUNT,
        kind: 'expense',
        categoryId: null, // filled by service → Rent/Mortgage
        accountId: null,
        scheduleType: 'monthly',
        dayOfMonth: 1,
        dayOfWeek: null,
        fixedDate: null,
        startDate: openingDate,
        endDate: null,
        isActive: true,
      },
    },
  ];

  const transactions: DemoTxDraft[] = [];

  // Monthly paycheck (15th) + rent (1st), linked to scheduled items for calendar dedup.
  for (
    let cursor = new Date(openingDate.getFullYear(), openingDate.getMonth(), 1);
    cursor <= rangeEnd;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
  ) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();

    const rentDay = startOfDay(new Date(y, m, 1));
    if (rentDay >= openingDate && rentDay <= rangeEnd) {
      transactions.push({
        accountKey: 'checking',
        postedAt: rentDay,
        merchant: 'Parkview Apartments',
        description: 'Monthly rent',
        amount: signedAmountForKind(RENT_AMOUNT, 'expense'),
        kind: 'expense',
        categoryName: 'Rent/Mortgage',
        scheduleKey: 'rent',
      });
    }

    const payDay = startOfDay(new Date(y, m, 15));
    if (payDay >= openingDate && payDay <= rangeEnd) {
      transactions.push({
        accountKey: 'checking',
        postedAt: payDay,
        merchant: 'Acme Corp Payroll',
        description: 'Direct deposit',
        amount: signedAmountForKind(PAYCHECK_AMOUNT, 'income'),
        kind: 'income',
        categoryName: null,
        scheduleKey: 'paycheck',
      });
    }
  }

  // Fixed monthly bills (subscriptions / utilities / insurance).
  for (let cursor = new Date(openingDate.getFullYear(), openingDate.getMonth(), 1); cursor <= rangeEnd; cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const fixed: { day: number; merchant: string; categoryName: string; amount: number; accountKey: DemoAccountKey }[] = [
      { day: 3, merchant: 'Netflix', categoryName: 'Subscriptions', amount: 15.49, accountKey: 'credit_card' },
      { day: 5, merchant: 'Spotify', categoryName: 'Subscriptions', amount: 11.99, accountKey: 'credit_card' },
      { day: 8, merchant: 'PG&E', categoryName: 'Utilities', amount: moneyBetween(y * 100 + m * 7 + 8, 85, 140), accountKey: 'checking' },
      { day: 12, merchant: 'State Farm', categoryName: 'Insurance', amount: 128, accountKey: 'checking' },
    ];
    for (const bill of fixed) {
      const postedAt = startOfDay(new Date(y, m, bill.day));
      if (postedAt < openingDate || postedAt > rangeEnd) continue;
      transactions.push({
        accountKey: bill.accountKey,
        postedAt,
        merchant: bill.merchant,
        description: null,
        amount: signedAmountForKind(bill.amount, 'expense'),
        kind: 'expense',
        categoryName: bill.categoryName,
      });
    }
  }

  // Everyday spending with a mix of categories and null (uncategorized).
  let dayIndex = 0;
  for (let d = new Date(openingDate); d <= rangeEnd; d = addDays(d, 1), dayIndex++) {
    for (let ti = 0; ti < EXPENSE_TEMPLATES.length; ti++) {
      const t = EXPENSE_TEMPLATES[ti];
      if (t.chance <= 0) continue;
      const roll = demoRand(dayIndex * 97 + ti * 13 + d.getDate());
      if (roll > t.chance) continue;
      // Skip weekends for office-ish coffee sometimes.
      if (t.merchant === 'Blue Bottle Coffee' && (d.getDay() === 0 || d.getDay() === 6) && demoRand(dayIndex + ti) > 0.35) {
        continue;
      }
      const amount = moneyBetween(dayIndex * 31 + ti * 17, t.min, t.max);
      // ~30% of otherwise-categorized spend left uncategorized for Inbox practice.
      const leaveUncategorized =
        t.categoryName != null && demoRand(dayIndex * 53 + ti * 19) < 0.3;
      transactions.push({
        accountKey: t.accountKey,
        postedAt: new Date(d),
        merchant: t.merchant,
        description: null,
        amount: signedAmountForKind(amount, 'expense'),
        kind: 'expense',
        categoryName: leaveUncategorized ? null : t.categoryName,
      });
    }
  }

  // Monthly credit-card payment from checking + a couple savings transfers.
  for (let cursor = new Date(openingDate.getFullYear(), openingDate.getMonth(), 1); cursor <= rangeEnd; cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const payDate = startOfDay(new Date(y, m, 22));
    if (payDate >= openingDate && payDate <= rangeEnd) {
      const payment = moneyBetween(y * 50 + m * 9, 280, 520);
      transactions.push({
        accountKey: 'checking',
        postedAt: payDate,
        merchant: 'Credit Card Payment',
        description: 'Payment to card ending 4242',
        amount: signedAmountForKind(payment, 'transfer'),
        kind: 'transfer',
        categoryName: null,
      });
      transactions.push({
        accountKey: 'credit_card',
        postedAt: payDate,
        merchant: 'Payment Thank You',
        description: 'Online payment',
        amount: signedAmountForKind(payment, 'cc_payment'),
        kind: 'cc_payment',
        categoryName: 'Credit Card Payment',
      });
    }

    const transferDate = startOfDay(new Date(y, m, 16));
    if (transferDate >= openingDate && transferDate <= rangeEnd) {
      const amount = moneyBetween(y * 11 + m * 3, 200, 400);
      transactions.push({
        accountKey: 'checking',
        postedAt: transferDate,
        merchant: 'Transfer to Savings',
        description: null,
        amount: signedAmountForKind(amount, 'transfer'),
        kind: 'transfer',
        categoryName: null,
      });
      transactions.push({
        accountKey: 'savings',
        postedAt: transferDate,
        merchant: 'Transfer from Checking',
        description: null,
        amount: signedAmountForKind(amount, 'income'),
        kind: 'income',
        categoryName: null,
      });
    }
  }

  transactions.sort((a, b) => a.postedAt.getTime() - b.postedAt.getTime());

  return {
    openingDate,
    openings: {
      checking: 4200,
      savings: 8500,
      credit_card: -650,
    },
    schedules,
    transactions,
  };
}
