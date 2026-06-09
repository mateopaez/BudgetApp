import { Injectable } from '@angular/core';
import { Account, Transaction } from '../models';
import { monthKey } from '../utils/date.util';

export interface MonthlyTotals {
  labels: string[];
  expenses: number[];
  income: number[];
  savings: number[];
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  computeMonthlyTotals(
    transactions: Transaction[],
    accounts: Account[],
    refundsOffsetSpending: boolean
  ): MonthlyTotals {
    const savingsAccountIds = new Set(
      accounts.filter((a) => a.type === 'savings').map((a) => a.id)
    );

    const monthMap = new Map<string, { expenses: number; income: number; savings: number }>();

    const ensure = (key: string) => {
      if (!monthMap.has(key)) {
        monthMap.set(key, { expenses: 0, income: 0, savings: 0 });
      }
      return monthMap.get(key)!;
    };

    for (const tx of transactions) {
      const key = monthKey(tx.postedAt);
      const bucket = ensure(key);

      if (tx.kind === 'expense') {
        bucket.expenses += Math.abs(tx.amount);
      } else if (tx.kind === 'refund' && refundsOffsetSpending) {
        bucket.expenses -= Math.abs(tx.amount);
      }

      if (tx.kind === 'income') {
        bucket.income += tx.amount;
      }

      if (savingsAccountIds.has(tx.accountId)) {
        if (tx.kind === 'transfer' || tx.kind === 'income') {
          bucket.savings += tx.amount;
        } else if (tx.kind === 'expense') {
          bucket.savings += tx.amount;
        }
      }
    }

    const sortedKeys = [...monthMap.keys()].sort();
    return {
      labels: sortedKeys,
      expenses: sortedKeys.map((k) => Math.round(monthMap.get(k)!.expenses * 100) / 100),
      income: sortedKeys.map((k) => Math.round(monthMap.get(k)!.income * 100) / 100),
      savings: sortedKeys.map((k) => Math.round(monthMap.get(k)!.savings * 100) / 100),
    };
  }
}
