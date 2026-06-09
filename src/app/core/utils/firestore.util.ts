import { Timestamp } from 'firebase/firestore';

export function toDate(value: unknown): Date {
  if (value instanceof Timestamp) {
    return value.toDate();
  }
  if (value instanceof Date) {
    return value;
  }
  return new Date(value as string);
}

export function toTimestamp(date: Date): Timestamp {
  return Timestamp.fromDate(date);
}
