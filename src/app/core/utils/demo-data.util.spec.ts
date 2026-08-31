import { buildDemoSeedPlan, demoRand } from './demo-data.util';

describe('demoRand', () => {
  it('is deterministic and in [0, 1)', () => {
    expect(demoRand(42)).toBe(demoRand(42));
    expect(demoRand(1)).toBeGreaterThanOrEqual(0);
    expect(demoRand(1)).toBeLessThan(1);
    expect(demoRand(1)).not.toBe(demoRand(2));
  });
});

describe('buildDemoSeedPlan', () => {
  const now = new Date(2026, 7, 25); // Aug 25, 2026

  it('covers ~3 months with paycheck, rent, and mixed categorization', () => {
    const plan = buildDemoSeedPlan(now);

    expect(plan.openingDate).toEqual(new Date(2026, 4, 1)); // May 1
    expect(plan.openings.checking).toBe(4200);
    expect(plan.openings.credit_card).toBeLessThan(0);

    expect(plan.schedules.map((s) => s.key)).toEqual(['paycheck', 'rent']);
    expect(plan.schedules[0].input.dayOfMonth).toBe(15);
    expect(plan.schedules[1].input.dayOfMonth).toBe(1);

    const paychecks = plan.transactions.filter((t) => t.scheduleKey === 'paycheck');
    const rents = plan.transactions.filter((t) => t.scheduleKey === 'rent');
    expect(paychecks.length).toBe(4); // May–Aug
    expect(rents.length).toBe(4);
    expect(paychecks.every((t) => t.amount === 3200 && t.kind === 'income')).toBe(true);
    expect(rents.every((t) => t.amount === -1850 && t.kind === 'expense')).toBe(true);

    const categorized = plan.transactions.filter((t) => t.categoryName != null);
    const uncategorized = plan.transactions.filter((t) => t.categoryName == null);
    expect(categorized.length).toBeGreaterThan(20);
    expect(uncategorized.length).toBeGreaterThan(10);
    expect(plan.transactions.length).toBeGreaterThan(80);

    const last = plan.transactions[plan.transactions.length - 1];
    expect(last.postedAt.getTime()).toBeLessThanOrEqual(now.getTime());
  });

  it('is reproducible for the same as-of date', () => {
    const a = buildDemoSeedPlan(now);
    const b = buildDemoSeedPlan(now);
    expect(a.transactions.length).toBe(b.transactions.length);
    expect(a.transactions.map((t) => t.merchant)).toEqual(b.transactions.map((t) => t.merchant));
    expect(a.transactions.map((t) => t.amount)).toEqual(b.transactions.map((t) => t.amount));
  });
});
