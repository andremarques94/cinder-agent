CREATE TABLE `github_installations` (
	`installation_id` integer PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_login` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `github_installations_user_id_unique` ON `github_installations` (`user_id`);--> statement-breakpoint
CREATE TABLE `sandbox_names` (
	`name` text PRIMARY KEY NOT NULL,
	`claimed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`sandbox` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_login_at` integer,
	FOREIGN KEY (`sandbox`) REFERENCES `sandbox_names`(`name`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_sandbox_unique` ON `users` (`sandbox`);