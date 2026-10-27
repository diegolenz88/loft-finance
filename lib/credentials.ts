// Credentials stored in D1, separate from the ledger payload so hashes are never
// sent to the browser. Only the standalone Worker uses this table.
import {env} from 'cloudflare:workers';
import {hashSecret,verifySecret,type HashRecord} from './passwords';
export {sameSecret} from './passwords';

type Row = {email:string;salt:string;hash:string;iterations:number};

function db(){return (env as unknown as {DB:D1Database}).DB}

export const normalizeEmail=(value:unknown)=>String(value??'').trim().toLowerCase();

// Creating the table on first use keeps local previews and fresh deployments
// working even when the migration was not applied yet. `IF NOT EXISTS` makes it
// a no-op afterwards, and the promise is memoized per isolate.
let schemaReady: Promise<void> | undefined;
function ensureSchema(): Promise<void> {
  schemaReady ??= db()
    .prepare(
      `CREATE TABLE IF NOT EXISTS finance_credentials (
         email text PRIMARY KEY NOT NULL,
         salt text NOT NULL,
         hash text NOT NULL,
         iterations integer NOT NULL,
         updated_at text NOT NULL,
         updated_by text NOT NULL
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

export async function listAccessEmails(): Promise<string[]> {
  await ensureSchema();
  const result = await db().prepare('SELECT email FROM finance_credentials ORDER BY email').all<{email:string}>();
  return (result.results ?? []).map((row) => row.email);
}

export async function readAccess(email: string): Promise<HashRecord | null> {
  await ensureSchema();
  const row = await db()
    .prepare('SELECT email, salt, hash, iterations FROM finance_credentials WHERE email = ?')
    .bind(normalizeEmail(email))
    .first<Row>();
  return row ? {salt: row.salt, hash: row.hash, iterations: row.iterations} : null;
}

export async function saveAccess(email: string, plain: string, updatedBy: string): Promise<void> {
  await ensureSchema();
  const record = await hashSecret(plain);
  await db()
    .prepare(
      `INSERT INTO finance_credentials (email, salt, hash, iterations, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET
         salt = excluded.salt,
         hash = excluded.hash,
         iterations = excluded.iterations,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`,
    )
    .bind(normalizeEmail(email), record.salt, record.hash, record.iterations, new Date().toISOString(), updatedBy)
    .run();
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
