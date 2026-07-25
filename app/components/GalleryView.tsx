"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import type { Album } from "@/app/lib/store";

function proxyArtwork(url: string) {
  if (url.startsWith("/")) return url;
  return `/api/douban?img=${encodeURIComponent(url)}`;
}

type InfoField = "title" | "artist" | "year" | "format" | "versions";

type GalleryViewProps = {
  albums: Album[];
  versionCounts?: Map<string, number>;
  onInspect: (album: Album) => void;
  onAdd: () => void;
  onBrowseAll: () => void;
  favoriteView?: boolean;
};

const INFO_OPTIONS: Array<{ id: InfoField; label: string }> = [
  { id: "title", label: "专辑名" },
  { id: "artist", label: "艺人" },
  { id: "year", label: "年份" },
  { id: "format", label: "介质" },
  { id: "versions", label: "版本数" },
];

const defaultShown = new Set<InfoField>(["title", "artist"]);

export function GalleryView({
  albums,
  versionCounts,
  onInspect,
  onAdd,
  onBrowseAll,
  favoriteView = false,
}: GalleryViewProps) {
  const [coverSize, setCoverSize] = useState(180);
  const [gap, setGap] = useState(20);
  const [shownInfo, setShownInfo] = useState<Set<InfoField>>(defaultShown);
  const [controlsOpen, setControlsOpen] = useState(false);

  function toggleInfo(field: InfoField) {
    setShownInfo((prev) => {
      const next = new Set(prev);
      if (next.has(field)) {
        next.delete(field);
      } else {
        next.add(field);
      }
      return next;
    });
  }

  if (albums.length === 0) {
    return (
      <div className="empty-library">
        <span className="empty-library-icon" aria-hidden="true">♫</span>
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
    <div className="gallery-view">
      <div className="gallery-controls-bar">
        <button
          type="button"
          className="gallery-toggle-btn"
          onClick={() => setControlsOpen(!controlsOpen)}
          aria-label={controlsOpen ? "收起画廊设置" : "显示画廊设置"}
          aria-expanded={controlsOpen}
        >
          <span aria-hidden="true">⚙</span>
        </button>

        {controlsOpen && (
          <motion.div
            className="gallery-controls"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
          >
            <label className="gallery-slider">
              <span>封面大小</span>
              <input
                type="range"
                min={100}
                max={360}
                step={10}
                value={coverSize}
                onChange={(e) => setCoverSize(Number(e.target.value))}
              />
              <small>{coverSize}px</small>
            </label>

            <label className="gallery-slider">
              <span>间距</span>
              <input
                type="range"
                min={4}
                max={48}
                step={2}
                value={gap}
                onChange={(e) => setGap(Number(e.target.value))}
              />
              <small>{gap}px</small>
            </label>

            <div className="gallery-info-toggles">
              <span>显示信息</span>
              <div>
                {INFO_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={shownInfo.has(opt.id) ? "is-active" : ""}
                    onClick={() => toggleInfo(opt.id)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </div>

      <div
        className="gallery-grid"
        style={{
          gridTemplateColumns: `repeat(auto-fill, minmax(min(${coverSize}px, calc(50% - ${gap / 2}px)), 1fr))`,
          gap: `${gap}px`,
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

            {shownInfo.size > 0 && (
              <div className="gallery-meta">
                {shownInfo.has("title") && (
                  <strong>{album.title}</strong>
                )}
                {shownInfo.has("artist") && (
                  <span className="gallery-artist">{album.artist}</span>
                )}
                <div className="gallery-meta-row">
                  {shownInfo.has("year") && album.year && (
                    <small>{album.year}</small>
                  )}
                  {shownInfo.has("format") && album.format !== "unknown" && (
                    <small className="gallery-format">
                      {formatLabel(album.format)}
                    </small>
                  )}
                  {shownInfo.has("versions") && (versionCounts?.get(album.id) ?? 1) > 1 && (
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
