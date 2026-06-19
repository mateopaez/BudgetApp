export function parsePostedAt(dateStr: string, timeStr: string): Date {
  const date = dateStr.trim();
  const time = timeStr?.trim() || '00:00:00';
  const combined = `${date}T${time}`;
  const parsed = new Date(combined);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }
  return new Date(`${date} ${time}`);
}

export function monthKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function startOfMonth(year: number, month: number): Date {
  return new Date(year, month - 1, 1);
}

export function endOfMonth(year: number, month: number): Date {
  return new Date(year, month, 0, 23, 59, 59, 999);
}

export type DateRangePreset =
  | 'all'
  | 'this_month'
  | 'last_30_days'
  | 'last_3_months'
  | 'ytd'
  | 'custom';

export interface ResolvedDateRange {
  start: Date | null;
  end: Date | null;
  label: string;
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

export function resolveDateRange(
  preset: DateRangePreset,
  customFrom?: string | Date | null,
  customTo?: string | Date | null,
  now: Date = new Date()
): ResolvedDateRange {
  const todayEnd = endOfDay(now);

  switch (preset) {
    case 'all':
      return { start: null, end: null, label: 'all time' };
    case 'this_month': {
      const start = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
      return { start, end: todayEnd, label: formatRangeLabel(start, todayEnd) };
    }
    case 'last_30_days': {
      const start = startOfDay(new Date(now));
      start.setDate(start.getDate() - 29);
      return { start, end: todayEnd, label: 'last 30 days' };
    }
    case 'last_3_months': {
      const start = startOfDay(new Date(now));
      start.setMonth(start.getMonth() - 3);
      return { start, end: todayEnd, label: 'last 3 months' };
    }
    case 'ytd': {
      const start = startOfDay(new Date(now.getFullYear(), 0, 1));
      return { start, end: todayEnd, label: 'year to date' };
    }
    case 'custom': {
      const start = customFrom ? startOfDay(toDateValue(customFrom)!) : null;
      const end = customTo ? endOfDay(toDateValue(customTo)!) : null;
      if (start && end) {
        return { start, end, label: formatRangeLabel(start, end) };
      }
      return { start: null, end: null, label: 'custom range' };
    }
  }
}

export function parseDateParam(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDateParam(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toDateValue(value: string | Date): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isWithinDateRange(date: Date, range: ResolvedDateRange): boolean {
  if (range.start && date < range.start) return false;
  if (range.end && date > range.end) return false;
  return true;
}

export function formatRangeLabel(start: Date, end: Date): string {
  const sameYear = start.getFullYear() === end.getFullYear();
  const fmt = (d: Date, withYear: boolean) =>
    d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      ...(withYear ? { year: 'numeric' } : {}),
    });
  return `${fmt(start, !sameYear)} – ${fmt(end, true)}`;
}
