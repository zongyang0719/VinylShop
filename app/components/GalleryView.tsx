"use client";

import { motion } from "framer-motion";
import type { Album } from "@/app/lib/store";
import type { GalleryDisplayMode } from "../lib/library-preferences";
import { AppIcon } from "./AppIcon";

function proxyArtwork(url: string) {
  if (url.startsWith("/")) return url;
  return `/api/douban?img=${encodeURIComponent(url)}`;
}

type GalleryViewProps = {
  albums: Album[];
  versionCounts?: Map<string, number>;
  onInspect: (album: Album) => void;
  onAdd: () => void;
  onBrowseAll: () => void;
  favoriteView?: boolean;
  displayMode: GalleryDisplayMode;
};

export function GalleryView({
  albums,
  versionCounts,
  onInspect,
  onAdd,
  onBrowseAll,
  favoriteView = false,
  displayMode,
}: GalleryViewProps) {
  if (albums.length === 0) {
    return (
      <div className="empty-library">
        <span className="empty-library-icon" aria-hidden="true">
          <AppIcon name={favoriteView ? "favorite" : "add"} size={26} />
        </span>
        <h2>{favoriteView ? "选出你最喜欢的唱片" : "这里还没有唱片"}</h2>
        <p>
          {favoriteView
            ? "浏览全部唱片，点击封面右上角的心形加入这里。"
            : "添加一张唱片，开始整理你的收藏。"}
        </p>
        <button type="button" onClick={favoriteView ? onBrowseAll : onAdd}>
          {favoriteView ? "浏览全部唱片" : "添加唱片"}
        </button>
      </div>
    );
  }

  const formatLabel = (f: string) =>
    f === "vinyl" ? "黑胶" : f === "cd" ? "CD" : "";

  return (
    <div className={`gallery-view gallery-view--${displayMode}`}>
      <div
        className="gallery-grid"
        style={{
          gridTemplateColumns:
            displayMode === "covers"
              ? "repeat(auto-fill, minmax(min(116px, calc(33.333% - 8px)), 1fr))"
              : "repeat(auto-fill, minmax(min(180px, calc(50% - 8px)), 1fr))",
          gap: displayMode === "covers" ? "14px 10px" : "24px 16px",
        }}
      >
        {albums.map((album, index) => (
          <motion.article
            key={album.id}
            className="gallery-item"
            initial={{ opacity: 0, y: 18, scale: 0.985 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, amount: 0.12 }}
            transition={{
              type: "spring",
              stiffness: 210,
              damping: 26,
              mass: 0.8,
              delay: Math.min(index, 8) * 0.025,
            }}
          >
            <button
              type="button"
              className="gallery-cover-btn"
              onClick={() => onInspect(album)}
              aria-label={`查看 ${album.artist} 的专辑 ${album.title}`}
            >
              <div className="gallery-cover" style={{ aspectRatio: "1" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={proxyArtwork(album.coverUrl)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  onError={(e) => {
                    e.currentTarget.src = "/covers/cover-fallback.svg";
                  }}
                />
              </div>
            </button>

            {displayMode === "standard" && (
              <div className="gallery-meta">
                <strong>{album.title}</strong>
                <span className="gallery-artist">{album.artist}</span>
                <div className="gallery-meta-row">
                  {album.year && <small>{album.year}</small>}
                  {album.format !== "unknown" && (
                    <small className="gallery-format">
                      {formatLabel(album.format)}
                    </small>
                  )}
                  {(versionCounts?.get(album.id) ?? 1) > 1 && (
                    <small className="gallery-versions">
                      {versionCounts!.get(album.id)} 个版本
                    </small>
                  )}
                </div>
              </div>
            )}
          </motion.article>
        ))}
      </div>
    </div>
  );
}
