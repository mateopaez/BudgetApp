import { Account, Transaction } from '../models';
import { computeAccountBalance } from './balance.util';

function account(openingDate: string, openingBalance = 1000): Account {
  return {
    id: 'acct-1',
    name: 'Checking',
    type: 'checking',
    openingBalance,
    openingDate: new Date(openingDate),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function tx(postedAt: string, amount: number): Transaction {
  return {
    id: 'tx-1',
    accountId: 'acct-1',
    postedAt: new Date(postedAt),
    merchant: 'Test',
    description: null,
    amount,
    kind: amount < 0 ? 'expense' : 'income',
    categoryId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('computeAccountBalance', () => {
  it('returns opening balance when there are no transactions', () => {
    expect(computeAccountBalance(account('2025-01-01'), [])).toBe(1000);
  });

  it('ignores transactions before openingDate', () => {
    const result = computeAccountBalance(account('2025-01-01'), [
      tx('2024-12-31', -50),
      tx('2025-01-02', -25),
    ]);
    expect(result).toBe(975);
  });

  it('includes transactions on openingDate', () => {
    const result = computeAccountBalance(account('2025-01-01'), [tx('2025-01-01', 100)]);
    expect(result).toBe(1100);
  });

  it('sums mixed kinds after openingDate', () => {
    const result = computeAccountBalance(account('2025-01-01'), [
      tx('2025-01-05', -200),
      tx('2025-01-10', 500),
      tx('2025-01-15', -50),
    ]);
    expect(result).toBe(1250);
  });

  it('ignores transactions for other accounts', () => {
    const other = { ...tx('2025-01-05', -999), accountId: 'other' };
    expect(computeAccountBalance(account('2025-01-01'), [other])).toBe(1000);
  });
});
