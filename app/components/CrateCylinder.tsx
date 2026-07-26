"use client";

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  nearestRecordOccurrence,
  recordRackTransform,
  wrapRecordIndex,
} from "./recordRackGeometry";
import { getInteractionFeedback } from "@/app/lib/interaction-feedback";
import type { Album } from "@/app/lib/store";

/* ─── cylinder geometry ──────────────────────────── */
const RANGE = 12;
const PX_PER = 88;

/* inertia constants */
const DECAY_RATE = 6.32; // ≈ 60 * ln(1/0.9)
const MAX_FLING_EXTRA = 4;
const MAX_LEAD = 5; // max items target can lead scroll during wheel input

/* ─── helpers ────────────────────────────────────── */
function proxy(url: string) {
  return url.startsWith("/")
    ? url
    : `/api/douban?img=${encodeURIComponent(url)}`;
}

const PAL = [
  "#24262a",
  "#455161",
  "#6f5a4c",
  "#7f574f",
  "#395d5c",
  "#6d6d72",
];
function seedColor(s: string) {
  return PAL[
    s.split("").reduce((h, c) => h + c.charCodeAt(0), 0) % PAL.length
  ];
}

function textOn(bg: string) {
  const m = bg.match(/\d+/g)?.map(Number);
  if (!m || m.length < 3) return "#f7f7f7";
  return m[0] * 0.2126 + m[1] * 0.7152 + m[2] * 0.0722 > 148
    ? "#111"
    : "#f7f7f7";
}

function sampleCover(img: HTMLImageElement) {
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 16;
    const x = c.getContext("2d", { willReadFrequently: true });
    if (!x) return null;
    x.drawImage(img, 0, 0, 16, 16);
    const d = x.getImageData(0, 0, 16, 16).data;
    let r = 0,
      g = 0,
      b = 0,
      n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 16) continue;
      r += d[i];
      g += d[i + 1];
      b += d[i + 2];
      n++;
    }
    if (!n) return null;
    const f = (v: number) =>
      Math.round(Math.min(Math.max(v / n, 30), 224));
    return `rgb(${f(r)} ${f(g)} ${f(b)})`;
  } catch {
    return null;
  }
}

/* ─── RecordSlot — single 3D record box ──────────── */
const Slot = memo(function Slot({ album }: { album: Album }) {
  const [bg, setBg] = useState(() =>
    seedColor(album.title + album.artist),
  );
  const fg = textOn(bg);
  const artist = album.artist.replace(/\s*\(\d+\)$/, "").trim();
  const src = proxy(album.coverUrl);

  const onLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const c = sampleCover(e.currentTarget);
      if (c) setBg(c);
    },
    [],
  );

  return (
    <div
      className="cyl-box"
      style={{ "--record-edge": bg } as CSSProperties}
    >
      <div
        className="cyl-spine cyl-spine--top"
        style={{ background: bg }}
        aria-hidden="true"
      />
      <div
        className="cyl-spine cyl-spine--bottom"
        style={{ background: bg, color: fg }}
      >
        <strong>{album.title}</strong>
        <span>{artist}</span>
      </div>
      <div className="cyl-cover cyl-cover--front">
        <img
          src={src}
          alt=""
          loading="lazy"
          crossOrigin="anonymous"
          onLoad={onLoad}
          draggable={false}
        />
      </div>
      <div className="cyl-cover cyl-cover--back">
        <img src={src} alt="" loading="lazy" draggable={false} />
      </div>
      <div
        className="cyl-edge cyl-edge--left"
        style={{ background: bg }}
      />
      <div
        className="cyl-edge cyl-edge--right"
        style={{ background: bg }}
      />
    </div>
  );
});

/* ─── CrateCylinder ──────────────────────────────── */
type Props = {
  albums: Album[];
  onInspect: (album: Album) => void;
  activeIndex: number;
  onActiveIndexChange: (i: number) => void;
  jumpRequest: { index: number; token: number } | null;
};

export function CrateCylinder({
  albums,
  onInspect,
  activeIndex,
  onActiveIndexChange,
  jumpRequest,
}: Props) {
  const vp = useRef<HTMLDivElement>(null);
  const scroll = useRef(activeIndex);
  const target = useRef(activeIndex);
  const activeAlbum = useRef(activeIndex);
  const activeVirtual = useRef(activeIndex);
  const [renderCenter, setRenderCenter] = useState(activeIndex);
  const vel = useRef(0);
  const raf = useRef(0);
  const pt = useRef(0);
  const wake = useRef<() => void>(() => {});
  const drag = useRef<{
    pid: number;
    y0: number;
    s0: number;
    moved: boolean;
    ly: number;
    lt: number;
  } | null>(null);

  /* feedback suppression: true on mount and during programmatic jumps */
  const feedbackSuppressedRef = useRef(true);
  const wheelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reducedMotionRef = useRef(false);

  /* ── commit: detect crossing & fire feedback ── */
  const commit = useCallback(
    (v: number) => {
      if (!albums.length) return;
      const virtualIndex = Math.round(v);
      const albumIndex = wrapRecordIndex(virtualIndex, albums.length);

      if (virtualIndex !== activeVirtual.current) {
        const wasSuppressed = feedbackSuppressedRef.current;
        activeVirtual.current = virtualIndex;
        setRenderCenter(virtualIndex);
        if (!wasSuppressed) {
          getInteractionFeedback().fire("user");
        }
      }
      if (albumIndex !== activeAlbum.current) {
        activeAlbum.current = albumIndex;
        onActiveIndexChange(albumIndex);
      }
    },
    [albums.length, onActiveIndexChange],
  );

  /* ── programmatic jump from OptionWheel ── */
  useEffect(() => {
    if (!albums.length || !jumpRequest) return;
    feedbackSuppressedRef.current = true;
    const normalizedIndex = wrapRecordIndex(
      jumpRequest.index,
      albums.length,
    );
    activeAlbum.current = normalizedIndex;
    target.current = nearestRecordOccurrence(
      normalizedIndex,
      target.current,
      albums.length,
    );
    vel.current = 0;
    wake.current();
  }, [albums.length, jumpRequest]);

  /* ── reduced motion ── */
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      reducedMotionRef.current = media.matches;
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  /* ── animation loop (spring-only, no velocity-based inertia) ── */
  useEffect(() => {
    let running = false;

    const tick = (t: number) => {
      if (!pt.current) pt.current = t;
      const dt = Math.min((t - pt.current) / 1000, 0.05);
      pt.current = t;

      const isDragging = drag.current !== null;
      const tau = isDragging
        ? 0.015
        : reducedMotionRef.current
          ? 0.001
          : 0.065;

      const diff = target.current - scroll.current;
      if (Math.abs(diff) > 0.0002) {
        scroll.current += diff * (1 - Math.exp(-dt / tau));
      } else {
        scroll.current = target.current;
      }

      commit(scroll.current);

      const el = vp.current;
      if (el) {
        for (const c of el.querySelectorAll<HTMLElement>("[data-i]")) {
          const i = Number(c.dataset.i);
          c.style.transform = recordRackTransform(i, scroll.current);
          c.style.opacity = "1";
        }
      }

      const shouldContinue =
        isDragging ||
        Math.abs(target.current - scroll.current) > 0.0002;

      if (shouldContinue) {
        raf.current = requestAnimationFrame(tick);
      } else {
        running = false;
        pt.current = 0;
      }
    };

    const start = () => {
      if (running) return;
      running = true;
      pt.current = 0;
      raf.current = requestAnimationFrame(tick);
    };

    wake.current = start;
    start();

    return () => {
      wake.current = () => {};
      cancelAnimationFrame(raf.current);
    };
  }, [albums.length, commit]);

  /* ── input handlers ── */
  useEffect(() => {
    const el = vp.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      feedbackSuppressedRef.current = false;
      getInteractionFeedback().unlock();

      const d =
        Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;

      if (Math.abs(d) >= 40) {
        /* discrete mouse wheel: one detent = one item */
        target.current = Math.round(target.current) + Math.sign(d);
      } else {
        /* continuous trackpad */
        target.current += d / PX_PER;
      }

      /* clamp lead distance so fast spinning doesn't fly away */
      target.current = Math.max(
        scroll.current - MAX_LEAD,
        Math.min(scroll.current + MAX_LEAD, target.current),
      );

      vel.current = 0;

      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
      wheelTimerRef.current = setTimeout(() => {
        target.current = Math.round(target.current);
        wake.current();
      }, 120);

      wake.current();
    };

    const onDown = (e: PointerEvent) => {
      el.focus({ preventScroll: true });
      feedbackSuppressedRef.current = false;
      getInteractionFeedback().unlock();
      drag.current = {
        pid: e.pointerId,
        y0: e.clientY,
        s0: target.current,
        moved: false,
        ly: e.clientY,
        lt: performance.now(),
      };
      vel.current = 0;
      el.setPointerCapture(e.pointerId);
      wake.current();
    };

    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || d.pid !== e.pointerId) return;
      const dist = d.y0 - e.clientY;
      if (Math.abs(dist) > 6) d.moved = true;

      const now = performance.now();
      const dtS = (now - d.lt) / 1000;
      if (dtS > 0.008) {
        vel.current = (d.ly - e.clientY) / (dtS * PX_PER);
        d.ly = e.clientY;
        d.lt = now;
      }
      target.current = d.s0 + dist / PX_PER;
      wake.current();
    };

    const onUp = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || d.pid !== e.pointerId) return;

      const v = vel.current;

      if (Math.abs(v) > 0.5) {
        /* predict landing from fling velocity; clamp to ±MAX_FLING_EXTRA */
        const predicted = target.current + v / DECAY_RATE;
        const rounded = Math.round(predicted);
        const currentRound = Math.round(scroll.current);
        target.current = Math.max(
          currentRound - MAX_FLING_EXTRA,
          Math.min(currentRound + MAX_FLING_EXTRA, rounded),
        );
      } else {
        target.current = Math.round(target.current);
      }

      vel.current = 0;
      drag.current = null;
      if (el.hasPointerCapture(e.pointerId))
        el.releasePointerCapture(e.pointerId);
      wake.current();
    };

    const onKey = (e: KeyboardEvent) => {
      const delta =
        e.key === "ArrowUp"
          ? -1
          : e.key === "ArrowDown"
            ? 1
            : e.key === "PageUp"
              ? -3
              : e.key === "PageDown"
                ? 3
                : 0;
      if (!delta) return;
      e.preventDefault();
      feedbackSuppressedRef.current = false;
      getInteractionFeedback().unlock();
      target.current = Math.round(target.current) + delta;
      vel.current = 0;
      wake.current();
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("keydown", onKey);
      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
    };
  }, [albums.length, commit]);

  /* ── render ── */
  const visibleRecords = Array.from(
    { length: albums.length ? RANGE * 2 + 1 : 0 },
    (_, offset) => {
      const virtualIndex = renderCenter - RANGE + offset;
      const albumIndex = wrapRecordIndex(virtualIndex, albums.length);
      return {
        album: albums[albumIndex],
        albumIndex,
        virtualIndex,
      };
    },
  ).sort((left, right) => {
    const leftDistance = Math.abs(left.virtualIndex - renderCenter);
    const rightDistance = Math.abs(right.virtualIndex - renderCenter);
    return rightDistance - leftDistance;
  });

  return (
    <div
      ref={vp}
      className="cyl-viewport"
      tabIndex={0}
      aria-label="3D 唱片浏览。可无限循环；上下滚动、拖动或使用方向键挑选，点击当前唱片打开详情。"
    >
      {visibleRecords.map(
        ({ album: a, albumIndex, virtualIndex }) => {
          return (
            <div
              key={`${a.id}:${virtualIndex}`}
              className="cyl-item"
              data-i={virtualIndex}
              data-album-index={albumIndex}
              data-active={
                virtualIndex === renderCenter || undefined
              }
              style={{
                transform: recordRackTransform(
                  virtualIndex,
                  renderCenter,
                ),
              }}
              onClick={() => {
                if (drag.current?.moved) return;
                feedbackSuppressedRef.current = false;
                getInteractionFeedback().unlock();
                if (virtualIndex === activeVirtual.current) {
                  onInspect(a);
                } else {
                  target.current = virtualIndex;
                  vel.current = 0;
                  wake.current();
                }
              }}
            >
              <Slot album={a} />
            </div>
          );
        },
      )}
    </div>
  );
}
