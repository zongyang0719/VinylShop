"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import "./OptionWheel.css";

type OptionWheelProps = {
  items: string[];
  selected: number;
  onChange: (index: number, item: string) => void;
  className?: string;
};

const ROW_HEIGHT = 43;
const TILT_RADIANS = 0.155;
const CURVE_RADIUS = ROW_HEIGHT / TILT_RADIANS;
const MAX_ANGLE = Math.PI / 2;

export default function OptionWheel({
  items,
  selected,
  onChange,
  className = "",
}: OptionWheelProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const positionRef = useRef(selected);
  const targetRef = useRef(selected);
  const selectedRef = useRef(selected);
  const frameRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);
  const wheelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reducedMotionRef = useRef(false);
  const dragRef = useRef<{
    pointerId: number;
    startY: number;
    startPosition: number;
    moved: boolean;
  } | null>(null);

  const renderWheel = useCallback((position: number) => {
    itemRefs.current.forEach((element, index) => {
      if (!element) return;
      const distance = index - position;
      const absoluteDistance = Math.abs(distance);
      const angle = Math.min(
        Math.max(distance * TILT_RADIANS, -MAX_ANGLE),
        MAX_ANGLE,
      );
      const y = CURVE_RADIUS * Math.sin(angle);
      const x = -CURVE_RADIUS * (1 - Math.cos(angle)) * 0.7;
      const rotation = angle * (180 / Math.PI) * 0.22;
      const proximity = Math.max(0, 1 - Math.min(absoluteDistance, 1));
      const opacity = Math.max(0.12, 1 - absoluteDistance * 0.12);
      const blur = Math.max(0, absoluteDistance - 2.4) * 0.34;
      const scale = Math.max(0.78, 1 - absoluteDistance * 0.035);

      element.style.transform = `translate3d(${x.toFixed(2)}px, calc(${y.toFixed(
        2,
      )}px - 50%), 0) rotate(${rotation.toFixed(2)}deg) scale(${scale.toFixed(
        3,
      )})`;
      element.style.opacity = absoluteDistance > 7 ? "0" : opacity.toFixed(3);
      element.style.filter = `blur(${blur.toFixed(2)}px)`;
      element.style.pointerEvents = absoluteDistance > 6 ? "none" : "auto";
      element.style.setProperty("--ow-proximity", proximity.toFixed(3));
    });
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => {
      reducedMotionRef.current = media.matches;
    };
    syncPreference();
    media.addEventListener("change", syncPreference);
    return () => media.removeEventListener("change", syncPreference);
  }, []);

  const runFrame = useCallback(
    function animateWheel(now: number) {
      const delta = Math.min((now - lastFrameRef.current) / 1000, 0.05);
      lastFrameRef.current = now;
      const difference = targetRef.current - positionRef.current;
      const response = reducedMotionRef.current
        ? 1
        : 1 - Math.exp(-delta / 0.16);
      positionRef.current += difference * response;
      const settled = Math.abs(targetRef.current - positionRef.current) < 0.001;
      if (settled) positionRef.current = targetRef.current;
      renderWheel(positionRef.current);
      frameRef.current = settled
        ? null
        : requestAnimationFrame(animateWheel);
    },
    [renderWheel],
  );

  const startLoop = useCallback(() => {
    if (frameRef.current !== null) return;
    lastFrameRef.current = performance.now();
    frameRef.current = requestAnimationFrame(runFrame);
  }, [runFrame]);

  const applyTarget = useCallback(
    (value: number, notify: boolean) => {
      const next = Math.min(Math.max(value, 0), Math.max(items.length - 1, 0));
      targetRef.current = next;
      if (notify) {
        const nextIndex = Math.round(next);
        targetRef.current = nextIndex;
        if (nextIndex !== selectedRef.current) {
          selectedRef.current = nextIndex;
          onChange(nextIndex, items[nextIndex]);
        }
      }
      startLoop();
    },
    [items, onChange, startLoop],
  );

  useEffect(() => {
    selectedRef.current = selected;
    targetRef.current = selected;
    startLoop();
  }, [selected, startLoop]);

  useEffect(() => {
    renderWheel(positionRef.current);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
    };
  }, [items, renderWheel]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const delta =
        Math.abs(event.deltaY) >= Math.abs(event.deltaX)
          ? event.deltaY
          : event.deltaX;
      const step = Math.max(-1, Math.min(1, delta / ROW_HEIGHT));
      applyTarget(targetRef.current + step, false);
      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
      wheelTimerRef.current = setTimeout(
        () => applyTarget(targetRef.current, true),
        130,
      );
    };
    root.addEventListener("wheel", handleWheel, { passive: false });
    return () => root.removeEventListener("wheel", handleWheel);
  }, [applyTarget]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const delta =
      event.key === "ArrowUp"
        ? -1
        : event.key === "ArrowDown"
          ? 1
          : null;
    if (delta === null) return;
    event.preventDefault();
    applyTarget(Math.round(targetRef.current) + delta, true);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startPosition: targetRef.current,
      moved: false,
    };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const distance = drag.startY - event.clientY;
    if (!drag.moved && Math.abs(distance) > 5) {
      drag.moved = true;
      rootRef.current?.setPointerCapture(event.pointerId);
    }
    if (drag.moved) {
      applyTarget(drag.startPosition + distance / ROW_HEIGHT, false);
    }
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.moved) applyTarget(targetRef.current, true);
    dragRef.current = null;
    if (rootRef.current?.hasPointerCapture(event.pointerId)) {
      rootRef.current.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <div
      ref={rootRef}
      role="listbox"
      tabIndex={0}
      aria-label="按艺人浏览"
      className={`option-wheel${className ? ` ${className}` : ""}`}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      {items.map((label, index) => (
        <button
          key={`${label}-${index}`}
          ref={(element) => {
            itemRefs.current[index] = element;
          }}
          type="button"
          role="option"
          aria-selected={selected === index}
          className={`option-wheel__item${
            selected === index ? " option-wheel__item--selected" : ""
          }`}
          onClick={() => {
            if (!dragRef.current?.moved) applyTarget(index, true);
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
