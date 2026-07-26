import { isNativeApp } from "./store";
import { resolveArtworkURL } from "./artwork";

const MB_BASE = "https://musicbrainz.org/ws/2";
const COVER_BASE = "https://coverartarchive.org";

type MBRelease = {
  id: string;
  score: number;
  title: string;
  date?: string;
  country?: string;
  "artist-credit"?: Array<{ name: string }>;
  "release-group"?: { "primary-type"?: string };
  "label-info"?: Array<{ label?: { name: string } }>;
  media?: Array<{
    format?: string;
    "track-count"?: number;
    tracks?: Array<{
      title: string;
      number?: string;
      position?: number;
    }>;
  }>;
  "track-count"?: number;
};

export type MusicSearchResult = {
  id: string;
  title: string;
  artist: string;
  year: string;
  country: string;
  label: string;
  format: string;
  trackCount: number;
  type: string;
  coverUrl: string;
  score: number;
};

export type MusicDetail = {
  id: string;
  title: string;
  artist: string;
  date: string;
  country: string;
  label: string;
  format: string;
  coverUrl: string;
  tracks: string[];
};

export async function searchMusic(
  query: string,
  fields?: { title?: string; artist?: string },
): Promise<MusicSearchResult[]> {
  if (isNativeApp()) {
    const structuredQuery =
      fields?.title?.trim() && fields.artist?.trim()
        ? `release:"${fields.title.trim()}" AND artist:"${fields.artist.trim()}"`
        : query;
    const params = new URLSearchParams({
      query: structuredQuery,
      fmt: "json",
      limit: "15",
    });
    const res = await fetch(`${MB_BASE}/release/?${params.toString()}`);
    if (!res.ok) throw new Error(`MusicBrainz 搜索失败（${res.status}）`);
    const data = (await res.json()) as { releases?: MBRelease[] };
    return (data.releases ?? []).map((release) => ({
      id: release.id,
      title: release.title,
      artist:
        release["artist-credit"]?.map((credit) => credit.name).join(", ") ??
        "",
      year: release.date?.slice(0, 4) ?? "",
      country: release.country ?? "",
      label: release["label-info"]?.[0]?.label?.name ?? "",
      format: release.media?.[0]?.format ?? "",
      trackCount: release["track-count"] ?? 0,
      type: release["release-group"]?.["primary-type"] ?? "",
      coverUrl: `${COVER_BASE}/release/${release.id}/front-500`,
      score: release.score,
    }));
  }

  const params = new URLSearchParams({ q: query });
  if (fields?.title?.trim()) params.set("title", fields.title.trim());
  if (fields?.artist?.trim()) params.set("artist", fields.artist.trim());
  const res = await fetch(`/api/douban?${params.toString()}`);
  const data = (await res.json()) as {
    results?: MusicSearchResult[];
    error?: string;
  };
  if (!res.ok) throw new Error(data.error || "搜索失败");
  return data.results ?? [];
}

export async function getMusicDetail(id: string): Promise<MusicDetail> {
  if (isNativeApp()) {
    const res = await fetch(
      `${MB_BASE}/release/${id}?inc=recordings+artists+labels&fmt=json`,
    );
    if (!res.ok) {
      throw new Error(`MusicBrainz 暂时没有回应（${res.status}）`);
    }
    const release = (await res.json()) as MBRelease;
    const tracks =
      release.media?.flatMap(
        (medium) =>
          medium.tracks?.map((track) => {
            const prefix =
              track.number || track.position
                ? `${track.number || track.position}. `
                : "";
            return `${prefix}${track.title}`;
          }) ?? [],
      ) ?? [];
    return {
      id: release.id,
      title: release.title,
      artist:
        release["artist-credit"]?.map((credit) => credit.name).join(", ") ??
        "",
      date: release.date ?? "",
      country: release.country ?? "",
      label: release["label-info"]?.[0]?.label?.name ?? "",
      format: release.media?.[0]?.format ?? "",
      coverUrl: `${COVER_BASE}/release/${release.id}/front-500`,
      tracks,
    };
  }

  const res = await fetch(`/api/douban?id=${id}`);
  const data = (await res.json()) as MusicDetail & { error?: string };
  if (!res.ok) throw new Error(data.error || "获取详情失败");
  return data;
}

export function proxyCoverUrl(url: string): string {
  return url ? resolveArtworkURL(url) : url;
}
