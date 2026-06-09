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
  where,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Category, DEFAULT_CATEGORIES, SYSTEM_CATEGORIES } from '../models';
import { toDate } from '../utils/firestore.util';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class CategoryService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(AuthService);

  watchCategories(): Observable<Category[]> {
    return new Observable((subscriber) => {
      const uid = this.auth.uid();
      if (!uid) {
        subscriber.next([]);
        return;
      }
      const ref = collection(this.firestore, `users/${uid}/categories`);
      const q = query(ref, orderBy('name'));
      return onSnapshot(
        q,
        (snap) => {
          const categories = snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              name: data['name'],
              isSystem: !!data['isSystem'],
              systemKey: data['systemKey'],
              createdAt: toDate(data['createdAt']),
            } satisfies Category;
          });
          subscriber.next(categories);
        },
        (err) => subscriber.error(err)
      );
    });
  }

  async seedIfNeeded(): Promise<void> {
    const uid = this.auth.uid();
    if (!uid) return;

    const ref = collection(this.firestore, `users/${uid}/categories`);
    const existing = await getDocs(ref);
    if (!existing.empty) return;

    for (const name of DEFAULT_CATEGORIES) {
      await addDoc(ref, { name, isSystem: false, createdAt: serverTimestamp() });
    }
    for (const sys of SYSTEM_CATEGORIES) {
      await addDoc(ref, {
        name: sys.name,
        isSystem: true,
        systemKey: sys.systemKey,
        createdAt: serverTimestamp(),
      });
    }
  }

  async create(name: string): Promise<string> {
    const uid = this.auth.uid();
    if (!uid) throw new Error('Not authenticated');
    const ref = collection(this.firestore, `users/${uid}/categories`);
    const docRef = await addDoc(ref, { name, isSystem: false, createdAt: serverTimestamp() });
    return docRef.id;
  }

  async update(id: string, name: string): Promise<void> {
    const uid = this.auth.uid();
    if (!uid) throw new Error('Not authenticated');
    await updateDoc(doc(this.firestore, `users/${uid}/categories/${id}`), { name });
  }

  async remove(id: string): Promise<void> {
    const uid = this.auth.uid();
    if (!uid) throw new Error('Not authenticated');
    await deleteDoc(doc(this.firestore, `users/${uid}/categories/${id}`));
  }

  getSystemCategoryId(categories: Category[], key: 'cc_payment' | 'refund'): string | null {
    return categories.find((c) => c.systemKey === key)?.id ?? null;
  }

  async getExistingImportHashes(accountId: string, hashes: string[]): Promise<Set<string>> {
    const uid = this.auth.uid();
    const found = new Set<string>();
    if (!uid || hashes.length === 0) return found;

    const ref = collection(this.firestore, `users/${uid}/transactions`);
    const chunkSize = 10;
    for (let i = 0; i < hashes.length; i += chunkSize) {
      const chunk = hashes.slice(i, i + chunkSize);
      const q = query(ref, where('accountId', '==', accountId), where('importHash', 'in', chunk));
      const snap = await getDocs(q);
      snap.docs.forEach((d) => {
        const hash = d.data()['importHash'];
        if (hash) found.add(hash);
      });
    }
    return found;
  }
}
