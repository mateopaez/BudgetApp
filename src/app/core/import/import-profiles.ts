import {
  AmountSignConvention,
  ImportColumnMapping,
  ImportProfileConfig,
} from '../models/import.model';

export const BUILTIN_IMPORT_PROFILES: ImportProfileConfig[] = [
  {
    id: 'builtin:personal-cc',
    name: 'Personal credit card (Description, Type, Date, Amount)',
    isBuiltin: true,
    amountSign: 'negative_expense',
    detectCcPayments: true,
    mapping: {
      date: 'Date',
      merchant: 'Description',
      amount: 'Amount',
      withdrawal: null,
      deposit: null,
      type: 'Type',
      memo: null,
    },
  },
  {
    id: 'builtin:withdrawal-deposit',
    name: 'Withdrawal / Deposit columns (Date, Description, Withdrawal, Deposit)',
    isBuiltin: true,
    amountSign: 'negative_expense',
    detectCcPayments: true,
    mapping: {
      date: 'Transaction Date',
      merchant: 'Description',
      amount: null,
      withdrawal: 'Withdrawal',
      deposit: 'Deposit',
      type: null,
      memo: null,
    },
  },
  {
    id: 'builtin:simple',
    name: 'Simple export (Date, Description, Amount)',
    isBuiltin: true,
    amountSign: 'positive_expense',
    detectCcPayments: false,
    mapping: {
      date: 'Date',
      merchant: 'Description',
      amount: 'Amount',
      withdrawal: null,
      deposit: null,
      type: null,
      memo: null,
    },
  },
];

export function getBuiltinProfile(id: string): ImportProfileConfig | undefined {
  return BUILTIN_IMPORT_PROFILES.find((p) => p.id === id);
}

export function cloneProfile(profile: ImportProfileConfig): ImportProfileConfig {
  return {
    ...profile,
    mapping: { ...profile.mapping },
  };
}

export function createUserProfile(
  name: string,
  mapping: ImportColumnMapping,
  amountSign: AmountSignConvention,
  detectCcPayments: boolean
): ImportProfileConfig {
  return {
    id: `user:${crypto.randomUUID()}`,
    name,
    isBuiltin: false,
    mapping: { ...mapping },
    amountSign,
    detectCcPayments,
  };
}

export function remapProfileToHeaders(
  profile: ImportProfileConfig,
  headers: string[]
): ImportProfileConfig {
  const headerLookup = new Map(headers.map((h) => [normalizeHeader(h), h]));

  const remap = (column: string | null): string | null => {
    if (!column) return null;
    return headerLookup.get(normalizeHeader(column)) ?? guessColumn(headers, column);
  };

  return {
    ...profile,
    mapping: {
      date: remap(profile.mapping.date),
      merchant: remap(profile.mapping.merchant),
      amount: remap(profile.mapping.amount),
      withdrawal: remap(profile.mapping.withdrawal),
      deposit: remap(profile.mapping.deposit),
      type: remap(profile.mapping.type),
      memo: remap(profile.mapping.memo),
    },
  };
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

function guessColumn(headers: string[], target: string): string | null {
  const normalized = normalizeHeader(target);
  const exact = headers.find((h) => normalizeHeader(h) === normalized);
  if (exact) return exact;

  const aliases: Record<string, string[]> = {
    date: ['transaction date', 'posting date', 'posted date', 'trans date'],
    description: ['merchant', 'payee', 'details', 'narrative', 'name'],
    amount: ['transaction amount', 'value', 'sum'],
    withdrawal: ['debit', 'debit amount', 'money out', 'withdrawal'],
    deposit: ['credit', 'credit amount', 'money in', 'deposit'],
    type: ['transaction type', 'trans type'],
    memo: ['notes', 'memo', 'category'],
  };

  const key = Object.entries(aliases).find(([, list]) =>
    list.some((a) => normalized.includes(a) || a.includes(normalized))
  )?.[0];

  if (!key) return null;

  const candidates = aliases[key];
  return (
    headers.find((h) => {
      const n = normalizeHeader(h);
      return candidates.some((c) => n === c || n.includes(c));
    }) ?? null
  );
}

export function guessMappingFromHeaders(headers: string[]): ImportColumnMapping {
  return {
    date: guessColumn(headers, 'Date'),
    merchant: guessColumn(headers, 'Description') ?? guessColumn(headers, 'Merchant'),
    amount: guessColumn(headers, 'Amount'),
    withdrawal: guessColumn(headers, 'Withdrawal') ?? guessColumn(headers, 'Debit'),
    deposit: guessColumn(headers, 'Deposit') ?? guessColumn(headers, 'Credit'),
    type: guessColumn(headers, 'Type'),
    memo: guessColumn(headers, 'Memo'),
  };
}

export function profileFromHeaders(headers: string[]): ImportProfileConfig {
  const matched = BUILTIN_IMPORT_PROFILES.find((preset) => {
    const remapped = remapProfileToHeaders(preset, headers);
    return isMappingComplete(remapped.mapping);
  });

  if (matched) {
    return remapProfileToHeaders(matched, headers);
  }

  return {
    id: 'builtin:custom',
    name: 'Custom mapping',
    isBuiltin: true,
    amountSign: 'negative_expense',
    detectCcPayments: true,
    mapping: guessMappingFromHeaders(headers),
  };
}

export function isMappingComplete(mapping: ImportColumnMapping): boolean {
  if (!mapping.date || !mapping.merchant) return false;
  const hasAmount = !!mapping.amount;
  const hasWithdrawalDeposit = !!mapping.withdrawal || !!mapping.deposit;
  return hasAmount || hasWithdrawalDeposit;
}

export function mappingValidationError(mapping: ImportColumnMapping): string | null {
  if (!mapping.date) return 'Map a Date column';
  if (!mapping.merchant) return 'Map a Merchant / Description column';
  if (!mapping.amount && !mapping.withdrawal && !mapping.deposit) {
    return 'Map an Amount column or Withdrawal/Deposit columns';
  }
  return null;
}
