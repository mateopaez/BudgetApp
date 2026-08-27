import { Injectable } from '@angular/core';
import { ImportColumnMapping, ImportProfileConfig } from '../models/import.model';
import {
  BUILTIN_IMPORT_PROFILES,
  cloneProfile,
  createUserProfile,
  getBuiltinProfile,
} from '../import/import-profiles';

const PROFILES_KEY = 'budget-app-import-user-profiles';
const ACCOUNT_KEY_PREFIX = 'budget-app-import-account:';

@Injectable({ providedIn: 'root' })
export class ImportProfileService {
  listSelectableProfiles(): ImportProfileConfig[] {
    return [...BUILTIN_IMPORT_PROFILES, ...this.loadUserProfiles()];
  }

  getProfileById(id: string): ImportProfileConfig | undefined {
    return getBuiltinProfile(id) ?? this.loadUserProfiles().find((p) => p.id === id);
  }

  getLastUsedForAccount(accountId: string): ImportProfileConfig | null {
    if (!accountId) return null;
    try {
      const raw = localStorage.getItem(`${ACCOUNT_KEY_PREFIX}${accountId}`);
      if (!raw) return null;
      const saved = JSON.parse(raw) as ImportProfileConfig;
      const profile = this.getProfileById(saved.id) ?? saved;
      return { ...profile, mapping: this.sanitizeMapping(profile.mapping) };
    } catch {
      return null;
    }
  }

  rememberForAccount(accountId: string, profile: ImportProfileConfig): void {
    if (!accountId) return;
    localStorage.setItem(`${ACCOUNT_KEY_PREFIX}${accountId}`, JSON.stringify(profile));
  }

  saveUserProfile(
    name: string,
    base: ImportProfileConfig
  ): ImportProfileConfig {
    const profile = createUserProfile(
      name,
      base.mapping,
      base.amountSign,
      base.detectCcPayments
    );
    const profiles = this.loadUserProfiles();
    profiles.push(profile);
    this.persistUserProfiles(profiles);
    return profile;
  }

  removeUserProfile(id: string): void {
    const profiles = this.loadUserProfiles().filter((p) => p.id !== id);
    this.persistUserProfiles(profiles);
  }

  clone(profile: ImportProfileConfig): ImportProfileConfig {
    return cloneProfile(profile);
  }

  private loadUserProfiles(): ImportProfileConfig[] {
    try {
      const raw = localStorage.getItem(PROFILES_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as ImportProfileConfig[];
      return parsed.map((p) => ({ ...p, mapping: this.sanitizeMapping(p.mapping) }));
    } catch {
      return [];
    }
  }

  /** Drop legacy fields (e.g. time, debit/credit) from saved mappings. */
  private sanitizeMapping(
    mapping:
      | (ImportColumnMapping & {
          time?: string | null;
          debit?: string | null;
          credit?: string | null;
        })
      | null
      | undefined
  ): ImportColumnMapping {
    return {
      date: mapping?.date ?? null,
      merchant: mapping?.merchant ?? null,
      amount: mapping?.amount ?? null,
      withdrawal: mapping?.withdrawal ?? mapping?.debit ?? null,
      deposit: mapping?.deposit ?? mapping?.credit ?? null,
      type: mapping?.type ?? null,
      memo: mapping?.memo ?? null,
    };
  }

  private persistUserProfiles(profiles: ImportProfileConfig[]): void {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  }
}
