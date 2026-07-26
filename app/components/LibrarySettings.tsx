"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type {
  GalleryDisplayMode,
  LibraryFormatFilter,
  LibrarySortMode,
} from "../lib/library-preferences";
import { getInteractionFeedback } from "../lib/interaction-feedback";
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
        <p className={`library-settings-sync is-${syncStatus}`} role="status">
          {syncStatus === "idle"
            ? "正在读取云端设置…"
            : syncStatus === "saving"
            ? "正在同步到云端…"
            : syncStatus === "offline"
              ? "已保存在本机，联网后再同步"
              : "已在手机和电脑间同步"}
        </p>
      </motion.section>
    </>
  );
}
