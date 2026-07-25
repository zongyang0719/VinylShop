CREATE TABLE `albums` (
	`id` text PRIMARY KEY NOT NULL,
	`discogs_id` integer,
	`title` text NOT NULL,
	`artist` text NOT NULL,
	`year` integer,
	`release_date` text,
	`cover_url` text NOT NULL,
	`format` text NOT NULL,
	`zone` text NOT NULL,
	`date_added` text NOT NULL,
	`purchase_date` text,
	`purchase_price` text,
	`douban_url` text,
	`tracklist_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
