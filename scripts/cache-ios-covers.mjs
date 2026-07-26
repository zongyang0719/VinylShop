import { createHash } from "node:crypto";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import library from "../app/data/initial-library.json" with { type: "json" };

const outputDirectory = path.resolve("ios/App/App/Resources/Covers");
const concurrency = 8;

function keyFor(url) {
  return createHash("sha256").update(url, "utf8").digest("hex");
}

function normalizedURL(url) {
  if (url.startsWith("http://") && !url.includes("file.52jdyy.com")) {
    return `https://${url.slice(7)}`;
  }
  return url;
}

function looksLikeImage(data) {
  if (data.length < 12) return false;
  return (
    (data[0] === 0xff && data[1] === 0xd8) ||
    (data[0] === 0x89 &&
      data[1] === 0x50 &&
      data[2] === 0x4e &&
      data[3] === 0x47) ||
    data.subarray(0, 4).toString("ascii") === "GIF8" ||
    (data.subarray(0, 4).toString("ascii") === "RIFF" &&
      data.subarray(8, 12).toString("ascii") === "WEBP") ||
    data.subarray(4, 12).toString("ascii").includes("ftyp")
  );
}

function refererFor(url) {
  const host = new URL(url).hostname;
  if (host.endsWith("discogs.com")) return "https://www.discogs.com/";
  if (host.endsWith("126.net")) return "https://music.163.com/";
  if (host.includes("amazon")) return "https://www.amazon.com/";
  return new URL(url).origin;
}

async function download(url) {
  const destination = path.join(outputDirectory, `${keyFor(url)}.cover`);
  const requestURL = normalizedURL(url);
  let lastError;

  try {
    await access(destination);
    return { ok: true, url, bytes: 0, cached: true };
  } catch {
    // Download missing source artwork.
  }

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(requestURL, {
        redirect: "follow",
        signal: AbortSignal.timeout(30_000),
        headers: {
          Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
          Referer: refererFor(requestURL),
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1",
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = Buffer.from(await response.arrayBuffer());
      if (!looksLikeImage(data)) {
        throw new Error(`not an image (${response.headers.get("content-type")})`);
      }
      await writeFile(destination, data);
      return { ok: true, url, bytes: data.length };
    } catch (error) {
      lastError = error;
    }
  }

  return {
    ok: false,
    url,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  };
}

async function main() {
  await mkdir(outputDirectory, { recursive: true });
  const urls = [...new Set(library.map((album) => album.coverUrl))];
  const results = [];
  let cursor = 0;

  async function worker() {
    while (cursor < urls.length) {
      const index = cursor;
      cursor += 1;
      const result = await download(urls[index]);
      results[index] = result;
      process.stdout.write(
        `[${index + 1}/${urls.length}] ${result.ok ? "ok" : "FAIL"}\n`,
      );
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, urls.length) }, () => worker()),
  );

  const failures = results.filter((result) => !result.ok);
  const totalBytes = results.reduce(
    (sum, result) => sum + (result.ok ? result.bytes : 0),
    0,
  );
  console.log(
    JSON.stringify(
      {
        covers: urls.length,
        downloaded: results.length - failures.length,
        failures,
        megabytes: Number((totalBytes / 1_000_000).toFixed(1)),
      },
      null,
      2,
    ),
  );
  if (failures.length) process.exitCode = 1;
}

await main();
