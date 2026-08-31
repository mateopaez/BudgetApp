import {
  CATEGORY_GROUP_LABELS,
  CATEGORY_GROUP_ORDER,
  Category,
  CategoryGroup,
  DEFAULT_CATEGORY_GROUPS,
} from '../models';

const NAME_GROUP_HINTS: Array<{ group: CategoryGroup; patterns: RegExp[] }> = [
  {
    group: 'essentials',
    patterns: [
      /grocer/i,
      /rent|mortgage|housing/i,
      /utilit/i,
      /insurance/i,
      /health|medical|pharmacy/i,
      /transport|gas|fuel|transit|parking/i,
      /phone|internet|telecom/i,
      /child.?care|daycare/i,
    ],
  },
  {
    group: 'lifestyle',
    patterns: [
      /dining|restaurant|eating.?out|food.?out/i,
      /entertain|movie|hobby/i,
      /shop|clothing|apparel/i,
      /travel|vacation|hotel/i,
      /subscription|streaming/i,
      /coffee|bar|alcohol/i,
      /fitness|gym/i,
    ],
  },
  {
    group: 'debt',
    patterns: [/loan|debt|interest|fee|credit.?card.?payment|student.?loan|car.?payment/i],
  },
];

/** Resolve a category's display group, inferring from name when unset. */
export function resolveCategoryGroup(category: Pick<Category, 'name' | 'group' | 'isSystem'>): CategoryGroup {
  if (category.isSystem) return 'other';
  if (category.group) return category.group;

  const known = (DEFAULT_CATEGORY_GROUPS as Record<string, CategoryGroup>)[category.name];
  if (known) return known;

  for (const hint of NAME_GROUP_HINTS) {
    if (hint.patterns.some((re) => re.test(category.name))) {
      return hint.group;
    }
  }
  return 'other';
}

export function categoryGroupLabel(group: CategoryGroup): string {
  return CATEGORY_GROUP_LABELS[group];
}

export function groupCategoriesByBudgetGroup(
  categories: Category[]
): Array<{ group: CategoryGroup; label: string; categories: Category[] }> {
  const buckets = new Map<CategoryGroup, Category[]>();
  for (const g of CATEGORY_GROUP_ORDER) buckets.set(g, []);

  for (const cat of categories) {
    if (cat.isSystem || cat.archivedAt) continue;
    const group = resolveCategoryGroup(cat);
    buckets.get(group)!.push(cat);
  }

  for (const list of buckets.values()) {
    list.sort((a, b) => {
      const ao = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
      const bo = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      return a.name.localeCompare(b.name);
    });
  }

  return CATEGORY_GROUP_ORDER.map((group) => ({
    group,
    label: categoryGroupLabel(group),
    categories: buckets.get(group) ?? [],
  })).filter((g) => g.categories.length > 0);
}
