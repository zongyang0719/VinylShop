import initialLibrary from "@/app/data/initial-library.json";

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
const CACHE_VERSION = "2026-07-26-v5-local";
const NATIVE_CACHE_KEY = "vinylshop_native_albums_v1";

/* ── native-local mode ───────────────────────────── */

/**
 * Detect if the app is running inside a Capacitor native shell.
 * When true, all data operations use localStorage as the authoritative
 * store — no server API calls are made for CRUD.
 */
function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const cap = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    return cap?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

export function getCachedAlbums(): Album[] | null {
  if (typeof window === "undefined") return null;
  try {
    if (
      !isNativeApp() &&
      window.localStorage.getItem(CACHE_VER_KEY) !== CACHE_VERSION
    ) {
      return null;
    }
    const key = isNativeApp() ? NATIVE_CACHE_KEY : CACHE_KEY;
    const raw =
      window.localStorage.getItem(key) ??
      (isNativeApp() ? window.localStorage.getItem(CACHE_KEY) : null);
    if (!raw) return null;
    const albums = JSON.parse(raw) as Album[];
    if (isNativeApp() && !window.localStorage.getItem(NATIVE_CACHE_KEY)) {
      window.localStorage.setItem(NATIVE_CACHE_KEY, raw);
    }
    return albums;
  } catch {
    return null;
  }
}

function writeCache(albums: Album[]) {
  if (typeof window === "undefined") return;
  try {
    const key = isNativeApp() ? NATIVE_CACHE_KEY : CACHE_KEY;
    window.localStorage.setItem(key, JSON.stringify(albums));
    window.localStorage.setItem(CACHE_TS_KEY, String(Date.now()));
    if (!isNativeApp()) {
      window.localStorage.setItem(CACHE_VER_KEY, CACHE_VERSION);
    }
  } catch { /* quota exceeded — ignore */ }
}

function patchCache(updated: Album[]) {
  if (typeof window === "undefined") return;
  try {
    const key = isNativeApp() ? NATIVE_CACHE_KEY : CACHE_KEY;
    const raw = window.localStorage.getItem(key);
    if (!raw) { writeCache(updated); return; }
    const existing = JSON.parse(raw) as Album[];
    const map = new Map(existing.map((a) => [a.id, a]));
    for (const album of updated) map.set(album.id, album);
    writeCache(Array.from(map.values()));
  } catch { /* ignore */ }
}

export async function getAlbums(): Promise<Album[]> {
  if (isNativeApp()) {
    const local = getCachedAlbums();
    if (local !== null) return local;

    // First launch: seed from the copy bundled inside the app. From this
    // point on the phone's store is authoritative and never overwritten by
    // a web cache version or a background server refresh.
    const seed = (initialLibrary as Album[]).map((album) => ({ ...album }));
    writeCache(seed);
    return seed;
  }

  return refreshAlbums();
}

export async function refreshAlbums(): Promise<Album[]> {
  if (isNativeApp()) {
    return getAlbums();
  }

  const response = await fetch("/api/albums", {
    cache: "no-store",
  });
  const data = await readJson<AlbumsResponse>(response);
  const albums = data.albums ?? [];
  writeCache(albums);
  return albums;
}

export async function upsertAlbums(items: Album[]) {
  if (isNativeApp()) {
    const existing = getCachedAlbums() ?? [];
    const map = new Map(existing.map((a) => [a.id, a]));
    let added = 0;
    let updated = 0;
    for (const album of items) {
      if (map.has(album.id)) updated++;
      else added++;
      map.set(album.id, album);
    }
    const merged = Array.from(map.values());
    writeCache(merged);
    return { albums: items, added, updated };
  }

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
  if (isNativeApp()) {
    const cached = getCachedAlbums();
    if (cached) writeCache(cached.filter((a) => a.id !== id));
    return;
  }

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

/* ── native-local helpers (exposed for settings UI) ──── */

export { isNativeApp };

/** Export the full library as a JSON string (for Share / Files / iCloud backup). */
export function exportLibraryJson(): string {
  const albums = getCachedAlbums() ?? [];
  return JSON.stringify({ albums, exportedAt: new Date().toISOString() }, null, 2);
}

/** Import a previously exported JSON string, merging into local store. */
export function importLibraryJson(json: string): { total: number; added: number; updated: number } {
  const data = JSON.parse(json) as { albums?: Album[] };
  const items = data.albums ?? [];
  const existing = getCachedAlbums() ?? [];
  const map = new Map(existing.map((a) => [a.id, a]));
  let added = 0;
  let updated = 0;
  for (const album of items) {
    if (map.has(album.id)) updated++;
    else added++;
    map.set(album.id, album);
  }
  writeCache(Array.from(map.values()));
  return { total: map.size, added, updated };
}

export function makeLocalId(discogsId?: number) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${discogsId ?? "album"}-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`;
}
