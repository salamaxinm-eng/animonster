CREATE TABLE `auth_flows` (
	`state` text PRIMARY KEY NOT NULL,
	`browser_hash` text NOT NULL,
	`verifier` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `blocks` (
	`user_id` text NOT NULL,
	`target_id` text NOT NULL,
	PRIMARY KEY(`user_id`, `target_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `collection` (
	`user_id` text NOT NULL,
	`anime_id` integer NOT NULL,
	`title` text NOT NULL,
	`image` text NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`rating` integer DEFAULT 0 NOT NULL,
	`favorite` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `anime_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`author_id` text NOT NULL,
	`parent_id` text,
	`body` text NOT NULL,
	`spoiler` integer DEFAULT 0 NOT NULL,
	`pinned` integer DEFAULT 0 NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`edited_at` integer,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `comments_scope_created` ON `comments` (`scope`,`created_at`);--> statement-breakpoint
CREATE INDEX `comments_author_created` ON `comments` (`author_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `grants` (
	`order_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`starts_at` integer NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `grants_user_expires` ON `grants` (`user_id`,`expires`);--> statement-breakpoint
CREATE TABLE `likes` (
	`user_id` text NOT NULL,
	`comment_id` text NOT NULL,
	PRIMARY KEY(`user_id`, `comment_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`comment_id`) REFERENCES `comments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`scope` text NOT NULL,
	`comment_id` text NOT NULL,
	`seen` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `notifications_user_created` ON `notifications` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_provider_id_unique` ON `orders` (`provider_id`);--> statement-breakpoint
CREATE INDEX `orders_user_created` ON `orders` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`comment_id` text NOT NULL,
	`reason` text NOT NULL,
	`resolved` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reports_user_comment` ON `reports` (`user_id`,`comment_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`identity` text NOT NULL,
	`nick` text NOT NULL,
	`bio` text DEFAULT '' NOT NULL,
	`theme` text DEFAULT 'neon' NOT NULL,
	`avatar` text DEFAULT 'moon' NOT NULL,
	`pin` text,
	`wall_open` integer DEFAULT 1 NOT NULL,
	`collection_public` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_identity_unique` ON `users` (`identity`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_nick_unique` ON `users` (`nick`);