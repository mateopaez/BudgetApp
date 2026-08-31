import { signedAmountForKind } from './amount.util';

describe('signedAmountForKind', () => {
  it('signs expense as outflow and income as inflow', () => {
    expect(signedAmountForKind(42.5, 'expense')).toBe(-42.5);
    expect(signedAmountForKind(100, 'income')).toBe(100);
  });

  it('signs transfer dual legs from/to', () => {
    expect(signedAmountForKind(50, 'transfer', 'from')).toBe(-50);
    expect(signedAmountForKind(50, 'transfer', 'to')).toBe(50);
    expect(signedAmountForKind(50, 'transfer')).toBe(-50);
  });

  it('signs cc_payment dual legs cash-out / card-in', () => {
    expect(signedAmountForKind(100, 'cc_payment', 'from')).toBe(-100);
    expect(signedAmountForKind(100, 'cc_payment', 'to')).toBe(100);
    expect(signedAmountForKind(100, 'cc_payment')).toBe(100);
  });
});
