import { Account, Transaction } from '../models';

function isOnOrAfterOpeningDate(tx: Transaction, account: Account): boolean {
  const opening = startOfDay(account.openingDate);
  const posted = startOfDay(tx.postedAt);
  return posted >= opening;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function relevantTransactions(account: Account, transactions: Transaction[]): Transaction[] {
  return transactions.filter(
    (tx) => tx.accountId === account.id && isOnOrAfterOpeningDate(tx, account)
  );
}

/** Current balance = opening balance + net of transactions on/after openingDate. */
export function computeAccountBalance(account: Account, transactions: Transaction[]): number {
  const netActivity = relevantTransactions(account, transactions).reduce(
    (sum, tx) => sum + tx.amount,
    0
  );
  return roundMoney(account.openingBalance + netActivity);
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
