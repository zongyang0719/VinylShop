export type Zone = "recent" | "unsorted";
export type Format = "vinyl" | "cd" | "unknown";

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

export async function getAlbums(): Promise<Album[]> {
  const response = await fetch("/api/albums", {
    cache: "no-store",
  });
  const data = await readJson<AlbumsResponse>(response);
  return data.albums ?? [];
}

export async function upsertAlbums(items: Album[]) {
  const response = await fetch("/api/albums", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ albums: items }),
  });
  return readJson<UpsertResponse>(response);
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
