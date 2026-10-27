// Pure helpers for account roles, kept free of runtime bindings so they can be
// unit tested with plain Node.

export const ROLES = ['admin', 'editor', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export const isRole = (value: unknown): value is Role =>
  typeof value === 'string' && (ROLES as readonly string[]).includes(value);

export const normalizeEmail = (value: unknown) =>
  String(value ?? '').trim().toLowerCase();

// A person must have a single source of truth for permissions: either the partner
// record (rateio participant) or the standalone account role. Creating a
// standalone account for an existing partner would make the two disagree.
export function conflictsWithPartner(partnerEmails: string[], email: string, role: unknown): boolean {
  return partnerEmails.map(normalizeEmail).includes(normalizeEmail(email)) || !isRole(role);
}

type LedgerLike = {config?:{partners?:{active?:boolean;email?:string}[]}} | null | undefined;

// Who may receive a magic link and sign in: the owner, an active partner, or a
// standalone account (checked separately, because it lives in the credentials
// table). Returns the normalised e-mail when it is allowed.
export function ledgerAllows(email: unknown, ledger: LedgerLike, ownerEmail: unknown): string | null {
  const target = normalizeEmail(email);
  if (!target) return null;
  if (normalizeEmail(ownerEmail) === target && normalizeEmail(ownerEmail)) return target;
  const partner = (ledger?.config?.partners ?? []).find(
    (p) => p?.active && normalizeEmail(p?.email) === target,
  );
  return partner ? target : null;
}
