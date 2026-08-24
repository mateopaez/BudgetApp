import { ScheduledItem, Transaction } from '../models';
import {
  buildMonthGrid,
  dayKey,
  expandScheduledOccurrences,
  signedScheduledAmount,
  transactionsAsOccurrences,
} from './calendar.util';

function item(partial: Partial<ScheduledItem> & Pick<ScheduledItem, 'id' | 'title'>): ScheduledItem {
  return {
    amount: 100,
    kind: 'expense',
    categoryId: null,
    accountId: null,
    scheduleType: 'monthly',
    dayOfMonth: 1,
    dayOfWeek: null,
    fixedDate: null,
    startDate: new Date(2026, 0, 1),
    endDate: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}

describe('calendar.util', () => {
  it('signs expense amounts negative and income positive', () => {
    expect(signedScheduledAmount({ amount: 50, kind: 'expense' })).toBe(-50);
    expect(signedScheduledAmount({ amount: 50, kind: 'income' })).toBe(50);
  });

  it('expands monthly rent on the 1st across a range', () => {
    const rent = item({
      id: '1',
      title: 'Rent',
      amount: 1200,
      scheduleType: 'monthly',
      dayOfMonth: 1,
    });
    const occ = expandScheduledOccurrences(
      [rent],
      new Date(2026, 0, 1),
      new Date(2026, 2, 31)
    );
    expect(occ.map((o) => dayKey(o.date))).toEqual(['2026-01-01', '2026-02-01', '2026-03-01']);
    expect(occ[0].amount).toBe(-1200);
  });

  it('expands paycheck on the 15th', () => {
    const pay = item({
      id: '2',
      title: 'Paycheck',
      amount: 2000,
      kind: 'income',
      scheduleType: 'monthly',
      dayOfMonth: 15,
    });
    const occ = expandScheduledOccurrences(
      [pay],
      new Date(2026, 7, 1),
      new Date(2026, 7, 31)
    );
    expect(occ.length).toBe(1);
    expect(dayKey(occ[0].date)).toBe('2026-08-15');
    expect(occ[0].amount).toBe(2000);
  });

  it('clamps day-of-month to shorter months', () => {
    const item31 = item({
      id: '3',
      title: 'Bill',
      scheduleType: 'monthly',
      dayOfMonth: 31,
    });
    const occ = expandScheduledOccurrences(
      [item31],
      new Date(2026, 1, 1),
      new Date(2026, 1, 28)
    );
    expect(dayKey(occ[0].date)).toBe('2026-02-28');
  });

  it('expands weekly on Fridays', () => {
    const friday = item({
      id: '4',
      title: 'Allowance',
      kind: 'income',
      scheduleType: 'weekly',
      dayOfMonth: null,
      dayOfWeek: 5,
    });
    const occ = expandScheduledOccurrences(
      [friday],
      new Date(2026, 7, 17), // Mon
      new Date(2026, 7, 30) // Sun
    );
    expect(occ.map((o) => dayKey(o.date))).toEqual(['2026-08-21', '2026-08-28']);
  });

  it('skips inactive items', () => {
    const inactive = item({ id: '5', title: 'Old', isActive: false });
    expect(
      expandScheduledOccurrences([inactive], new Date(2026, 0, 1), new Date(2026, 0, 31))
    ).toEqual([]);
  });

  it('maps income/expense transactions into calendar occurrences', () => {
    const txs: Transaction[] = [
      {
        id: 't1',
        accountId: 'a1',
        postedAt: new Date(2026, 7, 20),
        merchant: 'Coffee',
        description: null,
        amount: -5,
        kind: 'expense',
        categoryId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const occ = transactionsAsOccurrences(
      txs,
      new Date(2026, 7, 1),
      new Date(2026, 7, 31)
    );
    expect(occ.length).toBe(1);
    expect(occ[0].source).toBe('transaction');
    expect(occ[0].title).toBe('Coffee');
  });

  it('builds a Monday-first month grid', () => {
    const grid = buildMonthGrid(2026, 7); // Aug 2026 starts Saturday
    expect(grid.length).toBe(42);
    expect(grid[0].getDay()).toBe(1); // Monday
  });
});
