// Passwordless login tokens.
//
// The raw token lives only inside the URL sent to the person. D1 stores the
// SHA-256 digest, so a database dump cannot be replayed. Each token is bound to
// one e-mail, expires quickly and is consumed atomically exactly once.
import {env} from 'cloudflare:workers';
import {normalizeEmail} from './credentials';
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

export async function createLink(email: string, ip?: string): Promise<{token: string; expiresAt: Date}> {
  await ensureSchema();
  const token = newToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LINK_TTL_MINUTES * 60 * 1000);
  await db()
    .prepare(
      'INSERT INTO finance_login_links (token_hash, email, expires_at, used_at, created_at, created_ip) VALUES (?, ?, ?, NULL, ?, ?)',
    )
    .bind(await digest(token), normalizeEmail(email), expiresAt.toISOString(), now.toISOString(), ip ?? null)
    .run();
  return {token, expiresAt};
}

// Returns the e-mail only when the token is still valid and unused. The UPDATE
// runs with the same guards, so two simultaneous clicks cannot both succeed.
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
  const result = await db()
    .prepare('UPDATE finance_login_links SET used_at = ? WHERE token_hash = ? AND used_at IS NULL')
    .bind(now, hash)
    .run();
  if ((result.meta?.changes ?? 0) !== 1) return null;
  // Housekeeping: expired rows have no value and would grow forever.
  await db().prepare('DELETE FROM finance_login_links WHERE expires_at < ?').bind(now).run().catch(() => undefined);
  return row.email;
}

// Only the owner and active partners may receive a link. A miss returns null so
// the caller can answer generically and avoid revealing registered addresses.
export function authorizedInLedger(email: string, ledger: any): string | null {
  const target = normalizeEmail(email);
  if (!target) return null;
  const owner = (env as unknown as Record<string, unknown>).AUTH_OWNER_EMAIL;
  if (typeof owner === 'string' && normalizeEmail(owner) === target) return target;
  const partner = (ledger?.config?.partners ?? []).find(
    (p: any) => p?.active && normalizeEmail(p?.email) === target,
  );
  return partner ? target : null;
}

export async function authorizedEmail(email: string): Promise<string | null> {
  const target = normalizeEmail(email);
  if (!target) return null;
  const row = await db()
    .prepare('SELECT data FROM finance_project WHERE id = ?')
    .bind('main')
    .first<{data: string}>();
  if (!row) return null;
  try {
    return authorizedInLedger(target, JSON.parse(row.data));
  } catch {
    return null;
  }
}
