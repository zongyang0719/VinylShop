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
}
