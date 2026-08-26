import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type UpdateData,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { ParsedImportRow, SplitLine, Transaction, TransactionKind } from '../models';
import { endOfMonth, startOfDay, startOfMonth } from '../utils/date.util';
import { normalizeMerchant } from '../utils/hash.util';
import { toDate, toTimestamp } from '../utils/firestore.util';
import { AuthService } from './auth.service';

export interface TransactionInput {
  accountId: string;
  postedAt: Date;
  merchant: string;
  description?: string | null;
  amount: number;
  kind: TransactionKind;
  categoryId: string | null;
  split?: SplitLine[];
  importHash?: string;
  scheduledItemId?: string | null;
}

export interface TransactionFilters {
  accountId?: string | null;
  year: number;
  month: number;
}

@Injectable({ providedIn: 'root' })
export class TransactionService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(AuthService);

  watchTransactions(filters: TransactionFilters): Observable<Transaction[]> {
    return new Observable((subscriber) => {
      const uid = this.auth.uid();
      if (!uid) {
        subscriber.next([]);
        return;
      }

      const ref = collection(this.firestore, `users/${uid}/transactions`);
      const start = toTimestamp(startOfMonth(filters.year, filters.month));
      const end = toTimestamp(endOfMonth(filters.year, filters.month));

      let q = query(
        ref,
        where('postedAt', '>=', start),
        where('postedAt', '<=', end),
        orderBy('postedAt', 'desc')
      );

      if (filters.accountId) {
        q = query(
          ref,
          where('accountId', '==', filters.accountId),
          where('postedAt', '>=', start),
          where('postedAt', '<=', end),
          orderBy('postedAt', 'desc')
        );
      }

      return onSnapshot(
        q,
        (snap) => {
          const txs = snap.docs.map((d) => this.mapDoc(d.id, d.data()));
          subscriber.next(txs);
        },
        (err) => subscriber.error(err)
      );
    });
  }

  watchAllTransactions(): Observable<Transaction[]> {
    return new Observable((subscriber) => {
      const uid = this.auth.uid();
      if (!uid) {
        subscriber.next([]);
        return;
      }
      const ref = collection(this.firestore, `users/${uid}/transactions`);
      const q = query(ref, orderBy('postedAt', 'desc'));
      return onSnapshot(
        q,
        (snap) => subscriber.next(snap.docs.map((d) => this.mapDoc(d.id, d.data()))),
        (err) => subscriber.error(err)
      );
    });
  }

  private mapDoc(id: string, data: Record<string, unknown>): Transaction {
    const legacyDescription = (data['description'] as string | undefined) ?? '';
    const merchant =
      (data['merchant'] as string | undefined)?.trim() ||
      normalizeMerchant(legacyDescription) ||
      'Unknown';

    return {
      id,
      accountId: data['accountId'] as string,
      postedAt: toDate(data['postedAt']),
      merchant,
      description: data['merchant']
        ? ((data['description'] as string | null | undefined) ?? null)
        : legacyDescription && legacyDescription !== merchant
          ? legacyDescription
          : null,
      amount: data['amount'] as number,
      kind: normalizeTransactionKind(data['kind']),
      categoryId: (data['categoryId'] as string | null) ?? null,
      split: data['split'] as SplitLine[] | undefined,
      importHash: data['importHash'] as string | undefined,
      scheduledItemId: (data['scheduledItemId'] as string | null | undefined) ?? null,
      createdAt: toDate(data['createdAt']),
      updatedAt: toDate(data['updatedAt']),
    };
  }

  async create(input: TransactionInput): Promise<string> {
    const uid = this.auth.uid();
    if (!uid) throw new Error('Not authenticated');
    const ref = collection(this.firestore, `users/${uid}/transactions`);
    const docRef = await addDoc(ref, this.toFirestorePayload(input));
    return docRef.id;
  }

  private toFirestorePayload(input: TransactionInput) {
    const description = input.description?.trim() || null;
    return {
      accountId: input.accountId,
      postedAt: toTimestamp(startOfDay(input.postedAt)),
      merchant: normalizeMerchant(input.merchant),
      description,
      amount: input.amount,
      kind: input.kind,
      categoryId: input.categoryId,
      ...(input.split ? { split: input.split } : {}),
      ...(input.importHash ? { importHash: input.importHash } : {}),
      ...(input.scheduledItemId ? { scheduledItemId: input.scheduledItemId } : {}),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
  }

  async importBatch(
    accountId: string,
    rows: ParsedImportRow[],
    onProgress?: (done: number, total: number) => void
  ): Promise<{ imported: number; skipped: number }> {
    const uid = this.auth.uid();
    if (!uid) throw new Error('Not authenticated');

    const toImport = rows.filter((r) => !r.isDuplicate);
    const ref = collection(this.firestore, `users/${uid}/transactions`);
    const chunkSize = 400;
    let committed = 0;

    onProgress?.(0, toImport.length);

    for (let i = 0; i < toImport.length; i += chunkSize) {
      const chunk = toImport.slice(i, i + chunkSize);
      const batch = writeBatch(this.firestore);
      chunk.forEach((row) => {
        const newRef = doc(ref);
        batch.set(newRef, {
          accountId,
          postedAt: toTimestamp(startOfDay(row.postedAt)),
          merchant: row.merchant,
          description: row.description,
          amount: row.amount,
          kind: row.kind,
          categoryId: row.categoryId,
          importHash: row.importHash,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
      committed += chunk.length;
      onProgress?.(committed, toImport.length);
    }

    return { imported: toImport.length, skipped: rows.length - toImport.length };
  }

  async update(id: string, patch: Partial<TransactionInput>): Promise<void> {
    const uid = this.auth.uid();
    if (!uid) throw new Error('Not authenticated');

    // Firestore rejects `undefined` field values — only send keys that are present.
    const data: UpdateData<DocumentData> = {
      updatedAt: serverTimestamp(),
    };

    if (patch.accountId !== undefined) data['accountId'] = patch.accountId;
    if (patch.postedAt !== undefined) {
      data['postedAt'] = toTimestamp(startOfDay(patch.postedAt));
    }
    if (patch.merchant !== undefined) data['merchant'] = normalizeMerchant(patch.merchant);
    if (patch.description !== undefined) {
      data['description'] = patch.description?.trim() || null;
    }
    if (patch.amount !== undefined) data['amount'] = patch.amount;
    if (patch.kind !== undefined) data['kind'] = patch.kind;
    if (patch.categoryId !== undefined) data['categoryId'] = patch.categoryId;
    if (patch.split !== undefined) data['split'] = patch.split;
    if (patch.importHash !== undefined) data['importHash'] = patch.importHash;
    if (patch.scheduledItemId !== undefined) data['scheduledItemId'] = patch.scheduledItemId;

    await updateDoc(doc(this.firestore, `users/${uid}/transactions/${id}`), data);
  }

  async remove(id: string): Promise<void> {
    const uid = this.auth.uid();
    if (!uid) throw new Error('Not authenticated');
    await deleteDoc(doc(this.firestore, `users/${uid}/transactions/${id}`));
  }

  /** Deletes the given transaction docs in batches of 400. */
  async removeMany(
    ids: string[],
    onProgress?: (done: number, total: number) => void
  ): Promise<number> {
    const uid = this.auth.uid();
    if (!uid) throw new Error('Not authenticated');
    if (ids.length === 0) return 0;

    const chunkSize = 400;
    let deleted = 0;
    onProgress?.(0, ids.length);

    for (let i = 0; i < ids.length; i += chunkSize) {
      const batch = writeBatch(this.firestore);
      ids.slice(i, i + chunkSize).forEach((id) => {
        batch.delete(doc(this.firestore, `users/${uid}/transactions/${id}`));
      });
      await batch.commit();
      deleted += Math.min(chunkSize, ids.length - i);
      onProgress?.(deleted, ids.length);
    }
    return ids.length;
  }

  /**
   * Deletes every transaction for the signed-in user.
   * Pages through the collection so large datasets and cache/server mismatches still clear.
   */
  async removeAll(onProgress?: (deleted: number) => void): Promise<number> {
    const uid = this.auth.uid();
    if (!uid) throw new Error('Not authenticated');

    const ref = collection(this.firestore, `users/${uid}/transactions`);
    let deleted = 0;

    // Page until empty — do not rely on a single getDocs() of the whole collection.
    for (;;) {
      const snap = await getDocs(query(ref, limit(400)));
      if (snap.empty) break;

      const batch = writeBatch(this.firestore);
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      deleted += snap.size;
      onProgress?.(deleted);
    }

    return deleted;
  }

  async getByAccount(accountId: string): Promise<Transaction[]> {
    const uid = this.auth.uid();
    if (!uid) return [];
    const ref = collection(this.firestore, `users/${uid}/transactions`);
    const q = query(ref, where('accountId', '==', accountId), orderBy('postedAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => this.mapDoc(d.id, d.data()));
  }
}

/** Coerce legacy `refund` docs to income until migration rewrites them. */
function normalizeTransactionKind(kind: unknown): TransactionKind {
  if (kind === 'refund') return 'income';
  return kind as TransactionKind;
}
