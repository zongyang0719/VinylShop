"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { Album, Format, Zone } from "@/app/lib/store";

type InspectModalProps = {
  album: Album;
  onSave: (album: Album) => Promise<void>;
  onClose: () => void;
};

const spring = {
  type: "spring" as const,
  stiffness: 360,
  damping: 34,
  mass: 0.9,
};

function dateInput(value?: string) {
  return value ? value.slice(0, 10) : "";
}

export function InspectModal({
  album,
  onSave,
  onClose,
}: InspectModalProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState(album.title);
  const [artist, setArtist] = useState(album.artist);
  const [coverUrl, setCoverUrl] = useState(album.coverUrl);
  const [year, setYear] = useState(album.year ? String(album.year) : "");
  const [releaseDate, setReleaseDate] = useState(
    dateInput(album.releaseDate),
  );
  const [purchaseDate, setPurchaseDate] = useState(
    dateInput(album.purchaseDate),
  );
  const [purchasePrice, setPurchasePrice] = useState(
    album.purchasePrice ?? "",
  );
  const [doubanUrl, setDoubanUrl] = useState(album.doubanUrl ?? "");
  const [format, setFormat] = useState<Format>(album.format);
  const [zone, setZone] = useState<Zone>(album.zone);
  const [tracklist, setTracklist] = useState(
    album.tracklist?.join("\n") ?? "",
  );

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (editing) {
          setEditing(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [editing, onClose]);

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
        format,
        zone,
        tracklist:
          tracklist
            .split("\n")
            .map((track) => track.trim())
            .filter(Boolean) || undefined,
      });
      setEditing(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败");
    } finally {
      setSaving(false);
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

  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={() => !saving && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={`${album.artist}《${album.title}》详情`}
    >
      <motion.div
        className="inspect-panel"
        initial={{ y: 26, opacity: 0.7, scale: 0.985 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 20, opacity: 0, scale: 0.99 }}
        transition={spring}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <div className="inspect-toolbar">
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
                src={coverUrl || "/covers/cover-fallback.svg"}
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

              <div className="field-row">
                <label className="field">
                  <span>发行日期</span>
                  <input
                    type="date"
                    value={releaseDate}
                    onChange={(event) => setReleaseDate(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>发行年份</span>
                  <input
                    inputMode="numeric"
                    value={year}
                    onChange={(event) => setYear(event.target.value)}
                    placeholder="例如 1998"
                  />
                </label>
              </div>

              <div className="field-row">
                <label className="field">
                  <span>购买日期</span>
                  <input
                    type="date"
                    value={purchaseDate}
                    onChange={(event) => setPurchaseDate(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>购买价格</span>
                  <input
                    value={purchasePrice}
                    onChange={(event) => setPurchasePrice(event.target.value)}
                    placeholder="例如 ¥268"
                  />
                </label>
              </div>

              <label className="field field-wide">
                <span>豆瓣条目链接</span>
                <input
                  type="url"
                  value={doubanUrl}
                  onChange={(event) => setDoubanUrl(event.target.value)}
                  placeholder="https://music.douban.com/subject/…"
                />
              </label>

              <div className="field-row">
                <label className="field">
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
                <label className="field">
                  <span>分区</span>
                  <select
                    value={zone}
                    onChange={(event) => setZone(event.target.value as Zone)}
                  >
                    <option value="recent">最近入手</option>
                    <option value="frequent">常听</option>
                    <option value="unsorted">全部</option>
                  </select>
                </label>
              </div>

              <label className="field field-wide">
                <span>曲目（每行一首）</span>
                <textarea
                  rows={6}
                  value={tracklist}
                  onChange={(event) => setTracklist(event.target.value)}
                />
              </label>

              {error && <p className="form-error">{error}</p>}
            </div>
          </div>
        ) : (
          <div className="inspect-layout">
            <motion.div
              className="inspect-cover"
              layoutId={`cover-${album.id}`}
              transition={spring}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0.04, bottom: 0.55 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > 90 || info.velocity.y > 700) {
                  onClose();
                }
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={album.coverUrl}
                alt={`${album.artist}《${album.title}》封面`}
                onError={(event) => {
                  event.currentTarget.src = "/covers/cover-fallback.svg";
                }}
              />
            </motion.div>

            <div className="inspect-info">
              <p className="inspect-artist">{album.artist}</p>
              <h2>{album.title}</h2>
              <p className="inspect-release">{releaseLabel}</p>

              <dl className="album-facts">
                <div>
                  <dt>购买日期</dt>
                  <dd>{dateInput(album.purchaseDate) || "未记录"}</dd>
                </div>
                <div>
                  <dt>购买价格</dt>
                  <dd>{album.purchasePrice || "未记录"}</dd>
                </div>
                <div>
                  <dt>介质</dt>
                  <dd>{formatLabel}</dd>
                </div>
                <div>
                  <dt>分区</dt>
                  <dd>
                    {album.zone === "frequent"
                      ? "常听"
                      : album.zone === "recent"
                        ? "最近入手"
                        : "全部"}
                  </dd>
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
