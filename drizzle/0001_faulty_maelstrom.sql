CREATE TABLE `finance_credentials` (
	`email` text PRIMARY KEY NOT NULL,
	`salt` text NOT NULL,
	`hash` text NOT NULL,
	`iterations` integer NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL
);
