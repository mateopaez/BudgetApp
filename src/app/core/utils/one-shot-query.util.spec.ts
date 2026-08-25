import { oneShotQueryCleanup } from './one-shot-query.util';

describe('one-shot query helpers', () => {
  it('clears only the handled query parameters', () => {
    expect(oneShotQueryCleanup(['action'])).toEqual({ action: null });
    expect(oneShotQueryCleanup(['import'])).toEqual({ import: null });
    expect(oneShotQueryCleanup(['action', 'import'])).toEqual({
      action: null,
      import: null,
    });
  });
});
