import { Account, Transaction } from '../models';

/** Current balance = opening balance + net of all transactions on the account. */
export function computeAccountBalance(account: Account, transactions: Transaction[]): number {
  const netActivity = transactions
    .filter((tx) => tx.accountId === account.id)
    .reduce((sum, tx) => sum + tx.amount, 0);

  return roundMoney(account.openingBalance + netActivity);
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
