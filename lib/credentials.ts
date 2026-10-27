// Credentials stored in D1, separate from the ledger payload so hashes are never
// sent to the browser. Only the standalone Worker uses this table.
//
// Two kinds of account live here:
//  - partner accounts: the role comes from the partner record in the ledger;
//  - standalone accounts: people who need access without being a partner. For
//    those, `role` is stored on the credential itself.
import {env} from 'cloudflare:workers';
import {hashSecret,verifySecret,type HashRecord} from './passwords';
import {isRole,normalizeEmail,type Role} from './access-roles';
export {sameSecret} from './passwords';
export {ROLES,isRole,normalizeEmail} from './access-roles';
export type {Role} from './access-roles';

type Row = {email:string;salt:string;hash:string;iterations:number};
export type AccessRow = {email:string;name:string|null;role:string|null};
export type AccessMeta = {name?:string|null;role?:string|null};

function db(){return (env as unknown as {DB:D1Database}).DB}

// Creating the table on first use keeps local previews and fresh deployments
// working even when the migration was not applied yet. The ALTER statements make
// an older table gain the two new columns; a duplicate-column error is expected
// and ignored on every run after the first.
let schemaReady: Promise<void> | undefined;
function ensureSchema(): Promise<void> {
  schemaReady ??= (async () => {
    await db()
      .prepare(
        `CREATE TABLE IF NOT EXISTS finance_credentials (
           email text PRIMARY KEY NOT NULL,
           salt text NOT NULL,
           hash text NOT NULL,
           iterations integer NOT NULL,
           updated_at text NOT NULL,
           updated_by text NOT NULL,
           name text,
           role text
         )`,
      )
      .run();
    for (const column of ['name', 'role']) {
      // SQLite has no `ADD COLUMN IF NOT EXISTS`, so the duplicate error is the
      // expected outcome once the column exists.
      await db().prepare(`ALTER TABLE finance_credentials ADD COLUMN ${column} text`).run().catch(() => undefined);
    }
  })().catch((error) => {
    schemaReady = undefined;
    throw error;
  });
  return schemaReady;
}

export async function listAccesses(): Promise<AccessRow[]> {
  await ensureSchema();
  const result = await db()
    .prepare('SELECT email, name, role FROM finance_credentials ORDER BY email')
    .all<AccessRow>();
  return (result.results ?? []).map((row) => ({email: row.email, name: row.name ?? null, role: row.role ?? null}));
}

export async function listAccessEmails(): Promise<string[]> {
  return (await listAccesses()).map((row) => row.email);
}

export async function readAccess(email: string): Promise<HashRecord | null> {
  await ensureSchema();
  const row = await db()
    .prepare('SELECT email, salt, hash, iterations FROM finance_credentials WHERE email = ?')
    .bind(normalizeEmail(email))
    .first<Row>();
  return row ? {salt: row.salt, hash: row.hash, iterations: row.iterations} : null;
}

// Role granted to a standalone account. Returns null for partners (no role here)
// and for unknown e-mails.
export async function readStandaloneRole(email: string): Promise<Role | null> {
  await ensureSchema();
  const row = await db()
    .prepare('SELECT role FROM finance_credentials WHERE email = ?')
    .bind(normalizeEmail(email))
    .first<{role: string | null}>();
  return isRole(row?.role) ? row.role : null;
}

export async function saveAccess(email: string, plain: string, updatedBy: string, meta?: AccessMeta): Promise<void> {
  await ensureSchema();
  const record = await hashSecret(plain);
  const target = normalizeEmail(email);
  const existing = await db()
    .prepare('SELECT name, role FROM finance_credentials WHERE email = ?')
    .bind(target)
    .first<{name: string | null; role: string | null}>();
  // Metadata is preserved unless the caller explicitly sends a new value, so
  // resetting a partner's password never turns it into a standalone account.
  const name = meta && 'name' in meta ? (meta.name ?? null) : (existing?.name ?? null);
  const role = meta && 'role' in meta ? (meta.role ?? null) : (existing?.role ?? null);
  await db()
    .prepare(
      `INSERT INTO finance_credentials (email, salt, hash, iterations, updated_at, updated_by, name, role)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET
         salt = excluded.salt,
         hash = excluded.hash,
         iterations = excluded.iterations,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by,
         name = excluded.name,
         role = excluded.role`,
    )
    .bind(target, record.salt, record.hash, record.iterations, new Date().toISOString(), updatedBy, name, role)
    .run();
}

// Changes only the descriptive fields of an existing account.
export async function saveAccessMeta(email: string, meta: {name?: string|null; role?: string|null}, updatedBy: string): Promise<boolean> {
  await ensureSchema();
  const target = normalizeEmail(email);
  const fields: string[] = [];
  const values: (string | null)[] = [];
  if ('name' in meta) { fields.push('name = ?'); values.push(meta.name ?? null); }
  if ('role' in meta) { fields.push('role = ?'); values.push(meta.role ?? null); }
  if (!fields.length) return false;
  const result = await db()
    .prepare(`UPDATE finance_credentials SET ${fields.join(', ')}, updated_at = ?, updated_by = ? WHERE email = ?`)
    .bind(...values, new Date().toISOString(), updatedBy, target)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

export async function removeAccess(email: string): Promise<boolean> {
  await ensureSchema();
  const result = await db()
    .prepare('DELETE FROM finance_credentials WHERE email = ?')
    .bind(normalizeEmail(email))
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

export async function checkAccess(email: string, plain: string): Promise<boolean> {
  const record = await readAccess(email);
  return record ? verifySecret(plain, record) : false;
}
