import { ScheduledItem, Transaction } from '../models';
import { endOfDay, startOfDay } from './date.util';
import { roundMoney } from './balance.util';

export interface CalendarOccurrence {
  id: string;
  itemId: string;
  title: string;
  amount: number;
  kind: 'income' | 'expense';
  date: Date;
  source: 'scheduled' | 'transaction';
  categoryId: string | null;
  accountId: string | null;
}

export function signedScheduledAmount(item: Pick<ScheduledItem, 'amount' | 'kind'>): number {
  const abs = Math.abs(item.amount);
  return item.kind === 'expense' ? -abs : abs;
}

/** Expand active scheduled items into concrete dates within [rangeStart, rangeEnd]. */
export function expandScheduledOccurrences(
  items: ScheduledItem[],
  rangeStart: Date,
  rangeEnd: Date
): CalendarOccurrence[] {
  const start = startOfDay(rangeStart);
  const end = startOfDay(rangeEnd);
  const out: CalendarOccurrence[] = [];

  for (const item of items) {
    if (!item.isActive) continue;
    const itemStart = startOfDay(item.startDate);
    const itemEnd = item.endDate ? startOfDay(item.endDate) : null;

    if (item.scheduleType === 'fixed' && item.fixedDate) {
      const d = startOfDay(item.fixedDate);
      if (d >= start && d <= end && d >= itemStart && (!itemEnd || d <= itemEnd)) {
        out.push(toOccurrence(item, d));
      }
      continue;
    }

    if (item.scheduleType === 'monthly' && item.dayOfMonth != null) {
      let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
      const last = new Date(end.getFullYear(), end.getMonth(), 1);
      while (cursor <= last) {
        const day = Math.min(item.dayOfMonth, daysInMonth(cursor.getFullYear(), cursor.getMonth()));
        const d = startOfDay(new Date(cursor.getFullYear(), cursor.getMonth(), day));
        if (d >= start && d <= end && d >= itemStart && (!itemEnd || d <= itemEnd)) {
          out.push(toOccurrence(item, d));
        }
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      }
      continue;
    }

    if (item.scheduleType === 'weekly' && item.dayOfWeek != null) {
      const d = startOfDay(new Date(start));
      const diff = (item.dayOfWeek - d.getDay() + 7) % 7;
      d.setDate(d.getDate() + diff);
      while (d <= end) {
        if (d >= itemStart && (!itemEnd || d <= itemEnd)) {
          out.push(toOccurrence(item, startOfDay(new Date(d))));
        }
        d.setDate(d.getDate() + 7);
      }
    }
  }

  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function transactionsAsOccurrences(
  transactions: Transaction[],
  rangeStart: Date,
  rangeEnd: Date
): CalendarOccurrence[] {
  const start = startOfDay(rangeStart);
  const end = endOfDay(rangeEnd);

  return transactions
    .filter((tx) => {
      const d = tx.postedAt;
      return d >= start && d <= end && (tx.kind === 'income' || tx.kind === 'expense');
    })
    .map((tx) => ({
      id: `tx:${tx.id}`,
      itemId: tx.id,
      title: tx.merchant,
      amount: tx.amount,
      kind: tx.kind === 'income' ? ('income' as const) : ('expense' as const),
      date: startOfDay(tx.postedAt),
      source: 'transaction' as const,
      categoryId: tx.categoryId,
      accountId: tx.accountId,
    }));
}

export function mergeCalendarDay(
  scheduled: CalendarOccurrence[],
  actual: CalendarOccurrence[]
): CalendarOccurrence[] {
  return [...scheduled, ...actual].sort((a, b) => {
    if (a.source !== b.source) return a.source === 'scheduled' ? -1 : 1;
    return Math.abs(b.amount) - Math.abs(a.amount);
  });
}

export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function groupOccurrencesByDay(
  occurrences: CalendarOccurrence[]
): Map<string, CalendarOccurrence[]> {
  const map = new Map<string, CalendarOccurrence[]>();
  for (const occ of occurrences) {
    const key = dayKey(occ.date);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(occ);
  }
  return map;
}

export function dayNet(occurrences: CalendarOccurrence[]): number {
  return roundMoney(occurrences.reduce((sum, o) => sum + o.amount, 0));
}

function toOccurrence(item: ScheduledItem, date: Date): CalendarOccurrence {
  return {
    id: `sch:${item.id}:${dayKey(date)}`,
    itemId: item.id,
    title: item.title,
    amount: signedScheduledAmount(item),
    kind: item.kind,
    date,
    source: 'scheduled',
    categoryId: item.categoryId,
    accountId: item.accountId,
  };
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** Next (or most recent due) occurrence to post as a real transaction. */
export function resolveScheduledPostingDate(
  item: ScheduledItem,
  now: Date = new Date()
): Date | null {
  const today = startOfDay(now);
  const rangeStart = startOfDay(item.startDate);
  const rangeEnd = startOfDay(new Date(today));
  rangeEnd.setMonth(rangeEnd.getMonth() + 3);

  const occs = expandScheduledOccurrences([item], rangeStart, rangeEnd).map((o) => o.date);
  if (occs.length === 0) return null;

  const dueOrPast = [...occs].reverse().find((d) => d.getTime() <= today.getTime());
  if (dueOrPast) return dueOrPast;
  return occs.find((d) => d.getTime() >= today.getTime()) ?? null;
}

/** Drop scheduled rows that already have a posted transaction for the same item + day. */
export function filterPostedScheduledOccurrences(
  scheduled: CalendarOccurrence[],
  transactions: Transaction[]
): CalendarOccurrence[] {
  const posted = new Set(
    transactions
      .filter((tx) => tx.scheduledItemId)
      .map((tx) => `${tx.scheduledItemId}:${dayKey(tx.postedAt)}`)
  );
  return scheduled.filter((occ) => !posted.has(`${occ.itemId}:${dayKey(occ.date)}`));
}

export function buildMonthGrid(year: number, monthIndex: number): Date[] {
  const first = new Date(year, monthIndex, 1);
  const startOffset = (first.getDay() + 6) % 7; // Monday-first
  const gridStart = new Date(year, monthIndex, 1 - startOffset);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    cells.push(startOfDay(d));
  }
  return cells;
}

export function weekDays(weekStart: Date): Date[] {
  const start = startOfDay(weekStart);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}
