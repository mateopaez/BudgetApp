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
  writeBatch,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import {
  Category,
  CategoryGroup,
  DEFAULT_CATEGORIES,
  DEFAULT_CATEGORY_GROUPS,
  SYSTEM_CATEGORIES,
} from '../models';
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
              name: data['name'] as string,
              isSystem: !!data['isSystem'],
              systemKey: data['systemKey'] as Category['systemKey'],
              group: data['group'] as CategoryGroup | undefined,
              sortOrder: data['sortOrder'] as number | undefined,
              archivedAt: data['archivedAt'] ? toDate(data['archivedAt']) : null,
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

    let sortOrder = 0;
    for (const name of DEFAULT_CATEGORIES) {
      await addDoc(ref, {
        name,
        isSystem: false,
        group: DEFAULT_CATEGORY_GROUPS[name],
        sortOrder: sortOrder++,
        createdAt: serverTimestamp(),
      });
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

  async create(
    name: string,
    options: { group?: CategoryGroup; sortOrder?: number } = {}
  ): Promise<string> {
    const uid = this.auth.uid();
    if (!uid) throw new Error('Not authenticated');
    const ref = collection(this.firestore, `users/${uid}/categories`);
    const docRef = await addDoc(ref, {
      name,
      isSystem: false,
      group: options.group ?? 'other',
      ...(options.sortOrder != null ? { sortOrder: options.sortOrder } : {}),
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  }

  async update(
    id: string,
    patch: string | { name?: string; group?: CategoryGroup; sortOrder?: number }
  ): Promise<void> {
    const uid = this.auth.uid();
    if (!uid) throw new Error('Not authenticated');
    const data =
      typeof patch === 'string'
        ? { name: patch }
        : {
            ...(patch.name !== undefined ? { name: patch.name } : {}),
            ...(patch.group !== undefined ? { group: patch.group } : {}),
            ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
          };
    await updateDoc(doc(this.firestore, `users/${uid}/categories/${id}`), data);
  }

  async archive(id: string): Promise<void> {
    const uid = this.auth.uid();
    if (!uid) throw new Error('Not authenticated');
    await updateDoc(doc(this.firestore, `users/${uid}/categories/${id}`), {
      archivedAt: serverTimestamp(),
    });
  }

  async remove(id: string): Promise<void> {
    const uid = this.auth.uid();
    if (!uid) throw new Error('Not authenticated');
    await deleteDoc(doc(this.firestore, `users/${uid}/categories/${id}`));
  }

  getSystemCategoryId(categories: Category[], key: 'cc_payment'): string | null {
    return categories.find((c) => c.systemKey === key)?.id ?? null;
  }

  /**
   * One-time cleanup: convert legacy `refund` transactions to `income` and
   * remove the Refund/Credit system category if present.
   */
  async migrateAwayFromRefunds(): Promise<void> {
    const uid = this.auth.uid();
    if (!uid) return;

    const categoriesRef = collection(this.firestore, `users/${uid}/categories`);
    const categoriesSnap = await getDocs(categoriesRef);
    const refundCategoryIds = categoriesSnap.docs
      .filter((d) => d.data()['systemKey'] === 'refund')
      .map((d) => d.id);

    const txsRef = collection(this.firestore, `users/${uid}/transactions`);
    const refundTxSnap = await getDocs(query(txsRef, where('kind', '==', 'refund')));

    const chunkSize = 400;
    const docs = refundTxSnap.docs;
    for (let i = 0; i < docs.length; i += chunkSize) {
      const batch = writeBatch(this.firestore);
      docs.slice(i, i + chunkSize).forEach((d) => {
        const categoryId = d.data()['categoryId'] as string | null | undefined;
        const clearRefundCategory = !!(categoryId && refundCategoryIds.includes(categoryId));
        batch.update(d.ref, {
          kind: 'income',
          updatedAt: serverTimestamp(),
          ...(clearRefundCategory ? { categoryId: null } : {}),
        });
      });
      await batch.commit();
    }

    for (const id of refundCategoryIds) {
      await deleteDoc(doc(this.firestore, `users/${uid}/categories/${id}`));
    }
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
