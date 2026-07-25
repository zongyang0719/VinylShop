"use client";

import type { Album } from "@/app/lib/store";
import { AlbumCard } from "./AlbumCard";

type CollectionGridProps = {
  albums: Album[];
  onInspect: (album: Album) => void;
  onAdd: () => void;
};

export function CollectionGrid({
  albums,
  onInspect,
  onAdd,
}: CollectionGridProps) {
  if (albums.length === 0) {
    return (
      <div className="empty-library">
        <span className="empty-library-icon" aria-hidden="true">
          ♫
        </span>
        <h2>这里还没有唱片</h2>
        <p>添加一张，或把喜欢的专辑设为常听。</p>
        <button type="button" onClick={onAdd}>
          添加唱片
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
          priority={index < 6}
        />
      ))}
    </div>
  );
}
