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
  const res = await fetch(`/api/douban?id=${id}`);
  const data = (await res.json()) as MusicDetail & { error?: string };
  if (!res.ok) throw new Error(data.error || "获取详情失败");
  return data;
}

export function proxyCoverUrl(url: string): string {
  if (!url || url.startsWith("/")) return url;
  return `/api/douban?img=${encodeURIComponent(url)}`;
}
