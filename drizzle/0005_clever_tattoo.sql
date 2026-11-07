CREATE TABLE `trip_reviews` (
	`user_id` text NOT NULL,
	`trip_id` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `trip_id`)
);
