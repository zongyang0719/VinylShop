"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  createAlbumFromDiscogs,
  getDiscogsRelease,
  searchDiscogs,
  type DiscogsSearchResult,
} from "@/app/lib/discogs";
import {
  searchMusic,
  proxyCoverUrl,
  type MusicSearchResult,
} from "@/app/lib/douban";
import { parseMusicBuddyCsv } from "@/app/lib/musicbuddy";
import {
  makeLocalId,
  isNativeApp,
  type Album,
  type Format,
  type Zone,
} from "@/app/lib/store";

type SearchSource = "musicbrainz" | "discogs";

type AddMode = "search" | "manual" | "import";

type AddModalProps = {
  zone: Zone;
  onAdd: (album: Album) => Promise<void>;
  onImport: (
    albums: Album[],
  ) => Promise<{ added: number; updated: number }>;
  onClose: () => void;
};

const spring = {
  type: "spring" as const,
  stiffness: 380,
  damping: 36,
  mass: 0.85,
};

export function AddModal({
  zone,
  onAdd,
  onImport,
  onClose,
}: AddModalProps) {
  const [mode, setMode] = useState<AddMode>("search");
  const [query, setQuery] = useState("");
  const [format, setFormat] =
    useState<Exclude<Format, "unknown">>("vinyl");
  const [results, setResults] = useState<DiscogsSearchResult[]>([]);
  const [mbResults, setMbResults] = useState<MusicSearchResult[]>([]);
  const [searchSource, setSearchSource] = useState<SearchSource>("musicbrainz");
  const [loading, setLoading] = useState(false);
  const [addingId, setAddingId] = useState<number | string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [error, setError] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [manualArtist, setManualArtist] = useState("");
  const [manualCover, setManualCover] = useState("");
  const [manualYear, setManualYear] = useState("");
  const [manualPurchaseDate, setManualPurchaseDate] = useState("");
  const [manualPurchasePrice, setManualPurchasePrice] = useState("");
  const [manualDoubanUrl, setManualDoubanUrl] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); };
  }, [onClose]);

  useEffect(() => {
    if (mode === "search") {
      window.setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [mode]);

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError("");
    setResults([]);
    setMbResults([]);
    try {
      if (searchSource === "musicbrainz") {
        setMbResults(await searchMusic(query.trim()));
      } else {
        setResults(await searchDiscogs(query.trim()));
      }
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "搜索失败，请稍后重试",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleChooseDiscogs(result: DiscogsSearchResult) {
    setAddingId(result.id);
    setError("");
    try {
      const release = await getDiscogsRelease(result.id);
      await onAdd(createAlbumFromDiscogs(result, release, format, zone));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "添加失败");
      setAddingId(null);
    }
  }

  async function handleChooseMB(result: MusicSearchResult) {
    setAddingId(result.id);
    setError("");
    try {
      await onAdd({
        id: makeLocalId(),
        title: result.title,
        artist: result.artist,
        year: Number(result.year) || undefined,
        coverUrl: result.coverUrl,
        format,
        zone,
        dateAdded: new Date().toISOString(),
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "添加失败");
      setAddingId(null);
    }
  }

  async function handleManualAdd(event: FormEvent) {
    event.preventDefault();
    if (
      !manualTitle.trim() ||
      !manualArtist.trim() ||
      !manualCover.trim()
    ) {
      setError("专辑名、艺人和封面地址不能为空");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await onAdd({
        id: makeLocalId(),
        title: manualTitle.trim(),
        artist: manualArtist.trim(),
        coverUrl: manualCover.trim(),
        year: Number(manualYear) || undefined,
        purchaseDate: manualPurchaseDate || undefined,
        purchasePrice: manualPurchasePrice.trim() || undefined,
        doubanUrl: manualDoubanUrl.trim() || undefined,
        format,
        zone,
        dateAdded: new Date().toISOString(),
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "添加失败");
      setLoading(false);
    }
  }

  async function handleCsvImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setImporting(true);
    setError("");
    setImportMessage("");
    try {
      const imported = await parseMusicBuddyCsv(file);
      const result = await onImport(imported);
      setImportMessage(
        `完成：新增 ${result.added} 张，更新 ${result.updated} 张`,
      );
      window.setTimeout(onClose, 1100);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "CSV 导入失败，请检查文件",
      );
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  }

  const doubanSearch = `https://search.douban.com/music/subject_search?search_text=${encodeURIComponent(
    query.trim() || [manualArtist, manualTitle].filter(Boolean).join(" "),
  )}`;

  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-title"
    >
      <motion.div
        className="add-panel"
        initial={{ y: 30, opacity: 0.75, scale: 0.985 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 24, opacity: 0, scale: 0.99 }}
        transition={spring}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <div className="add-toolbar">
          <button
            type="button"
            className="circle-button"
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
          <h2 id="add-title">添加唱片</h2>
          <span className="toolbar-spacer" />
        </div>

        <nav className="add-modes" aria-label="添加方式">
          {[
            ["search", "搜索"],
            ["manual", "手动"],
            ["import", "导入"],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={mode === id ? "is-active" : ""}
              onClick={() => {
                setMode(id as AddMode);
                setError("");
              }}
            >
              {mode === id && (
                <motion.span
                  className="add-mode-highlight"
                  layoutId="add-mode"
                  transition={spring}
                />
              )}
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="format-row">
          <span>介质</span>
          <div>
            <button
              type="button"
              className={format === "vinyl" ? "is-active" : ""}
              onClick={() => setFormat("vinyl")}
            >
              黑胶
            </button>
            <button
              type="button"
              className={format === "cd" ? "is-active" : ""}
              onClick={() => setFormat("cd")}
            >
              CD
            </button>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {mode === "search" && (
            <motion.div
              key="search"
              className="add-content"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.18 }}
            >
              <form className="search-form" onSubmit={handleSearch}>
                <label htmlFor="discogs-query">艺人或专辑名</label>
                <div>
                  <input
                    ref={inputRef}
                    id="discogs-query"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="例如：周杰伦 范特西"
                    autoComplete="off"
                  />
                  <button type="submit" disabled={loading || !query.trim()}>
                    {loading ? "搜索中" : "搜索"}
                  </button>
                </div>
              </form>

              <div className="source-switch">
                <div className="source-tabs">
                  <button
                    type="button"
                    className={searchSource === "musicbrainz" ? "is-active" : ""}
                    onClick={() => { setSearchSource("musicbrainz"); setResults([]); setMbResults([]); }}
                  >
                    MusicBrainz
                  </button>
                  {!isNativeApp() && (
                    <button
                      type="button"
                      className={searchSource === "discogs" ? "is-active" : ""}
                      onClick={() => { setSearchSource("discogs"); setResults([]); setMbResults([]); }}
                    >
                      Discogs
                    </button>
                  )}
                </div>
                <span className="source-hint">
                  {searchSource === "musicbrainz"
                    ? "封面、年份与曲目从 MusicBrainz 带回"
                    : "封面、年份与曲目从 Discogs 带回"}
                </span>
              </div>

              {/* ── MusicBrainz results ── */}
              {searchSource === "musicbrainz" && mbResults.length > 0 && (
                <div className="search-results">
                  {mbResults.map((result) => (
                    <button
                      type="button"
                      key={result.id}
                      className="search-result"
                      onClick={() => void handleChooseMB(result)}
                      disabled={addingId !== null}
                    >
                      <span className="result-cover">
                        {result.coverUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={proxyCoverUrl(result.coverUrl)}
                            alt=""
                            onError={(event) => {
                              event.currentTarget.src =
                                "/covers/cover-fallback.svg";
                            }}
                          />
                        ) : (
                          <span>♫</span>
                        )}
                      </span>
                      <span className="result-copy">
                        <strong>{result.title}</strong>
                        <span>{result.artist}</span>
                        <small>
                          {result.year || "年份未知"}
                          {result.format ? ` · ${result.format}` : ""}
                          {result.label ? ` · ${result.label}` : ""}
                        </small>
                      </span>
                      <span className="result-action">
                        {addingId === result.id ? "添加中" : "添加"}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* ── Discogs results ── */}
              {searchSource === "discogs" && results.length > 0 && (
                <div className="search-results">
                  {results.map((result) => {
                    const [artist, ...rest] = result.title.split(" - ");
                    const title = rest.join(" - ") || result.title;
                    const image = result.cover_image || result.thumb;
                    return (
                      <button
                        type="button"
                        key={result.id}
                        className="search-result"
                        onClick={() => void handleChooseDiscogs(result)}
                        disabled={addingId !== null}
                      >
                        <span className="result-cover">
                          {image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={image} alt="" />
                          ) : (
                            <span>♫</span>
                          )}
                        </span>
                        <span className="result-copy">
                          <strong>{title}</strong>
                          <span>{artist}</span>
                          <small>{result.year || "年份未知"}</small>
                        </span>
                        <span className="result-action">
                          {addingId === result.id ? "添加中" : "添加"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {!loading && !results.length && !mbResults.length && (
                <div className="search-empty">
                  <span aria-hidden="true">⌕</span>
                  <p>输入关键词搜索专辑。</p>
                </div>
              )}
            </motion.div>
          )}

          {mode === "manual" && (
            <motion.form
              key="manual"
              className="add-content manual-form"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.18 }}
              onSubmit={handleManualAdd}
            >
              <div className="field-row">
                <label className="field">
                  <span>专辑名</span>
                  <input
                    value={manualTitle}
                    onChange={(event) => setManualTitle(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>艺人</span>
                  <input
                    value={manualArtist}
                    onChange={(event) => setManualArtist(event.target.value)}
                  />
                </label>
              </div>

              <label className="field field-wide">
                <span>封面图片地址</span>
                <input
                  type="url"
                  value={manualCover}
                  onChange={(event) => setManualCover(event.target.value)}
                  placeholder="https://…"
                />
              </label>
              <div className="cover-upload-row">
                <label className="cover-upload-button">
                  <span aria-hidden="true">📁</span>
                  <span>上传本地封面</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        if (typeof reader.result === "string") {
                          setManualCover(reader.result);
                        }
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
              </div>

              <div className="field-row">
                <label className="field">
                  <span>发行年份</span>
                  <input
                    inputMode="numeric"
                    value={manualYear}
                    onChange={(event) => setManualYear(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>购买日期</span>
                  <input
                    type="date"
                    value={manualPurchaseDate}
                    onChange={(event) =>
                      setManualPurchaseDate(event.target.value)
                    }
                  />
                </label>
              </div>

              <label className="field field-wide">
                <span>购买价格</span>
                <input
                  value={manualPurchasePrice}
                  onChange={(event) =>
                    setManualPurchasePrice(event.target.value)
                  }
                  placeholder="例如 ¥268"
                />
              </label>

              <label className="field field-wide">
                <span>豆瓣条目链接（可选）</span>
                <input
                  type="url"
                  value={manualDoubanUrl}
                  onChange={(event) =>
                    setManualDoubanUrl(event.target.value)
                  }
                  placeholder="https://music.douban.com/subject/…"
                />
              </label>

              <div className="manual-actions">
                <a href={doubanSearch} target="_blank" rel="noreferrer">
                  在豆瓣音乐查找资料
                  <span aria-hidden="true">↗</span>
                </a>
                <button
                  type="submit"
                  className="primary-action"
                  disabled={loading}
                >
                  {loading ? "保存中" : "添加到唱片库"}
                </button>
              </div>
            </motion.form>
          )}

          {mode === "import" && (
            <motion.div
              key="import"
              className="add-content import-content"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.18 }}
            >
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleCsvImport}
                className="visually-hidden"
              />
              <button
                type="button"
                className="import-dropzone"
                onClick={() => csvInputRef.current?.click()}
                disabled={importing}
              >
                <span className="import-icon" aria-hidden="true">
                  ↓
                </span>
                <strong>
                  {importing ? "正在整理唱片…" : "选择 MusicBuddy CSV"}
                </strong>
                <small>
                  会保留封面、发行年份、购买日期、价格、介质与曲目
                </small>
              </button>
              {importMessage && (
                <p className="import-message">{importMessage}</p>
              )}
              <p className="import-footnote">
                重复唱片会更新已有资料，不会再生成一份。
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {error && <p className="form-error panel-error">{error}</p>}
      </motion.div>
    </motion.div>
  );
}
