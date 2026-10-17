CREATE TABLE `shares` (
	`token` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
