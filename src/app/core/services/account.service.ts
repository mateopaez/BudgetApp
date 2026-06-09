import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Account, AccountType, DEFAULT_ACCOUNTS } from '../models';
import { toDate, toTimestamp } from '../utils/firestore.util';
import { AuthService } from './auth.service';

export interface AccountInput {
  name: string;
  type: AccountType;
  openingBalance: number;
  openingDate: Date;
}

@Injectable({ providedIn: 'root' })
export class AccountService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(AuthService);

  watchAccounts(): Observable<Account[]> {
    return new Observable((subscriber) => {
      const uid = this.auth.uid();
      if (!uid) {
        subscriber.next([]);
        return;
      }
      const ref = collection(this.firestore, `users/${uid}/accounts`);
      const q = query(ref, orderBy('name'));
      return onSnapshot(
        q,
        (snap) => {
          const accounts = snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              name: data['name'],
              type: data['type'] as AccountType,
              openingBalance: data['openingBalance'],
              openingDate: toDate(data['openingDate']),
              createdAt: toDate(data['createdAt']),
              updatedAt: toDate(data['updatedAt']),
            } satisfies Account;
          });
          subscriber.next(accounts);
        },
        (err) => subscriber.error(err)
      );
    });
  }

  async seedIfNeeded(): Promise<void> {
    const uid = this.auth.uid();
    if (!uid) return;

    const ref = collection(this.firestore, `users/${uid}/accounts`);
    const existing = await getDocs(ref);
    if (!existing.empty) return;

    const today = new Date();
    for (const account of DEFAULT_ACCOUNTS) {
      await addDoc(ref, {
        name: account.name,
        type: account.type,
        openingBalance: 0,
        openingDate: toTimestamp(today),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  }

  async create(input: AccountInput): Promise<string> {
    const uid = this.auth.uid();
    if (!uid) throw new Error('Not authenticated');
    const ref = collection(this.firestore, `users/${uid}/accounts`);
    const docRef = await addDoc(ref, {
      ...input,
      openingDate: toTimestamp(input.openingDate),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  }

  async update(id: string, input: Partial<AccountInput>): Promise<void> {
    const uid = this.auth.uid();
    if (!uid) throw new Error('Not authenticated');
    const payload = {
      ...input,
      openingDate: input.openingDate ? toTimestamp(input.openingDate) : undefined,
      updatedAt: serverTimestamp(),
    };
    await updateDoc(doc(this.firestore, `users/${uid}/accounts/${id}`), payload);
  }

  async remove(id: string): Promise<void> {
    const uid = this.auth.uid();
    if (!uid) throw new Error('Not authenticated');
    await deleteDoc(doc(this.firestore, `users/${uid}/accounts/${id}`));
  }
}
