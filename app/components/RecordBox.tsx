"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { useFrame } from "@react-three/fiber";
import {
  CanvasTexture,
  LinearFilter,
  MathUtils,
  MeshBasicMaterial,
  SRGBColorSpace,
  TextureLoader,
  type Group,
  type Texture,
} from "three";
import type { Album } from "@/app/lib/store";

const BOX_W = 3.3;
const BOX_H = 0.05;
const BOX_D = 3.3;

type RecordBoxProps = {
  album: Album;
  index: number;
  progressRef: MutableRefObject<number>;
  trackOrigin: number;
  trackSpacing: number;
  visible?: boolean;
  active?: boolean;
  onClick?: () => void;
};

function proxyCoverUrl(url: string) {
  if (url.startsWith("/")) return url;
  return `/api/douban?img=${encodeURIComponent(url)}`;
}

function fallbackSpineColor(seed: string) {
  const palette = [
    "#24262a",
    "#455161",
    "#6f5a4c",
    "#7f574f",
    "#395d5c",
    "#6d6d72",
  ];
  const hash = seed
    .split("")
    .reduce((total, char) => total + char.charCodeAt(0), 0);
  return palette[hash % palette.length];
}

function sampleImageColor(image: CanvasImageSource) {
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;

  try {
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let red = 0;
    let green = 0;
    let blue = 0;
    let count = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] < 16) continue;
      red += pixels[index];
      green += pixels[index + 1];
      blue += pixels[index + 2];
      count += 1;
    }
    if (!count) return null;
    const channel = (value: number) =>
      Math.round(MathUtils.clamp(value / count, 30, 224));
    return `rgb(${channel(red)} ${channel(green)} ${channel(blue)})`;
  } catch {
    return null;
  }
}

function readableTextColor(background: string) {
  const channels = background.match(/\d+/g)?.map(Number);
  if (!channels || channels.length < 3) return "#f7f7f7";
  const luminance =
    channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return luminance > 148 ? "#111113" : "#f7f7f7";
}

function makeSpineTexture(title: string, artist: string, background: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 1536;
  canvas.height = 72;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const cleanArtist = artist.replace(/\s*\(\d+\)$/, "").trim();
  const textColor = readableTextColor(background);
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.textBaseline = "middle";

  let size = 34;
  const titleFont = (fontSize: number) =>
    `680 ${fontSize}px -apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", sans-serif`;
  const artistFont = (fontSize: number) =>
    `440 ${fontSize}px -apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", sans-serif`;

  const measure = () => {
    context.font = titleFont(size);
    const titleWidth = context.measureText(title).width;
    context.font = artistFont(size);
    const artistWidth = context.measureText(`  ${cleanArtist}`).width;
    return { titleWidth, artistWidth, total: titleWidth + artistWidth };
  };

  let metrics = measure();
  while (metrics.total > canvas.width * 0.9 && size > 20) {
    size -= 2;
    metrics = measure();
  }

  let x = (canvas.width - metrics.total) / 2;
  context.fillStyle = textColor;
  context.font = titleFont(size);
  context.fillText(title, x, canvas.height / 2 + 1);
  x += metrics.titleWidth;
  context.globalAlpha = 0.86;
  context.font = artistFont(size);
  context.fillText(`  ${cleanArtist}`, x, canvas.height / 2 + 1);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export function RecordBox({
  album,
  index,
  progressRef,
  trackOrigin,
  trackSpacing,
  visible = true,
  active = false,
  onClick,
}: RecordBoxProps) {
  const groupRef = useRef<Group>(null);
  const [hovered, setHovered] = useState(false);
  const [texture, setTexture] = useState<Texture | null>(null);
  const [spineColor, setSpineColor] = useState(() =>
    fallbackSpineColor(`${album.title}${album.artist}`),
  );

  useEffect(() => {
    let cancelled = false;
    const loader = new TextureLoader();
    let loadedTexture: Texture | null = null;

    loader.load(
      proxyCoverUrl(album.coverUrl),
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
        const sampledColor = sampleImageColor(nextTexture.image);
        if (sampledColor) setSpineColor(sampledColor);
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
  }, [album.coverUrl]);

  const spineTexture = useMemo(
    () => makeSpineTexture(album.title, album.artist, spineColor),
    [album.artist, album.title, spineColor],
  );

  useEffect(
    () => () => {
      spineTexture?.dispose();
    },
    [spineTexture],
  );

  const boxMaterials = useMemo(() => {
    const edge = () => new MeshBasicMaterial({ color: spineColor });
    return [
      edge(),
      edge(),
      new MeshBasicMaterial({
        color: texture ? "#ffffff" : spineColor,
        map: texture,
      }),
      edge(),
      edge(),
      edge(),
    ];
  }, [spineColor, texture]);

  useEffect(
    () => () => {
      boxMaterials.forEach((material) => material.dispose());
    },
    [boxMaterials],
  );

  const yaw = useMemo(() => {
    const hash = album.id
      .split("")
      .reduce((total, char) => total + char.charCodeAt(0), 0);
    return ((hash % 9) - 4) * 0.0022;
  }, [album.id]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const relative = index - progressRef.current;
    const focus = Math.exp(-relative * relative * 1.8);
    const response = 1 - Math.exp(-delta / 0.13);
    const hoverLift = hovered && active ? 0.08 : 0;
    const targetX = yaw * Math.min(Math.abs(relative), 5) * 1.7;
    const targetY = focus * 0.08 + hoverLift;
    const targetZ = relative * trackSpacing + trackOrigin;
    const perspectiveCompensation = MathUtils.clamp(
      1 - (relative * trackSpacing) / 58,
      0.64,
      1.3,
    );
    group.position.x = MathUtils.lerp(group.position.x, targetX, response);
    group.position.y = MathUtils.lerp(group.position.y, targetY, response);
    group.position.z = MathUtils.lerp(group.position.z, targetZ, response);
    group.rotation.x = MathUtils.lerp(group.rotation.x, 0, response);
    group.rotation.y = MathUtils.lerp(group.rotation.y, yaw, response);
    group.rotation.z = MathUtils.lerp(group.rotation.z, yaw * -0.65, response);
    group.scale.setScalar(
      MathUtils.lerp(
        group.scale.x,
        perspectiveCompensation + focus * 0.18,
        response,
      ),
    );
  });

  return (
    <group
      ref={groupRef}
      position={[0, 0, index * trackSpacing + trackOrigin]}
      visible={visible}
      onClick={(event) => {
        event.stopPropagation();
        if (event.delta < 7) onClick?.();
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
      <mesh material={boxMaterials}>
        <boxGeometry args={[BOX_W, BOX_H, BOX_D]} />
      </mesh>
      {spineTexture && (
        <mesh position={[0, 0, BOX_D / 2 + 0.012]} renderOrder={2}>
          <planeGeometry args={[BOX_W - 0.028, 0.1]} />
          <meshBasicMaterial
            map={spineTexture}
            transparent
            depthTest
            depthWrite
          />
        </mesh>
      )}
    </group>
  );
}
