"use client";

import {
  Component,
  lazy,
  Suspense,
  useState,
  type ReactNode,
} from "react";
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
  const [activeAlbumIdx, setActiveAlbumIdx] = useState(2);

  if (albums.length === 0) {
    return (
      <div className="crate-empty">
        <p>还没有唱片</p>
      </div>
    );
  }

  const safeActiveIndex = Math.min(activeAlbumIdx, albums.length - 1);
  const activeAlbum = albums[safeActiveIndex] ?? albums[0];

  return (
    <div className="crate-fullscreen">
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
              albums={albums}
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
          第 {safeActiveIndex + 1} 张，共 {albums.length} 张
        </p>
      </div>
    </div>
  );
}
