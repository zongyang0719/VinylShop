"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import {
  LinearFilter,
  MathUtils,
  SRGBColorSpace,
  TextureLoader,
  type Group,
  type Texture,
} from "three";

const BOX_W = 3.3;
const BOX_H = 3.3;
const BOX_D = 0.05;

type RecordBoxProps = {
  coverUrl: string;
  title: string;
  position: [number, number, number];
  rotation: [number, number, number];
  visible?: boolean;
  active?: boolean;
  onClick?: () => void;
};

function proxyCoverUrl(url: string) {
  if (url.startsWith("/")) return url;
  return `/api/douban?img=${encodeURIComponent(url)}`;
}

export function RecordBox({
  coverUrl,
  title,
  position,
  rotation,
  visible = true,
  active = false,
  onClick,
}: RecordBoxProps) {
  const groupRef = useRef<Group>(null);
  const [hovered, setHovered] = useState(false);
  const [texture, setTexture] = useState<Texture | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loader = new TextureLoader();
    let loadedTexture: Texture | null = null;

    loader.load(
      proxyCoverUrl(coverUrl),
      (nextTexture) => {
        if (cancelled) {
          nextTexture.dispose();
          return;
        }
        nextTexture.minFilter = LinearFilter;
        nextTexture.generateMipmaps = false;
        nextTexture.colorSpace = SRGBColorSpace;
        loadedTexture = nextTexture;
        setTexture(nextTexture);
      },
      undefined,
      () => {
        if (!cancelled) setTexture(null);
      },
    );

    return () => {
      cancelled = true;
      loadedTexture?.dispose();
    };
  }, [coverUrl]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const response = 1 - Math.exp(-delta / 0.18);
    const hoverLift = hovered && active ? 0.14 : 0;
    group.position.x = MathUtils.lerp(group.position.x, position[0], response);
    group.position.y = MathUtils.lerp(group.position.y, position[1] + hoverLift, response);
    group.position.z = MathUtils.lerp(group.position.z, position[2] + hoverLift, response);
    group.rotation.x = MathUtils.lerp(group.rotation.x, rotation[0], response);
    group.rotation.y = MathUtils.lerp(group.rotation.y, rotation[1], response);
    group.rotation.z = MathUtils.lerp(group.rotation.z, rotation[2], response);
    group.scale.setScalar(
      MathUtils.lerp(group.scale.x, active ? 1 : 0.985, response),
    );
  });

  const edgeColor = useMemo(() => {
    const palette = ["#171719", "#252528", "#313136", "#404046", "#202024"];
    const hash =
      title.split("").reduce((total, char) => total + char.charCodeAt(0), 0) %
      palette.length;
    return palette[hash];
  }, [title]);

  return (
    <group
      ref={groupRef}
      position={position}
      rotation={rotation}
      visible={visible}
    >
      <mesh
        onClick={(event) => {
          event.stopPropagation();
          if (event.delta < 6) onClick?.();
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "";
        }}
      >
        <boxGeometry args={[BOX_W, BOX_H, BOX_D]} />
        <meshStandardMaterial color={edgeColor} roughness={0.72} />
      </mesh>
      <mesh
        position={[0, 0, BOX_D / 2 + 0.002]}
        onClick={(event) => {
          event.stopPropagation();
          if (event.delta < 6) onClick?.();
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "";
        }}
      >
        <planeGeometry args={[BOX_W - 0.02, BOX_H - 0.02]} />
        <meshStandardMaterial
          map={texture}
          color={texture ? "#ffffff" : "#242428"}
          roughness={0.68}
        />
      </mesh>
    </group>
  );
}
