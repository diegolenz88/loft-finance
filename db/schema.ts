import {integer,sqliteTable,text} from 'drizzle-orm/sqlite-core';
export const project=sqliteTable('finance_project',{id:text('id').primaryKey(),owner:text('owner').notNull(),data:text('data').notNull(),version:integer('version').notNull().default(1)});
export const files=sqliteTable('finance_files',{id:text('id').primaryKey(),name:text('name').notNull(),mime:text('mime').notNull(),owner:text('owner').notNull(),entry:text('entry').notNull()});
// Per-user login for the standalone Worker. Only the derived hash is stored, so
// the ledger payload returned to the browser never carries credentials.
export const credentials=sqliteTable('finance_credentials',{email:text('email').primaryKey(),salt:text('salt').notNull(),hash:text('hash').notNull(),iterations:integer('iterations').notNull(),updatedAt:text('updated_at').notNull(),updatedBy:text('updated_by').notNull()});
// Short-lived single-use tokens for the passwordless e-mail link. The raw token
// only travels inside the link; the table keeps its SHA-256 digest.
export const loginLinks=sqliteTable('finance_login_links',{tokenHash:text('token_hash').primaryKey(),email:text('email').notNull(),expiresAt:text('expires_at').notNull(),usedAt:text('used_at'),createdAt:text('created_at').notNull(),createdIp:text('created_ip')});
// Runtime settings editable from the app, so a provider key does not require a
// redeploy. Values are sealed with AES-GCM before reaching this table.
export const settings=sqliteTable('finance_settings',{key:text('key').primaryKey(),value:text('value').notNull(),updatedAt:text('updated_at').notNull(),updatedBy:text('updated_by').notNull()});
