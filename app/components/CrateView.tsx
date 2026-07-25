"use client";

import {
  useCallback,
  useMemo,
  useState,
} from "react";
import OptionWheel from "./OptionWheel/OptionWheel";
import { CrateCylinder } from "./CrateCylinder";
import type { Album } from "@/app/lib/store";

type CrateViewProps = {
  albums: Album[];
  onInspect: (album: Album) => void;
};

export function CrateView({ albums, onInspect }: CrateViewProps) {
  const artistGroups = useMemo(() => {
    const groups = new Map<string, Album[]>();
    for (const album of albums) {
      const artist = album.artist.replace(/\s*\(\d+\)$/, "").trim();
      if (!groups.has(artist)) groups.set(artist, []);
      groups.get(artist)!.push(album);
    }
    return Array.from(groups.entries())
      .sort(([left], [right]) => left.localeCompare(right, "zh-CN"))
      .map(([artist, list]) => ({ artist, albums: list }));
  }, [albums]);

  const artistNames = useMemo(
    () => artistGroups.map((group) => group.artist),
    [artistGroups],
  );

  const flatAlbums = useMemo(
    () =>
      artistGroups.flatMap((group, groupIdx) =>
        group.albums.map((album) => ({ album, groupIdx })),
      ),
    [artistGroups],
  );

  const groupStarts = useMemo(() => {
    const starts: number[] = [];
    let nextIndex = 0;
    for (const group of artistGroups) {
      starts.push(nextIndex);
      nextIndex += group.albums.length;
    }
    return starts;
  }, [artistGroups]);

  const [activeAlbumIdx, setActiveAlbumIdx] = useState(4);
  const [rackJump, setRackJump] = useState<{
    index: number;
    token: number;
  } | null>(null);
  const handleArtistChange = useCallback(
    (index: number) => {
      const albumIndex = groupStarts[index] ?? 0;
      setActiveAlbumIdx(albumIndex);
      setRackJump((previous) => ({
        index: albumIndex,
        token: (previous?.token ?? 0) + 1,
      }));
    },
    [groupStarts],
  );

  if (albums.length === 0) {
    return (
      <div className="crate-empty">
        <p>还没有唱片</p>
      </div>
    );
  }

  const safeActiveIndex = Math.min(activeAlbumIdx, flatAlbums.length - 1);
  const activeAlbum = flatAlbums[safeActiveIndex]?.album ?? albums[0];
  const activeArtistIdx = flatAlbums[safeActiveIndex]?.groupIdx ?? 0;

  return (
    <div className="crate-fullscreen">
      <aside className="crate-wheel-side" aria-label="歌手索引">
        <OptionWheel
          items={artistNames}
          selected={activeArtistIdx}
          defaultSelected={activeArtistIdx}
          textColor="rgba(255, 255, 255, 0.58)"
          activeColor="#ffffff"
          side="left"
          fontSize={0.875}
          spacing={3.05}
          curve={1}
          tilt={6}
          blur={0.55}
          fade={0.14}
          minOpacity={0.08}
          smoothing={200}
          inset={8}
          loop={false}
          draggable
          soundUrl="/assets/sounds/click-soft.mp3"
          soundVolume={0.26}
          haptics
          onChange={handleArtistChange}
        />
      </aside>

      <div className="crate-scene-side">
        <CrateCylinder
          albums={flatAlbums.map((item) => item.album)}
          onInspect={onInspect}
          activeIndex={safeActiveIndex}
          onActiveIndexChange={setActiveAlbumIdx}
          jumpRequest={rackJump}
        />
        <div className="crate-depth-blur crate-depth-blur--top" aria-hidden="true" />
        <div className="crate-depth-blur crate-depth-blur--bottom" aria-hidden="true" />
        <div className="crate-position-dots" aria-hidden="true">
          <span />
          <span className="is-current" />
          <span />
        </div>
        <p className="visually-hidden" aria-live="polite">
          {activeAlbum.title}，{activeAlbum.artist.replace(/\s*\(\d+\)$/, "")}，
          第 {safeActiveIndex + 1} 张，共 {flatAlbums.length} 张
        </p>
      </div>
    </div>
  );
}
