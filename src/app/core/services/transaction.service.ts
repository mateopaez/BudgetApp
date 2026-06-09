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
import { ParsedImportRow, SplitLine, Transaction, TransactionKind } from '../models';
import { endOfMonth, startOfMonth } from '../utils/date.util';
import { toDate, toTimestamp } from '../utils/firestore.util';
import { AuthService } from './auth.service';

export interface TransactionInput {
  accountId: string;
  postedAt: Date;
  description: string;
  amount: number;
  kind: TransactionKind;
  categoryId: string | null;
  split?: SplitLine[];
  importHash?: string;
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
    return {
      id,
      accountId: data['accountId'] as string,
      postedAt: toDate(data['postedAt']),
      description: data['description'] as string,
      amount: data['amount'] as number,
      kind: data['kind'] as Transaction['kind'],
      categoryId: (data['categoryId'] as string | null) ?? null,
      split: data['split'] as SplitLine[] | undefined,
      importHash: data['importHash'] as string | undefined,
      createdAt: toDate(data['createdAt']),
      updatedAt: toDate(data['updatedAt']),
    };
  }

  async create(input: TransactionInput): Promise<string> {
    const uid = this.auth.uid();
    if (!uid) throw new Error('Not authenticated');
    const ref = collection(this.firestore, `users/${uid}/transactions`);
    const docRef = await addDoc(ref, {
      ...input,
      postedAt: toTimestamp(input.postedAt),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  }

  async importBatch(accountId: string, rows: ParsedImportRow[]): Promise<{ imported: number; skipped: number }> {
    const uid = this.auth.uid();
    if (!uid) throw new Error('Not authenticated');

    const toImport = rows.filter((r) => !r.isDuplicate);
    const ref = collection(this.firestore, `users/${uid}/transactions`);
    const chunkSize = 400;

    for (let i = 0; i < toImport.length; i += chunkSize) {
      const chunk = toImport.slice(i, i + chunkSize);
      const batch = writeBatch(this.firestore);
      chunk.forEach((row) => {
        const newRef = doc(ref);
        batch.set(newRef, {
          accountId,
          postedAt: toTimestamp(row.postedAt),
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
    }

    return { imported: toImport.length, skipped: rows.length - toImport.length };
  }

  async update(id: string, patch: Partial<TransactionInput>): Promise<void> {
    const uid = this.auth.uid();
    if (!uid) throw new Error('Not authenticated');
    await updateDoc(doc(this.firestore, `users/${uid}/transactions/${id}`), {
      ...patch,
      postedAt: patch.postedAt ? toTimestamp(patch.postedAt) : undefined,
      updatedAt: serverTimestamp(),
    });
  }

  async remove(id: string): Promise<void> {
    const uid = this.auth.uid();
    if (!uid) throw new Error('Not authenticated');
    await deleteDoc(doc(this.firestore, `users/${uid}/transactions/${id}`));
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
