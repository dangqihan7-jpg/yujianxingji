CREATE TABLE `trip_spot_members` (
	`user_id` text NOT NULL,
	`spot_name` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `spot_name`)
);
