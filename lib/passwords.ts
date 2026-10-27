// Password hashing for the standalone Worker login.
//
// PBKDF2-SHA256 with a per-user random salt. Hashes are stored as base64url in
// the D1 `finance_credentials` table and never leave the server: the ledger API
// does not expose them, so an authenticated reader cannot brute force offline.
const encoder = new TextEncoder();

export const SECRET_MIN_LENGTH = 8;
export const SECRET_MAX_LENGTH = 200;
// Keeps a login request well inside the Workers CPU budget while staying far
// above the cost of a plain SHA-256 digest.
export const DEFAULT_ITERATIONS = 100_000;

export type HashRecord = {salt: string; hash: string; iterations: number};

export function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized + '='.repeat((4 - (normalized.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function derive(plain: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(plain), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    {name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations, hash: 'SHA-256'},
    key,
    256,
  );
  return base64url(new Uint8Array(bits));
}

export async function hashSecret(plain: string, iterations = DEFAULT_ITERATIONS): Promise<HashRecord> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return {salt: base64url(salt), hash: await derive(plain, salt, iterations), iterations};
}

// Constant-time comparison so response time does not reveal the stored hash.
function equal(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let divergence = 0;
  for (let index = 0; index < a.length; index++) divergence |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return divergence === 0;
}

export async function verifySecret(plain: string, record: HashRecord): Promise<boolean> {
  if (typeof plain !== 'string' || !plain) return false;
  if (!record?.salt || !record?.hash || !Number.isInteger(record.iterations) || record.iterations < 1000) return false;
  const computed = await derive(plain, fromBase64url(record.salt), record.iterations);
  return equal(computed, record.hash);
}

export function secretProblem(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || value.length < SECRET_MIN_LENGTH) {
    return `A senha precisa ter pelo menos ${SECRET_MIN_LENGTH} caracteres.`;
  }
  if (value.length > SECRET_MAX_LENGTH) return 'A senha é muito longa.';
  if (!/[a-zA-Z]/.test(value) || !/\d/.test(value)) return 'Use ao menos uma letra e um número na senha.';
  return null;
}

// Compares the bootstrap secret without leaking its length through timing.
export function sameSecret(received: string, expected: string | undefined): boolean {
  if (!expected) return false;
  let divergence = received.length === expected.length ? 0 : 1;
  for (let index = 0; index < Math.max(received.length, expected.length); index++) {
    divergence |= (received.charCodeAt(index) || 0) ^ (expected.charCodeAt(index) || 0);
  }
  return divergence === 0;
}
