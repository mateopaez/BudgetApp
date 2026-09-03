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

interface NavItem {
  path: string;
  label: string;
  icon: string;
  exact?: boolean;
}

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
    <div class="flex min-h-screen bg-canvas">
      <!-- Desktop side nav: plain aside so content is never covered -->
      <aside
        class="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-surface lg:flex"
        aria-label="Primary"
      >
        <div class="px-5 py-6">
          <p class="font-display text-xl font-semibold tracking-[-0.02em] text-ink">BudgetApp</p>
          <p class="mt-1 truncate text-xs text-ink-muted">{{ auth.user()?.email }}</p>
        </div>
        <nav class="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3">
          @for (item of desktopNav; track item.path) {
            <a
              class="nav-link"
              [routerLink]="item.path"
              #sideNavActive="routerLinkActive"
              routerLinkActive="active-nav"
              [routerLinkActiveOptions]="{ exact: item.exact ?? true }"
              [attr.aria-current]="sideNavActive.isActive ? 'page' : null"
            >
              <mat-icon class="!text-[20px]">{{ item.icon }}</mat-icon>
              <span>{{ item.label }}</span>
            </a>
          }
        </nav>
        <div class="border-t border-line p-4">
          <button mat-stroked-button class="!w-full" type="button" (click)="signOut()">
            Sign out
          </button>
        </div>
      </aside>

      <div class="flex min-w-0 flex-1 flex-col">
        <!-- Mobile overlay drawer: secondary destinations only -->
        <mat-sidenav-container class="flex-1 bg-canvas">
          <mat-sidenav
            #drawer
            mode="over"
            class="!w-72"
            fixedInViewport
            [autoFocus]="false"
          >
            <div class="app-drawer-content flex h-full flex-col bg-surface">
              <div class="border-b border-line px-5 py-5">
                <p class="font-display text-xl font-semibold tracking-[-0.02em] text-ink">BudgetApp</p>
                <p class="mt-1 truncate text-xs text-ink-muted">{{ auth.user()?.email }}</p>
              </div>

              <mat-nav-list class="flex-1 overflow-y-auto py-3">
                @for (item of mobileMoreNav; track item.path) {
                  <a
                    mat-list-item
                    [routerLink]="item.path"
                    #drawerNavActive="routerLinkActive"
                    routerLinkActive="active-nav"
                    [routerLinkActiveOptions]="{ exact: item.exact ?? true }"
                    [attr.aria-current]="drawerNavActive.isActive ? 'page' : null"
                    (click)="drawer.close()"
                  >
                    <mat-icon matListItemIcon>{{ item.icon }}</mat-icon>
                    <span matListItemTitle>{{ item.label }}</span>
                  </a>
                }
              </mat-nav-list>

              <div class="shrink-0 border-t border-line p-4">
                <button mat-stroked-button class="!w-full" type="button" (click)="signOut()">
                  Sign out
                </button>
              </div>
            </div>
          </mat-sidenav>

          <mat-sidenav-content class="min-h-screen bg-canvas">
            <mat-toolbar class="app-toolbar sticky top-0 z-20 !shadow-none lg:!hidden">
              <div class="flex min-w-0 flex-1 items-center gap-1">
                <button
                  mat-icon-button
                  class="!inline-flex !h-10 !w-10 !shrink-0 !items-center !justify-center"
                  type="button"
                  (click)="drawer.toggle()"
                  aria-label="Open menu"
                >
                  <mat-icon>menu</mat-icon>
                </button>
                <span
                  class="font-display truncate text-lg font-semibold leading-none tracking-[-0.02em]"
                >
                  BudgetApp
                </span>
              </div>
              <button
                mat-flat-button
                color="primary"
                type="button"
                [matMenuTriggerFor]="quickAdd"
                class="!hidden sm:!inline-flex"
              >
                <mat-icon>add</mat-icon>
                Add
              </button>
              <mat-menu #quickAdd="matMenu">
                <a mat-menu-item routerLink="/activity" [queryParams]="{ action: 'add' }">
                  <mat-icon>add_card</mat-icon>
                  <span>Add transaction</span>
                </a>
                <a mat-menu-item routerLink="/activity" [queryParams]="{ import: '1' }">
                  <mat-icon>upload_file</mat-icon>
                  <span>Import CSV</span>
                </a>
                <a mat-menu-item routerLink="/plan" [queryParams]="{ action: 'add' }">
                  <mat-icon>event_available</mat-icon>
                  <span>Add upcoming item</span>
                </a>
                <a mat-menu-item routerLink="/accounts" [queryParams]="{ action: 'add' }">
                  <mat-icon>account_balance_wallet</mat-icon>
                  <span>Add account</span>
                </a>
              </mat-menu>
            </mat-toolbar>

            <div
              class="sticky top-0 z-20 hidden items-center justify-end gap-3 border-b border-line bg-surface px-6 py-3 lg:flex"
            >
              <button
                mat-flat-button
                color="primary"
                type="button"
                [matMenuTriggerFor]="quickAddDesktop"
              >
                <mat-icon>add</mat-icon>
                Add
              </button>
              <mat-menu #quickAddDesktop="matMenu">
                <a mat-menu-item routerLink="/activity" [queryParams]="{ action: 'add' }">
                  <mat-icon>add_card</mat-icon>
                  <span>Add transaction</span>
                </a>
                <a mat-menu-item routerLink="/activity" [queryParams]="{ import: '1' }">
                  <mat-icon>upload_file</mat-icon>
                  <span>Import CSV</span>
                </a>
                <a mat-menu-item routerLink="/plan" [queryParams]="{ action: 'add' }">
                  <mat-icon>event_available</mat-icon>
                  <span>Add upcoming item</span>
                </a>
                <a mat-menu-item routerLink="/accounts" [queryParams]="{ action: 'add' }">
                  <mat-icon>account_balance_wallet</mat-icon>
                  <span>Add account</span>
                </a>
              </mat-menu>
            </div>

            <main class="app-main-content mx-auto max-w-content px-page py-6 sm:py-8">
              <router-outlet />
            </main>

            <nav
              class="app-bottom-nav fixed inset-x-0 z-30 border-t border-line bg-surface lg:hidden"
              aria-label="Primary navigation"
            >
              <div class="mx-auto grid max-w-lg grid-cols-4 px-1 pt-1">
                @for (item of primaryNav; track item.path) {
                  <a
                    class="flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[0.6875rem] font-medium text-ink-muted no-underline transition-colors"
                    [routerLink]="item.path"
                    #mobileNavActive="routerLinkActive"
                    routerLinkActive="!text-ink"
                    [routerLinkActiveOptions]="{ exact: item.exact ?? true }"
                    [attr.aria-current]="mobileNavActive.isActive ? 'page' : null"
                  >
                    <mat-icon
                      class="!text-[22px]"
                      [class.!text-action]="mobileNavActive.isActive"
                    >
                      {{ item.icon }}
                    </mat-icon>
                    <span>{{ item.label }}</span>
                  </a>
                }
              </div>
            </nav>

            <button
              mat-fab
              color="primary"
              class="app-quick-add-fab !fixed !right-4 !z-30 sm:!hidden"
              type="button"
              [matMenuTriggerFor]="quickAdd"
              aria-label="Add"
            >
              <mat-icon>add</mat-icon>
            </button>
          </mat-sidenav-content>
        </mat-sidenav-container>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .font-display {
        font-family: var(--font-display);
      }
    `,
  ],
})
export class ShellComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly accountService = inject(AccountService);
  private readonly categoryService = inject(CategoryService);

  /** Mobile bottom tabs — four everyday destinations. */
  readonly primaryNav: NavItem[] = [
    { path: '/home', label: 'Home', icon: 'home' },
    { path: '/activity', label: 'Activity', icon: 'receipt_long' },
    { path: '/plan', label: 'Plan', icon: 'event_note' },
    { path: '/budgets', label: 'Budgets', icon: 'pie_chart_outline' },
  ];

  /** Desktop primary destinations including Accounts + Insights. */
  readonly desktopNav: NavItem[] = [
    { path: '/home', label: 'Home', icon: 'home' },
    { path: '/activity', label: 'Activity', icon: 'receipt_long' },
    { path: '/plan', label: 'Plan', icon: 'event_note' },
    { path: '/budgets', label: 'Budgets', icon: 'pie_chart_outline' },
    { path: '/accounts', label: 'Accounts', icon: 'account_balance_wallet' },
    { path: '/insights', label: 'Insights', icon: 'insights' },
  ];

  /** Mobile hamburger: secondary destinations only (tabs cover the rest). */
  readonly mobileMoreNav: NavItem[] = [
    { path: '/accounts', label: 'Accounts', icon: 'account_balance_wallet' },
    { path: '/insights', label: 'Insights', icon: 'insights' },
  ];

  ngOnInit(): void {
    void this.categoryService.seedIfNeeded();
    void this.categoryService.migrateAwayFromRefunds();
    void this.accountService.seedIfNeeded();
  }

  signOut(): void {
    void this.auth.signOut();
  }
}
