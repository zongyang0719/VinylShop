"use client";

import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import OptionWheel from "./OptionWheel/OptionWheel";
import type { Album } from "@/app/lib/store";

const CrateScene = lazy(() =>
  import("./CrateScene").then((m) => ({ default: m.CrateScene })),
);

class SceneErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

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
  const handleArtistChange = useCallback(
    (index: number) => {
      setActiveAlbumIdx(groupStarts[index] ?? 0);
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
        <p className="crate-wheel-label">
          <span>艺人</span>
          <small>{artistNames.length}</small>
        </p>
        <OptionWheel
          items={artistNames}
          selected={activeArtistIdx}
          onChange={handleArtistChange}
        />
      </aside>

      <div className="crate-scene-side">
        <SceneErrorBoundary
          fallback={
            <div className="crate-loading">
              <span>3D 场景加载失败，请刷新重试</span>
            </div>
          }
        >
          <Suspense
            fallback={
              <div className="crate-loading">
                <span>加载 3D 场景…</span>
              </div>
            }
          >
            <CrateScene
              albums={flatAlbums.map((item) => item.album)}
              onInspect={onInspect}
              activeIndex={safeActiveIndex}
              onActiveIndexChange={setActiveAlbumIdx}
            />
          </Suspense>
        </SceneErrorBoundary>
        <div className="crate-depth-blur crate-depth-blur--top" aria-hidden="true" />
        <div className="crate-depth-blur crate-depth-blur--bottom" aria-hidden="true" />
        <div
          className="crate-position-dots"
          data-at-start={safeActiveIndex === 0 || undefined}
          data-at-end={safeActiveIndex === albums.length - 1 || undefined}
          aria-hidden="true"
        >
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
