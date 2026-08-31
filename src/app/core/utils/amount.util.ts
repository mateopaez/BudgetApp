import { TransactionKind } from '../models';

export type AmountLeg = 'from' | 'to' | 'single';

/**
 * Stored transaction amount from a positive user-entered value and kind.
 * Dual-leg kinds (transfer, cc_payment):
 * - from = outflow (−)
 * - to = inflow (+)
 * Single-leg legacy rows: expense/transfer outflow; income/cc_payment inflow
 * (cc_payment single-leg was historically stored positive on the card).
 */
export function signedAmountForKind(
  absAmount: number,
  kind: TransactionKind,
  leg: AmountLeg = 'single'
): number {
  const abs = Math.abs(absAmount);

  if (kind === 'transfer' || kind === 'cc_payment') {
    if (leg === 'to') return abs;
    if (leg === 'from') return -abs;
    // Legacy single-leg: transfer outflow; cc_payment positive (card side).
    return kind === 'transfer' ? -abs : abs;
  }

  if (kind === 'expense') return -abs;
  return abs; // income
}

/** Positive value for the amount input when editing an existing transaction. */
export function absoluteAmountForForm(amount: number): number {
  return Math.abs(amount);
}

export function amountHintForKind(kind: TransactionKind, leg: AmountLeg = 'single'): string {
  switch (kind) {
    case 'expense':
      return 'Recorded as an outflow (subtracts from balance)';
    case 'income':
      return 'Recorded as an inflow (adds to balance)';
    case 'transfer':
      if (leg === 'to') return 'Added to the destination account';
      return 'Leaves the from account; a matching inflow is added to the destination';
    case 'cc_payment':
      if (leg === 'to') return 'Applied to the card (reduces what you owe)';
      return 'Leaves the cash account; a matching credit is applied to the card';
  }
}
