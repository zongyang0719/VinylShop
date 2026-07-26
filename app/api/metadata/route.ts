import OpenCC from "opencc-js/t2cn";
import type {
  MetadataField,
  MetadataProposal,
  MetadataRequest,
  MetadataSource,
  MetadataSourceState,
} from "@/app/lib/metadata";

export const dynamic = "force-dynamic";

const MUSICBRAINZ_BASE = "https://musicbrainz.org/ws/2";
const DISCOGS_BASE = "https://api.discogs.com";
const USER_AGENT =
  "VinylShop/1.0 (https://github.com/zongyang0719/VinylShop)";
const toSimplified = OpenCC.Converter({ from: "tw", to: "cn" });

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

type MusicBrainzRelease = {
  id: string;
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

type DiscogsRelease = {
  exact: boolean;
  title: string;
  artist: string;
  year?: number;
  country?: string;
  label?: string;
  catalogNumber?: string;
  barcode?: string;
  genres?: string[];
  styles?: string[];
  producers?: string[];
  tracklist?: string[];
};

type WikidataArtist = {
  label: string;
  chineseMusicContext: boolean;
};

const SOURCE_LABELS = {
  apple: "Apple 中国区",
  musicbrainz: "MusicBrainz",
  discogs: "Discogs",
  wikidata: "Wikidata",
} as const;

function hasHan(value: string) {
  return /\p{Script=Han}/u.test(value);
}

function normalized(value: string) {
  return toSimplified(value)
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function hanOnly(value: string) {
  return toSimplified(value).match(/\p{Script=Han}/gu)?.join("") ?? "";
}

function similarity(left: string, right: string) {
  const a = normalized(left);
  const b = normalized(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) {
    const ratio = Math.min(a.length, b.length) / Math.max(a.length, b.length);
    return Math.max(0.72, ratio);
  }

  const aHan = hanOnly(left);
  const bHan = hanOnly(right);
  if (aHan && bHan) {
    if (aHan === bHan) return 0.96;
    if (aHan.includes(bHan) || bHan.includes(aHan)) return 0.82;
  }

  const aTokens = new Set(a.split(" "));
  const bTokens = new Set(b.split(" "));
  const shared = [...aTokens].filter((token) => bTokens.has(token)).length;
  const total = new Set([...aTokens, ...bTokens]).size;
  return total ? shared / total : 0;
}

const EDITION_WORDS =
  /\b(?:edition|anniversary|remaster(?:ed)?|reissue|deluxe|limited|mono|stereo|version|lp|cd|vinyl)\b|版|紀念|纪念|再版|重製|重制|黑膠|黑胶|彩膠|彩胶|透明膠|透明胶/i;

function splitEdition(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/\s*[\[(]([^()[\]]+)[\])]\s*$/u);
  if (!match || !EDITION_WORDS.test(match[1])) {
    return { title: trimmed };
  }
  return {
    title: trimmed.slice(0, match.index).trim(),
    edition: match[1].trim(),
  };
}

function cleanChineseDisplayTitle(value: string) {
  const simplified = toSimplified(splitEdition(value).title);
  const bilingual = simplified.match(
    /^(.+?[\p{Script=Han}])\s+(?:[A-Za-z].*|\d+(?:st|nd|rd|th)\b.*)$/u,
  );
  return (bilingual?.[1] ?? simplified).trim();
}

function unique(values: Array<string | undefined>) {
  return [
    ...new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ];
}

async function fetchJson<T>(
  url: string,
  init?: RequestInit,
  timeout = 8_000,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`${response.status}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

function appleScore(
  candidate: {
    title: string;
    artist: string;
    year?: number;
  },
  album: MetadataRequest,
) {
  const titleScore = similarity(
    splitEdition(candidate.title).title,
    splitEdition(album.title).title,
  );
  const artistScore = similarity(candidate.artist, album.artist);
  const yearScore =
    candidate.year && album.year && candidate.year === album.year ? 1 : 0;
  return titleScore * 70 + artistScore * 20 + yearScore * 10;
}

async function fetchApple(
  album: MetadataRequest,
): Promise<SourceResult<AppleAlbum>> {
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

    const candidates: AppleAlbum[] = (data.results ?? [])
      .filter((item) => item.collectionName && item.artistName)
      .map((item) => {
        const releaseDate = item.releaseDate ?? "";
        const candidate: AppleAlbum = {
          id: item.collectionId,
          title: item.collectionName ?? "",
          artist: item.artistName ?? "",
          year: Number(releaseDate.slice(0, 4)) || undefined,
          releaseDate,
          genre: item.primaryGenreName,
          score: 0,
        };
        candidate.score = appleScore(candidate, album);
        return candidate;
      })
      .sort((left, right) => right.score - left.score);

    const best = candidates[0];
    if (!best || best.score < 48) {
      return { status: "no-match" };
    }

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
        .filter(
          (item) =>
            item.wrapperType === "track" &&
            item.collectionId === best.id &&
            item.trackName,
        )
        .sort((left, right) => (left.trackNumber ?? 0) - (right.trackNumber ?? 0))
        .map((item) => item.trackName as string);
    } catch {
      // The album match is still useful when the track lookup is unavailable.
    }

    return { status: "matched", data: best };
  } catch {
    return { status: "unavailable" };
  }
}

async function fetchMusicBrainz(
  album: MetadataRequest,
): Promise<SourceResult<MusicBrainzRelease>> {
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
    }>(`${MUSICBRAINZ_BASE}/release/?${params.toString()}`, {
      headers: { "User-Agent": USER_AGENT },
    });

    const candidates = (data.releases ?? [])
      .map((item) => {
        const title = item.title ?? "";
        const artist =
          item["artist-credit"]
            ?.map((credit) => credit.name)
            .filter(Boolean)
            .join(", ") ?? "";
        const apiScore = item.score ?? 0;
        const localScore =
          similarity(title, album.title) * 25 +
          similarity(artist, album.artist) * 10;
        return {
          id: item.id,
          title,
          groupTitle: item["release-group"]?.title,
          artist,
          year: Number(item.date?.slice(0, 4)) || undefined,
          releaseDate: item.date,
          country: item.country,
          label: item["label-info"]?.[0]?.label?.name,
          catalogNumber: item["label-info"]?.[0]?.["catalog-number"],
          barcode: item.barcode,
          score: apiScore * 0.65 + localScore,
          apiScore,
        };
      })
      .sort((left, right) => right.score - left.score);

    const best = candidates[0];
    if (
      !best ||
      best.apiScore < 75 ||
      similarity(best.title, album.title) < 0.42
    ) {
      return { status: "no-match" };
    }
    return { status: "matched", data: best };
  } catch {
    return { status: "unavailable" };
  }
}

async function discogsRequest<T>(path: string) {
  const token =
    process.env.DISCOGS_TOKEN || process.env.NEXT_PUBLIC_DISCOGS_TOKEN;
  if (!token || token === "你的_Personal_Access_Token") {
    throw new Error("token unavailable");
  }
  return fetchJson<T>(`${DISCOGS_BASE}${path}`, {
    headers: {
      Authorization: `Discogs token=${token}`,
      Accept: "application/vnd.discogs.v2.discogs+json",
      "User-Agent": USER_AGENT,
    },
  });
}

async function fetchDiscogs(
  album: MetadataRequest,
): Promise<SourceResult<DiscogsRelease>> {
  try {
    let releaseId = album.discogsId;
    let exact = Boolean(releaseId);

    if (!releaseId) {
      const searchParams = new URLSearchParams({
        type: "release",
        per_page: "10",
      });
      if (album.barcode) searchParams.set("barcode", album.barcode);
      else searchParams.set("q", `${album.artist} ${album.title}`);
      const search = await discogsRequest<{
        results?: Array<{
          id: number;
          title?: string;
          year?: string;
          format?: string[];
        }>;
      }>(`/database/search?${searchParams.toString()}`);
      const expectedFormat =
        album.format === "vinyl"
          ? "vinyl"
          : album.format === "cd"
            ? "cd"
            : "";
      const ranked = (search.results ?? [])
        .map((result) => {
          const parts = (result.title ?? "").split(" - ");
          const resultArtist = parts[0] ?? "";
          const resultTitle =
            parts.slice(1).join(" - ") || result.title || "";
          const titleScore = similarity(resultTitle, album.title);
          const artistScore = similarity(resultArtist, album.artist);
          const sameYear =
            Boolean(album.year && result.year) &&
            Number(result.year) === album.year;
          const sameFormat =
            !expectedFormat ||
            (result.format ?? []).some((item) =>
              item.toLocaleLowerCase().includes(expectedFormat),
            );
          return {
            ...result,
            titleScore,
            artistScore,
            sameYear,
            sameFormat,
            rank:
              titleScore * 60 +
              artistScore * 25 +
              (sameYear ? 20 : 0) +
              (sameFormat ? 10 : 0),
          };
        })
        .sort((left, right) => right.rank - left.rank);
      const best = ranked[0];
      if (!best) return { status: "no-match" };
      const parts = (best.title ?? "").split(" - ");
      const resultTitle = parts.slice(1).join(" - ") || best.title || "";
      if (
        !album.barcode &&
        similarity(resultTitle, album.title) < 0.58
      ) {
        return { status: "no-match" };
      }
      releaseId = best.id;
      exact =
        Boolean(album.barcode) ||
        (best.titleScore >= 0.72 && best.sameYear && best.sameFormat);
    }

    const release = await discogsRequest<{
      title?: string;
      year?: number;
      country?: string;
      artists_sort?: string;
      artists?: Array<{ name?: string }>;
      genres?: string[];
      styles?: string[];
      labels?: Array<{ name?: string; catno?: string }>;
      extraartists?: Array<{ name?: string; role?: string }>;
      identifiers?: Array<{ type?: string; value?: string }>;
      tracklist?: Array<{
        position?: string;
        title?: string;
        duration?: string;
        type_?: string;
      }>;
    }>(`/releases/${releaseId}`);

    const producers = unique(
      (release.extraartists ?? [])
        .filter((item) => /produc/i.test(item.role ?? ""))
        .map((item) => item.name),
    );
    const barcode = release.identifiers?.find(
      (item) => item.type === "Barcode",
    )?.value;
    const tracklist = (release.tracklist ?? [])
      .filter((track) => track.type_ !== "heading" && track.title)
      .map((track) => {
        const position = track.position ? `${track.position}. ` : "";
        const duration = track.duration ? ` [${track.duration}]` : "";
        return `${position}${track.title}${duration}`;
      });

    return {
      status: "matched",
      data: {
        exact,
        title: release.title ?? album.title,
        artist:
          release.artists_sort ||
          release.artists
            ?.map((item) => item.name)
            .filter(Boolean)
            .join(", ") ||
          album.artist,
        year: release.year,
        country: release.country,
        label: release.labels?.[0]?.name,
        catalogNumber:
          release.labels?.[0]?.catno === "none"
            ? undefined
            : release.labels?.[0]?.catno,
        barcode: barcode?.replace(/\s/g, ""),
        genres: release.genres,
        styles: release.styles,
        producers,
        tracklist,
      },
    };
  } catch (error) {
    return {
      status:
        error instanceof Error && error.message === "token unavailable"
          ? "unavailable"
          : "unavailable",
    };
  }
}

async function fetchWikidata(
  album: MetadataRequest,
): Promise<SourceResult<WikidataArtist>> {
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
      search?: Array<{
        id?: string;
        label?: string;
        description?: string;
      }>;
    }>(`https://www.wikidata.org/w/api.php?${searchParams.toString()}`, {
      headers: { "User-Agent": USER_AGENT },
    });
    const candidate =
      search.search?.find(
        (item) =>
          similarity(item.label ?? "", album.artist) >= 0.7 &&
          /歌手|音乐人|音樂人|乐队|樂隊|singer|musician|rapper|band|composer/i.test(
            item.description ?? "",
          ),
      ) ?? search.search?.[0];
    if (!candidate?.id) return { status: "no-match" };

    const entity = await fetchJson<{
      entities?: Record<
        string,
        {
          labels?: Record<string, { value?: string }>;
        }
      >;
    }>(
      `https://www.wikidata.org/w/api.php?${new URLSearchParams({
        action: "wbgetentities",
        ids: candidate.id,
        props: "labels",
        languages: "zh-hans|zh-cn|zh|zh-hant|en",
        format: "json",
        origin: "*",
      }).toString()}`,
      { headers: { "User-Agent": USER_AGENT } },
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

function sourceState(
  source: keyof typeof SOURCE_LABELS,
  result: SourceResult<unknown>,
): MetadataSourceState {
  return {
    source,
    label: SOURCE_LABELS[source],
    status: result.status,
  };
}

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as Partial<MetadataRequest>;
    if (!input.title?.trim() || !input.artist?.trim()) {
      return Response.json(
        { error: "请先填写专辑名和艺人" },
        { status: 400 },
      );
    }

    const album: MetadataRequest = {
      title: input.title.trim(),
      artist: input.artist.trim(),
      format: input.format ?? "unknown",
      ...(input.year ? { year: Number(input.year) } : {}),
      ...(input.releaseDate ? { releaseDate: input.releaseDate } : {}),
      ...(input.discogsId ? { discogsId: Number(input.discogsId) } : {}),
      ...(input.barcode ? { barcode: input.barcode.trim() } : {}),
    };

    const [apple, musicbrainz, discogs, wikidata] = await Promise.all([
      fetchApple(album),
      fetchMusicBrainz(album),
      fetchDiscogs(album),
      fetchWikidata(album),
    ]);

    const proposal: MetadataProposal = {};
    const provenance: Partial<Record<MetadataField, MetadataSource[]>> = {};
    const propose = <K extends MetadataField>(
      field: K,
      value: MetadataProposal[K],
      sources: MetadataSource[],
    ) => {
      if (
        value === undefined ||
        value === "" ||
        (Array.isArray(value) && value.length === 0)
      ) {
        return;
      }
      proposal[field] = value;
      provenance[field] = unique(sources) as MetadataSource[];
    };

    const appleData = apple.data;
    const musicBrainzData = musicbrainz.data;
    const discogsData = discogs.data;
    const exactDiscogsData = discogsData?.exact ? discogsData : undefined;
    const wikidataData = wikidata.data;

    const chineseArtistName =
      (appleData?.artist && hasHan(appleData.artist)
        ? appleData.artist
        : undefined) ||
      (musicBrainzData?.artist && hasHan(musicBrainzData.artist)
        ? musicBrainzData.artist
        : undefined) ||
      (wikidataData?.chineseMusicContext ? wikidataData.label : undefined) ||
      (hasHan(album.artist) ? album.artist : undefined);
    const isChineseArtist = Boolean(chineseArtistName);

    if (chineseArtistName) {
      const simplifiedArtist = toSimplified(chineseArtistName);
      const artistSources: MetadataSource[] = [];
      if (appleData?.artist === chineseArtistName) artistSources.push("apple");
      if (musicBrainzData?.artist === chineseArtistName)
        artistSources.push("musicbrainz");
      if (wikidataData?.label === chineseArtistName)
        artistSources.push("wikidata");
      if (simplifiedArtist !== chineseArtistName) artistSources.push("opencc");
      propose("artist", simplifiedArtist, artistSources);
    } else {
      propose(
        "artist",
        musicBrainzData?.artist || discogsData?.artist || album.artist,
        musicBrainzData?.artist
          ? ["musicbrainz"]
          : discogsData?.artist
            ? ["discogs"]
            : [],
      );
    }

    const appleTitleIsCompatible =
      appleData &&
      similarity(appleData.title, album.title) >= 0.72;
    const rawTitle =
      (appleTitleIsCompatible && isChineseArtist
        ? appleData?.title
        : undefined) ||
      musicBrainzData?.groupTitle ||
      musicBrainzData?.title ||
      exactDiscogsData?.title ||
      album.title;
    const displayTitle = isChineseArtist
      ? cleanChineseDisplayTitle(rawTitle)
      : splitEdition(rawTitle).title;
    const titleSources: MetadataSource[] = [];
    if (rawTitle === appleData?.title) titleSources.push("apple");
    if (
      rawTitle === musicBrainzData?.groupTitle ||
      rawTitle === musicBrainzData?.title
    ) {
      titleSources.push("musicbrainz");
    }
    if (rawTitle === discogsData?.title) titleSources.push("discogs");
    if (displayTitle !== splitEdition(rawTitle).title)
      titleSources.push("opencc");
    propose("title", displayTitle, titleSources);

    const edition =
      splitEdition(album.title).edition ||
      (exactDiscogsData
        ? splitEdition(exactDiscogsData.title).edition
        : undefined) ||
      (appleData ? splitEdition(appleData.title).edition : undefined);
    if (edition) {
      propose("edition", toSimplified(edition), [
        splitEdition(album.title).edition ? "opencc" : "discogs",
      ]);
    }

    const physicalYear = exactDiscogsData?.year;
    const catalogReleaseDate =
      appleData?.releaseDate || musicBrainzData?.releaseDate;
    const catalogReleaseYear = Number(catalogReleaseDate?.slice(0, 4)) || 0;
    const releaseDate =
      physicalYear &&
      catalogReleaseYear &&
      physicalYear !== catalogReleaseYear
        ? undefined
        : catalogReleaseDate;
    propose(
      "year",
      physicalYear ||
        (releaseDate ? Number(releaseDate.slice(0, 4)) : undefined),
      physicalYear
        ? ["discogs"]
        : appleData?.releaseDate
          ? ["apple"]
          : ["musicbrainz"],
    );
    if (releaseDate) {
      propose(
        "releaseDate",
        releaseDate.slice(0, 10),
        appleData?.releaseDate ? ["apple"] : ["musicbrainz"],
      );
    }

    propose(
      "label",
      exactDiscogsData?.label,
      ["discogs"],
    );
    propose(
      "country",
      exactDiscogsData?.country,
      ["discogs"],
    );
    propose(
      "catalogNumber",
      exactDiscogsData?.catalogNumber,
      ["discogs"],
    );
    propose(
      "barcode",
      exactDiscogsData?.barcode,
      ["discogs"],
    );

    const genres = unique([
      appleData?.genre,
      ...(discogsData?.genres ?? []),
    ]);
    if (genres.length) {
      propose("genres", genres, [
        ...(appleData?.genre ? (["apple"] as MetadataSource[]) : []),
        ...(discogsData?.genres?.length
          ? (["discogs"] as MetadataSource[])
          : []),
      ]);
    }
    if (discogsData?.styles?.length) {
      propose("styles", unique(discogsData.styles), ["discogs"]);
    }
    if (exactDiscogsData?.producers?.length) {
      propose("producers", unique(exactDiscogsData.producers), ["discogs"]);
    }
    const rawTracklist =
      discogsData?.tracklist?.length
        ? discogsData.tracklist
        : appleData?.tracks?.length
          ? appleData.tracks
          : undefined;
    if (rawTracklist) {
      const normalizedTracklist = isChineseArtist
        ? rawTracklist.map((track) => toSimplified(track))
        : rawTracklist;
      const trackSources: MetadataSource[] = discogsData?.tracklist?.length
        ? ["discogs"]
        : ["apple"];
      if (
        normalizedTracklist.some(
          (track, index) => track !== rawTracklist[index],
        )
      ) {
        trackSources.push("opencc");
      }
      propose("tracklist", normalizedTracklist, trackSources);
    }

    const matched = [apple, musicbrainz, discogs, wikidata].filter(
      (result) => result.status === "matched",
    ).length;
    const confidence =
      discogsData?.exact && matched >= 2
        ? "high"
        : matched >= 2
          ? "medium"
          : "review";
    const summary =
      confidence === "high"
        ? "实体版本已定位，并完成中文名称交叉核对"
        : confidence === "medium"
          ? "多个来源指向同一张专辑，建议确认版本字段"
          : "只找到一个可靠来源，请逐项确认后采用";

    return Response.json({
      proposal,
      provenance,
      confidence,
      summary,
      sourceStates: [
        sourceState("apple", apple),
        sourceState("musicbrainz", musicbrainz),
        sourceState("discogs", discogs),
        sourceState("wikidata", wikidata),
      ],
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "更新专辑信息时发生错误",
      },
      { status: 500 },
    );
  }
}
