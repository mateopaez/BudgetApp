import { Injectable } from '@angular/core';
import { Category, Transaction } from '../models';
import { roundMoney } from '../utils/balance.util';
import {
  isWithinDateRange,
  monthKey,
  ResolvedDateRange,
  startOfMonth,
} from '../utils/date.util';
import { computeCategorySpend, UNCATEGORIZED_ID } from '../utils/budget.util';

export interface MonthlySeries {
  labels: string[];
  monthKeys: string[];
  values: number[];
  average: number;
  total: number;
}

export interface PeriodSummary {
  income: number;
  expenses: number;
  savings: number;
  expensesPctOfIncome: number | null;
  savingsPctOfIncome: number | null;
}

export interface CategorySlice {
  categoryId: string;
  name: string;
  amount: number;
  percent: number;
  monthlyAverage: number;
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  /** Excel-style: savings = income − expenses for the selected range. */
  computePeriodSummary(
    transactions: Transaction[],
    range: ResolvedDateRange,
    refundsOffset = false
  ): PeriodSummary {
    let income = 0;
    let expenses = 0;

    for (const tx of transactions) {
      if (!isWithinDateRange(tx.postedAt, range)) continue;
      if (tx.kind === 'income') {
        income += tx.amount;
      } else if (tx.kind === 'expense') {
        expenses += Math.abs(tx.amount);
      } else if (refundsOffset && tx.kind === 'refund') {
        expenses -= Math.abs(tx.amount);
      }
    }

    income = roundMoney(income);
    expenses = roundMoney(Math.max(0, expenses));
    const savings = roundMoney(income - expenses);

    return {
      income,
      expenses,
      savings,
      expensesPctOfIncome: income > 0 ? roundMoney((expenses / income) * 100) : null,
      savingsPctOfIncome: income > 0 ? roundMoney((savings / income) * 100) : null,
    };
  }

  computeMonthlySeries(
    transactions: Transaction[],
    range: ResolvedDateRange,
    metric: 'income' | 'expenses' | 'savings',
    refundsOffset = false
  ): MonthlySeries {
    const keys = monthKeysInRange(range, transactions);
    const byMonth = new Map<string, { income: number; expenses: number }>();
    for (const key of keys) {
      byMonth.set(key, { income: 0, expenses: 0 });
    }

    for (const tx of transactions) {
      if (!isWithinDateRange(tx.postedAt, range)) continue;
      const key = monthKey(tx.postedAt);
      if (!byMonth.has(key)) byMonth.set(key, { income: 0, expenses: 0 });
      const bucket = byMonth.get(key)!;

      if (tx.kind === 'income') {
        bucket.income += tx.amount;
      } else if (tx.kind === 'expense') {
        bucket.expenses += Math.abs(tx.amount);
      } else if (refundsOffset && tx.kind === 'refund') {
        bucket.expenses -= Math.abs(tx.amount);
      }
    }

    const orderedKeys = [...byMonth.keys()].sort();
    const values = orderedKeys.map((key) => {
      const b = byMonth.get(key)!;
      const income = roundMoney(b.income);
      const expenses = roundMoney(Math.max(0, b.expenses));
      if (metric === 'income') return income;
      if (metric === 'expenses') return expenses;
      return roundMoney(income - expenses);
    });

    const total = roundMoney(values.reduce((sum, v) => sum + v, 0));
    const average = values.length ? roundMoney(total / values.length) : 0;

    return {
      labels: orderedKeys.map(formatMonthLabel),
      monthKeys: orderedKeys,
      values,
      average,
      total,
    };
  }

  computeCategoryMonthlySeries(
    transactions: Transaction[],
    categoryId: string,
    range: ResolvedDateRange,
    refundsOffset = false
  ): MonthlySeries {
    const keys = monthKeysInRange(range, transactions);
    const byMonth = new Map<string, number>();
    for (const key of keys) byMonth.set(key, 0);

    for (const tx of transactions) {
      if (!isWithinDateRange(tx.postedAt, range)) continue;
      if (tx.kind !== 'expense' && !(refundsOffset && tx.kind === 'refund')) continue;

      const key = monthKey(tx.postedAt);
      if (!byMonth.has(key)) byMonth.set(key, 0);

      let amount = 0;
      if (tx.kind === 'expense') {
        if (tx.split?.length) {
          amount = tx.split
            .filter((line) => line.categoryId === categoryId)
            .reduce((sum, line) => sum + Math.abs(line.amount), 0);
        } else if (categoryId === UNCATEGORIZED_ID) {
          if (!tx.categoryId) amount = Math.abs(tx.amount);
        } else if (tx.categoryId === categoryId) {
          amount = Math.abs(tx.amount);
        }
      } else if (refundsOffset && tx.kind === 'refund') {
        if (
          (categoryId === UNCATEGORIZED_ID && !tx.categoryId) ||
          tx.categoryId === categoryId
        ) {
          amount = -Math.abs(tx.amount);
        }
      }

      byMonth.set(key, (byMonth.get(key) ?? 0) + amount);
    }

    const orderedKeys = [...byMonth.keys()].sort();
    const values = orderedKeys.map((key) => roundMoney(Math.max(0, byMonth.get(key) ?? 0)));
    const total = roundMoney(values.reduce((sum, v) => sum + v, 0));
    const average = values.length ? roundMoney(total / values.length) : 0;

    return {
      labels: orderedKeys.map(formatMonthLabel),
      monthKeys: orderedKeys,
      values,
      average,
      total,
    };
  }

  computeIncomeByCategory(
    transactions: Transaction[],
    categories: Category[],
    range: ResolvedDateRange
  ): CategorySlice[] {
    const nameById = new Map(categories.map((c) => [c.id, c.name]));
    const amounts = new Map<string, number>();

    for (const tx of transactions) {
      if (!isWithinDateRange(tx.postedAt, range)) continue;
      if (tx.kind !== 'income') continue;
      const id = tx.categoryId ?? UNCATEGORIZED_ID;
      amounts.set(id, (amounts.get(id) ?? 0) + tx.amount);
    }

    return toSlices(amounts, nameById, monthCountInRange(range, transactions));
  }

  computeExpenseByCategory(
    transactions: Transaction[],
    categories: Category[],
    range: ResolvedDateRange,
    refundsOffset = false
  ): CategorySlice[] {
    const nameById = new Map(categories.filter((c) => !c.isSystem).map((c) => [c.id, c.name]));
    const amounts = new Map<string, number>();

    for (const cat of categories) {
      if (cat.isSystem) continue;
      const spent = computeCategorySpend(transactions, cat.id, range, refundsOffset);
      if (spent > 0) amounts.set(cat.id, spent);
    }
    const uncategorized = computeCategorySpend(
      transactions,
      UNCATEGORIZED_ID,
      range,
      refundsOffset
    );
    if (uncategorized > 0) amounts.set(UNCATEGORIZED_ID, uncategorized);

    return toSlices(amounts, nameById, monthCountInRange(range, transactions));
  }
}

function toSlices(
  amounts: Map<string, number>,
  nameById: Map<string, string>,
  months: number
): CategorySlice[] {
  const total = [...amounts.values()].reduce((sum, v) => sum + v, 0);
  const monthDivisor = Math.max(1, months);

  return [...amounts.entries()]
    .map(([categoryId, amount]) => ({
      categoryId,
      name:
        categoryId === UNCATEGORIZED_ID
          ? 'Uncategorized'
          : (nameById.get(categoryId) ?? 'Unknown'),
      amount: roundMoney(amount),
      percent: total > 0 ? roundMoney((amount / total) * 100) : 0,
      monthlyAverage: roundMoney(amount / monthDivisor),
    }))
    .sort((a, b) => b.amount - a.amount);
}

function formatMonthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short' });
}

function monthKeysInRange(range: ResolvedDateRange, transactions: Transaction[]): string[] {
  let start = range.start;
  let end = range.end;

  if (!start || !end) {
    const dates = transactions
      .filter((tx) => isWithinDateRange(tx.postedAt, range))
      .map((tx) => tx.postedAt.getTime());
    if (!dates.length) {
      const now = new Date();
      return [monthKey(now)];
    }
    start = new Date(Math.min(...dates));
    end = new Date(Math.max(...dates));
  }

  const keys: string[] = [];
  let cursor = startOfMonth(start.getFullYear(), start.getMonth() + 1);
  const last = startOfMonth(end.getFullYear(), end.getMonth() + 1);

  while (cursor <= last) {
    keys.push(monthKey(cursor));
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }

  return keys.length ? keys : [monthKey(new Date())];
}

function monthCountInRange(range: ResolvedDateRange, transactions: Transaction[]): number {
  return monthKeysInRange(range, transactions).length;
}
