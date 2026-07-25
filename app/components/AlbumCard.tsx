"use client";

import { motion } from "framer-motion";
import type { Album } from "@/app/lib/store";

type AlbumCardProps = {
  album: Album;
  onInspect: (album: Album) => void;
  priority?: boolean;
};

const coverTransition = {
  type: "spring" as const,
  stiffness: 380,
  damping: 34,
  mass: 0.85,
};

export function AlbumCard({
  album,
  onInspect,
  priority = false,
}: AlbumCardProps) {
  return (
    <motion.article
      className="album-card"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
    >
      <motion.button
        type="button"
        onClick={() => onInspect(album)}
        aria-label={`查看 ${album.artist} 的专辑 ${album.title}`}
        whileTap={{ scale: 0.975 }}
        transition={coverTransition}
      >
        <motion.div
          className="album-cover"
          layoutId={`cover-${album.id}`}
          transition={coverTransition}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={album.coverUrl}
            alt={`${album.artist}《${album.title}》封面`}
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            onError={(event) => {
              event.currentTarget.src = "/covers/cover-fallback.svg";
            }}
          />
        </motion.div>
        <span className="album-copy">
          <strong>{album.title}</strong>
          <span>{album.artist}</span>
        </span>
      </motion.button>
    </motion.article>
  );
}
