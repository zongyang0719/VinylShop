"use client";

import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { AddModal } from "./components/AddModal";
import { CollectionGrid } from "./components/Crate";
import { InspectModal } from "./components/InspectModal";
import {
  getAlbums,
  upsertAlbum,
  upsertAlbums,
  type Album,
  type Zone,
} from "./lib/store";

type ActiveZone = "recent" | "favorite" | "all";

const tabs: Array<{ id: ActiveZone; label: string }> = [
  { id: "recent", label: "最近" },
  { id: "favorite", label: "喜欢" },
  { id: "all", label: "全部" },
];

const spring = {
  type: "spring" as const,
  stiffness: 420,
  damping: 38,
  mass: 0.8,
};

function sortByAdded(albums: Album[]) {
  return [...albums].sort(
    (a, b) =>
      new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime(),
  );
}

export default function Home() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [activeZone, setActiveZone] = useState<ActiveZone>("recent");
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [favoriteNotice, setFavoriteNotice] = useState("");

  async function loadLibrary() {
    setLoading(true);
    setLoadError("");
    try {
      setAlbums(await getAlbums());
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "唱片库暂时无法打开",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    getAlbums()
      .then((library) => {
        if (active) {
          setAlbums(library);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(
            error instanceof Error ? error.message : "唱片库暂时无法打开",
          );
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!favoriteNotice) {
      return;
    }
    const timer = window.setTimeout(() => setFavoriteNotice(""), 2400);
    return () => window.clearTimeout(timer);
  }, [favoriteNotice]);

  const sortedAlbums = useMemo(() => sortByAdded(albums), [albums]);
  const visibleAlbums = useMemo(() => {
    if (activeZone === "recent") {
      return sortedAlbums.slice(0, 24);
    }
    if (activeZone === "favorite") {
      return sortedAlbums.filter((album) => album.favorite);
    }
    return sortedAlbums;
  }, [activeZone, sortedAlbums]);

  const destinationZone: Zone =
    activeZone === "recent" ? "recent" : "unsorted";
  const favoriteCount = albums.filter((album) => album.favorite).length;

  async function handleAdd(album: Album) {
    const saved = await upsertAlbum(album);
    setAlbums((current) => sortByAdded([saved, ...current]));
    setAddOpen(false);
  }

  async function handleImport(imported: Album[]) {
    const result = await upsertAlbums(imported);
    await loadLibrary();
    setActiveZone("all");
    return {
      added: result.added ?? 0,
      updated: result.updated ?? 0,
    };
  }

  async function handleSave(album: Album) {
    const saved = await upsertAlbum(album);
    setAlbums((current) =>
      current.map((item) => (item.id === saved.id ? saved : item)),
    );
    setSelectedAlbum(saved);
  }

  async function handleToggleFavorite(album: Album) {
    if (!album.favorite && favoriteCount >= 10) {
      const message = "喜欢已经满 10 张，请先移除一张";
      setFavoriteNotice(message);
      return message;
    }

    try {
      const saved = await upsertAlbum({
        ...album,
        favorite: !album.favorite,
      });
      setAlbums((current) =>
        current.map((item) => (item.id === saved.id ? saved : item)),
      );
      setSelectedAlbum((current) =>
        current?.id === saved.id ? saved : current,
      );
      setFavoriteNotice(
        saved.favorite
          ? `已加入喜欢 · ${favoriteCount + 1}/10`
          : "已从喜欢中移除",
      );
      return null;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "暂时无法更新喜欢";
      setFavoriteNotice(message);
      return message;
    }
  }

  function countFor(tab: ActiveZone) {
    if (tab === "recent") {
      return Math.min(24, albums.length);
    }
    if (tab === "favorite") {
      return `${favoriteCount}/10`;
    }
    return albums.length;
  }

  return (
    <LayoutGroup>
      <main className="library-shell">
        <header className="library-header">
          <div>
            <p className="library-overline">My Music Library</p>
            <h1>唱片库</h1>
            <p className="library-summary">
              {loading ? "正在同步…" : `${albums.length} 张专辑`}
              {!loading && !loadError && (
                <span className="sync-state">
                  <i aria-hidden="true" />
                  已同步
                </span>
              )}
            </p>
          </div>

          <button
            type="button"
            className="primary-action desktop-add"
            onClick={() => setAddOpen(true)}
          >
            <span aria-hidden="true">＋</span>
            添加唱片
          </button>
        </header>

        <div className="library-toolbar">
          <nav className="segmented-control" aria-label="唱片分区">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={activeZone === tab.id ? "is-active" : ""}
                onClick={() => {
                  setSelectedAlbum(null);
                  setActiveZone(tab.id);
                }}
                aria-current={activeZone === tab.id ? "page" : undefined}
              >
                {activeZone === tab.id && (
                  <motion.span
                    className="segment-highlight"
                    layoutId="active-zone"
                    transition={spring}
                  />
                )}
                <span>{tab.label}</span>
                <small>{countFor(tab.id)}</small>
              </button>
            ))}
          </nav>
        </div>

        <section className="library-content" aria-live="polite">
          {loadError ? (
            <div className="status-card">
              <span className="status-symbol" aria-hidden="true">
                !
              </span>
              <h2>暂时无法打开唱片库</h2>
              <p>{loadError}</p>
              <button type="button" onClick={() => void loadLibrary()}>
                重新加载
              </button>
            </div>
          ) : loading ? (
            <div className="cover-skeletons" aria-label="正在加载唱片">
              {Array.from({ length: 10 }).map((_, index) => (
                <span key={index} />
              ))}
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={activeZone}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
              >
                {activeZone === "favorite" && (
                  <div className="favorites-heading">
                    <div>
                      <h2>最喜欢的唱片</h2>
                      <p>由你亲自选择，最多保留 10 张。</p>
                    </div>
                    <span>{favoriteCount}/10</span>
                  </div>
                )}
                <CollectionGrid
                  albums={visibleAlbums}
                  onInspect={setSelectedAlbum}
                  onToggleFavorite={handleToggleFavorite}
                  onAdd={() => setAddOpen(true)}
                  onBrowseAll={() => setActiveZone("all")}
                  favoriteView={activeZone === "favorite"}
                />
              </motion.div>
            </AnimatePresence>
          )}
        </section>

        <footer className="library-footer">
          <p>你的收藏，只对你可见。</p>
          <span>VinylShop · 2026</span>
        </footer>

        <button
          type="button"
          className="mobile-add"
          onClick={() => setAddOpen(true)}
          aria-label="添加唱片"
        >
          <span aria-hidden="true">＋</span>
        </button>
      </main>

      <AnimatePresence>
        {selectedAlbum && (
          <InspectModal
            key={selectedAlbum.id}
            album={selectedAlbum}
            onSave={handleSave}
            onToggleFavorite={handleToggleFavorite}
            onClose={() => setSelectedAlbum(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {favoriteNotice && (
          <motion.div
            className="favorite-toast"
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={spring}
            role="status"
          >
            {favoriteNotice}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {addOpen && (
          <AddModal
            key="add-modal"
            zone={destinationZone}
            onAdd={handleAdd}
            onImport={handleImport}
            onClose={() => setAddOpen(false)}
          />
        )}
      </AnimatePresence>
    </LayoutGroup>
  );
}
