import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const projectRoot = process.cwd();
const initialLibrary = JSON.parse(
  readFileSync(
    resolve(projectRoot, "app/data/initial-library.json"),
    "utf8",
  ),
) as Array<{ coverUrl: string }>;
const bundledArtwork = Object.fromEntries(
  Array.from(new Set(initialLibrary.map((album) => album.coverUrl))).map(
    (url) => [
      url,
      `./covers/${createHash("sha256").update(url).digest("hex")}.cover`,
    ],
  ),
);

export default defineConfig({
  root: "mobile",
  base: "./",
  publicDir: "../public",
  plugins: [
    react(),
    {
      name: "bundle-ios-covers",
      closeBundle() {
        const destination = resolve(projectRoot, "dist/mobile/covers");
        mkdirSync(destination, { recursive: true });
        cpSync(
          resolve(projectRoot, "ios/App/App/Resources/Covers"),
          destination,
          { recursive: true },
        );
      },
    },
  ],
  define: {
    __IOS_COVER_MAP__: JSON.stringify(bundledArtwork),
  },
  resolve: {
    alias: {
      "@": resolve(process.cwd()),
    },
  },
  build: {
    outDir: "../dist/mobile",
    emptyOutDir: true,
  },
});
