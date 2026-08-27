import { TransactionKind } from '../models';

/** Normalize bank description text for pattern matching. */
export function normalizeImportKindText(
  merchant: string,
  description?: string | null,
  typeRaw?: string | null
): string {
  return `${merchant} ${description ?? ''} ${typeRaw ?? ''}`.trim().toLowerCase();
}

/** Internal / inter-account transfers (TFR, XFER, Interac, wires, etc.). */
const TRANSFER_PATTERNS: RegExp[] = [
  /\btransfer\b/,
  /\bxfer\b/,
  /\btfr\b/,
  /\btrf\b/,
  /\btfr[\s-]+(?:fr|to|from)\b/,
  /\bft[\s-]?(?:dr|cr)\b/,
  /\bfunds?\s+transfer\b/,
  /\be[\s-]?transfer\b/,
  /\bsend\s+e[\s-]?tfr\b/,
  /\binterac\b/,
  /\bwire(?:\s+transfer|\s+tfr|\s+payment)?\b/,
  /\bach\s+(?:transfer|xfer|tfr|trf)\b/,
  /\b(?:internal|online|mobile|internet)\s+transfer\b/,
  /\boverdraft\s+prot(?:ection)?\b/,
  /\btfr[\s-]fr[\s-]odp\b/,
  /\b(?:zelle|venmo|cash\s*app)\b/,
  /\bp2p\s+(?:transfer|payment)\b/,
  /\bmove\s+money\b/,
  /\b(?:to|from)\s+(?:savings|checking|chequing)\b/,
];

/** Credit card bill payments from a bank account (or credits on a card statement). */
const CC_PAYMENT_PATTERNS: RegExp[] = [
  /\bpayment\b/,
  /\bpaymnt\b/,
  /\bpaymt\b/,
  /\bpmt\b/,
  /\bautopay\b/,
  /\bauto[\s-]?pay\b/,
  /\bcardmember\b/,
  /\bcard\s+member\b/,
  /\bcredit\s+card\b/,
  /\bcc\s+(?:pmt|payment|pay)\b/,
  /\bach\s+(?:pmt|payment|pay)\b/,
  /\bmastrcrd\b/,
  /\bmaster\s*card\b/,
  /\bvisa\s+(?:card|payment|pmt)\b/,
  /\bamex\b/,
  /\bamerican\s+express\b/,
  /\bdiscover\s+(?:card|payment|pmt)\b/,
  /\bcapital\s*one\b/,
  /\bciti\s+card\b/,
  /\bchase\s+card\b/,
  /\bsynchrony\b/,
  /\bbarclays?\b/,
  /\bpc\s+mastrcrd\b/,
  /\b(?:bill|online)\s+pay(?:ment|mnt)?\b/,
];

export function isLikelyTransfer(text: string): boolean {
  const normalized = text.toLowerCase();
  return TRANSFER_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isLikelyCcPayment(text: string): boolean {
  const normalized = text.toLowerCase();
  return CC_PAYMENT_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isLikelyPaymentOrTransfer(text: string): boolean {
  return isLikelyTransfer(text) || isLikelyCcPayment(text);
}

export function detectImportKind(
  amount: number,
  merchant: string,
  description: string | null | undefined,
  typeRaw: string | null | undefined,
  detectCcPayments: boolean,
  ccPaymentId: string | null
): { kind: TransactionKind; categoryId: string | null } {
  const text = normalizeImportKindText(merchant, description, typeRaw);
  const type = (typeRaw ?? '').trim().toUpperCase();

  if (detectCcPayments && (type === 'PAYMENT' || isLikelyCcPayment(text))) {
    return { kind: 'cc_payment', categoryId: ccPaymentId };
  }

  if (isLikelyTransfer(text)) {
    return { kind: 'transfer', categoryId: null };
  }

  if (amount < 0) {
    return { kind: 'expense', categoryId: null };
  }

  return { kind: 'income', categoryId: null };
}
