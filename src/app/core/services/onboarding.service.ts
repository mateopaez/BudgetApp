import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { doc, Firestore, getDoc, serverTimestamp, setDoc } from '@angular/fire/firestore';
import { AuthService } from './auth.service';

export type OnboardingStepId = 'activity' | 'budgets' | 'plan' | 'home';

export interface OnboardingState {
  completedSteps: OnboardingStepId[];
  dismissedAt?: Date | null;
}

/**
 * Lightweight, additive onboarding state. Financial records remain the source of
 * truth; this only remembers where a person is in the guided first-run path.
 */
@Injectable({ providedIn: 'root' })
export class OnboardingService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(AuthService);
  private readonly stateSignal = signal<OnboardingState>({ completedSteps: [] });

  readonly state = this.stateSignal.asReadonly();
  readonly isDismissed = computed(() => !!this.stateSignal().dismissedAt);
  readonly nextStep = computed<OnboardingStepId | null>(() =>
    (['activity', 'budgets', 'plan', 'home'] as OnboardingStepId[]).find(
      (step) => !this.stateSignal().completedSteps.includes(step)
    ) ?? null
  );

  constructor() {
    effect(() => {
      const uid = this.auth.uid();
      if (!uid) {
        this.stateSignal.set({ completedSteps: [] });
        return;
      }
      void this.hydrate(uid);
    });
  }

  async complete(step: OnboardingStepId): Promise<void> {
    const current = this.stateSignal();
    if (current.completedSteps.includes(step)) return;
    const completedSteps = [...current.completedSteps, step];
    this.stateSignal.set({ ...current, completedSteps });
    await this.persist({ completedSteps });
  }

  async dismiss(): Promise<void> {
    const dismissedAt = new Date();
    this.stateSignal.update((current) => ({ ...current, dismissedAt }));
    await this.persist({ dismissedAt: serverTimestamp() });
  }

  private async hydrate(uid: string): Promise<void> {
    const snapshot = await getDoc(doc(this.firestore, `users/${uid}`));
    const onboarding = snapshot.data()?.['onboarding'] as Record<string, unknown> | undefined;
    const completedSteps = Array.isArray(onboarding?.['completedSteps'])
      ? onboarding!['completedSteps'].filter((step): step is OnboardingStepId =>
          ['activity', 'budgets', 'plan', 'home'].includes(String(step))
        )
      : [];
    this.stateSignal.set({
      completedSteps,
      dismissedAt: onboarding?.['dismissedAt'] ? new Date() : null,
    });
  }

  private async persist(patch: Record<string, unknown>): Promise<void> {
    const uid = this.auth.uid();
    if (!uid) return;
    await setDoc(doc(this.firestore, `users/${uid}`), { onboarding: patch }, { merge: true });
  }
}
