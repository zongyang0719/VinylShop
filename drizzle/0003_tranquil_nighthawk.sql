CREATE TABLE `library_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`display_mode` text DEFAULT 'standard' NOT NULL,
	`format_filter` text DEFAULT 'all' NOT NULL,
	`sort_mode` text DEFAULT 'added' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `albums` ADD `label` text;--> statement-breakpoint
ALTER TABLE `albums` ADD `genres_json` text;--> statement-breakpoint
ALTER TABLE `albums` ADD `styles_json` text;--> statement-breakpoint
ALTER TABLE `albums` ADD `country` text;--> statement-breakpoint
ALTER TABLE `albums` ADD `catalog_number` text;--> statement-breakpoint
ALTER TABLE `albums` ADD `producers_json` text;--> statement-breakpoint
ALTER TABLE `albums` ADD `edition` text;--> statement-breakpoint
ALTER TABLE `albums` ADD `barcode` text;--> statement-breakpoint
ALTER TABLE `albums` ADD `number_of_volumes` integer;