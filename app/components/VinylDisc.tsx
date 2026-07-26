"use client";

import { motion } from "framer-motion";
import { useId } from "react";
import { resolveArtworkURL } from "@/app/lib/artwork";
import type { VinylStyle } from "@/app/lib/store";

type VinylDiscProps = {
  color?: string;
  style?: VinylStyle;
  coverUrl?: string;
  size?: number;
  spinning?: boolean;
};

const GROOVE_COUNT = 32;

function seededUnit(index: number, salt: number) {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function proxyArtwork(url?: string) {
  return url ? resolveArtworkURL(url) : url;
}

export function VinylDisc({
  color = "#1a1a1a",
  style = "standard",
  coverUrl,
  size = 300,
  spinning = false,
}: VinylDiscProps) {
  const r = size / 2;
  const labelR = r * 0.33;
  const holeR = r * 0.04;
  const grooveStart = labelR + 4;
  const grooveEnd = r - 6;
  const grooveStep = (grooveEnd - grooveStart) / GROOVE_COUNT;
  const uid = useId().replaceAll(":", "");
  const artworkUrl = proxyArtwork(coverUrl);

  const isTransparent = style === "transparent";
  const isPicture = style === "picture";
  const isSplatter = style === "splatter";

  const fillOpacity = isTransparent ? 0.45 : 1;
  const grooveOpacity = isTransparent ? 0.12 : 0.08;

  return (
    <motion.div
      className="vinyl-disc-wrapper"
      animate={spinning ? { rotate: 360 } : { rotate: 0 }}
      transition={
        spinning
          ? { repeat: Infinity, duration: 3.2, ease: "linear" }
          : { duration: 0 }
      }
      style={{ width: size, height: size }}
    >
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        className="vinyl-disc-svg"
      >
        <defs>
          <radialGradient id={`disc-grad-${uid}`}>
            <stop offset="0%" stopColor="rgba(255,255,255,0.08)" />
            <stop offset="60%" stopColor="transparent" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.15)" />
          </radialGradient>
          {isPicture && artworkUrl && (
            <pattern
              id={`pic-fill-${uid}`}
              patternUnits="objectBoundingBox"
              width="1"
              height="1"
            >
              <image
                href={artworkUrl}
                width={size}
                height={size}
                preserveAspectRatio="xMidYMid slice"
              />
            </pattern>
          )}
          {artworkUrl && (
            <pattern
              id={`label-fill-${uid}`}
              patternUnits="objectBoundingBox"
              width="1"
              height="1"
            >
              <image
                href={artworkUrl}
                width={size}
                height={size}
                preserveAspectRatio="xMidYMid slice"
              />
            </pattern>
          )}
          <clipPath id={`disc-clip-${uid}`}>
            <circle cx={r} cy={r} r={r - 1} />
          </clipPath>
        </defs>

        {/* Outer disc body */}
        <circle
          cx={r}
          cy={r}
          r={r - 1}
          fill={isPicture && artworkUrl ? `url(#pic-fill-${uid})` : color}
          fillOpacity={isPicture ? 0.85 : fillOpacity}
          stroke="rgba(0,0,0,0.25)"
          strokeWidth="1"
        />

        {/* Splatter effect */}
        {isSplatter && (
          <g clipPath={`url(#disc-clip-${uid})`} opacity="0.5">
            {Array.from({ length: 18 }).map((_, i) => {
              const angle = (i * 137.5 * Math.PI) / 180;
              const dist =
                grooveStart +
                seededUnit(i, 1) * (grooveEnd - grooveStart) * 0.9;
              const cx = r + Math.cos(angle) * dist * 0.7;
              const cy = r + Math.sin(angle) * dist * 0.7;
              const sr = 4 + seededUnit(i, 2) * 14;
              return (
                <circle
                  key={i}
                  cx={cx}
                  cy={cy}
                  r={sr}
                  fill="#fff"
                  opacity={0.3 + seededUnit(i, 3) * 0.4}
                />
              );
            })}
          </g>
        )}

        {/* Grooves */}
        {Array.from({ length: GROOVE_COUNT }).map((_, i) => (
          <circle
            key={i}
            cx={r}
            cy={r}
            r={grooveStart + i * grooveStep}
            fill="none"
            stroke={isPicture ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.06)"}
            strokeWidth="0.5"
            opacity={grooveOpacity + (i % 3 === 0 ? 0.04 : 0)}
          />
        ))}

        {/* Sheen overlay */}
        <circle
          cx={r}
          cy={r}
          r={r - 1}
          fill={`url(#disc-grad-${uid})`}
        />

        {/* Label area */}
        <circle
          cx={r}
          cy={r}
          r={labelR}
          fill={artworkUrl ? `url(#label-fill-${uid})` : "#2c2c2e"}
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="0.5"
        />

        {/* Label inner ring */}
        <circle
          cx={r}
          cy={r}
          r={labelR - 3}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="0.5"
        />

        {/* Spindle hole */}
        <circle
          cx={r}
          cy={r}
          r={holeR}
          fill="#0d0d0f"
          stroke="rgba(255,255,255,0.15)"
          strokeWidth="0.5"
        />
      </svg>
    </motion.div>
  );
}
