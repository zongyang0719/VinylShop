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

const RECORD_SIZE = 3.3;
const RECORD_DEPTH = 0.05;

type CrateGroupItem = { album: Album; groupIdx: number };

type CrateSceneProps = {
  flatAlbums: CrateGroupItem[];
  onInspect: (album: Album) => void;
  activeArtistIdx: number;
  onActiveChange: (idx: number) => void;
  onAlbumChange: (idx: number) => void;
  groupStarts: number[];
};

function clampIndex(value: number, count: number) {
  return Math.min(Math.max(value, 0), Math.max(count - 1, 0));
}

function CrateRecords({
  flatAlbums,
  onInspect,
  activeArtistIdx,
  onActiveChange,
  onAlbumChange,
  groupStarts,
}: CrateSceneProps) {
  const { gl } = useThree();
  const targetIndexRef = useRef(0);
  const currentIndexRef = useRef(0);
  const activeIndexRef = useRef(0);
  const dragRef = useRef<{
    pointerId: number;
    startY: number;
    startIndex: number;
    moved: boolean;
  } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const commitIndex = useCallback(
    (value: number) => {
      const next = clampIndex(Math.round(value), flatAlbums.length);
      if (next === activeIndexRef.current) return;
      activeIndexRef.current = next;
      setActiveIndex(next);
      onAlbumChange(next);
      const groupIndex = flatAlbums[next]?.groupIdx;
      if (groupIndex !== undefined && groupIndex !== activeArtistIdx) {
        onActiveChange(groupIndex);
      }
    },
    [
      activeArtistIdx,
      flatAlbums,
      onActiveChange,
      onAlbumChange,
    ],
  );

  useEffect(() => {
    const next = clampIndex(
      groupStarts[activeArtistIdx] ?? 0,
      flatAlbums.length,
    );
    targetIndexRef.current = next;
    commitIndex(next);
  }, [activeArtistIdx, commitIndex, flatAlbums.length, groupStarts]);

  useEffect(() => {
    const canvas = gl.domElement;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX)
        ? event.deltaY
        : event.deltaX;
      targetIndexRef.current = clampIndex(
        targetIndexRef.current + delta / 180,
        flatAlbums.length,
      );
      commitIndex(targetIndexRef.current);
    };

    const onPointerDown = (event: PointerEvent) => {
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
        drag.startIndex + distance / 74,
        flatAlbums.length,
      );
      commitIndex(targetIndexRef.current);
    };

    const onPointerUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      targetIndexRef.current = clampIndex(
        Math.round(targetIndexRef.current),
        flatAlbums.length,
      );
      commitIndex(targetIndexRef.current);
      dragRef.current = null;
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);

    return () => {
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
    };
  }, [commitIndex, flatAlbums.length, gl]);

  useFrame((_, delta) => {
    const response = 1 - Math.exp(-delta / 0.16);
    currentIndexRef.current +=
      (targetIndexRef.current - currentIndexRef.current) * response;
  });

  return (
    <group position={[0.15, -0.15, 0]}>
      {flatAlbums.map((item, index) => {
        const relative = index - activeIndex;
        const distance = Math.abs(relative);
        const visible = distance < 15;
        const isActive = index === activeIndex;
        const x = isActive
          ? 0.48
          : -0.48 + Math.sign(relative || 1) * Math.min(distance, 8) * 0.035;
        const y = isActive ? 0.1 : distance * 0.024;
        const z = isActive ? 0.5 : -0.25 - distance * 0.075;
        const rotationY = isActive ? -0.08 : -0.16 + relative * 0.006;
        const rotationZ = isActive ? -0.018 : relative * 0.004;

        return (
          <RecordBox
            key={item.album.id}
            coverUrl={item.album.coverUrl}
            title={item.album.title}
            position={[x, y, z]}
            rotation={[0, rotationY, rotationZ]}
            visible={visible}
            active={isActive}
            onClick={() => {
              const drag = dragRef.current;
              if (!drag?.moved) onInspect(item.album);
            }}
          />
        );
      })}
    </group>
  );
}

export function CrateScene(props: CrateSceneProps) {
  const [compact, setCompact] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 720px)").matches,
  );

  useEffect(() => {
    const query = window.matchMedia("(max-width: 720px)");
    const onChange = (event: MediaQueryListEvent) => setCompact(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return (
    <Canvas
      key={compact ? "compact" : "wide"}
      dpr={[1, 1.6]}
      camera={{
        fov: compact ? 42 : 34,
        near: 0.1,
        far: 60,
        position: compact ? [4.9, 4.2, 7.5] : [5.1, 4.7, 7.2],
      }}
      onCreated={({ camera }) => camera.lookAt(0, 0, -0.35)}
      gl={{ antialias: true, alpha: true }}
      style={{
        width: "100%",
        height: "100%",
        background: "transparent",
        touchAction: "none",
      }}
    >
      <ambientLight intensity={1.65} />
      <directionalLight position={[4, 7, 6]} intensity={2.4} />
      <directionalLight
        position={[-5, 2, 4]}
        intensity={0.8}
        color="#b8c6df"
      />
      <pointLight position={[2, 1, 5]} intensity={0.7} color="#f8efe4" />

      <Suspense fallback={null}>
        <CrateRecords {...props} />
      </Suspense>

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -RECORD_SIZE / 2 - 0.06, -0.8]}
        receiveShadow
      >
        <planeGeometry args={[18, 18]} />
        <meshStandardMaterial color="#09090b" roughness={0.88} />
      </mesh>

      <mesh position={[0, 0, -2.1]}>
        <boxGeometry args={[5.1, 0.12, RECORD_DEPTH]} />
        <meshStandardMaterial color="#18181b" roughness={0.6} />
      </mesh>
    </Canvas>
  );
}
