import { Injectable, computed, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, firstValueFrom } from 'rxjs';
import {
  Auth,
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from '@angular/fire/auth';
import { doc, Firestore, setDoc, serverTimestamp } from '@angular/fire/firestore';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = inject(Auth);
  private readonly firestore = inject(Firestore);

  private readonly userSignal = signal<User | null>(null);
  private readonly readySignal = signal(false);

  readonly user = this.userSignal.asReadonly();
  readonly isAuthenticated = computed(() => !!this.userSignal());
  readonly isReady = this.readySignal.asReadonly();
  readonly uid = computed(() => this.userSignal()?.uid ?? null);

  constructor() {
    onAuthStateChanged(this.auth, (user) => {
      this.userSignal.set(user);
      this.readySignal.set(true);
    });
  }

  async signUp(email: string, password: string): Promise<void> {
    const cred = await createUserWithEmailAndPassword(this.auth, email, password);
    await setDoc(doc(this.firestore, `users/${cred.user.uid}`), {
      email,
      createdAt: serverTimestamp(),
    });
  }

  signIn(email: string, password: string): Promise<void> {
    return signInWithEmailAndPassword(this.auth, email, password).then(() => undefined);
  }

  signOut(): Promise<void> {
    return signOut(this.auth);
  }

  /** Resolves once Firebase has restored persisted auth state from storage. */
  waitUntilReady(): Promise<void> {
    if (this.readySignal()) {
      return Promise.resolve();
    }
    return firstValueFrom(toObservable(this.isReady).pipe(filter((ready) => ready))).then(() => undefined);
  }
}
