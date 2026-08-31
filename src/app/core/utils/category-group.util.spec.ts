import {
  CATEGORY_GROUP_ORDER,
  Category,
  DEFAULT_CATEGORY_GROUPS,
} from '../models';
import {
  groupCategoriesByBudgetGroup,
  resolveCategoryGroup,
} from './category-group.util';

describe('category-group.util', () => {
  it('uses explicit group when present', () => {
    expect(
      resolveCategoryGroup({ name: 'Weird', group: 'debt', isSystem: false })
    ).toBe('debt');
  });

  it('infers from default category names', () => {
    expect(resolveCategoryGroup({ name: 'Groceries', isSystem: false })).toBe(
      DEFAULT_CATEGORY_GROUPS.Groceries
    );
  });

  it('infers from name hints', () => {
    expect(resolveCategoryGroup({ name: 'Student Loan', isSystem: false })).toBe('debt');
    expect(resolveCategoryGroup({ name: 'Coffee shops', isSystem: false })).toBe('lifestyle');
  });

  it('groups categories in display order', () => {
    const cats: Category[] = [
      {
        id: '1',
        name: 'Groceries',
        isSystem: false,
        createdAt: new Date(),
      },
      {
        id: '2',
        name: 'Dining',
        isSystem: false,
        createdAt: new Date(),
      },
      {
        id: '3',
        name: 'Credit Card Payment',
        isSystem: true,
        systemKey: 'cc_payment',
        createdAt: new Date(),
      },
    ];
    const groups = groupCategoriesByBudgetGroup(cats);
    expect(groups.map((g) => g.group)).toEqual(
      CATEGORY_GROUP_ORDER.filter((g) => groups.some((x) => x.group === g))
    );
    expect(groups.find((g) => g.group === 'essentials')?.categories.map((c) => c.name)).toEqual([
      'Groceries',
    ]);
    expect(groups.every((g) => g.categories.every((c) => !c.isSystem))).toBeTrue();
  });
});
