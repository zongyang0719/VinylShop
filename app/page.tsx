"use client";

import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import GlassSurface from "@/components/GlassSurface";
import { AddModal } from "./components/AddModal";
import { CrateView } from "./components/CrateView";
import { GalleryView } from "./components/GalleryView";
import { InspectModal } from "./components/InspectModal";
import { ViewSwitcher } from "./components/ViewSwitcher";
import {
  getAlbums,
  upsertAlbum,
  upsertAlbums,
  type Album,
  type ViewMode,
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

/** 生成分组 key：同一专辑不同版本合并 */
function groupKey(a: Album): string {
  return `${a.artist.trim().toLowerCase()}|||${a.title.trim().toLowerCase()}`;
}

/** 去重：同一 groupKey 只保留第一条 */
function dedup(albums: Album[]): Album[] {
  const seen = new Set<string>();
  return albums.filter((a) => {
    const k = groupKey(a);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export default function Home() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [activeZone, setActiveZone] = useState<ActiveZone>("recent");
  const [viewMode, setViewMode] = useState<ViewMode>("gallery");
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

  /* ── 集中管理 body 滚动锁定 ── */
  useEffect(() => {
    if (selectedAlbum || addOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [selectedAlbum, addOpen]);

  useEffect(() => {
    if (!favoriteNotice) {
      return;
    }
    const timer = window.setTimeout(() => setFavoriteNotice(""), 2400);
    return () => window.clearTimeout(timer);
  }, [favoriteNotice]);

  const sortedAlbums = useMemo(() => sortByAdded(albums), [albums]);

  /** 全库分组 Map：key → Album[] */
  const albumGroups = useMemo(() => {
    const map = new Map<string, Album[]>();
    for (const a of sortedAlbums) {
      const k = groupKey(a);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(a);
    }
    return map;
  }, [sortedAlbums]);

  /** 获取某张专辑的所有版本 */
  const getVersions = useCallback(
    (album: Album): Album[] => albumGroups.get(groupKey(album)) ?? [album],
    [albumGroups],
  );

  /** 每张专辑的版本数 Map（id → count） */
  const versionCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const group of albumGroups.values()) {
      for (const a of group) map.set(a.id, group.length);
    }
    return map;
  }, [albumGroups]);

  const visibleAlbums = useMemo(() => {
    if (activeZone === "recent") {
      return dedup(sortedAlbums).slice(0, 24);
    }
    if (activeZone === "favorite") {
      return dedup(sortedAlbums.filter((album) => album.favorite));
    }
    return dedup(sortedAlbums);
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

  const closeInspect = useCallback(() => setSelectedAlbum(null), []);
  const closeAdd = useCallback(() => setAddOpen(false), []);

  return (
    <LayoutGroup>
      <main className="library-shell">
        <GlassSurface
          width={120}
          height={44}
          borderRadius={22}
          borderWidth={0.09}
          brightness={62}
          opacity={0.88}
          blur={10}
          distortionScale={-120}
          className="floating-actions"
        >
          <ViewSwitcher mode={viewMode} onChange={setViewMode} />
          <span className="floating-action-divider" aria-hidden="true" />
          <button
            type="button"
            className="floating-action-btn"
            onClick={() => setAddOpen(true)}
            aria-label="添加唱片"
          >
            <span aria-hidden="true">＋</span>
          </button>
        </GlassSurface>

        <GlassSurface
          width={190}
          height={44}
          borderRadius={22}
          borderWidth={0.09}
          brightness={62}
          opacity={0.88}
          blur={10}
          distortionScale={-120}
          className="floating-tabs"
        >
          <nav aria-label="唱片导航">
            <div className="segmented-control">
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
                </button>
              ))}
            </div>
          </nav>
        </GlassSurface>

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
                key={`${activeZone}-${viewMode}`}
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

                {viewMode === "gallery" && (
                  <GalleryView
                    albums={visibleAlbums}
                    versionCounts={versionCounts}
                    onInspect={setSelectedAlbum}
                    onAdd={() => setAddOpen(true)}
                    onBrowseAll={() => setActiveZone("all")}
                    favoriteView={activeZone === "favorite"}
                  />
                )}

                {viewMode === "crate" && (
                  <CrateView
                    albums={visibleAlbums}
                    onInspect={setSelectedAlbum}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </section>


      </main>

      <AnimatePresence>
        {selectedAlbum && (
          <InspectModal
            key={selectedAlbum.id}
            album={selectedAlbum}
            versions={getVersions(selectedAlbum)}
            onSave={handleSave}
            onToggleFavorite={handleToggleFavorite}
            onClose={closeInspect}
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
            onClose={closeAdd}
          />
        )}
      </AnimatePresence>
    </LayoutGroup>
  );
}
