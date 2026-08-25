import { Component, inject, OnInit } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { AccountService } from '../../core/services/account.service';
import { AuthService } from '../../core/services/auth.service';
import { CategoryService } from '../../core/services/category.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatSidenavModule,
    MatListModule,
    MatMenuModule,
  ],
  template: `
    <mat-sidenav-container class="min-h-screen bg-canvas">
      <mat-sidenav #drawer mode="over" class="!w-72" fixedInViewport [autoFocus]="false">
        <div class="app-drawer-content flex h-full flex-col bg-surface">
          <div class="border-b border-line px-5 py-6">
            <p class="text-lg font-bold tracking-[-0.02em] text-ink">BudgetApp</p>
            <p class="mt-1 truncate text-xs text-ink-muted">{{ auth.user()?.email }}</p>
          </div>

          <mat-nav-list class="flex-1 overflow-y-auto py-3">
            @for (item of primaryNav; track item.path) {
              <a
                mat-list-item
                [routerLink]="item.path"
                #primaryNavActive="routerLinkActive"
                routerLinkActive="active-nav"
                [routerLinkActiveOptions]="{ exact: true }"
                [attr.aria-current]="primaryNavActive.isActive ? 'page' : null"
                (click)="drawer.close()"
              >
                <mat-icon matListItemIcon>{{ item.icon }}</mat-icon>
                <span matListItemTitle>{{ item.label }}</span>
              </a>
            }

            <div class="px-5 pb-2 pt-5 text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">
              Manage
            </div>
            @for (item of secondaryNav; track item.path) {
              <a
                mat-list-item
                [routerLink]="item.path"
                #secondaryNavActive="routerLinkActive"
                routerLinkActive="active-nav"
                [routerLinkActiveOptions]="{ exact: true }"
                [attr.aria-current]="secondaryNavActive.isActive ? 'page' : null"
                (click)="drawer.close()"
              >
                <mat-icon matListItemIcon>{{ item.icon }}</mat-icon>
                <span matListItemTitle>{{ item.label }}</span>
              </a>
            }
          </mat-nav-list>

          <div class="shrink-0 border-t border-line p-4">
            <button mat-stroked-button class="!w-full" (click)="signOut()">Sign out</button>
          </div>
        </div>
      </mat-sidenav>

      <mat-sidenav-content class="min-h-screen bg-canvas">
        <mat-toolbar class="app-toolbar sticky top-0 z-20 !shadow-none">
          <div class="flex min-w-0 flex-1 items-center gap-1">
            <button
              mat-icon-button
              class="!inline-flex !h-10 !w-10 !shrink-0 !items-center !justify-center"
              (click)="drawer.toggle()"
              aria-label="Open navigation"
            >
              <mat-icon>menu</mat-icon>
            </button>
            <span class="truncate text-base font-semibold leading-none tracking-[-0.02em]">BudgetApp</span>
          </div>
          <button mat-flat-button color="primary" [matMenuTriggerFor]="quickAdd" class="!hidden sm:!inline-flex">
            <mat-icon>add</mat-icon>
            Add
          </button>
          <mat-menu #quickAdd="matMenu">
            <a mat-menu-item routerLink="/transactions" [queryParams]="{ action: 'add' }">
              <mat-icon>add_card</mat-icon>
              <span>Add transaction</span>
            </a>
            <a mat-menu-item routerLink="/transactions" [queryParams]="{ import: '1' }">
              <mat-icon>upload_file</mat-icon>
              <span>Import CSV</span>
            </a>
            <a mat-menu-item routerLink="/calendar" [queryParams]="{ action: 'add' }">
              <mat-icon>event_available</mat-icon>
              <span>Add bill or paycheck</span>
            </a>
            <a mat-menu-item routerLink="/accounts" [queryParams]="{ action: 'add' }">
              <mat-icon>account_balance_wallet</mat-icon>
              <span>Add account</span>
            </a>
          </mat-menu>
        </mat-toolbar>

        <main class="app-main-content mx-auto max-w-7xl p-4 sm:p-6">
          <router-outlet />
        </main>

        <nav
          class="app-bottom-nav fixed inset-x-3 z-30 grid grid-cols-4 rounded-3xl border border-line bg-surface/95 p-1 shadow-floating backdrop-blur lg:hidden"
          aria-label="Primary navigation"
        >
          @for (item of primaryNav; track item.path) {
            <a
              class="flex min-h-14 flex-col items-center justify-center rounded-2xl px-1 text-xs font-medium text-ink-muted transition hover:bg-action-soft/50"
              [routerLink]="item.path"
              #mobileNavActive="routerLinkActive"
              routerLinkActive="!bg-action-soft !text-ink"
              [routerLinkActiveOptions]="{ exact: true }"
              [attr.aria-current]="mobileNavActive.isActive ? 'page' : null"
            >
              <mat-icon class="!text-[20px]">{{ item.icon }}</mat-icon>
              <span>{{ item.label }}</span>
            </a>
          }
        </nav>

        <button
          mat-fab
          color="primary"
          class="app-quick-add-fab !fixed !right-4 !z-30 sm:!hidden"
          [matMenuTriggerFor]="quickAdd"
          aria-label="Add or import"
        >
          <mat-icon>add</mat-icon>
        </button>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
})
export class ShellComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly accountService = inject(AccountService);
  private readonly categoryService = inject(CategoryService);

  readonly primaryNav = [
    { path: '/dashboard', label: 'Home', icon: 'home' },
    { path: '/transactions', label: 'Activity', icon: 'receipt_long' },
    { path: '/calendar', label: 'Plan', icon: 'event' },
    { path: '/categories', label: 'Budgets', icon: 'donut_large' },
  ];

  readonly secondaryNav = [
    { path: '/accounts', label: 'Accounts', icon: 'account_balance_wallet' },
  ];

  ngOnInit(): void {
    void this.categoryService.seedIfNeeded();
    void this.accountService.seedIfNeeded();
  }

  signOut(): void {
    void this.auth.signOut();
  }
}
