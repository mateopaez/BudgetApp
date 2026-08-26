import { Category, CategoryBudget, Transaction } from '../models';
import { isWithinDateRange, ResolvedDateRange } from './date.util';
import { roundMoney } from './balance.util';

export const UNCATEGORIZED_ID = '__uncategorized__';

/** Weeks per month for converting monthly budgets to weekly pace. */
export const WEEKS_PER_MONTH = 4.33;

export interface CategorySpendRow {
  categoryId: string;
  name: string;
  spent: number;
  budgetAmount: number | null;
  budgetPeriod: CategoryBudget['period'] | null;
  remaining: number | null;
  percentOfTotal: number;
  percentOfBudget: number | null;
}

export function computeCategorySpend(
  transactions: Transaction[],
  categoryId: string,
  range: ResolvedDateRange
): number {
  let spent = 0;

  for (const tx of transactions) {
    if (!isWithinDateRange(tx.postedAt, range)) continue;
    if (tx.kind !== 'expense') continue;

    if (tx.split?.length) {
      for (const line of tx.split) {
        if (line.categoryId === categoryId) {
          spent += Math.abs(line.amount);
        }
      }
    } else if (categoryId === UNCATEGORIZED_ID) {
      if (!tx.categoryId) spent += Math.abs(tx.amount);
    } else if (tx.categoryId === categoryId) {
      spent += Math.abs(tx.amount);
    }
  }

  return roundMoney(Math.max(0, spent));
}

export function computeAllCategorySpend(
  transactions: Transaction[],
  categories: Category[],
  range: ResolvedDateRange
): Map<string, number> {
  const spend = new Map<string, number>();
  for (const cat of categories) {
    if (cat.isSystem) continue;
    spend.set(cat.id, computeCategorySpend(transactions, cat.id, range));
  }
  spend.set(UNCATEGORIZED_ID, computeCategorySpend(transactions, UNCATEGORIZED_ID, range));
  return spend;
}

export function budgetForPeriod(
  budget: CategoryBudget | undefined,
  target: 'monthly' | 'weekly'
): number | null {
  if (!budget) return null;
  if (budget.period === target) return budget.amount;
  if (budget.period === 'monthly' && target === 'weekly') {
    return roundMoney(budget.amount / WEEKS_PER_MONTH);
  }
  if (budget.period === 'weekly' && target === 'monthly') {
    return roundMoney(budget.amount * WEEKS_PER_MONTH);
  }
  return budget.amount;
}

export function buildCategorySpendRows(
  transactions: Transaction[],
  categories: Category[],
  budgets: CategoryBudget[],
  range: ResolvedDateRange,
  options: {
    budgetAs?: 'monthly' | 'weekly' | 'as_configured';
    includeZero?: boolean;
  } = {}
): CategorySpendRow[] {
  const budgetAs = options.budgetAs ?? 'as_configured';
  const includeZero = options.includeZero ?? false;
  const budgetByCategory = new Map(budgets.map((b) => [b.categoryId, b]));
  const spendMap = computeAllCategorySpend(transactions, categories, range);

  const totalSpent = [...spendMap.values()].reduce((sum, v) => sum + v, 0);
  const rows: CategorySpendRow[] = [];

  for (const cat of categories.filter((c) => !c.isSystem)) {
    const spent = spendMap.get(cat.id) ?? 0;
    const budget = budgetByCategory.get(cat.id);
    const budgetAmount =
      budgetAs === 'as_configured'
        ? (budget?.amount ?? null)
        : budgetForPeriod(budget, budgetAs);
    if (!includeZero && spent === 0 && budgetAmount == null) continue;

    rows.push({
      categoryId: cat.id,
      name: cat.name,
      spent,
      budgetAmount,
      budgetPeriod: budget?.period ?? null,
      remaining: budgetAmount != null ? roundMoney(budgetAmount - spent) : null,
      percentOfTotal: totalSpent > 0 ? roundMoney((spent / totalSpent) * 100) : 0,
      percentOfBudget:
        budgetAmount != null && budgetAmount > 0
          ? roundMoney((spent / budgetAmount) * 100)
          : null,
    });
  }

  const uncategorized = spendMap.get(UNCATEGORIZED_ID) ?? 0;
  if (uncategorized > 0 || includeZero) {
    rows.push({
      categoryId: UNCATEGORIZED_ID,
      name: 'Uncategorized',
      spent: uncategorized,
      budgetAmount: null,
      budgetPeriod: null,
      remaining: null,
      percentOfTotal: totalSpent > 0 ? roundMoney((uncategorized / totalSpent) * 100) : 0,
      percentOfBudget: null,
    });
  }

  return rows.sort((a, b) => b.spent - a.spent);
}

export function computePeriodTotals(
  transactions: Transaction[],
  accounts: { id: string; type: string }[],
  range: ResolvedDateRange
): { spent: number; income: number; net: number; savingsChange: number } {
  const savingsIds = new Set(accounts.filter((a) => a.type === 'savings').map((a) => a.id));
  let spent = 0;
  let income = 0;
  let net = 0;
  let savingsChange = 0;

  for (const tx of transactions) {
    if (!isWithinDateRange(tx.postedAt, range)) continue;
    net += tx.amount;

    if (tx.kind === 'expense') {
      spent += Math.abs(tx.amount);
    }

    if (tx.kind === 'income') {
      income += tx.amount;
    }

    if (savingsIds.has(tx.accountId)) {
      if (tx.kind === 'transfer' || tx.kind === 'income' || tx.kind === 'expense') {
        savingsChange += tx.amount;
      }
    }
  }

  return {
    spent: roundMoney(Math.max(0, spent)),
    income: roundMoney(income),
    net: roundMoney(net),
    savingsChange: roundMoney(savingsChange),
  };
}

export function countUncategorizedExpenses(
  transactions: Transaction[],
  range: ResolvedDateRange
): number {
  return transactions.filter(
    (tx) =>
      isWithinDateRange(tx.postedAt, range) &&
      tx.kind === 'expense' &&
      !tx.categoryId &&
      !tx.split?.length
  ).length;
}
