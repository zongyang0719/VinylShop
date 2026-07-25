import Papa from "papaparse";
import type { Album, Format } from "./store";

type MusicBuddyRow = {
  Title?: string;
  Artist?: string;
  "Release Year"?: string;
  "Original Release Year"?: string;
  Tracks?: string;
  Media?: string;
  Format?: string;
  "Date Added"?: string;
  "Purchase Date"?: string;
  "Purchase Price"?: string;
  "discogs Release ID"?: string;
  "Uploaded Image URL"?: string;
};

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function parseFormat(row: MusicBuddyRow): Format {
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

function parseDate(value?: string, fallback?: string) {
  if (!value?.trim()) {
    return fallback;
  }

  const normalized = value
    .trim()
    .replace(
      /^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?\d*$/,
      (_, year, month, day, time, milliseconds = "000") =>
        `${year}-${month}-${day}T${time}.${milliseconds.padEnd(3, "0")}`,
    );
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function parseTracklist(value?: string) {
  if (!value?.trim()) {
    return undefined;
  }

  try {
    const tracks = JSON.parse(value) as Array<{ title?: string }>;
    const titles = tracks
      .map((track) => track.title?.trim())
      .filter((track): track is string => Boolean(track));
    return titles.length > 0 ? titles : undefined;
  } catch {
    return undefined;
  }
}

function toAlbum(row: MusicBuddyRow): Album | null {
  const title = row.Title?.trim();
  const artist = row.Artist?.trim();
  const coverUrl = row["Uploaded Image URL"]?.trim();

  if (!title || !artist || !coverUrl) {
    return null;
  }

  const discogsId = Number(row["discogs Release ID"]) || undefined;
  const format = parseFormat(row);
  const dateAdded = parseDate(row["Date Added"], new Date().toISOString());
  const fallbackKey = stableHash(
    [discogsId, title, artist, format, dateAdded]
      .join("|")
      .toLocaleLowerCase(),
  );
  const year =
    Number(row["Release Year"]) ||
    Number(row["Original Release Year"]) ||
    undefined;

  return {
    id: `musicbuddy-${fallbackKey}`,
    discogsId,
    title,
    artist,
    year,
    coverUrl,
    format,
    zone: "unsorted",
    dateAdded: dateAdded!,
    purchaseDate: parseDate(row["Purchase Date"]),
    purchasePrice: row["Purchase Price"]?.trim() || undefined,
    tracklist: parseTracklist(row.Tracks),
  };
}

export function parseMusicBuddyCsv(file: File): Promise<Album[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<MusicBuddyRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
      complete: ({ data, errors }) => {
        const fatal = errors.find((error) => error.type === "Quotes");
        if (fatal) {
          reject(new Error(`CSV 格式错误：${fatal.message}`));
          return;
        }
        resolve(data.map(toAlbum).filter((album): album is Album => album !== null));
      },
      error: (error) => reject(error),
    });
  });
}
