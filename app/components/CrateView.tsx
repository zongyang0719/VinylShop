"use client";

import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useMemo,
  useRef,
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
      .sort(([a], [b]) => a.localeCompare(b, "zh-CN"))
      .map(([artist, list]) => ({ artist, albums: list }));
  }, [albums]);

  const artistNames = useMemo(
    () => artistGroups.map((g) => g.artist),
    [artistGroups],
  );

  const flatAlbums = useMemo(() => {
    const flat: Array<{ album: Album; groupIdx: number }> = [];
    artistGroups.forEach((group, gi) => {
      group.albums.forEach((album) => {
        flat.push({ album, groupIdx: gi });
      });
    });
    return flat;
  }, [artistGroups]);

  const groupStarts = useMemo(() => {
    const starts: number[] = [];
    let idx = 0;
    for (const group of artistGroups) {
      starts.push(idx);
      idx += group.albums.length;
    }
    return starts;
  }, [artistGroups]);

  const [activeArtistIdx, setActiveArtistIdx] = useState(0);
  const [activeAlbumIdx, setActiveAlbumIdx] = useState(0);
  const wheelSyncRef = useRef(false);

  const handleWheelChange = useCallback((idx: number) => {
    wheelSyncRef.current = true;
    setActiveArtistIdx(idx);
    setActiveAlbumIdx(groupStarts[idx] ?? 0);
    requestAnimationFrame(() => {
      wheelSyncRef.current = false;
    });
  }, [groupStarts]);

  const handleSceneActiveChange = useCallback((idx: number) => {
      if (wheelSyncRef.current) return;
      setActiveArtistIdx(idx);
  }, []);

  const handleSceneAlbumChange = useCallback((idx: number) => {
    setActiveAlbumIdx(idx);
  }, []);

  if (albums.length === 0) {
    return (
      <div className="crate-empty">
        <p>还没有唱片</p>
      </div>
    );
  }

  const activeAlbum = flatAlbums[activeAlbumIdx]?.album ?? albums[0];

  return (
    <div className="crate-fullscreen">
      <div className="crate-wheel-side">
        <p className="crate-wheel-label">按艺人浏览</p>
        <OptionWheel
          items={artistNames}
          selected={activeArtistIdx}
          onChange={handleWheelChange}
        />
      </div>

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
              flatAlbums={flatAlbums}
              onInspect={onInspect}
              activeArtistIdx={activeArtistIdx}
              onActiveChange={handleSceneActiveChange}
              onAlbumChange={handleSceneAlbumChange}
              groupStarts={groupStarts}
            />
          </Suspense>
        </SceneErrorBoundary>
        <div className="crate-now-playing" aria-live="polite">
          <strong>{activeAlbum.title}</strong>
          <span>{activeAlbum.artist.replace(/\s*\(\d+\)$/, "")}</span>
        </div>
        <p className="crate-gesture-hint">滚动或拖动唱片</p>
      </div>
    </div>
  );
}
