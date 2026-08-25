import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTabsModule } from '@angular/material/tabs';
import { AuthService } from '../../core/services/auth.service';

export function friendlyAuthError(error: unknown): string {
  const candidate = error as { code?: unknown; message?: unknown } | null;
  const code = typeof candidate?.code === 'string' ? candidate.code : '';

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'Email or password is incorrect. Check both fields and try again.';
    case 'auth/email-already-in-use':
      return 'An account already uses this email. Sign in instead, or use another email.';
    case 'auth/weak-password':
      return 'Choose a stronger password with at least 6 characters.';
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a few minutes, then try again.';
    case 'auth/network-request-failed':
      return 'Could not reach the sign-in service. Check your connection and try again.';
    case 'auth/operation-not-allowed':
      return 'Email sign-in is not available right now. Contact support.';
  }

  const message = typeof candidate?.message === 'string' ? candidate.message : '';
  if (/network|offline|connection/i.test(message)) {
    return 'Could not reach the sign-in service. Check your connection and try again.';
  }
  return 'Authentication failed. Check your details and try again.';
}

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatTabsModule,
  ],
  template: `
    <div class="min-h-screen bg-canvas px-4 py-8 text-ink sm:px-6">
      <div class="mx-auto grid min-h-[calc(100vh-4rem)] max-w-5xl items-center gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <section class="hidden lg:block">
          <p class="kicker">BudgetApp</p>
          <h1 class="mt-3 max-w-xl text-5xl font-bold leading-[0.96] tracking-[-0.06em] text-ink">
            Know where your money stands before you spend.
          </h1>
          <p class="mt-5 max-w-lg text-base leading-7 text-ink-muted">
            Track accounts, review transactions, import bank activity, and plan what is coming due in one calm personal ledger.
          </p>

          <div class="panel mt-8 max-w-md p-5">
            <p class="kicker">Preview</p>
            <div class="mt-4 space-y-3">
              <div class="flex items-end justify-between border-b border-line pb-3">
                <div>
                  <p class="text-sm text-ink-muted">Net worth</p>
                  <p class="money text-3xl font-semibold tracking-[-0.05em]">$12,480</p>
                </div>
                <span class="rounded-full bg-action-soft px-3 py-1 text-xs font-semibold text-ink">Calm</span>
              </div>
              <div class="grid grid-cols-2 gap-3 text-sm">
                <div class="rounded-2xl bg-[#fffcf7] p-3">
                  <p class="text-ink-muted">Upcoming</p>
                  <p class="mt-1 font-semibold">2 bills due</p>
                </div>
                <div class="rounded-2xl bg-[#fffcf7] p-3">
                  <p class="text-ink-muted">Review</p>
                  <p class="mt-1 font-semibold">4 uncategorized</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <mat-card class="w-full !rounded-[2rem] !border-line !shadow-floating">
          <mat-card-header class="!pb-2">
            <mat-card-title class="!text-2xl !font-bold !tracking-[-0.03em] !text-ink">Welcome back</mat-card-title>
            <mat-card-subtitle>Sign in to review your budget, balances, and upcoming bills.</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <mat-tab-group>
              <mat-tab label="Sign in">
                <form class="mt-5 space-y-4" [formGroup]="signInForm" (ngSubmit)="signIn()">
                  <mat-form-field>
                    <mat-label>Email</mat-label>
                    <input matInput type="email" autocomplete="email" formControlName="email" />
                    @if (signInForm.controls.email.invalid && signInForm.controls.email.touched) {
                      <mat-error>Enter a valid email address.</mat-error>
                    }
                  </mat-form-field>
                  <mat-form-field>
                    <mat-label>Password</mat-label>
                    <input matInput type="password" autocomplete="current-password" formControlName="password" />
                    @if (signInForm.controls.password.invalid && signInForm.controls.password.touched) {
                      <mat-error>Password must be at least 6 characters.</mat-error>
                    }
                  </mat-form-field>
                  @if (error()) {
                    <p role="alert" aria-live="assertive" class="rounded-2xl border border-finance-expense/20 bg-finance-expenseSoft px-4 py-3 text-sm text-finance-expense">{{ error() }}</p>
                  }
                  <button mat-flat-button color="primary" class="!h-12 !w-full" type="submit" [disabled]="loading()">
                    {{ loading() ? 'Signing in…' : 'Sign in' }}
                  </button>
                </form>
              </mat-tab>
              <mat-tab label="Create account">
                <form class="mt-5 space-y-4" [formGroup]="signUpForm" (ngSubmit)="signUp()">
                  <mat-form-field>
                    <mat-label>Email</mat-label>
                    <input matInput type="email" autocomplete="email" formControlName="email" />
                    @if (signUpForm.controls.email.invalid && signUpForm.controls.email.touched) {
                      <mat-error>Enter a valid email address.</mat-error>
                    }
                  </mat-form-field>
                  <mat-form-field>
                    <mat-label>Password</mat-label>
                    <input matInput type="password" autocomplete="new-password" formControlName="password" />
                    @if (signUpForm.controls.password.invalid && signUpForm.controls.password.touched) {
                      <mat-error>Use at least 6 characters.</mat-error>
                    }
                  </mat-form-field>
                  @if (error()) {
                    <p role="alert" aria-live="assertive" class="rounded-2xl border border-finance-expense/20 bg-finance-expenseSoft px-4 py-3 text-sm text-finance-expense">{{ error() }}</p>
                  }
                  <button mat-flat-button color="primary" class="!h-12 !w-full" type="submit" [disabled]="loading()">
                    {{ loading() ? 'Creating account…' : 'Create account' }}
                  </button>
                </form>
              </mat-tab>
            </mat-tab-group>

            <div class="mt-5 rounded-2xl border border-line bg-[#fffcf7] p-4 text-xs leading-5 text-ink-muted">
              CSV files are parsed in your browser. Only the transactions you import are saved to your account.
            </div>
          </mat-card-content>
        </mat-card>
      </div>
    </div>
  `,
})
export class AuthComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly signInForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  readonly signUpForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  async signIn(): Promise<void> {
    if (this.signInForm.invalid) {
      this.signInForm.markAllAsTouched();
      return;
    }
    await this.runAuth(() => this.auth.signIn(this.signInForm.value.email!, this.signInForm.value.password!));
  }

  async signUp(): Promise<void> {
    if (this.signUpForm.invalid) {
      this.signUpForm.markAllAsTouched();
      return;
    }
    await this.runAuth(() => this.auth.signUp(this.signUpForm.value.email!, this.signUpForm.value.password!));
  }

  private async runAuth(action: () => Promise<void>): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      await action();
      await this.router.navigate(['/dashboard']);
    } catch (e: unknown) {
      this.error.set(friendlyAuthError(e));
    } finally {
      this.loading.set(false);
    }
  }
}
