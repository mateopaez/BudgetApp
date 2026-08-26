import { TransactionKind } from '../models';

const OUTFLOW_KINDS: TransactionKind[] = ['expense', 'transfer'];

/** Stored transaction amount from a positive user-entered value and kind. */
export function signedAmountForKind(absAmount: number, kind: TransactionKind): number {
  const abs = Math.abs(absAmount);
  if (OUTFLOW_KINDS.includes(kind)) {
    return -abs;
  }
  return abs;
}

/** Positive value for the amount input when editing an existing transaction. */
export function absoluteAmountForForm(amount: number): number {
  return Math.abs(amount);
}

export function amountHintForKind(kind: TransactionKind): string {
  switch (kind) {
    case 'expense':
      return 'Recorded as an outflow (subtracts from balance)';
    case 'income':
      return 'Recorded as an inflow (adds to balance)';
    case 'transfer':
      return 'Recorded as an outflow from this account';
    case 'cc_payment':
      return 'Recorded as a payment (positive on the card account)';
  }
}
