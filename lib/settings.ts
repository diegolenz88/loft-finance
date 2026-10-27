// App-level settings stored in D1 and editable from the interface.
//
// The mail provider key is sealed with AES-GCM before being written, so the table
// never holds it in clear text.
import {env} from 'cloudflare:workers';
import {open, seal} from './crypto-box';
import {isProvider, type Provider, type StoredMail} from './mail-config';

const MAIL_KEY = 'mail';

function db(){return (env as unknown as {DB:D1Database}).DB}

let schemaReady: Promise<void> | undefined;
function ensureSchema(): Promise<void> {
  schemaReady ??= db()
    .prepare(
      `CREATE TABLE IF NOT EXISTS finance_settings (
         key text PRIMARY KEY NOT NULL,
         value text NOT NULL,
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

async function readRaw(key: string): Promise<string | null> {
  await ensureSchema();
  const row = await db()
    .prepare('SELECT value FROM finance_settings WHERE key = ?')
    .bind(key)
    .first<{value: string}>();
  return row?.value ?? null;
}

async function writeRaw(key: string, value: string, by: string): Promise<void> {
  await ensureSchema();
  await db()
    .prepare(
      `INSERT INTO finance_settings (key, value, updated_at, updated_by)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    )
    .bind(key, value, new Date().toISOString(), by)
    .run();
}

export async function readMail(): Promise<StoredMail | null> {
  const raw = await readRaw(MAIL_KEY);
  if (!raw) return null;
  const clear = await open(raw);
  if (!clear) return null;
  try {
    const parsed = JSON.parse(clear) as Partial<StoredMail>;
    if (!isProvider(parsed.provider) || typeof parsed.from !== 'string' || typeof parsed.key !== 'string') return null;
    return {provider: parsed.provider as Provider, from: parsed.from, key: parsed.key};
  } catch {
    return null;
  }
}

export async function saveMail(config: StoredMail, by: string): Promise<void> {
  await writeRaw(MAIL_KEY, await seal(JSON.stringify(config)), by);
}

export async function clearMail(): Promise<void> {
  await ensureSchema();
  await db().prepare('DELETE FROM finance_settings WHERE key = ?').bind(MAIL_KEY).run();
}
