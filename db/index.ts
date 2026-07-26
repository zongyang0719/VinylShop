import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  }

  return drizzle(env.DB, { schema });
}

const albumsSchemaSql = `
  CREATE TABLE IF NOT EXISTS albums (
    id text PRIMARY KEY NOT NULL,
    discogs_id integer,
    title text NOT NULL,
    artist text NOT NULL,
    year integer,
    release_date text,
    cover_url text NOT NULL,
    format text NOT NULL,
    zone text NOT NULL,
    is_favorite integer DEFAULT 0 NOT NULL,
    date_added text NOT NULL,
    purchase_date text,
    purchase_price text,
    douban_url text,
    tracklist_json text,
    created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
  )
`;

export async function ensureAlbumsTable() {
  if (!env.DB) {
    throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  }
  await env.DB.prepare(albumsSchemaSql).run();

  const columns = await env.DB.prepare("PRAGMA table_info(albums)").all<{
    name: string;
  }>();
  if (!columns.results.some((column) => column.name === "is_favorite")) {
    await env.DB.prepare(
      "ALTER TABLE albums ADD COLUMN is_favorite integer DEFAULT 0 NOT NULL",
    ).run();
  }

  if (!columns.results.some((column) => column.name === "vinyl_color")) {
    await env.DB.prepare(
      "ALTER TABLE albums ADD COLUMN vinyl_color text",
    ).run();
  }
  if (!columns.results.some((column) => column.name === "vinyl_style")) {
    await env.DB.prepare(
      "ALTER TABLE albums ADD COLUMN vinyl_style text",
    ).run();
  }
  if (!columns.results.some((column) => column.name === "label")) {
    await env.DB.prepare(
      "ALTER TABLE albums ADD COLUMN label text",
    ).run();
  }
  const newTextCols = [
    "genres_json", "styles_json", "country", "catalog_number",
    "producers_json", "edition", "barcode",
  ];
  for (const col of newTextCols) {
    if (!columns.results.some((c) => c.name === col)) {
      await env.DB.prepare(`ALTER TABLE albums ADD COLUMN ${col} text`).run();
    }
  }
  if (!columns.results.some((c) => c.name === "number_of_volumes")) {
    await env.DB.prepare(
      "ALTER TABLE albums ADD COLUMN number_of_volumes integer",
    ).run();
  }

  await env.DB.prepare(
    "UPDATE albums SET zone = 'unsorted' WHERE zone = 'frequent'",
  ).run();
}

const libraryPreferencesSchemaSql = `
  CREATE TABLE IF NOT EXISTS library_preferences (
    id text PRIMARY KEY NOT NULL,
    display_mode text DEFAULT 'standard' NOT NULL,
    format_filter text DEFAULT 'all' NOT NULL,
    sort_mode text DEFAULT 'added' NOT NULL,
    updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
  )
`;

export async function ensureLibraryPreferencesTable() {
  if (!env.DB) {
    throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  }
  await env.DB.prepare(libraryPreferencesSchemaSql).run();
}
