"use client";

import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Album } from "@/app/lib/store";
import { AppIcon } from "./AppIcon";

function proxyArtwork(url: string) {
  if (url.startsWith("/")) return url;
  return `/api/douban?img=${encodeURIComponent(url)}`;
}

type LibrarySearchProps = {
  albums: Album[];
  onInspect: (album: Album) => void;
  onClose: () => void;
};

const spring = {
  type: "spring" as const,
  stiffness: 380,
  damping: 36,
  mass: 0.85,
};

export function LibrarySearch({
  albums,
  onInspect,
  onClose,
}: LibrarySearchProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("zh-CN");
    if (!normalized) return [];
    return albums.filter((album) =>
      `${album.title} ${album.artist} ${album.year ?? ""}`
        .toLocaleLowerCase("zh-CN")
        .includes(normalized),
    );
  }, [albums, query]);

  return (
    <motion.div
      className="library-search-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="library-search-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
    >
      <motion.section
        className="library-search-panel"
        initial={{ y: 32, opacity: 0.8 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 20, opacity: 0 }}
        transition={spring}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <header>
          <h2 id="library-search-title">搜索唱片库</h2>
          <button type="button" onClick={onClose} aria-label="关闭搜索">
            完成
          </button>
        </header>

        <label className="library-search-field">
          <AppIcon name="search" size={19} />
          <span className="visually-hidden">搜索专辑、艺人或年份</span>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="专辑、艺人或年份"
            autoComplete="off"
            enterKeyHint="search"
          />
        </label>

        <div className="library-search-results" aria-live="polite">
          {!query.trim() ? (
            <p>输入专辑名、艺人或年份</p>
          ) : results.length === 0 ? (
            <p>没有找到匹配的唱片</p>
          ) : (
            results.map((album) => (
              <button
                key={album.id}
                type="button"
                onClick={() => onInspect(album)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={proxyArtwork(album.coverUrl)}
                  alt=""
                  onError={(event) => {
                    event.currentTarget.src = "/covers/cover-fallback.svg";
                  }}
                />
                <span>
                  <strong>{album.title}</strong>
                  <small>{album.artist}</small>
                </span>
              </button>
            ))
          )}
        </div>
      </motion.section>
    </motion.div>
  );
}
