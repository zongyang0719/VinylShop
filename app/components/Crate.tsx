"use client";

import type { Album } from "@/app/lib/store";
import { AlbumCard } from "./AlbumCard";

type CollectionGridProps = {
  albums: Album[];
  onInspect: (album: Album) => void;
  onToggleFavorite: (album: Album) => Promise<string | null>;
  onAdd: () => void;
  onBrowseAll: () => void;
  favoriteView?: boolean;
};

export function CollectionGrid({
  albums,
  onInspect,
  onToggleFavorite,
  onAdd,
  onBrowseAll,
  favoriteView = false,
}: CollectionGridProps) {
  if (albums.length === 0) {
    return (
      <div className="empty-library">
        <span className="empty-library-icon" aria-hidden="true">
          ♫
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

  return (
    <div className="album-grid">
      {albums.map((album, index) => (
        <AlbumCard
          key={album.id}
          album={album}
          onInspect={onInspect}
          onToggleFavorite={onToggleFavorite}
          priority={index < 6}
        />
      ))}
    </div>
  );
}
