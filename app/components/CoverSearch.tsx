"use client";

import { useState } from "react";
import {
  getDiscogsRelease,
  searchDiscogs,
  type DiscogsSearchResult,
} from "@/app/lib/discogs";
import {
  getMusicDetail,
  proxyCoverUrl,
  searchMusic,
  type MusicSearchResult,
} from "@/app/lib/douban";
import {
  getItunesAlbum,
  searchItunes,
  type iTunesResult,
} from "@/app/lib/itunes";

type Source = "musicbrainz" | "discogs" | "itunes";

export type CoverSelection = {
  url: string;
  title: string;
  artist: string;
  year: string;
  releaseDate?: string;
  tracks?: string[];
  source: Source;
};

type CoverSearchProps = {
  query: string;
  title?: string;
  artist?: string;
  onSelect: (selection: CoverSelection) => void;
  defaultExpanded?: boolean;
};

type UnifiedResult = {
  key: string;
  image: string;
  title: string;
  artist: string;
  year: string;
  source: Source;
  raw: DiscogsSearchResult | MusicSearchResult | iTunesResult;
};

function normalize(value: string) {
  return value
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function relevance(
  resultTitle: string,
  resultArtist: string,
  preferredTitle?: string,
  preferredArtist?: string,
) {
  const candidateTitle = normalize(resultTitle);
  const candidateArtist = normalize(resultArtist);
  const targetTitle = normalize(preferredTitle ?? "");
  const targetArtist = normalize(preferredArtist ?? "");
  let score = 0;

  if (targetTitle) {
    if (candidateTitle === targetTitle) score += 80;
    else if (
      candidateTitle.includes(targetTitle) ||
      targetTitle.includes(candidateTitle)
    ) {
      score += 40;
    }
  }
  if (targetArtist) {
    if (candidateArtist === targetArtist) score += 50;
    else if (
      candidateArtist.includes(targetArtist) ||
      targetArtist.includes(candidateArtist)
    ) {
      score += 25;
    }
  }
  return score;
}

export function CoverSearch({
  query,
  title,
  artist,
  onSelect,
  defaultExpanded = false,
}: CoverSearchProps) {
  const [results, setResults] = useState<UnifiedResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [expanded, setExpanded] = useState(defaultExpanded);

  async function handleSearch() {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    setResults([]);

    const searchQuery = query.trim();
    const [appleResults, musicBrainzResults, discogsResults] =
      await Promise.all([
        searchItunes(searchQuery).catch(() => [] as iTunesResult[]),
        searchMusic(searchQuery, { title, artist }).catch(
          () => [] as MusicSearchResult[],
        ),
        searchDiscogs(searchQuery).catch(() => [] as DiscogsSearchResult[]),
      ]);

    const unified: UnifiedResult[] = [];

    const rankedApple = [...appleResults]
      .sort(
        (left, right) =>
          relevance(right.title, right.artist, title, artist) -
          relevance(left.title, left.artist, title, artist),
      )
      .filter(
        (result, index) =>
          relevance(result.title, result.artist, title, artist) >= 80 ||
          ((!title || !artist) && index < 6),
      )
      .slice(0, 6);
    const rankedMusicBrainz = [...musicBrainzResults]
      .sort(
        (left, right) =>
          relevance(right.title, right.artist, title, artist) +
          right.score / 10 -
          (relevance(left.title, left.artist, title, artist) +
            left.score / 10),
      )
      .slice(0, 8);
    const rankedDiscogs = [...discogsResults]
      .sort((left, right) => {
        const [leftArtist, ...leftTitle] = left.title.split(" - ");
        const [rightArtist, ...rightTitle] = right.title.split(" - ");
        return (
          relevance(
            rightTitle.join(" - ") || right.title,
            rightArtist,
            title,
            artist,
          ) -
          relevance(
            leftTitle.join(" - ") || left.title,
            leftArtist,
            title,
            artist,
          )
        );
      })
      .slice(0, 6);

    for (const result of rankedApple) {
      if (!result.coverUrl) continue;
      unified.push({
        key: `apple-${result.id}`,
        image: proxyCoverUrl(result.coverUrl),
        title: result.title,
        artist: result.artist,
        year: result.year,
        source: "itunes",
        raw: result,
      });
    }

    for (const result of rankedMusicBrainz) {
      unified.push({
        key: `mb-${result.id}`,
        image: proxyCoverUrl(result.coverUrl),
        title: result.title,
        artist: result.artist,
        year: result.year,
        source: "musicbrainz",
        raw: result,
      });
    }

    for (const result of rankedDiscogs) {
      const image = result.cover_image || result.thumb || "";
      if (!image || image.includes("spacer.gif")) continue;
      const [resultArtist, ...rest] = result.title.split(" - ");
      unified.push({
        key: `discogs-${result.id}`,
        image: proxyCoverUrl(image),
        title: rest.join(" - ") || result.title,
        artist: resultArtist,
        year: result.year || "",
        source: "discogs",
        raw: result,
      });
    }

    setResults(unified);
    setLoading(false);
  }

  async function handlePick(result: UnifiedResult) {
    if (result.source === "itunes") {
      const item = result.raw as iTunesResult;
      try {
        const detail = await getItunesAlbum(item.id);
        onSelect({
          url: detail.coverUrl || item.coverUrl,
          title: detail.title || item.title,
          artist: detail.artist || item.artist,
          year: detail.year || item.year,
          releaseDate: detail.releaseDate,
          tracks: detail.tracks,
          source: "itunes",
        });
      } catch {
        onSelect({
          url: item.coverUrl,
          title: item.title,
          artist: item.artist,
          year: item.year,
          releaseDate: item.releaseDate,
          source: "itunes",
        });
      }
      setExpanded(false);
      return;
    }

    if (result.source === "musicbrainz") {
      const item = result.raw as MusicSearchResult;
      try {
        const detail = await getMusicDetail(item.id);
        onSelect({
          url: detail.coverUrl,
          title: detail.title || item.title,
          artist: detail.artist || item.artist,
          year: detail.date.slice(0, 4) || item.year,
          releaseDate: detail.date,
          tracks: detail.tracks,
          source: "musicbrainz",
        });
      } catch {
        onSelect({
          url: item.coverUrl,
          title: item.title,
          artist: item.artist,
          year: item.year,
          source: "musicbrainz",
        });
      }
      setExpanded(false);
      return;
    }

    const item = result.raw as DiscogsSearchResult;
    try {
      const release = await getDiscogsRelease(item.id);
      const url =
        release.images?.[0]?.uri || item.cover_image || item.thumb || "";
      if (url) {
        onSelect({
          url,
          title: release.title || result.title,
          artist:
            release.artists_sort ||
            release.artists?.map((entry) => entry.name).join(", ") ||
            result.artist,
          year: String(release.year || result.year || ""),
          tracks: release.tracklist
            ?.filter((track) => track.type_ !== "heading")
            .map((track) =>
              track.position
                ? `${track.position}. ${track.title}`
                : track.title,
            ),
          source: "discogs",
        });
      }
    } catch {
      const url = item.cover_image || item.thumb;
      if (url) {
        onSelect({
          url,
          title: result.title,
          artist: result.artist,
          year: result.year,
          source: "discogs",
        });
      }
    }
    setExpanded(false);
  }

  const sourceBadge: Record<Source, string> = {
    itunes: "Apple",
    musicbrainz: "MB",
    discogs: "Discogs",
  };
  const googleImagesUrl = `https://www.google.com/search?${new URLSearchParams({
    tbm: "isch",
    q: `${query.trim()} album cover`,
  })}`;

  return (
    <div className="cover-search">
      <button
        type="button"
        className="cover-search-trigger"
        onClick={() => {
          setExpanded(!expanded);
          if (!expanded && !searched) void handleSearch();
        }}
        aria-expanded={expanded}
      >
        <span aria-hidden="true">⌕</span>
        <span>搜索封面与专辑信息</span>
      </button>

      {expanded && (
        <div className="cover-search-panel">
          {loading ? (
            <p className="cover-search-status">
              正在搜索 Apple、MusicBrainz 和 Discogs…
            </p>
          ) : results.length > 0 ? (
            <div className="cover-search-grid">
              {results.map((result) => (
                <button
                  key={result.key}
                  type="button"
                  className="cover-grid-item"
                  onClick={() => void handlePick(result)}
                  title={`${result.title} - ${result.artist} (${result.year}) [${sourceBadge[result.source]}]`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={result.image}
                    alt={`${result.title} 封面`}
                    onError={(event) => {
                      event.currentTarget.src = "/covers/cover-fallback.svg";
                    }}
                  />
                  <span className="cover-source-badge">
                    {sourceBadge[result.source]}
                  </span>
                </button>
              ))}
            </div>
          ) : searched ? (
            <p className="cover-search-status">没有找到结果</p>
          ) : null}

          <div className="cover-search-actions">
            <button
              type="button"
              className="cover-search-retry"
              onClick={() => void handleSearch()}
              disabled={loading}
            >
              {loading ? "搜索中…" : "重新搜索"}
            </button>
            <a
              className="cover-search-google"
              href={googleImagesUrl}
              target="_blank"
              rel="noreferrer"
            >
              Google 图片
              <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
