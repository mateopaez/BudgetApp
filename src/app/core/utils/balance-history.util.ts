import { Account, Transaction } from '../models';
import { computeAccountBalance, roundMoney } from './balance.util';
import { endOfDay, startOfDay, startOfMonth } from './date.util';

export interface BalancePoint {
  date: Date;
  label: string;
  netWorth: number;
  byAccount: Record<string, number>;
}

export interface AccountBalanceRow {
  account: Account;
  balanceToday: number;
  changeMtd: number;
  changeYtd: number;
}

/** Net worth: assets + liabilities (CC balances are typically negative when you owe). */
export function computeNetWorth(accounts: Account[], transactions: Transaction[]): number {
  return roundMoney(
    accounts.reduce((sum, account) => sum + computeAccountBalance(account, transactions), 0)
  );
}

export function computeAccountBalanceAsOf(
  account: Account,
  transactions: Transaction[],
  asOf: Date
): number {
  const cutoff = endOfDay(asOf);
  const opening = startOfDay(account.openingDate);
  if (cutoff < opening) return roundMoney(account.openingBalance);

  const net = transactions
    .filter(
      (tx) =>
        tx.accountId === account.id &&
        startOfDay(tx.postedAt) >= opening &&
        tx.postedAt <= cutoff
    )
    .reduce((sum, tx) => sum + tx.amount, 0);

  return roundMoney(account.openingBalance + net);
}

export function computeNetWorthAsOf(
  accounts: Account[],
  transactions: Transaction[],
  asOf: Date
): number {
  return roundMoney(
    accounts.reduce((sum, account) => sum + computeAccountBalanceAsOf(account, transactions, asOf), 0)
  );
}

/** Weekly samples from rangeStart → rangeEnd (inclusive), plus today if in range. */
export function buildNetWorthSeries(
  accounts: Account[],
  transactions: Transaction[],
  rangeStart: Date,
  rangeEnd: Date
): BalancePoint[] {
  const start = startOfDay(rangeStart);
  const end = startOfDay(rangeEnd);
  const points: BalancePoint[] = [];

  let cursor = new Date(start);
  while (cursor <= end) {
    points.push(samplePoint(accounts, transactions, cursor));
    cursor = new Date(cursor);
    cursor.setDate(cursor.getDate() + 7);
  }

  const today = startOfDay(new Date());
  if (today >= start && today <= end) {
    const last = points[points.length - 1];
    if (!last || dayKey(last.date) !== dayKey(today)) {
      points.push(samplePoint(accounts, transactions, today));
    } else {
      points[points.length - 1] = samplePoint(accounts, transactions, today);
    }
  }

  // Always include end date
  const endPoint = samplePoint(accounts, transactions, end);
  const last = points[points.length - 1];
  if (!last || dayKey(last.date) !== dayKey(end)) {
    points.push(endPoint);
  } else {
    points[points.length - 1] = endPoint;
  }

  return points.sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function buildAccountComparisonRows(
  accounts: Account[],
  transactions: Transaction[],
  now: Date = new Date()
): AccountBalanceRow[] {
  const today = startOfDay(now);
  const mtdStart = startOfMonth(today.getFullYear(), today.getMonth() + 1);
  const ytdStart = startOfMonth(today.getFullYear(), 1);

  return accounts.map((account) => {
    const balanceToday = computeAccountBalanceAsOf(account, transactions, today);
    const balanceMtdStart = computeAccountBalanceAsOf(
      account,
      transactions,
      new Date(mtdStart.getTime() - 1)
    );
    const balanceYtdStart = computeAccountBalanceAsOf(
      account,
      transactions,
      new Date(ytdStart.getTime() - 1)
    );
    return {
      account,
      balanceToday,
      changeMtd: roundMoney(balanceToday - balanceMtdStart),
      changeYtd: roundMoney(balanceToday - balanceYtdStart),
    };
  });
}

function samplePoint(
  accounts: Account[],
  transactions: Transaction[],
  date: Date
): BalancePoint {
  const byAccount: Record<string, number> = {};
  let netWorth = 0;
  for (const account of accounts) {
    const bal = computeAccountBalanceAsOf(account, transactions, date);
    byAccount[account.id] = bal;
    netWorth += bal;
  }
  return {
    date: startOfDay(date),
    label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    netWorth: roundMoney(netWorth),
    byAccount,
  };
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}
