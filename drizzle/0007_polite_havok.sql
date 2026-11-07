CREATE TABLE `group_members` (
	`group_id` text NOT NULL,
	`user_id` text NOT NULL,
	`payload` text NOT NULL,
	`joined_at` integer NOT NULL,
	PRIMARY KEY(`group_id`, `user_id`)
);
--> statement-breakpoint
CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`creator_id` text NOT NULL,
	`max_members` integer NOT NULL,
	`created_at` integer NOT NULL
);
