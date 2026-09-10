CREATE TABLE `anime_cache` (
	`id` integer PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`episodes` text DEFAULT '[]' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `auth_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `daily_activity` (
	`day` text NOT NULL,
	`actor` text NOT NULL,
	PRIMARY KEY(`day`, `actor`)
);
--> statement-breakpoint
CREATE TABLE `daily_views` (
	`day` text NOT NULL,
	`actor` text NOT NULL,
	`anime_id` integer NOT NULL,
	`episode` integer NOT NULL,
	PRIMARY KEY(`day`, `actor`, `anime_id`, `episode`)
);
--> statement-breakpoint
CREATE TABLE `history` (
	`user_id` text NOT NULL,
	`anime_id` integer NOT NULL,
	`episode` integer NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`duration` integer NOT NULL,
	`watched_seconds` integer DEFAULT 0 NOT NULL,
	`completed` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `anime_id`, `episode`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `watch_sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`user_id` text,
	`anime_id` integer NOT NULL,
	`episode` integer NOT NULL,
	`duration` integer NOT NULL,
	`last_at` integer NOT NULL,
	`watched` integer DEFAULT 0 NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `likes` ADD `value` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `email` text;--> statement-breakpoint
ALTER TABLE `users` ADD `password_hash` text;--> statement-breakpoint
ALTER TABLE `users` ADD `role` text DEFAULT 'user' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);