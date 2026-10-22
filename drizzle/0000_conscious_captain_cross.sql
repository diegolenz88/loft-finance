CREATE TABLE `finance_files` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`owner` text NOT NULL,
	`entry` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `finance_project` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`data` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL
);
