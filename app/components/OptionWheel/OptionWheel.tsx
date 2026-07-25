"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import "./OptionWheel.css";

type OptionWheelProps = {
  items: string[];
  selected?: number;
  defaultSelected?: number;
  onChange?: (index: number, item: string) => void;
  textColor?: string;
  activeColor?: string;
  side?: "left" | "right";
  fontSize?: number;
  spacing?: number;
  curve?: number;
  tilt?: number;
  blur?: number;
  fade?: number;
  minOpacity?: number;
  smoothing?: number;
  inset?: number;
  loop?: boolean;
  draggable?: boolean;
  soundUrl?: string;
  soundVolume?: number;
  haptics?: boolean;
  className?: string;
};

type WheelConfig = {
  count: number;
  items: string[];
  rowHeight: number;
  curve: number;
  tilt: number;
  blur: number;
  fade: number;
  minOpacity: number;
  side: "left" | "right";
  loop: boolean;
  smoothing: number;
  draggable: boolean;
  soundUrl: string;
  soundVolume: number;
  haptics: boolean;
};

type WheelStyle = CSSProperties & {
  "--ow-text-color": string;
  "--ow-active-color": string;
  "--ow-font-size": string;
  "--ow-inset": string;
};

function clampIndex(index: number, count: number) {
  return Math.min(Math.max(Math.round(index), 0), Math.max(count - 1, 0));
}

function wrapIndex(index: number, count: number) {
  if (count <= 0) return 0;
  return ((Math.round(index) % count) + count) % count;
}

export default function OptionWheel({
  items,
  selected,
  defaultSelected = 0,
  onChange,
  textColor = "#a6a6a6",
  activeColor = "#ffffff",
  side = "left",
  fontSize = 3,
  spacing = 1.4,
  curve = 1,
  tilt = 6,
  blur = 2,
  fade = 0.25,
  minOpacity = 0.05,
  smoothing = 200,
  inset = 80,
  loop = false,
  draggable = true,
  soundUrl = "",
  soundVolume = 0.5,
  haptics = true,
  className = "",
}: OptionWheelProps) {
  const initialIndex = clampIndex(selected ?? defaultSelected, items.length);
  const rootRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const positionRef = useRef(initialIndex);
  const targetRef = useRef(initialIndex);
  const selectedRef = useRef(initialIndex);
  const configRef = useRef<WheelConfig>({
    count: items.length,
    items,
    rowHeight: 1,
    curve,
    tilt,
    blur,
    fade,
    minOpacity,
    side,
    loop,
    smoothing,
    draggable,
    soundUrl,
    soundVolume,
    haptics,
  });
  const onChangeRef = useRef(onChange);
  const frameRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);
  const wheelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reducedMotionRef = useRef(false);
  const dragRef = useRef<{
    pointerId: number;
    startY: number;
    startPosition: number;
  } | null>(null);
  const dragMovedRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef("");
  const hapticLabelRef = useRef<HTMLLabelElement | null>(null);
  const lastFeedbackRef = useRef(0);
  const hapticId = `option-wheel-haptic-${useId().replaceAll(":", "")}`;
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const [isDragging, setIsDragging] = useState(false);

  const rootFontSize =
    typeof window === "undefined"
      ? 16
      : Number.parseFloat(
          window.getComputedStyle(document.documentElement).fontSize,
        ) || 16;

  onChangeRef.current = onChange;
  configRef.current = {
    count: items.length,
    items,
    rowHeight: Math.max(fontSize * spacing * rootFontSize, 1),
    curve,
    tilt,
    blur,
    fade,
    minOpacity,
    side,
    loop,
    smoothing,
    draggable,
    soundUrl,
    soundVolume,
    haptics,
  };

  const renderWheel = useCallback((position: number) => {
    const config = configRef.current;
    const count = config.count;
    const mirror = config.side === "right" ? -1 : 1;
    const tiltRadians = (config.tilt * Math.PI) / 180;
    const radius =
      Math.abs(tiltRadians) > 0.0005
        ? config.rowHeight / Math.abs(tiltRadians)
        : 0;

    itemRefs.current.forEach((element, index) => {
      if (!element) return;
      let distance = index - position;
      if (config.loop && count > 1) {
        distance = ((distance % count) + count) % count;
        if (distance > count / 2) distance -= count;
      }

      const absoluteDistance = Math.abs(distance);
      let x = 0;
      let y = distance * config.rowHeight;
      let rotation = 0;
      if (radius > 0) {
        const angle = Math.min(
          Math.max(distance * tiltRadians, -Math.PI / 2),
          Math.PI / 2,
        );
        y = radius * Math.sin(angle);
        x =
          -mirror *
          radius *
          (1 - Math.cos(angle)) *
          Math.max(config.curve, 0);
        rotation = mirror * angle * (180 / Math.PI);
      }

      const proximity = Math.max(0, 1 - Math.min(absoluteDistance, 1));
      const opacity = Math.max(
        config.minOpacity,
        1 - absoluteDistance * config.fade,
      );
      element.style.transform = `translate3d(${x.toFixed(
        2,
      )}px, calc(${y.toFixed(2)}px - 50%), 0) rotate(${rotation.toFixed(
        3,
      )}deg)`;
      element.style.opacity =
        absoluteDistance > 10 ? "0" : opacity.toFixed(3);
      element.style.filter =
        config.blur > 0
          ? `blur(${(absoluteDistance * config.blur).toFixed(2)}px)`
          : "none";
      element.style.pointerEvents =
        absoluteDistance > 8 ? "none" : "auto";
      element.style.setProperty("--ow-proximity", proximity.toFixed(4));
    });
  }, []);

  const runFrame = useCallback(
    function animateWheel(now: number) {
      const delta = Math.min((now - lastFrameRef.current) / 1000, 0.05);
      lastFrameRef.current = now;
      const difference = targetRef.current - positionRef.current;
      const response = reducedMotionRef.current
        ? 1
        : 1 -
          Math.exp(
            -delta / (Math.max(configRef.current.smoothing, 1) / 1000),
          );
      let nextPosition = positionRef.current + difference * response;
      const settled = Math.abs(targetRef.current - nextPosition) < 0.001;
      if (settled) nextPosition = targetRef.current;
      positionRef.current = nextPosition;
      renderWheel(nextPosition);
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

  const playFeedback = useCallback(() => {
    const config = configRef.current;
    const now = performance.now();
    if (now - lastFeedbackRef.current < 48) return;
    lastFeedbackRef.current = now;

    if (config.haptics) {
      if (typeof navigator.vibrate === "function") {
        navigator.vibrate(6);
      } else {
        hapticLabelRef.current?.click();
      }
    }

    if (!config.soundUrl) return;
    if (!audioRef.current || audioUrlRef.current !== config.soundUrl) {
      audioRef.current = new Audio(config.soundUrl);
      audioRef.current.preload = "auto";
      audioUrlRef.current = config.soundUrl;
    }
    const audio = audioRef.current;
    audio.volume = Math.min(Math.max(config.soundVolume, 0), 1);
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }, []);

  const applyTarget = useCallback(
    (value: number, snap: boolean, userInitiated = true) => {
      const config = configRef.current;
      if (config.count === 0) return;
      let nextTarget = value;
      if (!config.loop) {
        nextTarget = Math.min(
          Math.max(nextTarget, 0),
          Math.max(config.count - 1, 0),
        );
      }
      if (snap) nextTarget = Math.round(nextTarget);
      targetRef.current = nextTarget;

      const nextIndex = config.loop
        ? wrapIndex(nextTarget, config.count)
        : clampIndex(nextTarget, config.count);
      if (nextIndex !== selectedRef.current) {
        selectedRef.current = nextIndex;
        setSelectedIndex(nextIndex);
        if (userInitiated) {
          onChangeRef.current?.(nextIndex, config.items[nextIndex]);
          playFeedback();
        }
      }
      startLoop();
    },
    [playFeedback, startLoop],
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => {
      reducedMotionRef.current = media.matches;
    };
    syncPreference();
    media.addEventListener("change", syncPreference);
    return () => media.removeEventListener("change", syncPreference);
  }, []);

  useEffect(() => {
    if (!haptics) return;
    const input = document.createElement("input");
    input.type = "checkbox";
    input.id = hapticId;
    input.setAttribute("switch", "");
    input.style.display = "none";

    const label = document.createElement("label");
    label.htmlFor = hapticId;
    label.style.display = "none";
    label.setAttribute("aria-hidden", "true");
    label.appendChild(input);
    document.body.appendChild(label);
    hapticLabelRef.current = label;

    return () => {
      label.remove();
      hapticLabelRef.current = null;
    };
  }, [hapticId, haptics]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const delta =
        Math.abs(event.deltaY) >= Math.abs(event.deltaX)
          ? event.deltaY
          : event.deltaX;
      const step = Math.max(
        -1,
        Math.min(1, delta / configRef.current.rowHeight),
      );
      applyTarget(targetRef.current + step, false);
      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
      wheelTimerRef.current = setTimeout(
        () => applyTarget(targetRef.current, true),
        140,
      );
    };
    root.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      root.removeEventListener("wheel", handleWheel);
      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
    };
  }, [applyTarget]);

  useEffect(() => {
    const nextIndex =
      selected === undefined
        ? selectedRef.current
        : loop
          ? wrapIndex(selected, items.length)
          : clampIndex(selected, items.length);
    if (nextIndex !== selectedRef.current) {
      selectedRef.current = nextIndex;
      setSelectedIndex(nextIndex);
      targetRef.current = nextIndex;
    }
    startLoop();
  }, [items, loop, selected, startLoop]);

  useEffect(() => {
    itemRefs.current.length = items.length;
    renderWheel(positionRef.current);
    startLoop();
  }, [
    items,
    fontSize,
    spacing,
    curve,
    tilt,
    blur,
    fade,
    minOpacity,
    side,
    loop,
    smoothing,
    renderWheel,
    startLoop,
  ]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
      audioRef.current?.pause();
    },
    [],
  );

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const delta =
      event.key === "ArrowUp" || event.key === "ArrowLeft"
        ? -1
        : event.key === "ArrowDown" || event.key === "ArrowRight"
          ? 1
          : null;
    if (delta === null) return;
    event.preventDefault();
    applyTarget(Math.round(targetRef.current) + delta, true);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!configRef.current.draggable) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startPosition: targetRef.current,
    };
    dragMovedRef.current = false;
    setIsDragging(true);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const distance = drag.startY - event.clientY;
    if (!dragMovedRef.current && Math.abs(distance) > 4) {
      dragMovedRef.current = true;
      rootRef.current?.setPointerCapture(event.pointerId);
    }
    if (dragMovedRef.current) {
      applyTarget(
        drag.startPosition + distance / configRef.current.rowHeight,
        false,
      );
    }
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (dragMovedRef.current) applyTarget(targetRef.current, true);
    dragRef.current = null;
    setIsDragging(false);
    if (rootRef.current?.hasPointerCapture(event.pointerId)) {
      rootRef.current.releasePointerCapture(event.pointerId);
    }
  }

  function handleItemClick(index: number) {
    if (dragMovedRef.current) return;
    const config = configRef.current;
    const current = targetRef.current;
    let distance =
      index - (config.loop ? wrapIndex(current, config.count) : current);
    if (config.loop && config.count > 1) {
      if (distance > config.count / 2) distance -= config.count;
      if (distance < -config.count / 2) distance += config.count;
    }
    applyTarget(current + distance, true);
  }

  const wheelStyle: WheelStyle = {
    "--ow-text-color": textColor,
    "--ow-active-color": activeColor,
    "--ow-font-size": `${fontSize}rem`,
    "--ow-inset": `${inset}px`,
  };

  return (
    <div
      ref={rootRef}
      role="listbox"
      tabIndex={0}
      aria-label="按艺人浏览"
      aria-activedescendant={`${hapticId}-item-${selectedIndex}`}
      className={`option-wheel${
        side === "right" ? " option-wheel--right" : ""
      }${isDragging ? " option-wheel--dragging" : ""}${
        className ? ` ${className}` : ""
      }`}
      style={wheelStyle}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      {items.map((label, index) => (
        <button
          id={`${hapticId}-item-${index}`}
          key={`${label}-${index}`}
          ref={(element) => {
            itemRefs.current[index] = element;
          }}
          type="button"
          role="option"
          aria-selected={selectedIndex === index}
          className={`option-wheel__item${
            selectedIndex === index ? " option-wheel__item--selected" : ""
          }`}
          onClick={() => handleItemClick(index)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
