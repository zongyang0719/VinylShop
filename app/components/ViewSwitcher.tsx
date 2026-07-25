"use client";

import { motion } from "framer-motion";
import type { ViewMode } from "@/app/lib/store";

type ViewSwitcherProps = {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
};

const spring = {
  type: "spring" as const,
  stiffness: 420,
  damping: 38,
  mass: 0.8,
};

const views: Array<{ id: ViewMode; icon: string; label: string }> = [
  { id: "gallery", icon: "⊞", label: "画廊" },
  { id: "crate", icon: "▤", label: "唱片箱" },
];

export function ViewSwitcher({ mode, onChange }: ViewSwitcherProps) {
  return (
    <div className="view-switcher" aria-label="视图切换">
      {views.map((view) => (
        <button
          key={view.id}
          type="button"
          className={mode === view.id ? "is-active" : ""}
          onClick={() => onChange(view.id)}
          aria-label={view.label}
          title={view.label}
        >
          {mode === view.id && (
            <motion.span
              className="view-highlight"
              layoutId="view-mode"
              transition={spring}
            />
          )}
          <span className="view-icon">{view.icon}</span>
        </button>
      ))}
    </div>
  );
}
