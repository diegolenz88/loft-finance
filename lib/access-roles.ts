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
