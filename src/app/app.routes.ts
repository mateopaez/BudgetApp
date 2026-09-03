import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  {
    path: 'auth',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/auth.component').then((m) => m.AuthComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell/shell.component').then((m) => m.ShellComponent),
    children: [
      {
        path: 'home',
        loadComponent: () => import('./features/home/home.component').then((m) => m.HomeComponent),
      },
      {
        path: 'activity',
        loadComponent: () =>
          import('./features/transactions/transactions.component').then((m) => m.TransactionsComponent),
      },
      {
        path: 'plan',
        loadComponent: () => import('./features/plan/plan.component').then((m) => m.PlanComponent),
      },
      {
        path: 'budgets',
        loadComponent: () =>
          import('./features/budgets/budgets.component').then((m) => m.BudgetsComponent),
      },
      {
        path: 'accounts',
        loadComponent: () =>
          import('./features/accounts/accounts.component').then((m) => m.AccountsComponent),
      },
      {
        path: 'insights',
        loadComponent: () =>
          import('./features/insights/insights.component').then((m) => m.InsightsComponent),
      },
      // Legacy redirects
      { path: 'dashboard', redirectTo: 'home', pathMatch: 'full' },
      { path: 'transactions', redirectTo: 'activity', pathMatch: 'full' },
      { path: 'calendar', redirectTo: 'plan', pathMatch: 'full' },
      { path: 'categories', redirectTo: 'budgets', pathMatch: 'full' },
      { path: 'overview', redirectTo: 'plan', pathMatch: 'full' },
      { path: 'import', redirectTo: 'activity', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: 'home' },
];
