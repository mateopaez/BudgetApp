/** Shared formatting helpers for money and dates. */

const currencyFmt = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
});

const currencyCompactFmt = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

export function formatMoney(amount: number, compact = false): string {
  return (compact ? currencyCompactFmt : currencyFmt).format(amount);
}

export function formatMoneyAbs(amount: number): string {
  return formatMoney(Math.abs(amount));
}

export function formatSignedMoney(amount: number): string {
  if (amount > 0) return `+${formatMoney(amount)}`;
  if (amount < 0) return `−${formatMoney(Math.abs(amount))}`;
  return formatMoney(0);
}

export function formatMonthYear(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function formatShortDate(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatWeekdayDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}
