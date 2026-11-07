CREATE TABLE `demo_reviews` (
	`session_id` text NOT NULL,
	`user_label` text NOT NULL,
	`trip_id` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`session_id`, `trip_id`)
);
