import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTabsModule } from '@angular/material/tabs';
import { AuthService } from '../../core/services/auth.service';

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
    <div
      class="flex min-h-screen items-center justify-center bg-gradient-to-br from-midnight-900 via-brand-950 to-midnight-900 p-4"
    >
      <mat-card class="w-full max-w-md !rounded-2xl !border-brand-200 !shadow-2xl">
        <mat-card-header class="!pb-2">
          <mat-card-title class="!text-2xl !font-bold !text-brand-700">Budget Tracker</mat-card-title>
          <mat-card-subtitle>Track spending across accounts</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <mat-tab-group>
            <mat-tab label="Sign in">
              <form class="mt-4 space-y-4" [formGroup]="signInForm" (ngSubmit)="signIn()">
                <mat-form-field>
                  <mat-label>Email</mat-label>
                  <input matInput type="email" formControlName="email" />
                </mat-form-field>
                <mat-form-field>
                  <mat-label>Password</mat-label>
                  <input matInput type="password" formControlName="password" />
                </mat-form-field>
                @if (error()) {
                  <p class="text-sm text-red-600">{{ error() }}</p>
                }
                <button mat-flat-button color="primary" class="!w-full" type="submit" [disabled]="loading()">
                  Sign in
                </button>
              </form>
            </mat-tab>
            <mat-tab label="Sign up">
              <form class="mt-4 space-y-4" [formGroup]="signUpForm" (ngSubmit)="signUp()">
                <mat-form-field>
                  <mat-label>Email</mat-label>
                  <input matInput type="email" formControlName="email" />
                </mat-form-field>
                <mat-form-field>
                  <mat-label>Password</mat-label>
                  <input matInput type="password" formControlName="password" />
                </mat-form-field>
                @if (error()) {
                  <p class="text-sm text-red-600">{{ error() }}</p>
                }
                <button mat-flat-button color="primary" class="!w-full" type="submit" [disabled]="loading()">
                  Create account
                </button>
              </form>
            </mat-tab>
          </mat-tab-group>
        </mat-card-content>
      </mat-card>
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
    if (this.signInForm.invalid) return;
    await this.runAuth(() => this.auth.signIn(this.signInForm.value.email!, this.signInForm.value.password!));
  }

  async signUp(): Promise<void> {
    if (this.signUpForm.invalid) return;
    await this.runAuth(() => this.auth.signUp(this.signUpForm.value.email!, this.signUpForm.value.password!));
  }

  private async runAuth(action: () => Promise<void>): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      await action();
      await this.router.navigate(['/dashboard']);
    } catch (e: unknown) {
      this.error.set(e instanceof Error ? e.message : 'Authentication failed');
    } finally {
      this.loading.set(false);
    }
  }
}
