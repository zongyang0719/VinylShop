"use client";

import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GlassSurface from "@/components/GlassSurface";
import { AddModal } from "./components/AddModal";
import { AppIcon } from "./components/AppIcon";
import { CrateView } from "./components/CrateView";
import { GalleryView } from "./components/GalleryView";
import { InspectModal } from "./components/InspectModal";
import { LibrarySearch } from "./components/LibrarySearch";
import { LibrarySettings } from "./components/LibrarySettings";
import {
  cacheLibraryPreferences,
  DEFAULT_LIBRARY_PREFERENCES,
  fetchLibraryPreferences,
  readCachedLibraryPreferencesState,
  saveLibraryPreferences,
  type LibraryPreferences,
} from "./lib/library-preferences";
import {
  deleteAlbum,
  getAlbums,
  getCachedAlbums,
  upsertAlbum,
  upsertAlbums,
  type Album,
  type Zone,
} from "./lib/store";

type LibraryDestination = "gallery" | "crate" | "favorites";

const destinations: Array<{
  id: LibraryDestination;
  label: string;
  icon: "gallery" | "crate" | "favorite";
}> = [
  { id: "gallery", label: "画廊", icon: "gallery" },
  { id: "crate", label: "唱片架", icon: "crate" },
  { id: "favorites", label: "喜欢", icon: "favorite" },
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
  const [destination, setDestination] =
    useState<LibraryDestination>("gallery");
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [preferences, setPreferences] = useState<LibraryPreferences>(
    DEFAULT_LIBRARY_PREFERENCES,
  );
  const preferencesRef = useRef(preferences);
  const preferencesRevisionRef = useRef(0);
  const [preferencesSyncStatus, setPreferencesSyncStatus] = useState<
    "idle" | "saving" | "saved" | "offline"
  >("idle");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [favoriteNotice, setFavoriteNotice] = useState("");
  const { displayMode, formatFilter, sortMode } = preferences;

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
    const cached = getCachedAlbums();

    if (cached) {
      queueMicrotask(() => {
        if (active) {
          setAlbums(cached);
          setLoading(false);
        }
      });
    }

    getAlbums()
      .then((library) => {
        if (active) {
          setAlbums(library);
        }
      })
      .catch((error: unknown) => {
        if (active && !cached) {
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
    let active = true;
    const cached = readCachedLibraryPreferencesState();
    const startingRevision = preferencesRevisionRef.current;

    if (cached) {
      preferencesRef.current = cached.preferences;
      queueMicrotask(() => {
        if (active) {
          setPreferences(cached.preferences);
          if (cached.pendingSync) {
            setPreferencesSyncStatus("saving");
          }
        }
      });
    } else {
      cacheLibraryPreferences(DEFAULT_LIBRARY_PREFERENCES);
    }

    const initialSync = cached?.pendingSync
      ? saveLibraryPreferences(cached.preferences)
      : fetchLibraryPreferences();

    initialSync
      .then((cloudPreferences) => {
        if (
          active &&
          preferencesRevisionRef.current === startingRevision
        ) {
          preferencesRef.current = cloudPreferences;
          setPreferences(cloudPreferences);
          setPreferencesSyncStatus("saved");
        }
      })
      .catch(() => {
        if (active) {
          setPreferencesSyncStatus("offline");
        }
      });

    const retryPendingPreferences = () => {
      const pending = readCachedLibraryPreferencesState();
      if (!pending?.pendingSync) {
        return;
      }
      const revision = preferencesRevisionRef.current;
      setPreferencesSyncStatus("saving");
      void saveLibraryPreferences(pending.preferences)
        .then((saved) => {
          if (active && preferencesRevisionRef.current === revision) {
            preferencesRef.current = saved;
            setPreferences(saved);
            setPreferencesSyncStatus("saved");
          }
        })
        .catch(() => {
          if (active && preferencesRevisionRef.current === revision) {
            setPreferencesSyncStatus("offline");
          }
        });
    };

    window.addEventListener("online", retryPendingPreferences);
    return () => {
      active = false;
      window.removeEventListener("online", retryPendingPreferences);
    };
  }, []);

  function updatePreferences(patch: Partial<LibraryPreferences>) {
    const next = { ...preferencesRef.current, ...patch };
    const revision = preferencesRevisionRef.current + 1;
    preferencesRevisionRef.current = revision;
    preferencesRef.current = next;
    setPreferences(next);
    cacheLibraryPreferences(next);
    setPreferencesSyncStatus("saving");

    void saveLibraryPreferences(next)
      .then((saved) => {
        if (preferencesRevisionRef.current === revision) {
          preferencesRef.current = saved;
          setPreferences(saved);
          setPreferencesSyncStatus("saved");
        }
      })
      .catch(() => {
        if (preferencesRevisionRef.current === revision) {
          setPreferencesSyncStatus("offline");
        }
      });
  }

  useEffect(() => {
    const preloadCrate = () => {
      void import("./components/CrateScene");
    };
    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(preloadCrate, {
        timeout: 2200,
      });
      return () => window.cancelIdleCallback(idleId);
    }
    const timer = setTimeout(preloadCrate, 900);
    return () => clearTimeout(timer);
  }, []);

  /* ── 集中管理 body 滚动锁定 ── */
  useEffect(() => {
    if (
      selectedAlbum ||
      addOpen ||
      settingsOpen ||
      searchOpen ||
      destination === "crate"
    ) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [selectedAlbum, addOpen, destination, searchOpen, settingsOpen]);

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
    let result = dedup(albums);
    if (formatFilter !== "all") {
      result = result.filter((album) => album.format === formatFilter);
    }
    if (destination === "favorites") {
      result = result.filter((album) => album.favorite);
    }
    return [...result].sort((a, b) => {
      if (sortMode === "artist") {
        return a.artist.localeCompare(b.artist, "zh-CN");
      }
      if (sortMode === "title") {
        return a.title.localeCompare(b.title, "zh-CN");
      }
      if (sortMode === "year") {
        return (b.year ?? -1) - (a.year ?? -1);
      }
      return (
        new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime()
      );
    });
  }, [albums, destination, formatFilter, sortMode]);

  const destinationZone: Zone = "unsorted";
  const favoriteCount = albums.filter((album) => album.favorite).length;

  async function handleAdd(album: Album) {
    const saved = await upsertAlbum(album);
    setAlbums((current) => sortByAdded([saved, ...current]));
    setAddOpen(false);
  }

  async function handleImport(imported: Album[]) {
    const result = await upsertAlbums(imported);
    await loadLibrary();
    setDestination("gallery");
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

  async function handleDelete(album: Album) {
    await deleteAlbum(album.id);
    setAlbums((current) => current.filter((item) => item.id !== album.id));
    setSelectedAlbum(null);
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
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);

  return (
    <LayoutGroup>
      <main
        className={`library-shell${
          destination === "crate" ? " is-crate-mode" : ""
        }`}
      >
        <GlassSurface
          width={104}
          height={52}
          borderRadius={26}
          borderWidth={0.09}
          brightness={62}
          opacity={0.82}
          blur={7}
          displace={0.35}
          backgroundOpacity={0.12}
          saturation={1.35}
          distortionScale={-72}
          className="top-actions"
        >
          <button
            type="button"
            className={settingsOpen ? "is-active" : ""}
            onClick={() => {
              setSettingsOpen((current) => !current);
              setSearchOpen(false);
            }}
            aria-label="显示设置"
            aria-expanded={settingsOpen}
          >
            <AppIcon name="settings" />
          </button>
          <span aria-hidden="true" />
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            aria-label="添加唱片"
          >
            <AppIcon name="add" />
          </button>
        </GlassSurface>

        <div className="bottom-navigation">
          <GlassSurface
            width={232}
            height={62}
            borderRadius={31}
            borderWidth={0.09}
            brightness={62}
            opacity={0.82}
            blur={7}
            displace={0.35}
            backgroundOpacity={0.12}
            saturation={1.35}
            distortionScale={-72}
            className="main-tab-bar"
          >
            <nav aria-label="唱片库视图">
              {destinations.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={destination === item.id ? "is-active" : ""}
                  onClick={() => {
                    setSelectedAlbum(null);
                    setDestination(item.id);
                  }}
                  aria-current={destination === item.id ? "page" : undefined}
                >
                  {destination === item.id && (
                    <motion.span
                      className="main-tab-highlight"
                      layoutId="library-destination"
                      transition={spring}
                    />
                  )}
                  <AppIcon name={item.icon} size={20} />
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
          </GlassSurface>

          <GlassSurface
            width={62}
            height={62}
            borderRadius={31}
            borderWidth={0.09}
            brightness={62}
            opacity={0.82}
            blur={7}
            displace={0.35}
            backgroundOpacity={0.12}
            saturation={1.35}
            distortionScale={-72}
            className="search-tab-button"
          >
            <button
              type="button"
              onClick={() => {
                setSearchOpen(true);
                setSettingsOpen(false);
              }}
              aria-label="搜索唱片库"
            >
              <AppIcon name="search" size={23} />
            </button>
          </GlassSurface>
        </div>

        <AnimatePresence>
          {settingsOpen && (
            <LibrarySettings
              key="library-settings"
              displayMode={displayMode}
              formatFilter={formatFilter}
              sortMode={sortMode}
              onDisplayModeChange={(value) =>
                updatePreferences({ displayMode: value })
              }
              onFormatFilterChange={(value) =>
                updatePreferences({ formatFilter: value })
              }
              onSortModeChange={(value) =>
                updatePreferences({ sortMode: value })
              }
              syncStatus={preferencesSyncStatus}
              onClose={closeSettings}
            />
          )}
        </AnimatePresence>

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
                key={`${destination}-${displayMode}-${formatFilter}-${sortMode}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
              >
                {destination === "favorites" && (
                  <div className="favorites-heading">
                    <div>
                      <h2>我的最喜欢的唱片</h2>
                      <p>最多保留 10 张。</p>
                    </div>
                    <span>{favoriteCount}/10</span>
                  </div>
                )}

                {destination !== "crate" && (
                  <GalleryView
                    albums={visibleAlbums}
                    versionCounts={versionCounts}
                    onInspect={setSelectedAlbum}
                    onAdd={() => setAddOpen(true)}
                    onBrowseAll={() => setDestination("gallery")}
                    favoriteView={destination === "favorites"}
                    displayMode={displayMode}
                  />
                )}

                {destination === "crate" && (
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
        {searchOpen && (
          <LibrarySearch
            key="library-search"
            albums={dedup(sortedAlbums)}
            onInspect={(album) => {
              setSearchOpen(false);
              setSelectedAlbum(album);
            }}
            onClose={closeSearch}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedAlbum && (
          <InspectModal
            key={selectedAlbum.id}
            album={selectedAlbum}
            versions={getVersions(selectedAlbum)}
            onSave={handleSave}
            onDelete={handleDelete}
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
