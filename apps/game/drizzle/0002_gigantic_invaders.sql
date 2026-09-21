CREATE TABLE `player_city_visits` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`destination_id` text NOT NULL,
	`visited_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `player_city_visits_user_destination` ON `player_city_visits` (`user_id`,`destination_id`);--> statement-breakpoint
CREATE TABLE `player_stats` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`total_distance_m` real DEFAULT 0 NOT NULL,
	`total_jump_distance_m` real DEFAULT 0 NOT NULL,
	`max_jump_m` real DEFAULT 0 NOT NULL,
	`total_play_time_s` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `player_stats_user_id_unique` ON `player_stats` (`user_id`);--> statement-breakpoint
CREATE TABLE `player_trophies` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`trophy_id` text NOT NULL,
	`unlocked_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `player_trophies_user_trophy` ON `player_trophies` (`user_id`,`trophy_id`);