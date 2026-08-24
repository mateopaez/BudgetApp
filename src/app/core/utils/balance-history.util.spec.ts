import { Account, Transaction } from '../models';
import {
  buildAccountComparisonRows,
  computeAccountBalanceAsOf,
  computeNetWorth,
  computeNetWorthAsOf,
} from './balance-history.util';

function account(partial: Partial<Account> & Pick<Account, 'id' | 'name' | 'type'>): Account {
  return {
    openingBalance: 0,
    openingDate: new Date(2026, 0, 1),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}

function tx(
  partial: Partial<Transaction> & Pick<Transaction, 'id' | 'accountId' | 'amount' | 'postedAt'>
): Transaction {
  return {
    merchant: 'x',
    description: null,
    kind: 'expense',
    categoryId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}

describe('balance-history.util', () => {
  const checking = account({
    id: 'chk',
    name: 'Checking',
    type: 'checking',
    openingBalance: 1000,
  });
  const cc = account({
    id: 'cc',
    name: 'Card',
    type: 'credit_card',
    openingBalance: 0,
  });

  it('computes net worth as sum of all account balances', () => {
    const txs = [
      tx({ id: '1', accountId: 'chk', amount: 500, postedAt: new Date(2026, 1, 1), kind: 'income' }),
      tx({ id: '2', accountId: 'cc', amount: -200, postedAt: new Date(2026, 1, 2), kind: 'expense' }),
    ];
    // checking 1500 + cc -200 = 1300
    expect(computeNetWorth([checking, cc], txs)).toBe(1300);
  });

  it('reconstructs balance as of a past date', () => {
    const txs = [
      tx({ id: '1', accountId: 'chk', amount: 100, postedAt: new Date(2026, 0, 10), kind: 'income' }),
      tx({ id: '2', accountId: 'chk', amount: 50, postedAt: new Date(2026, 1, 10), kind: 'income' }),
    ];
    expect(computeAccountBalanceAsOf(checking, txs, new Date(2026, 0, 15))).toBe(1100);
    expect(computeAccountBalanceAsOf(checking, txs, new Date(2026, 1, 15))).toBe(1150);
  });

  it('ignores transactions before openingDate', () => {
    const late = account({
      id: 's',
      name: 'Savings',
      type: 'savings',
      openingBalance: 200,
      openingDate: new Date(2026, 2, 1),
    });
    const txs = [
      tx({ id: '1', accountId: 's', amount: 999, postedAt: new Date(2026, 1, 1), kind: 'income' }),
      tx({ id: '2', accountId: 's', amount: 10, postedAt: new Date(2026, 2, 5), kind: 'income' }),
    ];
    expect(computeAccountBalanceAsOf(late, txs, new Date(2026, 2, 10))).toBe(210);
  });

  it('builds MTD / YTD comparison deltas', () => {
    const txs = [
      tx({ id: '1', accountId: 'chk', amount: 100, postedAt: new Date(2026, 0, 5), kind: 'income' }),
      tx({ id: '2', accountId: 'chk', amount: 25, postedAt: new Date(2026, 7, 5), kind: 'income' }),
    ];
    const rows = buildAccountComparisonRows([checking], txs, new Date(2026, 7, 20));
    expect(rows[0].balanceToday).toBe(1125);
    expect(rows[0].changeMtd).toBe(25);
    expect(rows[0].changeYtd).toBe(125);
  });

  it('computes net worth as of Jan 1 for delta', () => {
    const txs = [
      tx({ id: '1', accountId: 'chk', amount: 100, postedAt: new Date(2026, 0, 15), kind: 'income' }),
    ];
    const beforeYear = computeNetWorthAsOf([checking], txs, new Date(2025, 11, 31));
    expect(beforeYear).toBe(1000);
  });
});
