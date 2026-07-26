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
    duration?: string;
  }>;
  genres?: string[];
  styles?: string[];
  country?: string;
  labels?: Array<{ name: string; catno?: string }>;
  extraartists?: Array<{ name: string; role?: string }>;
  identifiers?: Array<{ type: string; value: string }>;
  notes?: string;
  num_for_sale?: number;
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

function parseDuration(dur: string): number {
  const parts = dur.split(":");
  if (parts.length === 2) {
    return Number(parts[0]) * 60 + Number(parts[1]);
  }
  return 0;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export type EnrichResult = {
  genres?: string[];
  styles?: string[];
  country?: string;
  catalogNumber?: string;
  label?: string;
  producers?: string[];
  edition?: string;
  barcode?: string;
  year?: number;
  tracklist?: string[];
  numberOfVolumes?: number;
};

export async function enrichAlbumFromDiscogs(
  discogsId: number | undefined,
  title: string,
  artist: string,
): Promise<EnrichResult | null> {
  let releaseId = discogsId;

  if (!releaseId) {
    try {
      const results = await searchDiscogs(`${artist} ${title}`);
      if (results.length === 0) return null;
      releaseId = results[0].id;
    } catch {
      return null;
    }
  }

  try {
    const release = await getDiscogsRelease(releaseId);
    const result: EnrichResult = {};

    if (release.genres?.length) result.genres = release.genres;
    if (release.styles?.length) result.styles = release.styles;
    if (release.country) result.country = release.country;
    if (release.year) result.year = release.year;

    if (release.labels?.length) {
      const mainLabel = release.labels[0];
      result.label = mainLabel.name;
      if (mainLabel.catno && mainLabel.catno !== "none") {
        result.catalogNumber = mainLabel.catno;
      }
    }

    const producers = release.extraartists
      ?.filter((ea) => /produc/i.test(ea.role ?? ""))
      .map((ea) => ea.name);
    if (producers?.length) result.producers = producers;

    const barcode = release.identifiers?.find(
      (id) => id.type === "Barcode",
    );
    if (barcode?.value) result.barcode = barcode.value.replace(/\s/g, "");

    if (release.tracklist?.length) {
      result.tracklist = release.tracklist
        .filter((t) => t.type_ !== "heading")
        .map((t) => {
          const prefix = t.position ? `${t.position}. ` : "";
          const dur = t.duration ? parseDuration(t.duration) : 0;
          const suffix = dur > 0 ? ` [${formatDuration(dur)}]` : "";
          return `${prefix}${t.title}${suffix}`;
        })
        .filter(Boolean);
    }

    return result;
  } catch {
    return null;
  }
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
