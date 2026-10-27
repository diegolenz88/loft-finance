import {integer,sqliteTable,text} from 'drizzle-orm/sqlite-core';
export const project=sqliteTable('finance_project',{id:text('id').primaryKey(),owner:text('owner').notNull(),data:text('data').notNull(),version:integer('version').notNull().default(1)});
export const files=sqliteTable('finance_files',{id:text('id').primaryKey(),name:text('name').notNull(),mime:text('mime').notNull(),owner:text('owner').notNull(),entry:text('entry').notNull()});
// Per-user login for the standalone Worker. Only the derived hash is stored, so
// the ledger payload returned to the browser never carries credentials.
export const credentials=sqliteTable('finance_credentials',{email:text('email').primaryKey(),salt:text('salt').notNull(),hash:text('hash').notNull(),iterations:integer('iterations').notNull(),updatedAt:text('updated_at').notNull(),updatedBy:text('updated_by').notNull()});
