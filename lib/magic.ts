// Passwordless login tokens.
//
// The raw token lives only inside the URL sent to the person. D1 stores the
// SHA-256 digest, so a database dump cannot be replayed. Each token is bound to
// exactly one e-mail: the e-mail that asked for it or the one the administrator
// generated it for. The binding is enforced on both ends — the token cannot be
// created for an address without access, and it stops working if that access is
// revoked before the link is opened.
import {env} from 'cloudflare:workers';
import {normalizeEmail,readStandaloneRole} from './credentials';
import {ledgerAllows} from './access-roles';
import {LINK_TTL_MINUTES,digestToken,newToken} from './magic-core';

export {LINK_TTL_MINUTES,newToken} from './magic-core';

function db(){return (env as unknown as {DB:D1Database}).DB}

let schemaReady: Promise<void> | undefined;
function ensureSchema(): Promise<void> {
  schemaReady ??= db()
    .prepare(
      `CREATE TABLE IF NOT EXISTS finance_login_links (
         token_hash text PRIMARY KEY NOT NULL,
         email text NOT NULL,
         expires_at text NOT NULL,
         used_at text,
         created_at text NOT NULL,
         created_ip text
       )`,
    )
    .run()
    .then(() => undefined)
    .catch((error) => {
      schemaReady = undefined;
      throw error;
    });
  return schemaReady;
}

async function digest(token: string): Promise<string> {
  return digestToken(token);
}

// An address is allowed to receive a link when it is the owner, an active partner
// or a standalone account (a login that exists without being a partner). A miss
// returns null so the caller can answer generically and avoid revealing which
// addresses are registered.
export function authorizedInLedger(email: string, ledger: unknown): string | null {
  return ledgerAllows(email, ledger as never, (env as unknown as Record<string, unknown>).AUTH_OWNER_EMAIL);
}

async function ledgerForCheck(): Promise<unknown> {
  const row = await db().prepare('SELECT data FROM finance_project WHERE id = ?').bind('main').first<{data:string}>();
  if (!row) return null;
  try {
    return JSON.parse(row.data);
  } catch {
    return null;
  }
}

// Full check used when issuing and when consuming a token, so a revoked partner
// or a deleted account cannot keep using a link that was already sent.
export async function hasAccess(email: string): Promise<boolean> {
  const target = normalizeEmail(email);
  if (!target) return false;
  if (authorizedInLedger(target, await ledgerForCheck())) return true;
  return Boolean(await readStandaloneRole(target));
}

export async function authorizedEmail(email: string): Promise<string | null> {
  const target = normalizeEmail(email);
  if (!target) return null;
  return (await hasAccess(target)) ? target : null;
}

export async function createLink(email: string, ip?: string): Promise<{token: string; expiresAt: Date}> {
  await ensureSchema();
  // Refuse to mint a token for an address that cannot sign in: that keeps the
  // link strictly bound to someone with access.
  const target = normalizeEmail(email);
  if (!(await hasAccess(target))) throw new Error('Este e-mail não tem acesso ao sistema.');
  const token = newToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LINK_TTL_MINUTES * 60 * 1000);
  await db()
    .prepare(
      'INSERT INTO finance_login_links (token_hash, email, expires_at, used_at, created_at, created_ip) VALUES (?, ?, ?, NULL, ?, ?)',
    )
    .bind(await digest(token), target, expiresAt.toISOString(), now.toISOString(), ip ?? null)
    .run();
  return {token, expiresAt};
}

// Returns the e-mail only when the token is still valid and unused. The UPDATE
// runs with the same guards, so two simultaneous clicks cannot both succeed.
// The access check happens before the token is spent, so an expired permission
// does not consume the link either.
export async function consumeLink(token: string | null | undefined): Promise<string | null> {
  if (!token || token.length < 20 || token.length > 200) return null;
  await ensureSchema();
  const hash = await digest(token);
  const now = new Date().toISOString();
  const row = await db()
    .prepare('SELECT email FROM finance_login_links WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?')
    .bind(hash, now)
    .first<{email: string}>();
  if (!row) return null;
  if (!(await hasAccess(row.email))) return null;
  const result = await db()
    .prepare('UPDATE finance_login_links SET used_at = ? WHERE token_hash = ? AND used_at IS NULL')
    .bind(now, hash)
    .run();
  if ((result.meta?.changes ?? 0) !== 1) return null;
  // Housekeeping: expired rows have no value and would grow forever.
  await db().prepare('DELETE FROM finance_login_links WHERE expires_at < ?').bind(now).run().catch(() => undefined);
  return normalizeEmail(row.email);
}
