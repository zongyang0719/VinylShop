CREATE TABLE IF NOT EXISTS `library_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`display_mode` text DEFAULT 'standard' NOT NULL,
	`format_filter` text DEFAULT 'all' NOT NULL,
	`sort_mode` text DEFAULT 'added' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
