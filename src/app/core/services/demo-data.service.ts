import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  writeBatch,
} from '@angular/fire/firestore';
import { AccountService } from './account.service';
import { AuthService } from './auth.service';
import { CategoryService } from './category.service';
import { ScheduledItemService } from './scheduled-item.service';
import {
  DemoAccountKey,
  DemoScheduleKey,
  buildDemoSeedPlan,
} from '../utils/demo-data.util';
import { startOfDay } from '../utils/date.util';
import { toTimestamp } from '../utils/firestore.util';
import { normalizeMerchant } from '../utils/hash.util';

export type DemoSeedResult =
  | { ok: true; transactionCount: number }
  | { ok: false; reason: 'not_authenticated' | 'already_has_transactions' | 'missing_accounts' };

@Injectable({ providedIn: 'root' })
export class DemoDataService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(AuthService);
  private readonly accountService = inject(AccountService);
  private readonly categoryService = inject(CategoryService);
  private readonly scheduledItemService = inject(ScheduledItemService);

  /**
   * Seeds ~3 months of sample activity for the signed-in user when they have
   * no transactions yet. Safe to call repeatedly — no-ops if data exists.
   */
  async seedIfEmpty(now: Date = new Date()): Promise<DemoSeedResult> {
    const uid = this.auth.uid();
    if (!uid) return { ok: false, reason: 'not_authenticated' };

    await this.categoryService.seedIfNeeded();
    await this.accountService.seedIfNeeded();

    const txRef = collection(this.firestore, `users/${uid}/transactions`);
    const existingTx = await getDocs(query(txRef, limit(1)));
    if (!existingTx.empty) {
      return { ok: false, reason: 'already_has_transactions' };
    }

    const [accountsSnap, categoriesSnap] = await Promise.all([
      getDocs(collection(this.firestore, `users/${uid}/accounts`)),
      getDocs(collection(this.firestore, `users/${uid}/categories`)),
    ]);

    const accountsByType = new Map<DemoAccountKey, string>();
    for (const d of accountsSnap.docs) {
      const type = d.data()['type'] as DemoAccountKey;
      const name = d.data()['name'] as string;
      if (type === 'checking' && name === 'Checking') accountsByType.set('checking', d.id);
      if (type === 'savings' && name === 'Savings') accountsByType.set('savings', d.id);
      if (type === 'credit_card' && name === 'Credit Card') accountsByType.set('credit_card', d.id);
    }
    // Fallback: first account of each type if renamed.
    for (const d of accountsSnap.docs) {
      const type = d.data()['type'] as DemoAccountKey;
      if (!accountsByType.has(type)) accountsByType.set(type, d.id);
    }

    if (!accountsByType.has('checking')) {
      return { ok: false, reason: 'missing_accounts' };
    }

    const categoryByName = new Map<string, string>();
    for (const d of categoriesSnap.docs) {
      categoryByName.set(d.data()['name'] as string, d.id);
    }

    const plan = buildDemoSeedPlan(now);
    const checkingId = accountsByType.get('checking')!;
    const savingsId = accountsByType.get('savings');
    const creditId = accountsByType.get('credit_card');

    // Opening balances / dates so net worth looks realistic from day one.
    for (const [key, opening] of Object.entries(plan.openings) as [DemoAccountKey, number][]) {
      const id = accountsByType.get(key);
      if (!id) continue;
      await this.accountService.update(id, {
        openingBalance: opening,
        openingDate: plan.openingDate,
      });
    }

    const scheduleIds = new Map<DemoScheduleKey, string>();
    for (const schedule of plan.schedules) {
      const categoryId =
        schedule.key === 'rent' ? (categoryByName.get('Rent/Mortgage') ?? null) : null;
      const id = await this.scheduledItemService.create({
        ...schedule.input,
        categoryId,
        accountId: checkingId,
      });
      scheduleIds.set(schedule.key, id);
    }

    const accountIdFor = (key: DemoAccountKey): string | null => {
      if (key === 'checking') return checkingId;
      if (key === 'savings') return savingsId ?? null;
      return creditId ?? null;
    };

    const chunkSize = 400;
    let written = 0;
    for (let i = 0; i < plan.transactions.length; i += chunkSize) {
      const chunk = plan.transactions.slice(i, i + chunkSize);
      const batch = writeBatch(this.firestore);
      for (const row of chunk) {
        const accountId = accountIdFor(row.accountKey);
        if (!accountId) continue;

        let categoryId: string | null = null;
        if (row.categoryName) {
          categoryId = categoryByName.get(row.categoryName) ?? null;
        }

        const payload: Record<string, unknown> = {
          accountId,
          postedAt: toTimestamp(startOfDay(row.postedAt)),
          merchant: normalizeMerchant(row.merchant),
          description: row.description,
          amount: row.amount,
          kind: row.kind,
          categoryId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (row.scheduleKey) {
          const scheduledItemId = scheduleIds.get(row.scheduleKey);
          if (scheduledItemId) payload['scheduledItemId'] = scheduledItemId;
        }

        batch.set(doc(txRef), payload);
        written += 1;
      }
      await batch.commit();
    }

    return { ok: true, transactionCount: written };
  }
}
