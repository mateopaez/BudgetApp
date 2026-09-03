import { Transaction, TransactionKind } from '../models';
import { isWithinDateRange, ResolvedDateRange } from './date.util';
import { roundMoney } from './balance.util';

export type KindFilter = 'all' | TransactionKind;

export type SortOption =
  | 'date_desc'
  | 'date_asc'
  | 'amount_desc'
  | 'amount_asc'
  | 'merchant_asc'
  | 'kind_then_date_desc';

export interface TransactionFilterState {
  accountId: string;
  kind: KindFilter;
  categoryId: string;
  hideCcPayments: boolean;
  hideTransfers: boolean;
  sort: SortOption;
}

export interface TransactionSummary {
  expenses: number;
  income: number;
  net: number;
}

const KIND_SORT_ORDER: Record<TransactionKind, number> = {
  expense: 0,
  transfer: 1,
  cc_payment: 2,
  income: 3,
};

export function filterTransactions(
  transactions: Transaction[],
  range: ResolvedDateRange,
  state: TransactionFilterState
): Transaction[] {
  let list = transactions.filter((tx) => isWithinDateRange(tx.postedAt, range));

  if (state.accountId) {
    list = list.filter((tx) => tx.accountId === state.accountId);
  }

  if (state.kind !== 'all') {
    list = list.filter((tx) => tx.kind === state.kind);
  }

  if (state.categoryId === 'uncategorized') {
    list = list.filter(
      (tx) =>
        tx.kind === 'expense' &&
        !tx.categoryId &&
        !tx.split?.length
    );
  } else if (state.categoryId) {
    list = list.filter((tx) => {
      if (tx.split?.length) {
        return tx.split.some((line) => line.categoryId === state.categoryId);
      }
      return tx.categoryId === state.categoryId;
    });
  }

  if (state.hideCcPayments) {
    list = list.filter((tx) => tx.kind !== 'cc_payment');
  }

  if (state.hideTransfers) {
    list = list.filter((tx) => tx.kind !== 'transfer');
  }

  return sortTransactions(list, state.sort);
}

export function sortTransactions(list: Transaction[], sort: SortOption): Transaction[] {
  const sorted = [...list];
  switch (sort) {
    case 'date_asc':
      return sorted.sort((a, b) => a.postedAt.getTime() - b.postedAt.getTime());
    case 'amount_desc':
      return sorted.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    case 'amount_asc':
      return sorted.sort((a, b) => Math.abs(a.amount) - Math.abs(b.amount));
    case 'merchant_asc':
      return sorted.sort((a, b) => a.merchant.localeCompare(b.merchant));
    case 'kind_then_date_desc':
      return sorted.sort((a, b) => {
        const kindDiff = KIND_SORT_ORDER[a.kind] - KIND_SORT_ORDER[b.kind];
        if (kindDiff !== 0) return kindDiff;
        return b.postedAt.getTime() - a.postedAt.getTime();
      });
    case 'date_desc':
    default:
      return sorted.sort((a, b) => b.postedAt.getTime() - a.postedAt.getTime());
  }
}

export function computeTransactionSummary(transactions: Transaction[]): TransactionSummary {
  let expenses = 0;
  let income = 0;

  for (const tx of transactions) {
    // Transfers and CC payments never count as income or spending.
    if (tx.kind === 'expense') {
      expenses += Math.abs(tx.amount);
    } else if (tx.kind === 'income') {
      income += tx.amount;
    }
  }

  const expensesRounded = roundMoney(expenses);
  const incomeRounded = roundMoney(income);

  return {
    expenses: expensesRounded,
    income: incomeRounded,
    // Net = income − spending only (excludes transfers and card payments).
    net: roundMoney(incomeRounded - expensesRounded),
  };
}

export function computeNetActivity(transactions: Transaction[]): number {
  return roundMoney(transactions.reduce((sum, tx) => sum + tx.amount, 0));
}

export function transactionAmountClass(tx: Transaction): string {
  if (tx.kind === 'expense' || (tx.kind === 'transfer' && tx.amount < 0)) {
    return 'text-finance-expense';
  }
  if (tx.kind === 'income') {
    return 'text-action';
  }
  return 'text-ink-muted';
}
