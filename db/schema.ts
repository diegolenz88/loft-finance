import {integer,sqliteTable,text} from 'drizzle-orm/sqlite-core';
export const project=sqliteTable('finance_project',{id:text('id').primaryKey(),owner:text('owner').notNull(),data:text('data').notNull(),version:integer('version').notNull().default(1)});
export const files=sqliteTable('finance_files',{id:text('id').primaryKey(),name:text('name').notNull(),mime:text('mime').notNull(),owner:text('owner').notNull(),entry:text('entry').notNull()});
