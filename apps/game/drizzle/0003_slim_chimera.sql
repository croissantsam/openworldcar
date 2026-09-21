CREATE TABLE `trial_times` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`trial_id` text NOT NULL,
	`destination_id` text NOT NULL,
	`label` text NOT NULL,
	`from_name` text NOT NULL,
	`to_name` text NOT NULL,
	`distance_m` real NOT NULL,
	`time_ms` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `trial_times_trial_time` ON `trial_times` (`trial_id`,`time_ms`);