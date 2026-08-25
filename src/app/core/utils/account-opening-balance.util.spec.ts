import {
  creditCardOpeningBalanceForForm,
  openingBalanceForStorage,
} from './account-opening-balance.util';

describe('account opening balance helpers', () => {
  it('shows stored credit-card debt as a positive amount owed', () => {
    expect(creditCardOpeningBalanceForForm(-425.5)).toBe(425.5);
  });

  it('stores a positive amount owed as negative debt', () => {
    expect(openingBalanceForStorage('credit_card', 425.5)).toBe(-425.5);
  });

  it('preserves an existing positive credit balance when requested', () => {
    expect(openingBalanceForStorage('credit_card', 75, true)).toBe(75);
  });

  it('does not change checking or savings opening balances', () => {
    expect(openingBalanceForStorage('checking', -20)).toBe(-20);
    expect(openingBalanceForStorage('savings', 1000)).toBe(1000);
  });
});
