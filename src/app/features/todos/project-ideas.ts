export interface ProjectIdea {
  id: string;
  title: string;
  children?: ProjectIdea[];
}

export const PROJECT_IDEAS: ProjectIdea[] = [
  {
    id: 'transactions-ui',
    title: 'Fix transaction UI, allow sorting of income vs expenses.',
    children: [
      {
        id: 'transactions-balance',
        title:
          'Make sure it interacts with total balance correctly. Old transactions does not interfere with modern balance.',
      },
      {
        id: 'transactions-date-range',
        title: 'Instead of per month, allow date range lookup.',
      },
    ],
  },
  {
    id: 'csv-headers',
    title: 'Allow all CSV header types, not just hardcoded from my personal 1 CSV account',
  },
  { id: 'category-budgets', title: 'Set budgets per category' },
  { id: 'dashboard-overhaul', title: 'Dashboard overhaul, per category spending.' },
  {
    id: 'calendar-bills',
    title:
      'Calendar / upcoming bill system. Can choose week view or month view. Can put in fixed dates for income or bills',
  },
  { id: 'balance-comparison', title: 'Balance comparison to some extent ?' },
  { id: 'weekly-overview', title: 'Weekly overview (over/under budget info)' },
  { id: 'debts-owed', title: 'Debts owed kinda thing' },
  {
    id: 'spending-recommendations',
    title:
      'Recommendations based on spending habits. "Spend less on takeout vs spend more on necessities")',
  },
  {
    id: 'debt-calculator',
    title:
      'Debt calculator (If I up/lower my payments how does that affect my time to pay off my debt?)',
  },
  {
    id: 'client-encryption',
    title:
      "Client side encryption so Firebase admins can't see any data. Maybe leave date unencrypted so it still is easily queryable?",
  },
];

export function allIdeaIds(ideas: ProjectIdea[]): string[] {
  return ideas.flatMap((idea) => [idea.id, ...(idea.children?.map((c) => c.id) ?? [])]);
}
