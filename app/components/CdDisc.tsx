"use client";

import { motion } from "framer-motion";
import { useId } from "react";
import { resolveArtworkURL } from "@/app/lib/artwork";

type CdDiscProps = {
  coverUrl?: string;
  size?: number;
  spinning?: boolean;
};

export function CdDisc({ coverUrl, size = 300, spinning = false }: CdDiscProps) {
  const r = size / 2;
  const holeR = r * 0.07;
  const ringR = r * 0.19;
  const artR = r * 0.34;
  const uid = `cd-${useId().replaceAll(":", "")}`;
  const artworkUrl = coverUrl ? resolveArtworkURL(coverUrl) : coverUrl;

  return (
    <motion.div
      className="cd-disc-wrapper"
      animate={spinning ? { rotate: 360 } : { rotate: 0 }}
      transition={
        spinning
          ? { repeat: Infinity, duration: 4.5, ease: "linear" }
          : { duration: 0 }
      }
      style={{ width: size, height: size }}
    >
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        className="cd-disc-svg"
      >
        <defs>
          {/* 彩虹色反光渐变 */}
          <linearGradient id={`${uid}-rainbow`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#e8d5f5" stopOpacity="0.5" />
            <stop offset="18%" stopColor="#c4e0f9" stopOpacity="0.45" />
            <stop offset="36%" stopColor="#d0f0e0" stopOpacity="0.4" />
            <stop offset="54%" stopColor="#f5f0c8" stopOpacity="0.45" />
            <stop offset="72%" stopColor="#f5d0c8" stopOpacity="0.4" />
            <stop offset="90%" stopColor="#e8c8f0" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#d0d8f8" stopOpacity="0.45" />
          </linearGradient>

          {/* 径向高光 */}
          <radialGradient id={`${uid}-sheen`} cx="35%" cy="35%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.35)" />
            <stop offset="40%" stopColor="rgba(255,255,255,0.08)" />
            <stop offset="75%" stopColor="transparent" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.1)" />
          </radialGradient>

          {/* 同心数据纹理 */}
          <radialGradient id={`${uid}-tracks`}>
            <stop offset="0%" stopColor="transparent" />
            <stop offset="38%" stopColor="transparent" />
            <stop offset="39%" stopColor="rgba(255,255,255,0.02)" />
            <stop offset="95%" stopColor="rgba(255,255,255,0.03)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>

          {/* 中心图案 */}
          {artworkUrl && (
            <pattern
              id={`${uid}-art`}
              patternUnits="objectBoundingBox"
              width="1"
              height="1"
            >
              <image
                href={artworkUrl}
                x={-((size - artR * 2) / 2 / (artR * 2)) * artR * 2}
                y={-((size - artR * 2) / 2 / (artR * 2)) * artR * 2}
                width={size}
                height={size}
                preserveAspectRatio="xMidYMid slice"
              />
            </pattern>
          )}

          {/* 遮罩：外圆 - 中心孔 */}
          <mask id={`${uid}-mask`}>
            <rect width={size} height={size} fill="black" />
            <circle cx={r} cy={r} r={r - 0.5} fill="white" />
            <circle cx={r} cy={r} r={holeR} fill="black" />
          </mask>
        </defs>

        {/* 主体：银色光盘 */}
        <circle
          cx={r}
          cy={r}
          r={r - 0.5}
          fill="#c8ccd0"
          stroke="rgba(0,0,0,0.2)"
          strokeWidth="0.5"
        />

        {/* 数据区微纹 */}
        {Array.from({ length: 48 }).map((_, i) => {
          const ir = ringR + 6 + i * ((r - ringR - 10) / 48);
          return (
            <circle
              key={i}
              cx={r}
              cy={r}
              r={ir}
              fill="none"
              stroke={i % 4 === 0 ? "rgba(180,190,200,0.25)" : "rgba(200,210,220,0.12)"}
              strokeWidth="0.4"
            />
          );
        })}

        {/* 彩虹反光层 */}
        <circle
          cx={r}
          cy={r}
          r={r - 0.5}
          fill={`url(#${uid}-rainbow)`}
        />

        {/* 径向高光 */}
        <circle
          cx={r}
          cy={r}
          r={r - 0.5}
          fill={`url(#${uid}-sheen)`}
        />

        {/* 弧形彩虹条纹（模拟 CD 特有的环形折射） */}
        {[0.42, 0.55, 0.68, 0.78, 0.88].map((pct, i) => (
          <circle
            key={i}
            cx={r}
            cy={r}
            r={r * pct}
            fill="none"
            stroke={[
              "rgba(180,140,255,0.12)",
              "rgba(100,200,255,0.1)",
              "rgba(140,255,180,0.08)",
              "rgba(255,220,100,0.1)",
              "rgba(255,150,180,0.09)",
            ][i]}
            strokeWidth={2 + i * 0.5}
          />
        ))}

        {/* 中心印刷区 (album art) */}
        <circle
          cx={r}
          cy={r}
          r={artR}
          fill={artworkUrl ? `url(#${uid}-art)` : "#e0e2e5"}
          stroke="rgba(0,0,0,0.12)"
          strokeWidth="0.5"
        />

        {/* 中心透明环 */}
        <circle
          cx={r}
          cy={r}
          r={ringR}
          fill="rgba(240,242,245,0.85)"
          stroke="rgba(0,0,0,0.08)"
          strokeWidth="0.5"
        />

        {/* 内环装饰 */}
        <circle
          cx={r}
          cy={r}
          r={ringR - 3}
          fill="none"
          stroke="rgba(0,0,0,0.06)"
          strokeWidth="0.3"
        />

        {/* 中心孔 */}
        <circle
          cx={r}
          cy={r}
          r={holeR}
          fill="#0d0d0f"
          stroke="rgba(0,0,0,0.3)"
          strokeWidth="0.5"
        />

        {/* 孔的高光边缘 */}
        <circle
          cx={r}
          cy={r}
          r={holeR + 1}
          fill="none"
          stroke="rgba(255,255,255,0.2)"
          strokeWidth="0.5"
        />
      </svg>
    </motion.div>
  );
}
