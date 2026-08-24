import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { ScheduledItem, ScheduledItemInput } from '../models';
import { toDate, toTimestamp } from '../utils/firestore.util';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class ScheduledItemService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(AuthService);

  watchScheduledItems(): Observable<ScheduledItem[]> {
    return new Observable((subscriber) => {
      const uid = this.auth.uid();
      if (!uid) {
        subscriber.next([]);
        return;
      }
      const ref = collection(this.firestore, `users/${uid}/scheduledItems`);
      const q = query(ref, orderBy('title'));
      return onSnapshot(
        q,
        (snap) => {
          const items = snap.docs.map((d) => this.mapDoc(d.id, d.data()));
          subscriber.next(items);
        },
        (err) => {
          console.error('scheduledItems watch failed', err);
          subscriber.next([]);
        }
      );
    });
  }

  async create(input: ScheduledItemInput): Promise<string> {
    const uid = this.auth.uid();
    if (!uid) throw new Error('Not authenticated');
    const ref = collection(this.firestore, `users/${uid}/scheduledItems`);
    const docRef = await addDoc(ref, {
      ...this.toFirestore(input),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  }

  async update(id: string, input: ScheduledItemInput): Promise<void> {
    const uid = this.auth.uid();
    if (!uid) throw new Error('Not authenticated');
    await updateDoc(doc(this.firestore, `users/${uid}/scheduledItems/${id}`), {
      ...this.toFirestore(input),
      updatedAt: serverTimestamp(),
    });
  }

  async remove(id: string): Promise<void> {
    const uid = this.auth.uid();
    if (!uid) throw new Error('Not authenticated');
    await deleteDoc(doc(this.firestore, `users/${uid}/scheduledItems/${id}`));
  }

  private mapDoc(id: string, data: Record<string, unknown>): ScheduledItem {
    return {
      id,
      title: data['title'] as string,
      amount: Number(data['amount'] ?? 0),
      kind: data['kind'] as ScheduledItem['kind'],
      categoryId: (data['categoryId'] as string | null) ?? null,
      accountId: (data['accountId'] as string | null) ?? null,
      scheduleType: data['scheduleType'] as ScheduledItem['scheduleType'],
      dayOfMonth: (data['dayOfMonth'] as number | null) ?? null,
      dayOfWeek: (data['dayOfWeek'] as number | null) ?? null,
      fixedDate: data['fixedDate'] ? toDate(data['fixedDate']) : null,
      startDate: toDate(data['startDate']),
      endDate: data['endDate'] ? toDate(data['endDate']) : null,
      isActive: data['isActive'] !== false,
      createdAt: toDate(data['createdAt']),
      updatedAt: toDate(data['updatedAt'] ?? data['createdAt']),
    };
  }

  private toFirestore(input: ScheduledItemInput): Record<string, unknown> {
    return {
      title: input.title.trim(),
      amount: Math.abs(input.amount),
      kind: input.kind,
      categoryId: input.categoryId,
      accountId: input.accountId,
      scheduleType: input.scheduleType,
      dayOfMonth: input.dayOfMonth,
      dayOfWeek: input.dayOfWeek,
      fixedDate: input.fixedDate ? toTimestamp(input.fixedDate) : null,
      startDate: toTimestamp(input.startDate),
      endDate: input.endDate ? toTimestamp(input.endDate) : null,
      isActive: input.isActive,
    };
  }
}
