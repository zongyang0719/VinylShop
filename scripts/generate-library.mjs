import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import Papa from "papaparse";

const source = process.argv[2];
if (!source) {
  throw new Error("Usage: npm run library:generate -- /absolute/path/library.csv");
}

function stableHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function parseFormat(row) {
  const media = row.Media?.trim().toLocaleLowerCase() || "";
  const format = row.Format?.trim().toLocaleLowerCase() || "";

  if (media.includes("黑胶") || media.includes("vinyl") || format === "lp") {
    return "vinyl";
  }
  if (media.includes("cd") || media.includes("sacd")) {
    return "cd";
  }
  return "unknown";
}

function parseDate(value, fallback = undefined) {
  if (!value?.trim()) {
    return fallback;
  }

  const normalized = value
    .trim()
    .replace(
      /^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?\d*$/,
      (_, year, month, day, time, milliseconds = "000") =>
        `${year}-${month}-${day}T${time}.${milliseconds.padEnd(3, "0")}`,
    )
    .replace(/^(\d{4})\/(\d{2})\/(\d{2})$/, "$1-$2-$3");

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function parseTracklist(value) {
  if (!value?.trim()) {
    return undefined;
  }

  try {
    const tracks = JSON.parse(value);
    const titles = tracks
      .map((track) => track.title?.trim())
      .filter(Boolean);
    return titles.length > 0 ? titles : undefined;
  } catch {
    return undefined;
  }
}

const csv = await readFile(resolve(source), "utf8");
const result = Papa.parse(csv.replace(/^\uFEFF/, ""), {
  header: true,
  skipEmptyLines: true,
  transformHeader: (header) => header.trim(),
});

if (result.errors.some((error) => error.type === "Quotes")) {
  throw new Error(result.errors[0].message);
}

const albums = result.data
  .map((row) => {
    const title = row.Title?.trim();
    const artist = row.Artist?.trim();
    const coverUrl = row["Uploaded Image URL"]?.trim();
    if (!title || !artist || !coverUrl) {
      return null;
    }

    const format = parseFormat(row);
    const dateAdded = parseDate(row["Date Added"], new Date().toISOString());
    const discogsId = Number(row["discogs Release ID"]) || undefined;
    const uniqueKey = [discogsId, title, artist, format, dateAdded]
      .join("|")
      .toLocaleLowerCase();

    return {
      id: `musicbuddy-${stableHash(uniqueKey)}`,
      ...(discogsId ? { discogsId } : {}),
      title,
      artist,
      ...(Number(row["Release Year"]) || Number(row["Original Release Year"])
        ? {
            year:
              Number(row["Release Year"]) ||
              Number(row["Original Release Year"]),
          }
        : {}),
      coverUrl,
      format,
      zone: "unsorted",
      dateAdded,
      ...(parseDate(row["Purchase Date"])
        ? { purchaseDate: parseDate(row["Purchase Date"]) }
        : {}),
      ...(row["Purchase Price"]?.trim()
        ? { purchasePrice: row["Purchase Price"].trim() }
        : {}),
      ...(parseTracklist(row.Tracks)
        ? { tracklist: parseTracklist(row.Tracks) }
        : {}),
    };
  })
  .filter(Boolean);

const output = resolve("app/data/initial-library.json");
await mkdir(resolve("app/data"), { recursive: true });
await writeFile(
  output,
  `${JSON.stringify(albums, null, 2)}\n`,
);

console.log(`Generated ${albums.length} albums.`);
