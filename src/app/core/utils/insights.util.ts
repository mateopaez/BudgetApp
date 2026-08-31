import { roundMoney } from './balance.util';
import { formatMoney, formatMonthYear } from './format.util';

/** Category amount for a single period (expenses only). */
export interface CategoryPeriodAmount {
  categoryId: string;
  name: string;
  amount: number;
}

/** Month-over-month delta for a category. */
export interface CategoryMoMDelta {
  categoryId: string;
  name: string;
  current: number;
  compare: number;
  /** current − compare (positive = spent more). */
  dollarChange: number;
  /** Percent change vs compare period; null when compare is ~0. */
  percentChange: number | null;
  /** Quiet styling hint for small absolute changes. */
  isSmall: boolean;
}

const DEFAULT_SMALL_CHANGE = 5;

/**
 * Merge current and compare category amounts into MoM deltas,
 * sorted by largest absolute dollar change first.
 */
export function computeCategoryMoMDeltas(
  current: CategoryPeriodAmount[],
  compare: CategoryPeriodAmount[],
  options: { smallChangeThreshold?: number } = {}
): CategoryMoMDelta[] {
  const smallThreshold = options.smallChangeThreshold ?? DEFAULT_SMALL_CHANGE;
  const byId = new Map<string, CategoryMoMDelta>();

  for (const row of compare) {
    byId.set(row.categoryId, {
      categoryId: row.categoryId,
      name: row.name,
      current: 0,
      compare: roundMoney(Math.max(0, row.amount)),
      dollarChange: 0,
      percentChange: null,
      isSmall: true,
    });
  }

  for (const row of current) {
    const existing = byId.get(row.categoryId);
    const currentAmt = roundMoney(Math.max(0, row.amount));
    if (existing) {
      existing.current = currentAmt;
      existing.name = row.name;
    } else {
      byId.set(row.categoryId, {
        categoryId: row.categoryId,
        name: row.name,
        current: currentAmt,
        compare: 0,
        dollarChange: 0,
        percentChange: null,
        isSmall: true,
      });
    }
  }

  const rows: CategoryMoMDelta[] = [];
  for (const row of byId.values()) {
    if (row.current === 0 && row.compare === 0) continue;
    const dollarChange = roundMoney(row.current - row.compare);
    const percentChange =
      row.compare > 0.005 ? roundMoney((dollarChange / row.compare) * 100) : null;
    rows.push({
      ...row,
      dollarChange,
      percentChange,
      isSmall: Math.abs(dollarChange) < smallThreshold,
    });
  }

  return rows.sort(
    (a, b) =>
      Math.abs(b.dollarChange) - Math.abs(a.dollarChange) ||
      b.current - a.current ||
      a.name.localeCompare(b.name)
  );
}

/** Top N drivers by absolute dollar change (skips tiny noise). */
export function topCategoryDrivers(
  deltas: CategoryMoMDelta[],
  n = 3,
  minAbsChange = 1
): CategoryMoMDelta[] {
  return deltas.filter((d) => Math.abs(d.dollarChange) >= minAbsChange).slice(0, n);
}

/**
 * Plain-language spending comparison, e.g.
 * “You spent $120 less in April than in March.”
 */
export function spendingComparisonSummary(
  currentSpent: number,
  compareSpent: number,
  currentMonth: Date,
  compareMonth: Date,
  options: { isPartialCurrentMonth?: boolean } = {}
): string {
  const current = roundMoney(Math.max(0, currentSpent));
  const compare = roundMoney(Math.max(0, compareSpent));
  const delta = roundMoney(current - compare);
  const currentLabel = formatMonthName(currentMonth);
  const compareLabel = formatMonthName(compareMonth);
  const partial = options.isPartialCurrentMonth
    ? ' (so far — the month is still in progress)'
    : '';

  if (compare <= 0 && current <= 0) {
    return `No spending recorded in ${currentLabel} or ${compareLabel} yet.`;
  }

  if (Math.abs(delta) < 1) {
    return `You spent about the same in ${currentLabel} as in ${compareLabel}${partial}.`;
  }

  if (delta < 0) {
    return `You spent ${formatMoney(Math.abs(delta))} less in ${currentLabel} than in ${compareLabel}${partial}.`;
  }

  return `You spent ${formatMoney(delta)} more in ${currentLabel} than in ${compareLabel}${partial}.`;
}

export function formatPercentChange(pct: number | null): string | null {
  if (pct == null || !Number.isFinite(pct)) return null;
  const rounded = Math.round(pct);
  if (Math.abs(rounded) < 1) return null;
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}

export function driverBlurb(driver: CategoryMoMDelta): string {
  const abs = formatMoney(Math.abs(driver.dollarChange));
  if (driver.dollarChange > 0) {
    return `${driver.name} up ${abs}`;
  }
  if (driver.dollarChange < 0) {
    return `${driver.name} down ${abs}`;
  }
  return `${driver.name} unchanged`;
}

function formatMonthName(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'long' });
}

/** Inclusive month range ending at `endMonth` (1st of month), spanning `months` months. */
export function trailingMonthRange(
  endMonth: Date,
  months: number
): { start: Date; end: Date; label: string } {
  const end = new Date(endMonth.getFullYear(), endMonth.getMonth() + 1, 0, 23, 59, 59, 999);
  const start = new Date(endMonth.getFullYear(), endMonth.getMonth() - (months - 1), 1);
  return {
    start,
    end,
    label: `${formatMonthYear(start)} – ${formatMonthYear(endMonth)}`,
  };
}

/** Full calendar month range for a date in that month. */
export function fullMonthRange(month: Date): { start: Date; end: Date; label: string } {
  const y = month.getFullYear();
  const m = month.getMonth();
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 0, 23, 59, 59, 999);
  return {
    start,
    end,
    label: formatMonthYear(start),
  };
}

export function isSameCalendarMonth(a: Date, b: Date = new Date()): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function shiftMonth(month: Date, delta: number): Date {
  return new Date(month.getFullYear(), month.getMonth() + delta, 1);
}
