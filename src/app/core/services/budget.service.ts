import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { BudgetPeriod, CategoryBudget } from '../models';
import { toDate } from '../utils/firestore.util';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class BudgetService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(AuthService);

  watchBudgets(): Observable<CategoryBudget[]> {
    return new Observable((subscriber) => {
      const uid = this.auth.uid();
      if (!uid) {
        subscriber.next([]);
        return;
      }
      const ref = collection(this.firestore, `users/${uid}/budgets`);
      return onSnapshot(
        ref,
        (snap) => {
          const budgets = snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              categoryId: data['categoryId'] ?? d.id,
              amount: Number(data['amount'] ?? 0),
              period: (data['period'] as BudgetPeriod) ?? 'monthly',
              createdAt: toDate(data['createdAt']),
              updatedAt: toDate(data['updatedAt'] ?? data['createdAt']),
            } satisfies CategoryBudget;
          });
          subscriber.next(budgets);
        },
        (err) => subscriber.error(err)
      );
    });
  }

  async upsert(categoryId: string, amount: number, period: BudgetPeriod): Promise<void> {
    const uid = this.auth.uid();
    if (!uid) throw new Error('Not authenticated');
    if (amount <= 0) {
      await this.remove(categoryId);
      return;
    }
    const ref = doc(this.firestore, `users/${uid}/budgets/${categoryId}`);
    const existing = await getDoc(ref);
    await setDoc(
      ref,
      {
        categoryId,
        amount,
        period,
        updatedAt: serverTimestamp(),
        ...(existing.exists() ? {} : { createdAt: serverTimestamp() }),
      },
      { merge: true }
    );
  }

  async remove(categoryId: string): Promise<void> {
    const uid = this.auth.uid();
    if (!uid) throw new Error('Not authenticated');
    await deleteDoc(doc(this.firestore, `users/${uid}/budgets/${categoryId}`));
  }
}
