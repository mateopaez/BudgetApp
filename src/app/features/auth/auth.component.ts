import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { AuthService } from '../../core/services/auth.service';

export type AuthMode = 'signIn' | 'signUp';

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
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <div class="flex min-h-screen items-center justify-center bg-canvas px-4 py-10 text-ink sm:px-6">
      <div class="w-full max-w-md">
        <div class="mb-8 text-center sm:text-left">
          <p class="text-sm font-semibold tracking-[0.08em] uppercase text-ink-soft">BudgetApp</p>
          <h1 class="mt-2 text-3xl font-bold tracking-[-0.04em] text-ink sm:text-4xl">
            {{ mode() === 'signIn' ? 'Sign in' : 'Create account' }}
          </h1>
          <p class="mt-2 text-sm leading-6 text-ink-muted">
            Accounts, transactions, budgets, and what is due next — in one place.
          </p>
        </div>

        <div class="panel p-5 sm:p-6">
          <div
            class="mb-5 grid grid-cols-2 gap-1 rounded-2xl bg-surface-muted p-1"
            role="tablist"
            aria-label="Authentication mode"
          >
            <button
              type="button"
              role="tab"
              class="mode-btn"
              [class.mode-btn-active]="mode() === 'signIn'"
              [attr.aria-selected]="mode() === 'signIn'"
              (click)="setMode('signIn')"
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              class="mode-btn"
              [class.mode-btn-active]="mode() === 'signUp'"
              [attr.aria-selected]="mode() === 'signUp'"
              (click)="setMode('signUp')"
            >
              Create account
            </button>
          </div>

          <form class="space-y-4" [formGroup]="form" (ngSubmit)="submit()">
            <mat-form-field>
              <mat-label>Email</mat-label>
              <input matInput type="email" autocomplete="email" formControlName="email" />
              @if (form.controls.email.invalid && form.controls.email.touched) {
                <mat-error>Enter a valid email address.</mat-error>
              }
            </mat-form-field>

            <mat-form-field>
              <mat-label>Password</mat-label>
              <input
                matInput
                type="password"
                [attr.autocomplete]="mode() === 'signIn' ? 'current-password' : 'new-password'"
                formControlName="password"
              />
              @if (form.controls.password.invalid && form.controls.password.touched) {
                <mat-error>Password must be at least 6 characters.</mat-error>
              }
            </mat-form-field>

            @if (error()) {
              <p
                role="alert"
                aria-live="assertive"
                class="rounded-2xl border border-finance-expense/20 bg-finance-expenseSoft px-4 py-3 text-sm text-finance-expense"
              >
                {{ error() }}
              </p>
            }

            <button mat-flat-button color="primary" class="!h-12 !w-full" type="submit" [disabled]="loading()">
              @if (loading()) {
                {{ mode() === 'signIn' ? 'Signing in…' : 'Creating account…' }}
              } @else {
                {{ mode() === 'signIn' ? 'Sign in' : 'Create account' }}
              }
            </button>
          </form>

          <p class="mt-5 text-center text-sm text-ink-muted">
            @if (mode() === 'signIn') {
              New here?
              <button type="button" class="link-btn" (click)="setMode('signUp')">Create an account</button>
            } @else {
              Already have an account?
              <button type="button" class="link-btn" (click)="setMode('signIn')">Sign in</button>
            }
          </p>
        </div>
      </div>
    </div>
  `,
  styles: `
    .mode-btn {
      border: 0;
      border-radius: 0.875rem;
      background: transparent;
      color: var(--color-muted);
      cursor: pointer;
      font: inherit;
      font-size: 0.875rem;
      font-weight: 600;
      min-height: 2.5rem;
      padding: 0.5rem 0.75rem;
      transition:
        background-color 120ms ease,
        color 120ms ease;
    }

    .mode-btn:hover {
      color: var(--color-ink);
    }

    .mode-btn-active {
      background: var(--color-surface);
      color: var(--color-ink);
      box-shadow: 0 1px 2px rgb(20 33 31 / 0.08);
    }

    .link-btn {
      border: 0;
      background: transparent;
      color: var(--color-primary);
      cursor: pointer;
      font: inherit;
      font-weight: 600;
      padding: 0;
      text-decoration: underline;
      text-underline-offset: 0.15em;
    }

    .link-btn:hover {
      color: var(--color-primary-hover);
    }
  `,
})
export class AuthComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly mode = signal<AuthMode>('signIn');
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  setMode(next: AuthMode): void {
    if (this.mode() === next) return;
    this.mode.set(next);
    this.error.set(null);
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { email, password } = this.form.getRawValue();
    const isNewAccount = this.mode() === 'signUp';
    const action = isNewAccount
      ? () => this.auth.signUp(email, password)
      : () => this.auth.signIn(email, password);

    await this.runAuth(action, isNewAccount);
  }

  private async runAuth(action: () => Promise<void>, isNewAccount = false): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      await action();
      // New accounts start where value begins: adding or importing activity.
      await this.router.navigate([isNewAccount ? '/transactions' : '/dashboard']);
    } catch (e: unknown) {
      this.error.set(friendlyAuthError(e));
    } finally {
      this.loading.set(false);
    }
  }
}
