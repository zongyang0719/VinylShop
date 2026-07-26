export type Zone = "recent" | "unsorted";
export type Format = "vinyl" | "cd" | "unknown";
export type VinylStyle = "standard" | "transparent" | "picture" | "splatter";
export type ViewMode = "gallery" | "crate";

export type Album = {
  id: string;
  discogsId?: number;
  title: string;
  artist: string;
  year?: number;
  releaseDate?: string;
  coverUrl: string;
  format: Format;
  zone: Zone;
  favorite?: boolean;
  dateAdded: string;
  purchaseDate?: string;
  purchasePrice?: string;
  doubanUrl?: string;
  tracklist?: string[];
  label?: string;
  genres?: string[];
  styles?: string[];
  country?: string;
  catalogNumber?: string;
  producers?: string[];
  edition?: string;
  barcode?: string;
  numberOfVolumes?: number;
  vinylColor?: string;
  vinylStyle?: VinylStyle;
  musicBuddySourceKey?: string;
  originalReleaseYear?: number;
  labels?: string[];
  trackDurations?: number[];
  composers?: string[];
  orchestras?: string[];
  conductors?: string[];
  performers?: string[];
  writers?: string[];
  productionCompanies?: string[];
  sourceMetadataJson?: string;
};

type AlbumsResponse = {
  albums?: Album[];
  error?: string;
};

type UpsertResponse = {
  albums?: Album[];
  added?: number;
  updated?: number;
  error?: string;
};

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || "唱片库暂时不可用");
  }
  return data;
}

const CACHE_KEY = "vinylshop_albums";
const CACHE_TS_KEY = "vinylshop_albums_ts";
const CACHE_VER_KEY = "vinylshop_cache_ver";
const CACHE_VERSION = "2026-07-26-v4-enriched";

export function getCachedAlbums(): Album[] | null {
  if (typeof window === "undefined") return null;
  try {
    if (window.localStorage.getItem(CACHE_VER_KEY) !== CACHE_VERSION) {
      return null;
    }
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Album[];
  } catch {
    return null;
  }
}

function writeCache(albums: Album[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(albums));
    window.localStorage.setItem(CACHE_TS_KEY, String(Date.now()));
    window.localStorage.setItem(CACHE_VER_KEY, CACHE_VERSION);
  } catch { /* quota exceeded — ignore */ }
}

function patchCache(updated: Album[]) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) { writeCache(updated); return; }
    const existing = JSON.parse(raw) as Album[];
    const map = new Map(existing.map((a) => [a.id, a]));
    for (const album of updated) map.set(album.id, album);
    writeCache(Array.from(map.values()));
  } catch { /* ignore */ }
}

export async function getAlbums(): Promise<Album[]> {
  const cached = getCachedAlbums();
  if (cached) {
    void refreshAlbums().catch(() => {});
    return cached;
  }

  return refreshAlbums();
}

export async function refreshAlbums(): Promise<Album[]> {
  const response = await fetch("/api/albums", {
    cache: "no-store",
  });
  const data = await readJson<AlbumsResponse>(response);
  const albums = data.albums ?? [];
  writeCache(albums);
  return albums;
}

export async function upsertAlbums(items: Album[]) {
  const response = await fetch("/api/albums", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ albums: items }),
  });
  const result = await readJson<UpsertResponse>(response);
  if (result.albums) patchCache(result.albums);
  return result;
}

export async function upsertAlbum(album: Album) {
  const response = await upsertAlbums([album]);
  return response.albums?.[0] ?? album;
}

export async function deleteAlbum(id: string) {
  const response = await fetch("/api/albums", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error ?? "删除失败",
    );
  }
  const cached = getCachedAlbums();
  if (cached) {
    writeCache(cached.filter((a) => a.id !== id));
  }
}

export function makeLocalId(discogsId?: number) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${discogsId ?? "album"}-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`;
}
