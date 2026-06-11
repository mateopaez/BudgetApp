import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.waitUntilReady();
  if (auth.isAuthenticated()) {
    return true;
  }
  return router.createUrlTree(['/auth']);
};

export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.waitUntilReady();
  if (!auth.isAuthenticated()) {
    return true;
  }
  return router.createUrlTree(['/dashboard']);
};
