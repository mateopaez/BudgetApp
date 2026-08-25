import { AccountType } from '../models';

export function creditCardOpeningBalanceForForm(storedBalance: number): number {
  return storedBalance < 0 ? Math.abs(storedBalance) : storedBalance;
}

export function openingBalanceForStorage(
  type: AccountType,
  enteredBalance: number,
  preservePositiveCredit = false
): number {
  if (type !== 'credit_card') return enteredBalance;
  return preservePositiveCredit ? Math.abs(enteredBalance) : -Math.abs(enteredBalance);
}
