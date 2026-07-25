import type { Album, Format, Zone } from "./store";
import { makeLocalId } from "./store";

export type DiscogsSearchResult = {
  id: number;
  title: string;
  year?: string;
  cover_image?: string;
  thumb?: string;
  format?: string[];
};

export type DiscogsRelease = {
  id: number;
  title: string;
  year?: number;
  artists_sort?: string;
  artists?: Array<{ name: string }>;
  images?: Array<{ uri: string; uri150?: string }>;
  tracklist?: Array<{
    title: string;
    position?: string;
    type_?: string;
  }>;
};

async function apiFetch<T>(params: URLSearchParams): Promise<T> {
  const response = await fetch(`/api/discogs?${params.toString()}`);
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || "Discogs 暂时没有回应");
  }
  return data;
}

export async function searchDiscogs(query: string) {
  const data = await apiFetch<{ results: DiscogsSearchResult[] }>(
    new URLSearchParams({ q: query }),
  );
  return data.results.slice(0, 3);
}

export function getDiscogsRelease(id: number) {
  return apiFetch<DiscogsRelease>(
    new URLSearchParams({ id: String(id) }),
  );
}

function splitSearchTitle(value: string) {
  const separator = value.indexOf(" - ");
  if (separator === -1) {
    return { artist: "Unknown Artist", title: value };
  }
  return {
    artist: value.slice(0, separator),
    title: value.slice(separator + 3),
  };
}

export function createAlbumFromDiscogs(
  result: DiscogsSearchResult,
  release: DiscogsRelease,
  format: Exclude<Format, "unknown">,
  zone: Zone,
): Album {
  const fallback = splitSearchTitle(result.title);
  const artist =
    release.artists_sort ||
    release.artists?.map((item) => item.name).join(", ") ||
    fallback.artist;
  const tracklist = release.tracklist
    ?.filter((track) => track.type_ !== "heading")
    .map((track) =>
      track.position ? `${track.position}  ${track.title}` : track.title,
    )
    .filter(Boolean);

  return {
    id: makeLocalId(release.id),
    discogsId: release.id,
    title: release.title || fallback.title,
    artist,
    year: release.year || Number(result.year) || undefined,
    coverUrl:
      release.images?.[0]?.uri ||
      result.cover_image ||
      result.thumb ||
      "/covers/cover-fallback.svg",
    format,
    zone,
    dateAdded: new Date().toISOString(),
    tracklist,
  };
}
