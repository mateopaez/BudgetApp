import {
  detectImportKind,
  isLikelyCcPayment,
  isLikelyPaymentOrTransfer,
  isLikelyTransfer,
  normalizeImportKindText,
} from './import-kind-detection.util';

describe('import kind detection', () => {
  it('normalizes merchant, description, and type into one searchable string', () => {
    expect(normalizeImportKindText('JB163 TFR-FR 6028821', null, 'Debit')).toContain('tfr-fr');
  });

  describe('transfers', () => {
    const cases = [
      'JB163 TFR-FR 6028821',
      'JL544 TFR-TO 6585932',
      'SEND E-TFR ***S7v',
      'E-TRANSFER ***8GU',
      'ACH TRANSFER TO SAVINGS',
      'ONLINE TRANSFER REF #123',
      'WIRE TRANSFER IN',
      'FT-DR 12345',
      'INTERAC E-TRANSFER',
      'ZELLE PAYMENT FROM JOHN',
      'XFER TO CHECKING',
    ];

    cases.forEach((merchant) => {
      it(`detects "${merchant}" as a transfer`, () => {
        expect(isLikelyTransfer(merchant)).toBe(true);
        expect(isLikelyPaymentOrTransfer(merchant)).toBe(true);
      });
    });
  });

  describe('credit card payments', () => {
    const cases = [
      'PC MASTRCRD K7U9L7',
      'CHASE CARD AUTOPAY',
      'AMERICAN EXPRESS ACH PMT',
      'CREDIT CARD PAYMENT',
      'VISA PAYMENT',
      'DISCOVER CARD PAYMT',
      'CAPITAL ONE ONLINE PAYMENT',
      'CARDMEMBER SERV WEB PYMT',
    ];

    cases.forEach((merchant) => {
      it(`detects "${merchant}" as a card payment`, () => {
        expect(isLikelyCcPayment(merchant)).toBe(true);
        expect(isLikelyPaymentOrTransfer(merchant)).toBe(true);
      });
    });
  });

  it('classifies TD-style transfers and PC Mastercard payments during import', () => {
    expect(
      detectImportKind(-90, 'JL544 TFR-TO 6585932', null, null, false, null)
    ).toEqual({ kind: 'transfer', categoryId: null });

    expect(
      detectImportKind(90, 'JY071 TFR-FR 6585932', null, null, false, null)
    ).toEqual({ kind: 'transfer', categoryId: null });

    expect(
      detectImportKind(-500, 'PC MASTRCRD K7U9L7', null, null, true, 'cc-cat')
    ).toEqual({ kind: 'cc_payment', categoryId: 'cc-cat' });
  });

  it('prefers card payment over transfer when both patterns appear', () => {
    expect(
      detectImportKind(-200, 'TFR-TO PC MASTRCRD', null, null, true, 'cc-cat')
    ).toEqual({ kind: 'cc_payment', categoryId: 'cc-cat' });
  });

  it('falls back to expense/income when no special pattern matches', () => {
    expect(detectImportKind(-12.5, 'STARBUCKS', null, null, true, null)).toEqual({
      kind: 'expense',
      categoryId: null,
    });
    expect(detectImportKind(1200, 'ACME PAYROLL', null, null, true, null)).toEqual({
      kind: 'income',
      categoryId: null,
    });
  });

  it('honors a PAYMENT type column on card statement imports', () => {
    expect(
      detectImportKind(250, 'THANK YOU', null, 'Payment', true, 'cc-cat')
    ).toEqual({ kind: 'cc_payment', categoryId: 'cc-cat' });
  });
});
