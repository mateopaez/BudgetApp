import { Component, inject, OnInit } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
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
  ],
  template: `
    <mat-sidenav-container class="min-h-screen bg-midnight-50">
      <mat-sidenav #drawer mode="over" class="!w-72" fixedInViewport [autoFocus]="false">
        <div class="flex h-full flex-col">
          <div class="border-b border-white/10 px-5 py-6">
            <p class="text-lg font-bold text-white">Budget Tracker</p>
            <p class="mt-1 truncate text-xs text-brand-300">{{ auth.user()?.email }}</p>
          </div>

          <mat-nav-list class="flex-1 overflow-y-auto py-2">
            @for (item of nav; track item.path) {
              <a
                mat-list-item
                [routerLink]="item.path"
                routerLinkActive="active-nav"
                [routerLinkActiveOptions]="{ exact: true }"
                (click)="drawer.close()"
              >
                <mat-icon matListItemIcon>{{ item.icon }}</mat-icon>
                <span matListItemTitle>{{ item.label }}</span>
              </a>
            }
          </mat-nav-list>

          <div class="shrink-0 border-t border-white/10 p-4">
            <button
              mat-stroked-button
              class="!w-full !border-brand-400/40 !text-brand-200"
              (click)="signOut()"
            >
              Sign out
            </button>
          </div>
        </div>
      </mat-sidenav>

      <mat-sidenav-content class="bg-midnight-50">
        <mat-toolbar class="sticky top-0 z-20 !shadow-md">
          <button mat-icon-button (click)="drawer.toggle()" aria-label="Open menu">
            <mat-icon>menu</mat-icon>
          </button>
          <span class="ml-2 text-base font-semibold tracking-wide">Budget Tracker</span>
        </mat-toolbar>
        <main class="mx-auto max-w-5xl p-4 pb-8 sm:p-6">
          <router-outlet />
        </main>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
})
export class ShellComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly accountService = inject(AccountService);
  private readonly categoryService = inject(CategoryService);

  readonly nav = [
    { path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { path: '/accounts', label: 'Accounts', icon: 'account_balance_wallet' },
    { path: '/transactions', label: 'Transactions', icon: 'receipt_long' },
    { path: '/categories', label: 'Categories', icon: 'category' },
  ];

  ngOnInit(): void {
    void this.categoryService.seedIfNeeded();
    void this.accountService.seedIfNeeded();
  }

  signOut(): void {
    void this.auth.signOut();
  }
}
