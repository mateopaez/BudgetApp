import { Signal, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';

export interface LoadableSignal<T> {
  readonly value: Signal<T>;
  readonly loading: Signal<boolean>;
  readonly error: Signal<string | null>;
}

/**
 * Keeps a safe initial value while exposing the first-emission and error states.
 * Call from an Angular injection context, such as a component field initializer.
 */
export function toLoadableSignal<T>(
  source: Observable<T>,
  initialValue: T,
  errorMessage = 'Could not load this data. Check your connection and try again.'
): LoadableSignal<T> {
  const value = signal(initialValue);
  const loading = signal(true);
  const error = signal<string | null>(null);

  source.pipe(takeUntilDestroyed()).subscribe({
    next: (nextValue) => {
      value.set(nextValue);
      loading.set(false);
      error.set(null);
    },
    error: () => {
      loading.set(false);
      error.set(errorMessage);
    },
  });

  return { value: value.asReadonly(), loading: loading.asReadonly(), error: error.asReadonly() };
}
