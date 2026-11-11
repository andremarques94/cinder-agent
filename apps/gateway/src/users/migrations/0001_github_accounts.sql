CREATE TABLE `github_accounts` (
	`user_id` text PRIMARY KEY NOT NULL,
	`github_user_id` integer NOT NULL,
	`login` text NOT NULL,
	`linked_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `github_accounts_github_user_id_unique` ON `github_accounts` (`github_user_id`);--> statement-breakpoint
DROP INDEX `github_installations_user_id_unique`;--> statement-breakpoint
CREATE INDEX `github_installations_user_id` ON `github_installations` (`user_id`);