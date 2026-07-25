"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type UIEvent,
} from "react";
import "./OptionWheel.css";

type OptionWheelProps = {
  items: string[];
  selected: number;
  onChange: (index: number, item: string) => void;
  className?: string;
};

const ROW_HEIGHT = 58;

export default function OptionWheel({
  items,
  selected,
  onChange,
  className = "",
}: OptionWheelProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const selectedRef = useRef(selected);

  const selectIndex = useCallback(
    (nextIndex: number, notify: boolean) => {
      const clamped = Math.min(Math.max(nextIndex, 0), items.length - 1);
      if (!Number.isFinite(clamped) || clamped === selectedRef.current) return;
      selectedRef.current = clamped;
      if (notify) onChange(clamped, items[clamped]);
    },
    [items, onChange],
  );

  useEffect(() => {
    selectedRef.current = selected;
    const frame = requestAnimationFrame(() => {
      rootRef.current?.scrollTo({
        top: selected * ROW_HEIGHT,
        behavior: "smooth",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [selected]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    const scrollTop = event.currentTarget.scrollTop;
    frameRef.current = requestAnimationFrame(() => {
      selectIndex(Math.round(scrollTop / ROW_HEIGHT), true);
      frameRef.current = null;
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const delta =
      event.key === "ArrowUp"
        ? -1
        : event.key === "ArrowDown"
          ? 1
          : null;
    if (delta === null) return;
    event.preventDefault();
    const next = Math.min(
      Math.max(selectedRef.current + delta, 0),
      items.length - 1,
    );
    rootRef.current?.scrollTo({
      top: next * ROW_HEIGHT,
      behavior: "smooth",
    });
  }

  return (
    <div
      ref={rootRef}
      role="listbox"
      tabIndex={0}
      aria-label="按艺人浏览"
      className={`option-wheel${className ? ` ${className}` : ""}`}
      onScroll={handleScroll}
      onKeyDown={handleKeyDown}
    >
      <div className="option-wheel__spacer" aria-hidden="true" />
      {items.map((label, index) => {
        const distance = Math.min(Math.abs(index - selected), 5);
        return (
          <button
            key={`${label}-${index}`}
            type="button"
            role="option"
            aria-selected={selected === index}
            className={`option-wheel__item${
              selected === index ? " option-wheel__item--selected" : ""
            }`}
            style={{ "--ow-distance": distance } as CSSProperties}
            onClick={() => {
              rootRef.current?.scrollTo({
                top: index * ROW_HEIGHT,
                behavior: "smooth",
              });
            }}
          >
            {label}
          </button>
        );
      })}
      <div className="option-wheel__spacer" aria-hidden="true" />
    </div>
  );
}
