import { desc, eq, inArray, sql } from "drizzle-orm";
import initialLibrary from "@/app/data/initial-library.json";
import type { Album, Format, VinylStyle, Zone } from "@/app/lib/store";
import { ensureAlbumsTable, getDb } from "@/db";
import { albums as albumsTable } from "@/db/schema";

export const dynamic = "force-dynamic";

const formats = new Set<Format>(["vinyl", "cd", "unknown"]);
const zones = new Set<Zone>(["recent", "unsorted"]);

function normalizeAlbum(value: unknown): Album | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const input = value as Partial<Album>;
  const title = input.title?.trim();
  const artist = input.artist?.trim();
  const coverUrl = input.coverUrl?.trim();

  if (!input.id || !title || !artist || !coverUrl) {
    return null;
  }

  const format = formats.has(input.format as Format)
    ? (input.format as Format)
    : "unknown";
  const zone = zones.has(input.zone as Zone)
    ? (input.zone as Zone)
    : "unsorted";

  return {
    id: input.id,
    ...(input.discogsId ? { discogsId: input.discogsId } : {}),
    title,
    artist,
    ...(input.year ? { year: Number(input.year) } : {}),
    ...(input.releaseDate?.trim()
      ? { releaseDate: input.releaseDate.trim() }
      : {}),
    coverUrl,
    format,
    zone,
    ...(typeof input.favorite === "boolean"
      ? { favorite: input.favorite }
      : {}),
    dateAdded: input.dateAdded || new Date().toISOString(),
    ...(input.purchaseDate?.trim()
      ? { purchaseDate: input.purchaseDate.trim() }
      : {}),
    ...(input.purchasePrice?.trim()
      ? { purchasePrice: input.purchasePrice.trim() }
      : {}),
    ...(input.doubanUrl?.trim() ? { doubanUrl: input.doubanUrl.trim() } : {}),
    ...(Array.isArray(input.tracklist)
      ? {
          tracklist: input.tracklist
            .map((track) => track.trim())
            .filter(Boolean),
        }
      : {}),
    ...(input.label?.trim() ? { label: input.label.trim() } : {}),
    ...(input.vinylColor?.trim() ? { vinylColor: input.vinylColor.trim() } : {}),
    ...(input.vinylStyle ? { vinylStyle: input.vinylStyle as VinylStyle } : {}),
  };
}

function toRow(album: Album) {
  return {
    id: album.id,
    discogsId: album.discogsId ?? null,
    title: album.title,
    artist: album.artist,
    year: album.year ?? null,
    releaseDate: album.releaseDate ?? null,
    coverUrl: album.coverUrl,
    format: album.format,
    zone: album.zone,
    isFavorite: album.favorite ?? false,
    dateAdded: album.dateAdded,
    purchaseDate: album.purchaseDate ?? null,
    purchasePrice: album.purchasePrice ?? null,
    doubanUrl: album.doubanUrl ?? null,
    tracklistJson: album.tracklist ? JSON.stringify(album.tracklist) : null,
    label: album.label ?? null,
    vinylColor: album.vinylColor ?? null,
    vinylStyle: album.vinylStyle ?? null,
    updatedAt: new Date().toISOString(),
  };
}

function fromRow(row: typeof albumsTable.$inferSelect): Album {
  let tracklist: string[] | undefined;
  if (row.tracklistJson) {
    try {
      const parsed = JSON.parse(row.tracklistJson) as unknown;
      if (Array.isArray(parsed)) {
        tracklist = parsed.filter(
          (track): track is string => typeof track === "string",
        );
      }
    } catch {
      tracklist = undefined;
    }
  }

  return {
    id: row.id,
    ...(row.discogsId ? { discogsId: row.discogsId } : {}),
    title: row.title,
    artist: row.artist,
    ...(row.year ? { year: row.year } : {}),
    ...(row.releaseDate ? { releaseDate: row.releaseDate } : {}),
    coverUrl: row.coverUrl,
    format: row.format as Format,
    zone: row.zone as Zone,
    favorite: row.isFavorite,
    dateAdded: row.dateAdded,
    ...(row.purchaseDate ? { purchaseDate: row.purchaseDate } : {}),
    ...(row.purchasePrice ? { purchasePrice: row.purchasePrice } : {}),
    ...(row.doubanUrl ? { doubanUrl: row.doubanUrl } : {}),
    ...(tracklist?.length ? { tracklist } : {}),
    ...(row.label ? { label: row.label } : {}),
    ...(row.vinylColor ? { vinylColor: row.vinylColor } : {}),
    ...(row.vinylStyle ? { vinylStyle: row.vinylStyle as VinylStyle } : {}),
  };
}

async function seedIfEmpty() {
  await ensureAlbumsTable();
  const db = getDb();
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(albumsTable);

  if (Number(total) > 0) {
    return;
  }

  const seed = (initialLibrary as Album[]).map(toRow);
  for (let index = 0; index < seed.length; index += 5) {
    await db
      .insert(albumsTable)
      .values(seed.slice(index, index + 5))
      .onConflictDoNothing();
  }
}

export async function GET() {
  try {
    await seedIfEmpty();
    const rows = await getDb()
      .select()
      .from(albumsTable)
      .orderBy(desc(albumsTable.dateAdded));
    return Response.json({ albums: rows.map(fromRow) });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "读取唱片库时发生错误",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureAlbumsTable();
    const payload = (await request.json()) as { albums?: unknown[] };
    const incoming = (payload.albums ?? [])
      .map(normalizeAlbum)
      .filter((album): album is Album => album !== null);

    if (incoming.length === 0) {
      return Response.json({ error: "没有可保存的唱片资料" }, { status: 400 });
    }

    const db = getDb();
    const existing: Array<{ id: string; isFavorite: boolean }> = [];
    const incomingIds = incoming.map((album) => album.id);
    for (let index = 0; index < incomingIds.length; index += 80) {
      existing.push(
        ...(await db
          .select({
            id: albumsTable.id,
            isFavorite: albumsTable.isFavorite,
          })
          .from(albumsTable)
          .where(inArray(albumsTable.id, incomingIds.slice(index, index + 80)))),
      );
    }
    const existingIds = new Set(existing.map((row) => row.id));
    const existingFavoritesById = new Map(
      existing.map((row) => [row.id, row.isFavorite]),
    );
    const resolvedIncoming = incoming.map((album) => ({
      ...album,
      favorite:
        typeof album.favorite === "boolean"
          ? album.favorite
          : (existingFavoritesById.get(album.id) ?? false),
    }));

    const favoriteRows = await db
      .select({ id: albumsTable.id })
      .from(albumsTable)
      .where(eq(albumsTable.isFavorite, true));
    const nextFavoriteIds = new Set(favoriteRows.map((row) => row.id));
    resolvedIncoming.forEach((album) => {
      if (album.favorite) {
        nextFavoriteIds.add(album.id);
      } else {
        nextFavoriteIds.delete(album.id);
      }
    });
    if (nextFavoriteIds.size > 10) {
      return Response.json(
        { error: "喜欢最多只能保留 10 张唱片，请先移除一张" },
        { status: 409 },
      );
    }

    const rows = resolvedIncoming.map(toRow);

    for (let index = 0; index < rows.length; index += 5) {
      await db
        .insert(albumsTable)
        .values(rows.slice(index, index + 5))
        .onConflictDoUpdate({
          target: albumsTable.id,
          set: {
            discogsId: sql`excluded.discogs_id`,
            title: sql`excluded.title`,
            artist: sql`excluded.artist`,
            year: sql`excluded.year`,
            releaseDate: sql`excluded.release_date`,
            coverUrl: sql`excluded.cover_url`,
            format: sql`excluded.format`,
            zone: sql`excluded.zone`,
            isFavorite: sql`excluded.is_favorite`,
            dateAdded: sql`excluded.date_added`,
            purchaseDate: sql`excluded.purchase_date`,
            purchasePrice: sql`excluded.purchase_price`,
            doubanUrl: sql`excluded.douban_url`,
            tracklistJson: sql`excluded.tracklist_json`,
            label: sql`excluded.label`,
            vinylColor: sql`excluded.vinyl_color`,
            vinylStyle: sql`excluded.vinyl_style`,
            updatedAt: sql`excluded.updated_at`,
          },
        });
    }

    return Response.json({
      albums: resolvedIncoming,
      added: resolvedIncoming.filter((album) => !existingIds.has(album.id))
        .length,
      updated: resolvedIncoming.filter((album) => existingIds.has(album.id))
        .length,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "保存唱片资料时发生错误",
      },
      { status: 500 },
    );
  }
}
