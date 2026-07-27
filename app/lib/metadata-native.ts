/**
 * Client-side metadata suggestion engine for native (Capacitor) builds.
 *
 * Calls Apple iTunes, MusicBrainz and Wikidata directly — no server routes
 * needed. Discogs is skipped because it requires a secret token.
 */

import type {
  MetadataField,
  MetadataProposal,
  MetadataRequest,
  MetadataSource,
  MetadataSourceState,
  MetadataSuggestion,
} from "./metadata";

/* ─── types ────────────────────────────────────────── */

type SourceResult<T> = {
  status: "matched" | "no-match" | "unavailable";
  data?: T;
};

type AppleAlbum = {
  id: number;
  title: string;
  artist: string;
  year?: number;
  releaseDate?: string;
  genre?: string;
  tracks?: string[];
  score: number;
};

type MBRelease = {
  title: string;
  groupTitle?: string;
  artist: string;
  year?: number;
  releaseDate?: string;
  country?: string;
  label?: string;
  catalogNumber?: string;
  barcode?: string;
  score: number;
};

type WikidataArtist = {
  label: string;
  chineseMusicContext: boolean;
};

/* ─── helpers ──────────────────────────────────────── */

const MB_BASE = "https://musicbrainz.org/ws/2";

function hasHan(value: string) {
  return /\p{Script=Han}/u.test(value);
}

function normalized(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/['']/g, "'")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function hanOnly(value: string) {
  return value.match(/\p{Script=Han}/gu)?.join("") ?? "";
}

function similarity(left: string, right: string) {
  const a = normalized(left);
  const b = normalized(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) {
    return Math.max(0.72, Math.min(a.length, b.length) / Math.max(a.length, b.length));
  }
  const aHan = hanOnly(left);
  const bHan = hanOnly(right);
  if (aHan && bHan) {
    if (aHan === bHan) return 0.96;
    if (aHan.includes(bHan) || bHan.includes(aHan)) return 0.82;
  }
  const aTokens = new Set(a.split(" "));
  const bTokens = new Set(b.split(" "));
  const shared = [...aTokens].filter((t) => bTokens.has(t)).length;
  const total = new Set([...aTokens, ...bTokens]).size;
  return total ? shared / total : 0;
}

const EDITION_RE =
  /\b(?:edition|anniversary|remaster(?:ed)?|reissue|deluxe|limited|mono|stereo|version|lp|cd|vinyl)\b|版|紀念|纪念|再版|重製|重制|黑膠|黑胶|彩膠|彩胶|透明膠|透明胶/i;

function splitEdition(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/\s*[\[(]([^()[\]]+)[\])]\s*$/u);
  if (!match || !EDITION_RE.test(match[1])) return { title: trimmed };
  return { title: trimmed.slice(0, match.index).trim(), edition: match[1].trim() };
}

function unique(values: Array<string | undefined>) {
  return [...new Set(values.map((v) => v?.trim()).filter((v): v is string => Boolean(v)))];
}

async function fetchJson<T>(url: string, init?: RequestInit, timeout = 8_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) throw new Error(`${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/* ─── Apple iTunes ─────────────────────────────────── */

function appleScore(
  candidate: { title: string; artist: string; year?: number },
  album: MetadataRequest,
) {
  const titleScore = similarity(splitEdition(candidate.title).title, splitEdition(album.title).title);
  const artistScore = similarity(candidate.artist, album.artist);
  const yearScore = candidate.year && album.year && candidate.year === album.year ? 1 : 0;
  return titleScore * 70 + artistScore * 20 + yearScore * 10;
}

async function fetchApple(album: MetadataRequest): Promise<SourceResult<AppleAlbum>> {
  try {
    const params = new URLSearchParams({
      term: `${album.artist} ${album.title}`,
      country: "cn",
      media: "music",
      entity: "album",
      limit: "25",
    });
    const data = await fetchJson<{
      results?: Array<{
        collectionId: number;
        collectionName?: string;
        artistName?: string;
        releaseDate?: string;
        primaryGenreName?: string;
      }>;
    }>(`https://itunes.apple.com/search?${params.toString()}`);

    const candidates = (data.results ?? [])
      .filter((r) => r.collectionName && r.artistName)
      .map((r) => {
        const c: AppleAlbum = {
          id: r.collectionId,
          title: r.collectionName ?? "",
          artist: r.artistName ?? "",
          year: Number(r.releaseDate?.slice(0, 4)) || undefined,
          releaseDate: r.releaseDate,
          genre: r.primaryGenreName,
          score: 0,
        };
        c.score = appleScore(c, album);
        return c;
      })
      .sort((a, b) => b.score - a.score);

    const best = candidates[0];
    if (!best || best.score < 48) return { status: "no-match" };

    try {
      const lookup = await fetchJson<{
        results?: Array<{
          wrapperType?: string;
          collectionId?: number;
          trackName?: string;
          trackNumber?: number;
        }>;
      }>(
        `https://itunes.apple.com/lookup?${new URLSearchParams({
          id: String(best.id),
          entity: "song",
          country: "cn",
        }).toString()}`,
      );
      best.tracks = (lookup.results ?? [])
        .filter((r) => r.wrapperType === "track" && r.collectionId === best.id && r.trackName)
        .sort((a, b) => (a.trackNumber ?? 0) - (b.trackNumber ?? 0))
        .map((r) => r.trackName as string);
    } catch {
      /* album match is still useful */
    }
    return { status: "matched", data: best };
  } catch {
    return { status: "unavailable" };
  }
}

/* ─── MusicBrainz ──────────────────────────────────── */

async function fetchMusicBrainz(album: MetadataRequest): Promise<SourceResult<MBRelease>> {
  try {
    const params = new URLSearchParams({
      query: `${album.title} ${album.artist}`,
      fmt: "json",
      limit: "8",
    });
    const data = await fetchJson<{
      releases?: Array<{
        id: string;
        score?: number;
        title?: string;
        date?: string;
        country?: string;
        barcode?: string;
        "artist-credit"?: Array<{ name?: string }>;
        "release-group"?: { title?: string };
        "label-info"?: Array<{
          "catalog-number"?: string;
          label?: { name?: string };
        }>;
      }>;
    }>(`${MB_BASE}/release/?${params.toString()}`);

    const candidates = (data.releases ?? [])
      .map((r) => {
        const title = r.title ?? "";
        const artist = r["artist-credit"]?.map((c) => c.name).filter(Boolean).join(", ") ?? "";
        const apiScore = r.score ?? 0;
        const localScore = similarity(title, album.title) * 25 + similarity(artist, album.artist) * 10;
        return {
          title,
          groupTitle: r["release-group"]?.title,
          artist,
          year: Number(r.date?.slice(0, 4)) || undefined,
          releaseDate: r.date,
          country: r.country,
          label: r["label-info"]?.[0]?.label?.name,
          catalogNumber: r["label-info"]?.[0]?.["catalog-number"],
          barcode: r.barcode,
          score: apiScore * 0.65 + localScore,
          apiScore,
        };
      })
      .sort((a, b) => b.score - a.score);

    const best = candidates[0];
    if (!best || best.apiScore < 75 || similarity(best.title, album.title) < 0.42) {
      return { status: "no-match" };
    }
    return { status: "matched", data: best };
  } catch {
    return { status: "unavailable" };
  }
}

/* ─── Wikidata ─────────────────────────────────────── */

async function fetchWikidata(album: MetadataRequest): Promise<SourceResult<WikidataArtist>> {
  try {
    const searchParams = new URLSearchParams({
      action: "wbsearchentities",
      search: album.artist,
      language: hasHan(album.artist) ? "zh" : "en",
      uselang: "zh-hans",
      type: "item",
      limit: "5",
      format: "json",
      origin: "*",
    });
    const search = await fetchJson<{
      search?: Array<{ id?: string; label?: string; description?: string }>;
    }>(`https://www.wikidata.org/w/api.php?${searchParams.toString()}`);

    const candidate =
      search.search?.find(
        (item) =>
          similarity(item.label ?? "", album.artist) >= 0.7 &&
          /歌手|音乐人|音樂人|乐队|樂隊|singer|musician|rapper|band|composer/i.test(item.description ?? ""),
      ) ?? search.search?.[0];
    if (!candidate?.id) return { status: "no-match" };

    const entity = await fetchJson<{
      entities?: Record<string, { labels?: Record<string, { value?: string }> }>;
    }>(
      `https://www.wikidata.org/w/api.php?${new URLSearchParams({
        action: "wbgetentities",
        ids: candidate.id,
        props: "labels",
        languages: "zh-hans|zh-cn|zh|zh-hant|en",
        format: "json",
        origin: "*",
      }).toString()}`,
    );
    const labels = entity.entities?.[candidate.id]?.labels;
    const label =
      labels?.["zh-hans"]?.value ||
      labels?.["zh-cn"]?.value ||
      labels?.zh?.value ||
      labels?.["zh-hant"]?.value;
    if (!label || !hasHan(label)) return { status: "no-match" };
    return {
      status: "matched",
      data: {
        label,
        chineseMusicContext:
          /Chinese|Taiwanese|Hong Kong|Macanese|Singaporean|Malaysian|中国|中國|台湾|台灣|香港|澳门|澳門|新加坡|马来西亚|馬來西亞/i.test(
            candidate.description ?? "",
          ),
      },
    };
  } catch {
    return { status: "unavailable" };
  }
}

/* ─── merge & build suggestion ─────────────────────── */

const SOURCE_LABELS: Record<string, string> = {
  apple: "Apple 中国区",
  musicbrainz: "MusicBrainz",
  discogs: "Discogs",
  wikidata: "Wikidata",
};

function sourceState(
  source: "apple" | "musicbrainz" | "discogs" | "wikidata",
  result: SourceResult<unknown>,
): MetadataSourceState {
  return { source, label: SOURCE_LABELS[source], status: result.status };
}

export async function suggestAlbumMetadataNative(
  input: MetadataRequest,
): Promise<MetadataSuggestion> {
  const album: MetadataRequest = {
    title: input.title.trim(),
    artist: input.artist.trim(),
    format: input.format ?? "unknown",
    ...(input.year ? { year: Number(input.year) } : {}),
    ...(input.releaseDate ? { releaseDate: input.releaseDate } : {}),
    ...(input.barcode ? { barcode: input.barcode.trim() } : {}),
  };

  const [apple, musicbrainz, wikidata] = await Promise.all([
    fetchApple(album),
    fetchMusicBrainz(album),
    fetchWikidata(album),
  ]);

  const discogsResult: SourceResult<never> = { status: "unavailable" };

  const proposal: MetadataProposal = {};
  const provenance: Partial<Record<MetadataField, MetadataSource[]>> = {};

  const propose = <K extends MetadataField>(
    field: K,
    value: MetadataProposal[K],
    sources: MetadataSource[],
  ) => {
    if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) return;
    proposal[field] = value;
    provenance[field] = unique(sources) as MetadataSource[];
  };

  const appleData = apple.data;
  const mbData = musicbrainz.data;
  const wkData = wikidata.data;

  /* ── artist ── */
  const chineseArtistName =
    (appleData?.artist && hasHan(appleData.artist) ? appleData.artist : undefined) ||
    (mbData?.artist && hasHan(mbData.artist) ? mbData.artist : undefined) ||
    (wkData?.chineseMusicContext ? wkData.label : undefined) ||
    (hasHan(album.artist) ? album.artist : undefined);

  if (chineseArtistName) {
    const artistSources: MetadataSource[] = [];
    if (appleData?.artist === chineseArtistName) artistSources.push("apple");
    if (mbData?.artist === chineseArtistName) artistSources.push("musicbrainz");
    if (wkData?.label === chineseArtistName) artistSources.push("wikidata");
    propose("artist", chineseArtistName, artistSources);
  } else {
    propose(
      "artist",
      mbData?.artist || album.artist,
      mbData?.artist ? ["musicbrainz"] : [],
    );
  }

  /* ── title ── */
  const isChineseArtist = Boolean(chineseArtistName);
  const appleTitleOk = appleData && similarity(appleData.title, album.title) >= 0.72;
  const rawTitle =
    (appleTitleOk && isChineseArtist ? appleData?.title : undefined) ||
    mbData?.groupTitle ||
    mbData?.title ||
    album.title;
  const displayTitle = splitEdition(rawTitle).title;
  const titleSources: MetadataSource[] = [];
  if (rawTitle === appleData?.title) titleSources.push("apple");
  if (rawTitle === mbData?.groupTitle || rawTitle === mbData?.title) titleSources.push("musicbrainz");
  propose("title", displayTitle, titleSources);

  /* ── edition ── */
  const edition =
    splitEdition(album.title).edition ||
    (appleData ? splitEdition(appleData.title).edition : undefined);
  if (edition) propose("edition", edition, ["apple"]);

  /* ── year & releaseDate ── */
  const catalogDate = appleData?.releaseDate || mbData?.releaseDate;
  const catalogYear = Number(catalogDate?.slice(0, 4)) || 0;
  propose(
    "year",
    catalogYear || mbData?.year || appleData?.year,
    appleData?.releaseDate ? ["apple"] : mbData?.year ? ["musicbrainz"] : [],
  );
  if (catalogDate) {
    propose(
      "releaseDate",
      catalogDate.slice(0, 10),
      appleData?.releaseDate ? ["apple"] : ["musicbrainz"],
    );
  }

  /* ── MusicBrainz-sourced fields ── */
  if (mbData?.label) propose("label", mbData.label, ["musicbrainz"]);
  if (mbData?.country) propose("country", mbData.country, ["musicbrainz"]);
  if (mbData?.catalogNumber) propose("catalogNumber", mbData.catalogNumber, ["musicbrainz"]);
  if (mbData?.barcode) propose("barcode", mbData.barcode.replace(/\s/g, ""), ["musicbrainz"]);

  /* ── genres (from Apple) ── */
  if (appleData?.genre) {
    propose("genres", [appleData.genre], ["apple"]);
  }

  /* ── tracklist (from Apple) ── */
  if (appleData?.tracks?.length) {
    propose("tracklist", appleData.tracks, ["apple"]);
  }

  /* ── confidence ── */
  const matched = [apple, musicbrainz, wikidata].filter((r) => r.status === "matched").length;
  const confidence: MetadataSuggestion["confidence"] = matched >= 2 ? "medium" : "review";
  const summary =
    matched >= 2
      ? "多个来源指向同一张专辑，建议确认版本字段"
      : matched === 1
        ? "只找到一个可靠来源，请逐项确认后采用"
        : "没有找到可靠的外部匹配";

  return {
    proposal,
    provenance,
    confidence,
    summary,
    sourceStates: [
      sourceState("apple", apple),
      sourceState("musicbrainz", musicbrainz),
      sourceState("discogs", discogsResult),
      sourceState("wikidata", wikidata),
    ],
  };
}
