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
    ...(Array.isArray(input.genres) && input.genres.length
      ? { genres: input.genres.map((g) => g.trim()).filter(Boolean) }
      : {}),
    ...(Array.isArray(input.styles) && input.styles.length
      ? { styles: input.styles.map((s) => s.trim()).filter(Boolean) }
      : {}),
    ...(input.country?.trim() ? { country: input.country.trim() } : {}),
    ...(input.catalogNumber?.trim()
      ? { catalogNumber: input.catalogNumber.trim() }
      : {}),
    ...(Array.isArray(input.producers) && input.producers.length
      ? { producers: input.producers.map((p) => p.trim()).filter(Boolean) }
      : {}),
    ...(input.edition?.trim() ? { edition: input.edition.trim() } : {}),
    ...(input.barcode?.trim() ? { barcode: input.barcode.trim() } : {}),
    ...(input.numberOfVolumes && Number(input.numberOfVolumes) > 1
      ? { numberOfVolumes: Number(input.numberOfVolumes) }
      : {}),
    ...(input.vinylColor?.trim() ? { vinylColor: input.vinylColor.trim() } : {}),
    ...(input.vinylStyle ? { vinylStyle: input.vinylStyle as VinylStyle } : {}),
    ...(input.musicBuddySourceKey?.trim()
      ? { musicBuddySourceKey: input.musicBuddySourceKey.trim() }
      : {}),
    ...(input.originalReleaseYear
      ? { originalReleaseYear: Number(input.originalReleaseYear) }
      : {}),
    ...(Array.isArray(input.labels) && input.labels.length
      ? { labels: input.labels.map((l) => l.trim()).filter(Boolean) }
      : {}),
    ...(Array.isArray(input.trackDurations) && input.trackDurations.length
      ? { trackDurations: input.trackDurations }
      : {}),
    ...(Array.isArray(input.composers) && input.composers.length
      ? { composers: input.composers.map((c) => c.trim()).filter(Boolean) }
      : {}),
    ...(Array.isArray(input.orchestras) && input.orchestras.length
      ? { orchestras: input.orchestras.map((o) => o.trim()).filter(Boolean) }
      : {}),
    ...(Array.isArray(input.conductors) && input.conductors.length
      ? { conductors: input.conductors.map((c) => c.trim()).filter(Boolean) }
      : {}),
    ...(Array.isArray(input.performers) && input.performers.length
      ? { performers: input.performers.map((p) => p.trim()).filter(Boolean) }
      : {}),
    ...(Array.isArray(input.writers) && input.writers.length
      ? { writers: input.writers.map((w) => w.trim()).filter(Boolean) }
      : {}),
    ...(Array.isArray(input.productionCompanies) &&
    input.productionCompanies.length
      ? {
          productionCompanies: input.productionCompanies
            .map((p) => p.trim())
            .filter(Boolean),
        }
      : {}),
    ...(input.sourceMetadataJson?.trim()
      ? { sourceMetadataJson: input.sourceMetadataJson.trim() }
      : {}),
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
    genresJson: album.genres?.length ? JSON.stringify(album.genres) : null,
    stylesJson: album.styles?.length ? JSON.stringify(album.styles) : null,
    country: album.country ?? null,
    catalogNumber: album.catalogNumber ?? null,
    producersJson: album.producers?.length
      ? JSON.stringify(album.producers)
      : null,
    edition: album.edition ?? null,
    barcode: album.barcode ?? null,
    numberOfVolumes: album.numberOfVolumes ?? null,
    vinylColor: album.vinylColor ?? null,
    vinylStyle: album.vinylStyle ?? null,
    musicBuddySourceKey: album.musicBuddySourceKey ?? null,
    originalReleaseYear: album.originalReleaseYear ?? null,
    labelsJson: album.labels?.length ? JSON.stringify(album.labels) : null,
    trackDurationsJson: album.trackDurations?.length
      ? JSON.stringify(album.trackDurations)
      : null,
    composersJson: album.composers?.length
      ? JSON.stringify(album.composers)
      : null,
    orchestrasJson: album.orchestras?.length
      ? JSON.stringify(album.orchestras)
      : null,
    conductorsJson: album.conductors?.length
      ? JSON.stringify(album.conductors)
      : null,
    performersJson: album.performers?.length
      ? JSON.stringify(album.performers)
      : null,
    writersJson: album.writers?.length
      ? JSON.stringify(album.writers)
      : null,
    productionCompaniesJson: album.productionCompanies?.length
      ? JSON.stringify(album.productionCompanies)
      : null,
    sourceMetadataJson: album.sourceMetadataJson ?? null,
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
    ...(row.genresJson
      ? { genres: JSON.parse(row.genresJson as string) as string[] }
      : {}),
    ...(row.stylesJson
      ? { styles: JSON.parse(row.stylesJson as string) as string[] }
      : {}),
    ...(row.country ? { country: row.country } : {}),
    ...(row.catalogNumber ? { catalogNumber: row.catalogNumber } : {}),
    ...(row.producersJson
      ? { producers: JSON.parse(row.producersJson as string) as string[] }
      : {}),
    ...(row.edition ? { edition: row.edition } : {}),
    ...(row.barcode ? { barcode: row.barcode } : {}),
    ...(row.numberOfVolumes && (row.numberOfVolumes as number) > 1
      ? { numberOfVolumes: row.numberOfVolumes as number }
      : {}),
    ...(row.vinylColor ? { vinylColor: row.vinylColor } : {}),
    ...(row.vinylStyle ? { vinylStyle: row.vinylStyle as VinylStyle } : {}),
    ...(row.musicBuddySourceKey
      ? { musicBuddySourceKey: row.musicBuddySourceKey }
      : {}),
    ...(row.originalReleaseYear
      ? { originalReleaseYear: row.originalReleaseYear }
      : {}),
    ...(row.labelsJson
      ? { labels: JSON.parse(row.labelsJson as string) as string[] }
      : {}),
    ...(row.trackDurationsJson
      ? {
          trackDurations: JSON.parse(
            row.trackDurationsJson as string,
          ) as number[],
        }
      : {}),
    ...(row.composersJson
      ? { composers: JSON.parse(row.composersJson as string) as string[] }
      : {}),
    ...(row.orchestrasJson
      ? { orchestras: JSON.parse(row.orchestrasJson as string) as string[] }
      : {}),
    ...(row.conductorsJson
      ? { conductors: JSON.parse(row.conductorsJson as string) as string[] }
      : {}),
    ...(row.performersJson
      ? { performers: JSON.parse(row.performersJson as string) as string[] }
      : {}),
    ...(row.writersJson
      ? { writers: JSON.parse(row.writersJson as string) as string[] }
      : {}),
    ...(row.productionCompaniesJson
      ? {
          productionCompanies: JSON.parse(
            row.productionCompaniesJson as string,
          ) as string[],
        }
      : {}),
    ...(row.sourceMetadataJson
      ? { sourceMetadataJson: row.sourceMetadataJson }
      : {}),
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
            discogsId: sql`COALESCE(excluded.discogs_id, albums.discogs_id)`,
            title: sql`excluded.title`,
            artist: sql`excluded.artist`,
            year: sql`COALESCE(excluded.year, albums.year)`,
            releaseDate: sql`COALESCE(excluded.release_date, albums.release_date)`,
            coverUrl: sql`excluded.cover_url`,
            format: sql`excluded.format`,
            zone: sql`excluded.zone`,
            isFavorite: sql`excluded.is_favorite`,
            dateAdded: sql`excluded.date_added`,
            purchaseDate: sql`COALESCE(excluded.purchase_date, albums.purchase_date)`,
            purchasePrice: sql`COALESCE(excluded.purchase_price, albums.purchase_price)`,
            doubanUrl: sql`COALESCE(excluded.douban_url, albums.douban_url)`,
            tracklistJson: sql`COALESCE(excluded.tracklist_json, albums.tracklist_json)`,
            label: sql`COALESCE(excluded.label, albums.label)`,
            genresJson: sql`COALESCE(excluded.genres_json, albums.genres_json)`,
            stylesJson: sql`COALESCE(excluded.styles_json, albums.styles_json)`,
            country: sql`COALESCE(excluded.country, albums.country)`,
            catalogNumber: sql`COALESCE(excluded.catalog_number, albums.catalog_number)`,
            producersJson: sql`COALESCE(excluded.producers_json, albums.producers_json)`,
            edition: sql`COALESCE(excluded.edition, albums.edition)`,
            barcode: sql`COALESCE(excluded.barcode, albums.barcode)`,
            numberOfVolumes: sql`COALESCE(excluded.number_of_volumes, albums.number_of_volumes)`,
            vinylColor: sql`COALESCE(excluded.vinyl_color, albums.vinyl_color)`,
            vinylStyle: sql`COALESCE(excluded.vinyl_style, albums.vinyl_style)`,
            musicBuddySourceKey: sql`COALESCE(excluded.musicbuddy_source_key, albums.musicbuddy_source_key)`,
            originalReleaseYear: sql`COALESCE(excluded.original_release_year, albums.original_release_year)`,
            labelsJson: sql`COALESCE(excluded.labels_json, albums.labels_json)`,
            trackDurationsJson: sql`COALESCE(excluded.track_durations_json, albums.track_durations_json)`,
            composersJson: sql`COALESCE(excluded.composers_json, albums.composers_json)`,
            orchestrasJson: sql`COALESCE(excluded.orchestras_json, albums.orchestras_json)`,
            conductorsJson: sql`COALESCE(excluded.conductors_json, albums.conductors_json)`,
            performersJson: sql`COALESCE(excluded.performers_json, albums.performers_json)`,
            writersJson: sql`COALESCE(excluded.writers_json, albums.writers_json)`,
            productionCompaniesJson: sql`COALESCE(excluded.production_companies_json, albums.production_companies_json)`,
            sourceMetadataJson: sql`COALESCE(excluded.source_metadata_json, albums.source_metadata_json)`,
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

export async function DELETE(request: Request) {
  try {
    const { id } = (await request.json()) as { id?: string };
    if (!id || typeof id !== "string") {
      return Response.json({ error: "缺少专辑 ID" }, { status: 400 });
    }
    await ensureAlbumsTable();
    const db = getDb();
    await db.delete(albumsTable).where(eq(albumsTable.id, id));
    return Response.json({ deleted: id });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "删除唱片时发生错误",
      },
      { status: 500 },
    );
  }
}
