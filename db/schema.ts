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
  isFavorite: integer("is_favorite", { mode: "boolean" })
    .notNull()
    .default(false),
  dateAdded: text("date_added").notNull(),
  purchaseDate: text("purchase_date"),
  purchasePrice: text("purchase_price"),
  doubanUrl: text("douban_url"),
  tracklistJson: text("tracklist_json"),
  label: text("label"),
  genresJson: text("genres_json"),
  stylesJson: text("styles_json"),
  country: text("country"),
  catalogNumber: text("catalog_number"),
  producersJson: text("producers_json"),
  edition: text("edition"),
  barcode: text("barcode"),
  numberOfVolumes: integer("number_of_volumes"),
  vinylColor: text("vinyl_color"),
  vinylStyle: text("vinyl_style"),
  musicBuddySourceKey: text("musicbuddy_source_key"),
  originalReleaseYear: integer("original_release_year"),
  labelsJson: text("labels_json"),
  trackDurationsJson: text("track_durations_json"),
  composersJson: text("composers_json"),
  orchestrasJson: text("orchestras_json"),
  conductorsJson: text("conductors_json"),
  performersJson: text("performers_json"),
  writersJson: text("writers_json"),
  productionCompaniesJson: text("production_companies_json"),
  sourceMetadataJson: text("source_metadata_json"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const libraryPreferences = sqliteTable("library_preferences", {
  id: text("id").primaryKey(),
  displayMode: text("display_mode").notNull().default("standard"),
  formatFilter: text("format_filter").notNull().default("all"),
  sortMode: text("sort_mode").notNull().default("added"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
