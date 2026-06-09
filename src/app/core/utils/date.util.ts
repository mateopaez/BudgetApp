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
