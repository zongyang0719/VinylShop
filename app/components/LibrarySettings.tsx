"use client";

import { useEffect, useRef, useState } from "react";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { motion } from "framer-motion";
import type {
  GalleryDisplayMode,
  LibraryFormatFilter,
  LibrarySortMode,
} from "../lib/library-preferences";
import { getInteractionFeedback } from "../lib/interaction-feedback";
import {
  isNativeApp,
  exportLibraryJson,
  getCachedAlbums,
  importLibraryJson,
} from "../lib/store";
import { AppIcon } from "./AppIcon";

export type {
  GalleryDisplayMode,
  LibraryFormatFilter,
  LibrarySortMode,
} from "../lib/library-preferences";

type LibrarySettingsProps = {
  displayMode: GalleryDisplayMode;
  formatFilter: LibraryFormatFilter;
  sortMode: LibrarySortMode;
  onDisplayModeChange: (value: GalleryDisplayMode) => void;
  onFormatFilterChange: (value: LibraryFormatFilter) => void;
  onSortModeChange: (value: LibrarySortMode) => void;
  syncStatus: "idle" | "saving" | "saved" | "offline";
  onClose: () => void;
};

const spring = {
  type: "spring" as const,
  stiffness: 420,
  damping: 38,
  mass: 0.82,
};

function OptionGroup<T extends string>({
  title,
  value,
  options,
  onChange,
}: {
  title: string;
  value: T;
  options: Array<{ id: T; label: string }>;
  onChange: (value: T) => void;
}) {
  if (isNativeApp()) {
    return (
      <fieldset className="library-settings-group">
        <legend>{title}</legend>
        <select
          className="library-settings-native-select"
          value={value}
          onChange={(event) => onChange(event.target.value as T)}
          aria-label={title}
        >
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </fieldset>
    );
  }

  return (
    <fieldset className="library-settings-group">
      <legend>{title}</legend>
      <div>
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={value === option.id ? "is-selected" : ""}
            aria-pressed={value === option.id}
            onClick={() => onChange(option.id)}
          >
            {option.label}
            {value === option.id && (
              <svg
                viewBox="0 0 20 20"
                width="18"
                height="18"
                aria-hidden="true"
              >
                <path
                  d="m4.5 10 3.2 3.2 7.8-7.8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function NativeSwitchRow({
  title,
  checked,
  onChange,
}: {
  title: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.setAttribute("switch", "");
  }, []);

  return (
    <fieldset className="library-settings-group">
      <legend>{title}</legend>
      <label className="library-settings-native-switch">
        <span>{checked ? "开启" : "关闭"}</span>
        <input
          ref={inputRef}
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
      </label>
    </fieldset>
  );
}

export function LibrarySettings({
  displayMode,
  formatFilter,
  sortMode,
  onDisplayModeChange,
  onFormatFilterChange,
  onSortModeChange,
  syncStatus,
  onClose,
}: LibrarySettingsProps) {
  /* device-local scroll feedback settings (not synced to cloud) */
  const [hapticOn, setHapticOn] = useState(() =>
    typeof window !== "undefined"
      ? getInteractionFeedback().hapticEnabled
      : true,
  );
  const [soundOn, setSoundOn] = useState(() =>
    typeof window !== "undefined"
      ? getInteractionFeedback().soundEnabled
      : false,
  );

  useEffect(() => {
    const fb = getInteractionFeedback();
    return fb.subscribe(() => {
      setHapticOn(fb.hapticEnabled);
      setSoundOn(fb.soundEnabled);
    });
  }, []);

  function handleHapticToggle(v: string) {
    const on = v === "on";
    setHapticOn(on);
    getInteractionFeedback().setHapticEnabled(on);
  }

  function handleSoundToggle(v: string) {
    const on = v === "on";
    setSoundOn(on);
    const fb = getInteractionFeedback();
    fb.setSoundEnabled(on);
    if (on) fb.unlock();
  }

  return (
    <>
      <button
        type="button"
        className="library-settings-scrim"
        onClick={onClose}
        aria-label="关闭设置"
      />
      <motion.section
        className="library-settings-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="library-settings-title"
        initial={{ opacity: 0, y: -10, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -6, scale: 0.985 }}
        transition={spring}
      >
        <header>
          <h2 id="library-settings-title">显示设置</h2>
          <button type="button" onClick={onClose} aria-label="关闭设置">
            <AppIcon name="close" size={18} />
          </button>
        </header>

        <OptionGroup
          title="显示方式"
          value={displayMode}
          options={[
            { id: "standard", label: "标准" },
            { id: "covers", label: "仅封面" },
          ]}
          onChange={onDisplayModeChange}
        />
        <OptionGroup
          title="筛选"
          value={formatFilter}
          options={[
            { id: "all", label: "全部介质" },
            { id: "vinyl", label: "黑胶" },
            { id: "cd", label: "CD" },
          ]}
          onChange={onFormatFilterChange}
        />
        <OptionGroup
          title="排序"
          value={sortMode}
          options={[
            { id: "added", label: "最近添加" },
            { id: "artist", label: "艺人" },
            { id: "title", label: "专辑名" },
            { id: "year", label: "年份" },
          ]}
          onChange={onSortModeChange}
        />
        {isNativeApp() ? (
          <>
            <NativeSwitchRow
              title="滚动触觉"
              checked={hapticOn}
              onChange={(checked) =>
                handleHapticToggle(checked ? "on" : "off")
              }
            />
            <NativeSwitchRow
              title="滚动声音"
              checked={soundOn}
              onChange={(checked) =>
                handleSoundToggle(checked ? "on" : "off")
              }
            />
          </>
        ) : (
          <>
            <OptionGroup
              title="滚动触觉"
              value={hapticOn ? "on" : "off"}
              options={[
                { id: "on", label: "开启" },
                { id: "off", label: "关闭" },
              ]}
              onChange={handleHapticToggle}
            />
            <OptionGroup
              title="滚动声音"
              value={soundOn ? "on" : "off"}
              options={[
                { id: "on", label: "开启" },
                { id: "off", label: "关闭" },
              ]}
              onChange={handleSoundToggle}
            />
          </>
        )}
        {isNativeApp() ? (
          <NativeDataSection />
        ) : (
          <p className={`library-settings-sync is-${syncStatus}`} role="status">
            {syncStatus === "idle"
              ? "正在读取云端设置…"
              : syncStatus === "saving"
              ? "正在同步到云端…"
              : syncStatus === "offline"
                ? "已保存在本机，联网后再同步"
                : "已在手机和电脑间同步"}
          </p>
        )}
      </motion.section>
    </>
  );
}

/* ── native-only data management section ──── */

function NativeDataSection() {
  const [busy, setBusy] = useState<
    "idle" | "exporting" | "importing" | "done" | "error"
  >("idle");
  const [message, setMessage] = useState("");
  const albumCount = getCachedAlbums()?.length ?? 0;

  async function handleExport() {
    setBusy("exporting");
    setMessage("");
    try {
      const filename = `vinylshop-backup-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      const result = await Filesystem.writeFile({
        path: filename,
        data: exportLibraryJson(),
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });
      await Share.share({
        title: "唱片库备份",
        files: [result.uri],
      });
      setBusy("done");
      setMessage("备份已生成，可存入“文件”或 iCloud Drive");
    } catch {
      setBusy("error");
      setMessage("导出失败，请重试");
    }
  }

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy("importing");
    setMessage("");
    try {
      const result = importLibraryJson(await file.text());
      setBusy("done");
      setMessage(
        `已恢复 ${result.total} 张：新增 ${result.added}，更新 ${result.updated}`,
      );
      window.setTimeout(() => window.location.reload(), 700);
    } catch {
      setBusy("error");
      setMessage("无法读取这个备份文件");
    } finally {
      event.target.value = "";
    }
  }

  return (
    <div className="library-settings-native-data">
      <p className="library-settings-sync is-saved" role="status">
        📱 数据存储在本机 · {albumCount} 张唱片
      </p>
      <div className="library-settings-actions">
        <button
          type="button"
          onClick={() => void handleExport()}
          disabled={busy === "exporting"}
          className="settings-action-btn"
        >
          {busy === "exporting" ? "正在导出…" : "导出到文件 / iCloud"}
        </button>
        <label className="settings-action-btn">
          {busy === "importing" ? "正在导入…" : "从备份恢复"}
          <input
            type="file"
            accept="application/json,.json"
            onChange={(event) => void handleImport(event)}
            disabled={busy === "importing"}
            hidden
          />
        </label>
      </div>
      {message && (
        <p
          className={`library-settings-sync is-${
            busy === "error" ? "offline" : "saved"
          }`}
          role={busy === "error" ? "alert" : "status"}
        >
          {message}
        </p>
      )}
    </div>
  );
}
