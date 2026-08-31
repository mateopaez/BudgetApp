import { CalendarOccurrence } from './calendar.util';
import { endOfDay, startOfDay } from './date.util';

export type PlanBucketId = 'today' | 'tomorrow' | 'this_week' | 'later_month' | 'later';

export interface PlanBucket {
  id: PlanBucketId;
  label: string;
  items: CalendarOccurrence[];
}

function startOfWeekMonday(now: Date): Date {
  const d = startOfDay(now);
  const day = d.getDay();
  const fromMonday = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - fromMonday);
  return d;
}

function endOfWeekSunday(now: Date): Date {
  const start = startOfWeekMonday(now);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return endOfDay(end);
}

function endOfCurrentMonth(now: Date): Date {
  return endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));
}

/** Group upcoming occurrences into relative-time buckets for Plan. */
export function groupPlanOccurrences(
  items: CalendarOccurrence[],
  now: Date = new Date()
): PlanBucket[] {
  const today = startOfDay(now);
  const tomorrow = startOfDay(new Date(today));
  tomorrow.setDate(tomorrow.getDate() + 1);
  const weekEnd = endOfWeekSunday(now);
  const monthEnd = endOfCurrentMonth(now);

  const buckets: Record<PlanBucketId, CalendarOccurrence[]> = {
    today: [],
    tomorrow: [],
    this_week: [],
    later_month: [],
    later: [],
  };

  const sorted = [...items].sort((a, b) => a.date.getTime() - b.date.getTime());

  for (const item of sorted) {
    const d = startOfDay(item.date);
    if (d.getTime() === today.getTime()) {
      buckets.today.push(item);
    } else if (d.getTime() === tomorrow.getTime()) {
      buckets.tomorrow.push(item);
    } else if (d > tomorrow && d <= weekEnd) {
      buckets.this_week.push(item);
    } else if (d > weekEnd && d <= monthEnd) {
      buckets.later_month.push(item);
    } else if (d > monthEnd) {
      buckets.later.push(item);
    }
  }

  const labels: Record<PlanBucketId, string> = {
    today: 'Today',
    tomorrow: 'Tomorrow',
    this_week: 'This week',
    later_month: 'Later this month',
    later: 'Later',
  };

  return (Object.keys(labels) as PlanBucketId[])
    .map((id) => ({ id, label: labels[id], items: buckets[id] }))
    .filter((b) => b.items.length > 0);
}

export function planHorizonEnd(now: Date = new Date(), monthsAhead = 2): Date {
  return endOfDay(new Date(now.getFullYear(), now.getMonth() + monthsAhead + 1, 0));
}
