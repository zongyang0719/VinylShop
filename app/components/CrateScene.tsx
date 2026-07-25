"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { RecordBox } from "./RecordBox";
import type { Album } from "@/app/lib/store";

const TRACK_SPACING = 3.65;
const TRACK_ORIGIN = -2;

type CrateSceneProps = {
  albums: Album[];
  onInspect: (album: Album) => void;
  activeIndex: number;
  onActiveIndexChange: (idx: number) => void;
};

function clampIndex(value: number, count: number) {
  return Math.min(Math.max(value, 0), Math.max(count - 1, 0));
}

function CrateRecords({
  albums,
  onInspect,
  activeIndex,
  onActiveIndexChange,
}: CrateSceneProps) {
  const { gl } = useThree();
  const targetIndexRef = useRef(activeIndex);
  const currentIndexRef = useRef(activeIndex);
  const activeIndexRef = useRef(activeIndex);
  const dragRef = useRef<{
    pointerId: number;
    startY: number;
    startIndex: number;
    moved: boolean;
  } | null>(null);

  const commitIndex = useCallback(
    (value: number) => {
      const next = clampIndex(Math.round(value), albums.length);
      if (next === activeIndexRef.current) return;
      activeIndexRef.current = next;
      onActiveIndexChange(next);
    },
    [albums.length, onActiveIndexChange],
  );

  useEffect(() => {
    const next = clampIndex(activeIndex, albums.length);
    targetIndexRef.current = next;
    activeIndexRef.current = next;
    commitIndex(next);
  }, [activeIndex, albums.length, commitIndex]);

  useEffect(() => {
    const canvas = gl.domElement;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX)
        ? event.deltaY
        : event.deltaX;
      targetIndexRef.current = clampIndex(
        targetIndexRef.current +
          Math.sign(delta) * Math.min(Math.abs(delta) / 150, 0.72),
        albums.length,
      );
      commitIndex(targetIndexRef.current);
    };

    const onPointerDown = (event: PointerEvent) => {
      canvas.focus({ preventScroll: true });
      dragRef.current = {
        pointerId: event.pointerId,
        startY: event.clientY,
        startIndex: targetIndexRef.current,
        moved: false,
      };
      canvas.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const distance = drag.startY - event.clientY;
      if (Math.abs(distance) > 8) drag.moved = true;
      targetIndexRef.current = clampIndex(
        drag.startIndex + distance / 92,
        albums.length,
      );
      commitIndex(targetIndexRef.current);
    };

    const onPointerUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      targetIndexRef.current = clampIndex(
        Math.round(targetIndexRef.current),
        albums.length,
      );
      commitIndex(targetIndexRef.current);
      dragRef.current = null;
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const delta =
        event.key === "ArrowUp"
          ? -1
          : event.key === "ArrowDown"
            ? 1
            : event.key === "PageUp"
              ? -3
              : event.key === "PageDown"
                ? 3
                : 0;
      if (!delta) return;
      event.preventDefault();
      targetIndexRef.current = clampIndex(
        Math.round(targetIndexRef.current) + delta,
        albums.length,
      );
      commitIndex(targetIndexRef.current);
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("keydown", onKeyDown);

    return () => {
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("keydown", onKeyDown);
    };
  }, [albums.length, commitIndex, gl]);

  useFrame((_, delta) => {
    const response = 1 - Math.exp(-delta / 0.14);
    currentIndexRef.current +=
      (targetIndexRef.current - currentIndexRef.current) * response;
  });

  return (
    <group>
      {albums.map((album, index) => {
        const isActive = index === activeIndex;
        return (
          <RecordBox
            key={album.id}
            album={album}
            index={index}
            progressRef={currentIndexRef}
            trackOrigin={TRACK_ORIGIN}
            trackSpacing={TRACK_SPACING}
            visible={Math.abs(index - activeIndex) <= 7}
            active={isActive}
            onClick={() => {
              if (dragRef.current?.moved) return;
              if (index === activeIndexRef.current) {
                onInspect(album);
                return;
              }
              targetIndexRef.current = index;
              commitIndex(index);
            }}
          />
        );
      })}
    </group>
  );
}

export function CrateScene(props: CrateSceneProps) {
  const [wide, setWide] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 801px)").matches,
  );

  useEffect(() => {
    const query = window.matchMedia("(min-width: 801px)");
    const onChange = (event: MediaQueryListEvent) => setWide(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return (
    <Canvas
      key={wide ? "wide" : "phone"}
      dpr={[1, 1.6]}
      tabIndex={0}
      aria-label="3D 唱片浏览。上下滚动、拖动或使用方向键挑选，点击当前唱片打开详情。"
      camera={{
        fov: wide ? 6.2 : 11.5,
        near: 0.1,
        far: 140,
        position: [0, wide ? 3.5 : 7, 40],
      }}
      onCreated={({ camera }) =>
        camera.lookAt(0, 0, wide ? 6.7 : 6.5)
      }
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      }}
      style={{
        width: "100%",
        height: "100%",
        background: "#99938b",
        touchAction: "none",
      }}
    >
      <color attach="background" args={["#99938b"]} />
      <fog attach="fog" args={["#99938b", 48, 75]} />
      <ambientLight intensity={1.75} />
      <directionalLight position={[3, 8, 7]} intensity={2.1} />
      <directionalLight
        position={[-4, 3, 2]}
        intensity={0.55}
        color="#d8d1c8"
      />
      <Suspense fallback={null}>
        <CrateRecords {...props} />
      </Suspense>
    </Canvas>
  );
}
