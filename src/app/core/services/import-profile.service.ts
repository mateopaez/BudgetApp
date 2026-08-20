import { Injectable } from '@angular/core';
import { ImportProfileConfig } from '../models/import.model';
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
      return this.getProfileById(saved.id) ?? saved;
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
      return JSON.parse(raw) as ImportProfileConfig[];
    } catch {
      return [];
    }
  }

  private persistUserProfiles(profiles: ImportProfileConfig[]): void {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  }
}
