import { Category, CategoryBudget, Transaction } from '../models';
import {
  buildCategorySpendRows,
  budgetForPeriod,
  computeCategorySpend,
  UNCATEGORIZED_ID,
} from './budget.util';
import { resolveDateRange } from './date.util';

function cat(id: string, name: string): Category {
  return { id, name, isSystem: false, createdAt: new Date() };
}

function tx(
  partial: Partial<Transaction> & Pick<Transaction, 'amount' | 'kind' | 'postedAt'>
): Transaction {
  return {
    id: 'tx',
    accountId: 'a1',
    merchant: 'Shop',
    description: null,
    categoryId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}

describe('budget.util', () => {
  const range = resolveDateRange('this_month', null, null, new Date('2026-03-15'));

  it('attributes split lines to categories', () => {
    const transactions = [
      tx({
        amount: -100,
        kind: 'expense',
        postedAt: new Date('2026-03-10'),
        split: [
          { categoryId: 'groc', amount: -60 },
          { categoryId: 'dine', amount: -40 },
        ],
      }),
    ];
    expect(computeCategorySpend(transactions, 'groc', range)).toBe(60);
    expect(computeCategorySpend(transactions, 'dine', range)).toBe(40);
  });

  it('tracks uncategorized inbox spend', () => {
    const transactions = [
      tx({ amount: -25, kind: 'expense', postedAt: new Date('2026-03-10'), categoryId: null }),
      tx({
        amount: -10,
        kind: 'expense',
        postedAt: new Date('2026-03-11'),
        categoryId: 'groc',
      }),
    ];
    expect(computeCategorySpend(transactions, UNCATEGORIZED_ID, range)).toBe(25);
  });

  it('converts monthly budget to weekly', () => {
    const budget: CategoryBudget = {
      id: 'groc',
      categoryId: 'groc',
      amount: 433,
      period: 'monthly',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(budgetForPeriod(budget, 'weekly')).toBe(100);
  });

  it('builds rows with remaining budget', () => {
    const transactions = [
      tx({
        amount: -287,
        kind: 'expense',
        postedAt: new Date('2026-03-10'),
        categoryId: 'groc',
      }),
    ];
    const budgets: CategoryBudget[] = [
      {
        id: 'groc',
        categoryId: 'groc',
        amount: 400,
        period: 'monthly',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const rows = buildCategorySpendRows(
      transactions,
      [cat('groc', 'Groceries')],
      budgets,
      range,
      { budgetAs: 'monthly' }
    );
    const groceries = rows.find((r) => r.categoryId === 'groc')!;
    expect(groceries.spent).toBe(287);
    expect(groceries.remaining).toBe(113);
    expect(groceries.percentOfBudget).toBe(71.75);
  });
});
