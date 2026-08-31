import { CalendarOccurrence } from './calendar.util';
import { startOfDay } from './date.util';
import { groupPlanOccurrences } from './plan.util';

function occ(title: string, date: Date, kind: 'income' | 'expense' = 'expense'): CalendarOccurrence {
  return {
    id: `${title}-${date.toISOString()}`,
    itemId: title,
    title,
    amount: kind === 'expense' ? -50 : 100,
    kind,
    date: startOfDay(date),
    source: 'scheduled',
    categoryId: null,
    accountId: null,
  };
}

describe('plan.util', () => {
  it('buckets occurrences by relative time', () => {
    const now = startOfDay(new Date(2026, 3, 15)); // Wed Apr 15 2026
    const tomorrow = new Date(2026, 3, 16);
    const laterWeek = new Date(2026, 3, 17); // Fri same week
    const laterMonth = new Date(2026, 3, 28);
    const later = new Date(2026, 5, 1);

    const buckets = groupPlanOccurrences(
      [
        occ('Rent', now),
        occ('Paycheck', tomorrow, 'income'),
        occ('Gym', laterWeek),
        occ('Insurance', laterMonth),
        occ('Vacation', later),
      ],
      now
    );

    expect(buckets.map((b) => b.id)).toEqual([
      'today',
      'tomorrow',
      'this_week',
      'later_month',
      'later',
    ]);
    expect(buckets.find((b) => b.id === 'today')?.items[0].title).toBe('Rent');
    expect(buckets.find((b) => b.id === 'tomorrow')?.items[0].title).toBe('Paycheck');
  });

  it('omits empty buckets', () => {
    const now = startOfDay(new Date(2026, 3, 15));
    const buckets = groupPlanOccurrences([occ('Only today', now)], now);
    expect(buckets.length).toBe(1);
    expect(buckets[0].id).toBe('today');
  });
});
