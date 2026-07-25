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
const CACHE_TTL = 1000 * 60 * 30; // 30 min

function readCache(): Album[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const ts = localStorage.getItem(CACHE_TS_KEY);
    if (!raw || !ts) return null;
    if (Date.now() - Number(ts) > CACHE_TTL) return null;
    return JSON.parse(raw) as Album[];
  } catch {
    return null;
  }
}

function writeCache(albums: Album[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(albums));
    localStorage.setItem(CACHE_TS_KEY, String(Date.now()));
  } catch { /* quota exceeded — ignore */ }
}

function patchCache(updated: Album[]) {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) { writeCache(updated); return; }
    const existing = JSON.parse(raw) as Album[];
    const map = new Map(existing.map((a) => [a.id, a]));
    for (const album of updated) map.set(album.id, album);
    writeCache(Array.from(map.values()));
  } catch { /* ignore */ }
}

export async function getAlbums(): Promise<Album[]> {
  const cached = readCache();
  if (cached) {
    fetch("/api/albums", { cache: "no-store" })
      .then((r) => readJson<AlbumsResponse>(r))
      .then((d) => { if (d.albums) writeCache(d.albums); })
      .catch(() => {});
    return cached;
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

export function makeLocalId(discogsId?: number) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${discogsId ?? "album"}-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`;
}
