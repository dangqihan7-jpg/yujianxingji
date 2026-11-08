CREATE TABLE `demo_adds` (
	`session_id` text NOT NULL,
	`spot_name` text NOT NULL,
	`adds` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`session_id`, `spot_name`)
);
