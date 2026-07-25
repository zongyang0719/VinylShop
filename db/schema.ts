import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const albums = sqliteTable("albums", {
  id: text("id").primaryKey(),
  discogsId: integer("discogs_id"),
  title: text("title").notNull(),
  artist: text("artist").notNull(),
  year: integer("year"),
  releaseDate: text("release_date"),
  coverUrl: text("cover_url").notNull(),
  format: text("format").notNull(),
  zone: text("zone").notNull(),
  dateAdded: text("date_added").notNull(),
  purchaseDate: text("purchase_date"),
  purchasePrice: text("purchase_price"),
  doubanUrl: text("douban_url"),
  tracklistJson: text("tracklist_json"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
