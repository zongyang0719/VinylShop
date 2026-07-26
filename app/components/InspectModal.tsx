"use client";

import { motion } from "framer-motion";
import { useEffect, useState, type CSSProperties } from "react";
import { resolveArtworkURL } from "@/app/lib/artwork";
import type { MetadataProposal } from "@/app/lib/metadata";
import {
  isNativeApp,
  type Album,
  type Format,
  type VinylStyle,
} from "@/app/lib/store";
import { CdDisc } from "./CdDisc";
import { CoverSearch, type CoverSelection } from "./CoverSearch";
import { MetadataUpdater } from "./MetadataUpdater";
import { VinylDisc } from "./VinylDisc";

type InspectModalProps = {
  album: Album;
  versions?: Album[];
  onSave: (album: Album) => Promise<void>;
  onDelete?: (album: Album) => Promise<void>;
  onToggleFavorite: (album: Album) => Promise<string | null>;
  onClose: () => void;
};

const panelSpring = {
  type: "spring" as const,
  stiffness: 320,
  damping: 34,
  mass: 0.9,
};

const objectSpring = {
  type: "spring" as const,
  stiffness: 165,
  damping: 24,
  mass: 1.05,
};

const VINYL_COLORS = [
  { color: "#1a1a1a", label: "经典黑" },
  { color: "#a43a36", label: "红" },
  { color: "#376f9f", label: "蓝" },
  { color: "#397a58", label: "绿" },
  { color: "#bd6b32", label: "橙" },
  { color: "#705287", label: "紫" },
  { color: "#bd557d", label: "粉" },
  { color: "#a88934", label: "金" },
  { color: "#e8e8e8", label: "白" },
  { color: "#a8b4c0", label: "透明" },
];

const VINYL_STYLES: Array<{ id: VinylStyle; label: string }> = [
  { id: "standard", label: "普通" },
  { id: "transparent", label: "透明胶" },
  { id: "picture", label: "画胶" },
  { id: "splatter", label: "泼溅" },
];

function versionLabel(album: Album) {
  const format =
    album.format === "vinyl" ? "黑胶" : album.format === "cd" ? "CD" : "其他";
  const styles: Record<VinylStyle, string> = {
    standard: "",
    transparent: "透明",
    picture: "画胶",
    splatter: "泼溅",
  };
  const style = album.vinylStyle ? styles[album.vinylStyle] : "";
  return style ? `${format} · ${style}` : format;
}

function dateInput(value?: string) {
  return value ? value.slice(0, 10) : "";
}

function proxyArtwork(url: string) {
  return resolveArtworkURL(url);
}

function cleanTracks(value: string) {
  const tracks = value
    .split("\n")
    .map((track) => track.trim())
    .filter(Boolean);
  return tracks.length > 0 ? tracks : undefined;
}

function cleanList(value: string) {
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function extractDominantColor(src: string): Promise<string> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) {
        resolve("18,18,22");
        return;
      }
      canvas.width = 36;
      canvas.height = 36;
      context.drawImage(image, 0, 0, 36, 36);
      try {
        const pixels = context.getImageData(0, 0, 36, 36).data;
        let red = 0;
        let green = 0;
        let blue = 0;
        let count = 0;
        for (let index = 0; index < pixels.length; index += 20) {
          red += pixels[index];
          green += pixels[index + 1];
          blue += pixels[index + 2];
          count += 1;
        }
        resolve(
          `${Math.round((red / count) * 0.42)},${Math.round(
            (green / count) * 0.42,
          )},${Math.round((blue / count) * 0.42)}`,
        );
      } catch {
        resolve("18,18,22");
      }
    };
    image.onerror = () => resolve("18,18,22");
    image.src = src;
  });
}

export function InspectModal({
  album: initialAlbum,
  versions: suppliedVersions,
  onSave,
  onDelete,
  onToggleFavorite,
  onClose,
}: InspectModalProps) {
  const versions =
    suppliedVersions && suppliedVersions.length > 0
      ? suppliedVersions
      : [initialAlbum];
  const [activeVersionIndex, setActiveVersionIndex] = useState(0);
  const album = versions[activeVersionIndex] ?? initialAlbum;

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [favoriteSaving, setFavoriteSaving] = useState(false);
  const [error, setError] = useState("");
  const [favoriteError, setFavoriteError] = useState("");
  const [title, setTitle] = useState(album.title);
  const [artist, setArtist] = useState(album.artist);
  const [coverUrl, setCoverUrl] = useState(album.coverUrl);
  const [year, setYear] = useState(album.year ? String(album.year) : "");
  const [releaseDate, setReleaseDate] = useState(dateInput(album.releaseDate));
  const [purchaseDate, setPurchaseDate] = useState(
    dateInput(album.purchaseDate),
  );
  const [purchasePrice, setPurchasePrice] = useState(
    album.purchasePrice ?? "",
  );
  const [doubanUrl, setDoubanUrl] = useState(album.doubanUrl ?? "");
  const [format, setFormat] = useState<Format>(album.format);
  const [tracklist, setTracklist] = useState(
    album.tracklist?.join("\n") ?? "",
  );
  const [vinylColor, setVinylColor] = useState(
    album.vinylColor ?? "#1a1a1a",
  );
  const [vinylStyle, setVinylStyle] = useState<VinylStyle>(
    album.vinylStyle ?? "standard",
  );
  const [label, setLabel] = useState(album.label ?? "");
  const [genres, setGenres] = useState(album.genres?.join(", ") ?? "");
  const [styles, setStyles] = useState(album.styles?.join(", ") ?? "");
  const [country, setCountry] = useState(album.country ?? "");
  const [catalogNumber, setCatalogNumber] = useState(
    album.catalogNumber ?? "",
  );
  const [producers, setProducers] = useState(
    album.producers?.join(", ") ?? "",
  );
  const [edition, setEdition] = useState(album.edition ?? "");
  const [barcode, setBarcode] = useState(album.barcode ?? "");

  const [showColorPicker, setShowColorPicker] = useState(false);
  const [customHex, setCustomHex] = useState(
    album.vinylColor ?? "#1a1a1a",
  );
  const [spinning, setSpinning] = useState(false);
  const [dominantRgb, setDominantRgb] = useState("18,18,22");

  useEffect(() => {
    let active = true;
    void extractDominantColor(proxyArtwork(album.coverUrl)).then((color) => {
      if (active) setDominantRgb(color);
    });
    return () => {
      active = false;
    };
  }, [album.coverUrl]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (editing) setEditing(false);
      else onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editing, onClose]);

  function syncDraft(nextAlbum: Album) {
    setTitle(nextAlbum.title);
    setArtist(nextAlbum.artist);
    setCoverUrl(nextAlbum.coverUrl);
    setYear(nextAlbum.year ? String(nextAlbum.year) : "");
    setReleaseDate(dateInput(nextAlbum.releaseDate));
    setPurchaseDate(dateInput(nextAlbum.purchaseDate));
    setPurchasePrice(nextAlbum.purchasePrice ?? "");
    setDoubanUrl(nextAlbum.doubanUrl ?? "");
    setFormat(nextAlbum.format);
    setTracklist(nextAlbum.tracklist?.join("\n") ?? "");
    setLabel(nextAlbum.label ?? "");
    setGenres(nextAlbum.genres?.join(", ") ?? "");
    setStyles(nextAlbum.styles?.join(", ") ?? "");
    setCountry(nextAlbum.country ?? "");
    setCatalogNumber(nextAlbum.catalogNumber ?? "");
    setProducers(nextAlbum.producers?.join(", ") ?? "");
    setEdition(nextAlbum.edition ?? "");
    setBarcode(nextAlbum.barcode ?? "");
    setVinylColor(nextAlbum.vinylColor ?? "#1a1a1a");
    setVinylStyle(nextAlbum.vinylStyle ?? "standard");
    setCustomHex(nextAlbum.vinylColor ?? "#1a1a1a");
    setShowColorPicker(false);
    setSpinning(false);
    setError("");
  }

  function selectVersion(index: number) {
    const nextAlbum = versions[index];
    if (!nextAlbum) return;
    setActiveVersionIndex(index);
    setEditing(false);
    syncDraft(nextAlbum);
  }

  function applyCoverOnly(selection: CoverSelection) {
    setCoverUrl(selection.url);
  }

  function applyMetadata(proposal: MetadataProposal) {
    if (proposal.title !== undefined) setTitle(proposal.title);
    if (proposal.artist !== undefined) setArtist(proposal.artist);
    if (proposal.year !== undefined) setYear(String(proposal.year));
    if (proposal.releaseDate !== undefined) {
      setReleaseDate(dateInput(proposal.releaseDate));
    }
    if (proposal.label !== undefined) setLabel(proposal.label);
    if (proposal.genres !== undefined) setGenres(proposal.genres.join(", "));
    if (proposal.styles !== undefined) setStyles(proposal.styles.join(", "));
    if (proposal.country !== undefined) setCountry(proposal.country);
    if (proposal.catalogNumber !== undefined) {
      setCatalogNumber(proposal.catalogNumber);
    }
    if (proposal.producers !== undefined) {
      setProducers(proposal.producers.join(", "));
    }
    if (proposal.edition !== undefined) setEdition(proposal.edition);
    if (proposal.barcode !== undefined) setBarcode(proposal.barcode);
    if (proposal.tracklist !== undefined) {
      setTracklist(proposal.tracklist.join("\n"));
    }
  }

  function pickColor(color: string) {
    setVinylColor(color);
    setCustomHex(color);
  }

  function pickStyle(style: VinylStyle) {
    setVinylStyle(style);
    if (style === "transparent" && vinylColor === "#1a1a1a") {
      pickColor("#a8b4c0");
    }
  }

  async function handleSave() {
    if (!title.trim() || !artist.trim() || !coverUrl.trim()) {
      setError("专辑名、艺人和封面地址不能为空");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave({
        ...album,
        title: title.trim(),
        artist: artist.trim(),
        coverUrl: coverUrl.trim(),
        year: Number(year) || undefined,
        releaseDate: releaseDate || undefined,
        purchaseDate: purchaseDate || undefined,
        purchasePrice: purchasePrice.trim() || undefined,
        doubanUrl: doubanUrl.trim() || undefined,
        label: label.trim() || undefined,
        genres: cleanList(genres),
        styles: cleanList(styles),
        country: country.trim() || undefined,
        catalogNumber: catalogNumber.trim() || undefined,
        producers: cleanList(producers),
        edition: edition.trim() || undefined,
        barcode: barcode.trim() || undefined,
        format,
        vinylColor,
        vinylStyle,
        tracklist: cleanTracks(tracklist),
      });
      setEditing(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteVersion() {
    if (!onDelete) return;
    setDeleting(true);
    setError("");
    try {
      await onDelete(album);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "删除失败");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function handleFavorite() {
    setFavoriteSaving(true);
    setFavoriteError("");
    try {
      const message = await onToggleFavorite(album);
      if (message) setFavoriteError(message);
    } finally {
      setFavoriteSaving(false);
    }
  }

  const releaseLabel =
    album.releaseDate?.slice(0, 10) ||
    (album.year ? String(album.year) : "发行时间未记录");
  const formatLabel =
    album.format === "vinyl"
      ? "黑胶"
      : album.format === "cd"
        ? "CD"
        : "未标注";
  const artwork = proxyArtwork(album.coverUrl);
  const metadataDraft: Album = {
    ...album,
    title,
    artist,
    coverUrl,
    year: Number(year) || undefined,
    releaseDate: releaseDate || undefined,
    label: label.trim() || undefined,
    genres: cleanList(genres),
    styles: cleanList(styles),
    country: country.trim() || undefined,
    catalogNumber: catalogNumber.trim() || undefined,
    producers: cleanList(producers),
    edition: edition.trim() || undefined,
    barcode: barcode.trim() || undefined,
    tracklist: cleanTracks(tracklist),
  };

  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={() => {
        if (!saving) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`${album.artist}《${album.title}》详情`}
    >
      <motion.div
        className="inspect-panel inspect-panel-vinyl"
        style={
          {
            "--hero-rgb": dominantRgb,
          } as CSSProperties
        }
        initial={{ y: 28, opacity: 0, scale: 0.975 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 22, opacity: 0, scale: 0.985 }}
        transition={panelSpring}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <div
          className="inspect-toolbar inspect-toolbar-vinyl"
        >
          <button
            type="button"
            className="circle-button"
            onClick={onClose}
            aria-label="关闭详情"
          >
            ×
          </button>
          <p>{editing ? "编辑专辑" : "专辑详情"}</p>
          {editing ? (
            <button
              type="button"
              className="text-action"
              onClick={() => void handleSave()}
              disabled={saving}
            >
              {saving ? "保存中" : "完成"}
            </button>
          ) : (
            <button
              type="button"
              className="text-action"
              onClick={() => setEditing(true)}
            >
              编辑
            </button>
          )}
        </div>

        {editing ? (
          <div className="edit-layout">
            <div className="edit-cover-preview">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={
                  coverUrl
                    ? proxyArtwork(coverUrl)
                    : "/covers/cover-fallback.svg"
                }
                alt="封面预览"
                onError={(event) => {
                  event.currentTarget.src = "/covers/cover-fallback.svg";
                }}
              />
            </div>
            <div className="edit-form">
              <label className="field field-wide">
                <span>封面图片地址</span>
                <input
                  type="url"
                  value={coverUrl}
                  onChange={(event) => setCoverUrl(event.target.value)}
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
                          setCoverUrl(reader.result);
                        }
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
                <CoverSearch
                  query={`${artist} ${title}`}
                  title={title}
                  artist={artist}
                  onSelect={applyCoverOnly}
                />
              </div>

              <div className="field-row">
                <label className="field">
                  <span>专辑名</span>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>艺人</span>
                  <input
                    value={artist}
                    onChange={(event) => setArtist(event.target.value)}
                  />
                </label>
              </div>
              {!isNativeApp() && (
                <MetadataUpdater album={metadataDraft} onApply={applyMetadata} />
              )}
              <div className="field-row">
                <label className="field">
                  <span>发行日期</span>
                  <input
                    type="date"
                    value={releaseDate}
                    onChange={(event) => {
                      setReleaseDate(event.target.value);
                      const y = event.target.value.slice(0, 4);
                      if (y && /^\d{4}$/.test(y)) setYear(y);
                    }}
                  />
                </label>
                <label className="field">
                  <span>购买日期</span>
                  <input
                    type="date"
                    value={purchaseDate}
                    onChange={(event) => setPurchaseDate(event.target.value)}
                  />
                </label>
              </div>
              <label className="field field-wide">
                <span>购买价格</span>
                <input
                  value={purchasePrice}
                  onChange={(event) => setPurchasePrice(event.target.value)}
                  placeholder="例如 ¥268"
                />
              </label>
              <label className="field field-wide">
                <span>厂牌 / 唱片公司</span>
                <input
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder="例如 环球音乐、索尼音乐"
                />
              </label>
              <div className="field-row">
                <label className="field">
                  <span>流派</span>
                  <input
                    value={genres}
                    onChange={(event) => setGenres(event.target.value)}
                    placeholder="Pop, Rock, Jazz"
                  />
                </label>
                <label className="field">
                  <span>风格</span>
                  <input
                    value={styles}
                    onChange={(event) => setStyles(event.target.value)}
                    placeholder="Indie Pop, Ballad"
                  />
                </label>
              </div>
              <div className="field-row">
                <label className="field">
                  <span>发行国家</span>
                  <input
                    value={country}
                    onChange={(event) => setCountry(event.target.value)}
                    placeholder="例如 Japan, Taiwan"
                  />
                </label>
                <label className="field">
                  <span>编目号</span>
                  <input
                    value={catalogNumber}
                    onChange={(event) =>
                      setCatalogNumber(event.target.value)
                    }
                    placeholder="例如 XLLP520"
                  />
                </label>
              </div>
              <div className="field-row">
                <label className="field">
                  <span>制作人</span>
                  <input
                    value={producers}
                    onChange={(event) => setProducers(event.target.value)}
                    placeholder="逗号分隔"
                  />
                </label>
                <label className="field">
                  <span>版本说明</span>
                  <input
                    value={edition}
                    onChange={(event) => setEdition(event.target.value)}
                    placeholder="例如 再版、重新灌录"
                  />
                </label>
              </div>
              <label className="field field-wide">
                <span>条形码</span>
                <input
                  value={barcode}
                  onChange={(event) => setBarcode(event.target.value)}
                  placeholder="UPC / EAN-13"
                />
              </label>
              <label className="field field-wide">
                <span>豆瓣条目链接</span>
                <input
                  type="url"
                  value={doubanUrl}
                  onChange={(event) => setDoubanUrl(event.target.value)}
                  placeholder="https://music.douban.com/subject/…"
                />
              </label>
              <label className="field field-wide">
                <span>介质</span>
                <select
                  value={format}
                  onChange={(event) =>
                    setFormat(event.target.value as Format)
                  }
                >
                  <option value="vinyl">黑胶</option>
                  <option value="cd">CD</option>
                  <option value="unknown">未标注</option>
                </select>
              </label>

              {format === "vinyl" && (
                <div className="edit-vinyl-section">
                  <span className="field-label">黑胶样式</span>
                  <div className="vinyl-style-row-edit">
                    {VINYL_STYLES.map((style) => (
                      <button
                        key={style.id}
                        type="button"
                        className={
                          vinylStyle === style.id ? "is-active" : ""
                        }
                        onClick={() => pickStyle(style.id)}
                      >
                        {style.label}
                      </button>
                    ))}
                  </div>
                  <span className="field-label">黑胶颜色</span>
                  <div className="vinyl-color-row-edit">
                    {VINYL_COLORS.map((color) => (
                      <button
                        key={color.color}
                        type="button"
                        className={`vinyl-dot ${
                          vinylColor === color.color ? "is-active" : ""
                        }`}
                        style={{ background: color.color }}
                        onClick={() => pickColor(color.color)}
                        aria-label={color.label}
                      />
                    ))}
                    <button
                      type="button"
                      className="vinyl-dot-custom"
                      onClick={() => setShowColorPicker(!showColorPicker)}
                      aria-label="自定义颜色"
                    >
                      +
                    </button>
                  </div>
                  {showColorPicker && (
                    <div className="vinyl-picker-row">
                      <input
                        type="color"
                        value={customHex}
                        onChange={(event) => pickColor(event.target.value)}
                        aria-label="选择黑胶颜色"
                      />
                      <span>{customHex}</span>
                    </div>
                  )}
                  <div className="edit-vinyl-preview">
                    <VinylDisc
                      color={vinylColor}
                      style={vinylStyle}
                      coverUrl={coverUrl}
                      size={112}
                    />
                  </div>
                </div>
              )}
              {format === "cd" && (
                <div className="edit-vinyl-section">
                  <span className="field-label">CD 预览</span>
                  <div className="edit-vinyl-preview">
                    <CdDisc coverUrl={coverUrl} size={112} />
                  </div>
                </div>
              )}

              <label className="field field-wide">
                <span>曲目（每行一首）</span>
                <textarea
                  rows={7}
                  value={tracklist}
                  onChange={(event) => setTracklist(event.target.value)}
                />
              </label>
              {error && <p className="form-error">{error}</p>}

              {onDelete && (
                <div className="delete-section">
                  {confirmDelete ? (
                    <div className="delete-confirm-row">
                      <span>确定删除此版本？此操作不可撤销。</span>
                      <button
                        type="button"
                        className="delete-confirm-button"
                        onClick={() => void handleDeleteVersion()}
                        disabled={deleting}
                      >
                        {deleting ? "删除中…" : "确认删除"}
                      </button>
                      <button
                        type="button"
                        className="delete-cancel-button"
                        onClick={() => setConfirmDelete(false)}
                        disabled={deleting}
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="delete-version-button"
                      onClick={() => setConfirmDelete(true)}
                    >
                      删除此版本
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="inspect-layout-vinyl">
            <section className="turntable-hero" aria-label="唱片展示">
              <div
                className="turntable-bg"
                style={{ backgroundImage: `url(${artwork})` }}
                aria-hidden="true"
              />
              <div className="turntable-bg-vignette" aria-hidden="true" />
              <div className="turntable-stage">
                <motion.button
                  key={`disc-${album.id}`}
                  type="button"
                  className="turntable-disc"
                  initial={{ x: -190, opacity: 0, rotate: -18, scale: 0.92 }}
                  animate={{ x: 0, opacity: 1, rotate: 0, scale: 1 }}
                  transition={{ ...objectSpring, delay: 0.14 }}
                  onClick={() => setSpinning(!spinning)}
                  aria-label={spinning ? "暂停唱片旋转" : "让唱片旋转"}
                  aria-pressed={spinning}
                >
                  {album.format === "cd" ? (
                    <CdDisc
                      coverUrl={album.coverUrl}
                      size={520}
                      spinning={spinning}
                    />
                  ) : (
                    <VinylDisc
                      color={album.vinylColor ?? vinylColor}
                      style={album.vinylStyle ?? vinylStyle}
                      coverUrl={album.coverUrl}
                      size={520}
                      spinning={spinning}
                    />
                  )}
                </motion.button>

                <motion.figure
                  key={`cover-${album.id}`}
                  className="turntable-cover"
                  initial={{ x: 34, opacity: 0, rotate: 2.5, scale: 0.93 }}
                  animate={{ x: 0, opacity: 1, rotate: -1.2, scale: 1 }}
                  transition={objectSpring}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={artwork}
                    alt={`${album.artist}《${album.title}》封面`}
                    onError={(event) => {
                      event.currentTarget.src = "/covers/cover-fallback.svg";
                    }}
                  />
                </motion.figure>
              </div>
            </section>

            {versions.length > 1 && (
              <div className="version-tabs" aria-label="专辑版本">
                {versions.map((version, index) => (
                  <button
                    key={version.id}
                    type="button"
                    className={`version-tab ${
                      activeVersionIndex === index ? "is-active" : ""
                    }`}
                    onClick={() => selectVersion(index)}
                    aria-pressed={activeVersionIndex === index}
                  >
                    <span
                      className="version-tab-dot"
                      style={
                        version.format === "vinyl"
                          ? {
                              background:
                                version.vinylColor ?? "#1a1a1a",
                            }
                          : {
                              background:
                                "linear-gradient(135deg, #d8dce2, #9298a2)",
                            }
                      }
                    />
                    <span>{versionLabel(version)}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="inspect-info inspect-info-vinyl">
              <div className="inspect-summary">
                <p className="inspect-artist">
                  {album.artist.replace(/\s*\(\d+\)$/, "")}
                </p>
                <h2>{album.title}</h2>
                <p className="inspect-release">{releaseLabel}</p>

                <button
                  type="button"
                  className={`favorite-detail-button ${
                    album.favorite ? "is-favorite" : ""
                  }`}
                  onClick={() => void handleFavorite()}
                  disabled={favoriteSaving}
                  aria-pressed={Boolean(album.favorite)}
                >
                  <span aria-hidden="true">
                    {album.favorite ? "♥" : "♡"}
                  </span>
                  <strong>
                    {favoriteSaving
                      ? "正在更新…"
                      : album.favorite
                        ? "已在喜欢里"
                        : "加入喜欢"}
                  </strong>
                  <small>最多 10 张</small>
                </button>
                {favoriteError && (
                  <p className="favorite-detail-error">{favoriteError}</p>
                )}

                <dl className="album-facts">
                  {album.label && (
                    <div>
                      <dt>厂牌</dt>
                      <dd>{album.label}</dd>
                    </div>
                  )}
                  <div>
                    <dt>介质</dt>
                    <dd>{formatLabel}</dd>
                  </div>
                  {album.genres && album.genres.length > 0 && (
                    <div>
                      <dt>流派</dt>
                      <dd>{album.genres.join(" / ")}</dd>
                    </div>
                  )}
                  {album.styles && album.styles.length > 0 && (
                    <div>
                      <dt>风格</dt>
                      <dd>{album.styles.join(" / ")}</dd>
                    </div>
                  )}
                  {album.country && (
                    <div>
                      <dt>发行国家</dt>
                      <dd>{album.country}</dd>
                    </div>
                  )}
                  {album.catalogNumber && (
                    <div>
                      <dt>编目号</dt>
                      <dd className="mono-text">{album.catalogNumber}</dd>
                    </div>
                  )}
                  {album.edition && (
                    <div>
                      <dt>版本</dt>
                      <dd>{album.edition}</dd>
                    </div>
                  )}
                  {album.producers && album.producers.length > 0 && (
                    <div>
                      <dt>制作人</dt>
                      <dd>{album.producers.join("、")}</dd>
                    </div>
                  )}
                  {album.numberOfVolumes && album.numberOfVolumes > 1 && (
                    <div>
                      <dt>碟数</dt>
                      <dd>{album.numberOfVolumes} 碟</dd>
                    </div>
                  )}
                  {album.barcode && (
                    <div>
                      <dt>条形码</dt>
                      <dd className="mono-text">{album.barcode}</dd>
                    </div>
                  )}
                  <div>
                    <dt>购买日期</dt>
                    <dd>{dateInput(album.purchaseDate) || "未记录"}</dd>
                  </div>
                  <div>
                    <dt>购买价格</dt>
                    <dd>{album.purchasePrice || "未记录"}</dd>
                  </div>
                  <div>
                    <dt>收藏状态</dt>
                    <dd>{album.favorite ? "喜欢" : "普通收藏"}</dd>
                  </div>
                </dl>

                {album.doubanUrl && (
                  <a
                    className="source-link"
                    href={album.doubanUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    在豆瓣查看
                    <span aria-hidden="true">↗</span>
                  </a>
                )}
              </div>

              <div className="tracklist">
                <h3>曲目</h3>
                {album.tracklist && album.tracklist.length > 0 ? (
                  <ol>
                    {album.tracklist.map((track, index) => (
                      <li key={`${track}-${index}`}>
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        <p>{track}</p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="tracklist-empty">还没有曲目资料。</p>
                )}
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
