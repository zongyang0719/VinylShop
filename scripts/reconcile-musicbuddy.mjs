#!/usr/bin/env node
/**
 * MusicBuddy CSV ↔ VinylShop 数据对账、补全与安全合并脚本
 *
 * Usage:
 *   node scripts/reconcile-musicbuddy.mjs <CSV_PATH>              # dry-run
 *   node scripts/reconcile-musicbuddy.mjs <CSV_PATH> --apply-local # 写入本地 seed
 *   node scripts/reconcile-musicbuddy.mjs <CSV_PATH> --apply-live  # 需要鉴权+备份
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import Papa from "papaparse";

/* ------------------------------------------------------------------ */
/*  CLI                                                                */
/* ------------------------------------------------------------------ */
const CSV_PATH = process.argv[2];
const APPLY_LOCAL = process.argv.includes("--apply-local");
const APPLY_LIVE = process.argv.includes("--apply-live");

if (!CSV_PATH) {
  console.error("Usage: node scripts/reconcile-musicbuddy.mjs <CSV_PATH> [--apply-local] [--apply-live]");
  process.exit(1);
}

const PROJECT_ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");
const LIBRARY_PATH = resolve(PROJECT_ROOT, "app/data/initial-library.json");
const REPORT_DIR = `/tmp/vinylshop-reconcile-${Date.now()}`;
mkdirSync(REPORT_DIR, { recursive: true });

console.log(`\n=== MusicBuddy 对账脚本 ===`);
console.log(`CSV: ${CSV_PATH}`);
console.log(`Library: ${LIBRARY_PATH}`);
console.log(`Reports: ${REPORT_DIR}`);
console.log(`Mode: ${APPLY_LOCAL ? "apply-local" : APPLY_LIVE ? "apply-live" : "dry-run"}\n`);

/* ------------------------------------------------------------------ */
/*  Stable hash (same as musicbuddy.ts)                                */
/* ------------------------------------------------------------------ */
function stableHash(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/* ------------------------------------------------------------------ */
/*  Artist name mappings                                               */
/* ------------------------------------------------------------------ */
const CHINESE_ARTIST_MAP = {
  "fish leong": "梁静茹",
  "chyi yu": "齐豫",
  "stefanie sun": "孙燕姿",
  "jolin tsai": "蔡依林",
  "a-mei": "张惠妹",
  "teresa teng": "邓丽君",
  "tarcy su": "苏慧伦",
  "tanya chua": "蔡健雅",
  "faye wong": "王菲",
  "sitar tan": "谭维维",
  "elva hsiao": "萧亚轩",
  "yoga lin": "林宥嘉",
  "faith yang": "杨乃文",
  "eason chan": "陈奕迅",
  "kit chan": "陈洁仪",
  "hideaki tokunaga": "德永英明",
};

const JAPANESE_ARTIST_MAP = {
  "miyuki nakajima": "中島みゆき",
  "utada hikaru": "宇多田ヒカル",
  "ryuichi sakamoto": "坂本龍一",
  "tatsuro yamashita": "山下達郎",
};

const TRADITIONAL_TO_SIMPLIFIED = {
  "張震嶽": "张震岳",
  "吳青峰": "吴青峰",
  "徐佳瑩": "徐佳莹",
};

function cleanDiscogsArtistSuffix(name) {
  return name.replace(/\s*\(\d+\)\s*$/, "").trim();
}

function mapArtistName(csvArtist) {
  if (!csvArtist) return csvArtist;
  const cleaned = cleanDiscogsArtistSuffix(csvArtist);
  const lower = cleaned.toLowerCase();

  if (JAPANESE_ARTIST_MAP[lower]) return JAPANESE_ARTIST_MAP[lower];
  if (CHINESE_ARTIST_MAP[lower]) return CHINESE_ARTIST_MAP[lower];
  if (TRADITIONAL_TO_SIMPLIFIED[cleaned]) return TRADITIONAL_TO_SIMPLIFIED[cleaned];

  // Jonathan Lee (6) → 李宗盛
  if (/^jonathan\s+lee$/i.test(cleaned)) return "李宗盛";
  // Adele (3) → Adele
  if (/^adele$/i.test(cleaned)) return "Adele";

  return cleaned;
}

/* ------------------------------------------------------------------ */
/*  Date & format parsing                                              */
/* ------------------------------------------------------------------ */
function parseDate(value) {
  if (!value?.trim()) return undefined;
  const normalized = value.trim()
    .replace(
      /^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?\d*$/,
      (_, y, m, d, t, ms = "000") => `${y}-${m}-${d}T${t}.${ms.padEnd(3, "0")}`
    )
    .replace(/^(\d{4})\/(\d{2})\/(\d{2})$/, "$1-$2-$3");
  const parsed = new Date(normalized);
  return isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function parseFormat(media, format) {
  const m = (media || "").trim().toLowerCase();
  const f = (format || "").trim().toLowerCase();
  if (m.includes("黑胶") || m.includes("vinyl") || f === "lp") return "vinyl";
  if (m.includes("cd") || m.includes("sacd")) return "cd";
  return "unknown";
}

/* ------------------------------------------------------------------ */
/*  Genre parsing (handles "Folk, World, & Country")                   */
/* ------------------------------------------------------------------ */
const KNOWN_MULTI_COMMA_GENRES = ["Folk, World, & Country"];
const GENRE_PLACEHOLDER_MAP = new Map();
KNOWN_MULTI_COMMA_GENRES.forEach((g, i) => {
  GENRE_PLACEHOLDER_MAP.set(g, `__GENRE_PLACEHOLDER_${i}__`);
});

function parseGenres(value) {
  if (!value?.trim()) return undefined;
  let v = value.trim();
  for (const [genre, ph] of GENRE_PLACEHOLDER_MAP) {
    v = v.replaceAll(genre, ph);
  }
  const parts = v.split(",").map(s => s.trim()).filter(Boolean);
  const result = parts.map(p => {
    for (const [genre, ph] of GENRE_PLACEHOLDER_MAP) {
      if (p === ph) return genre;
    }
    return p;
  });
  return result.length > 0 ? result : undefined;
}

/* ------------------------------------------------------------------ */
/*  Labels parsing (clean Discogs suffixes)                            */
/* ------------------------------------------------------------------ */
function parseLabels(value) {
  if (!value?.trim()) return undefined;
  const parts = value.split(",").map(s => cleanDiscogsArtistSuffix(s.trim())).filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

function pickPrimaryLabel(labels) {
  if (!labels || labels.length === 0) return undefined;
  return labels[0];
}

/* ------------------------------------------------------------------ */
/*  Barcode handling (must be string, preserve leading zeros)           */
/* ------------------------------------------------------------------ */
function parseBarcode(value) {
  if (!value?.trim()) return undefined;
  const bc = value.trim();
  if (!/^\d+$/.test(bc)) return undefined;
  if (![8, 12, 13, 14].includes(bc.length)) return undefined;
  return bc;
}

/* ------------------------------------------------------------------ */
/*  Track parsing (with durations)                                     */
/* ------------------------------------------------------------------ */
function parseTracks(value) {
  if (!value?.trim()) return { tracklist: undefined, trackDurations: undefined };
  try {
    const tracks = JSON.parse(value);
    if (!Array.isArray(tracks) || tracks.length === 0) {
      return { tracklist: undefined, trackDurations: undefined };
    }
    const tracklist = [];
    const trackDurations = [];
    for (const t of tracks) {
      const title = (t.title || "").trim();
      if (!title) continue;
      tracklist.push(title);
      trackDurations.push(typeof t.duration === "number" ? t.duration : 0);
    }
    if (tracklist.length === 0) return { tracklist: undefined, trackDurations: undefined };
    return { tracklist, trackDurations };
  } catch {
    return { tracklist: undefined, trackDurations: undefined };
  }
}

/* ------------------------------------------------------------------ */
/*  Performers parsing                                                 */
/* ------------------------------------------------------------------ */
function parsePerformers(value) {
  if (!value?.trim()) return undefined;
  const parts = value.split(",").map(s => cleanDiscogsArtistSuffix(s.trim())).filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

function parseCommaList(value) {
  if (!value?.trim()) return undefined;
  const parts = value.split(",").map(s => cleanDiscogsArtistSuffix(s.trim())).filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

/* ------------------------------------------------------------------ */
/*  Year / releaseDate handling                                        */
/* ------------------------------------------------------------------ */
function isFakeJan1(dateStr) {
  if (!dateStr) return false;
  return /^\d{4}-01-01/.test(dateStr);
}

/* ------------------------------------------------------------------ */
/*  Full CSV row parser                                                */
/* ------------------------------------------------------------------ */
function parseFullCsvRow(row, rowIndex) {
  const title = (row.Title || "").trim();
  const rawArtist = (row.Artist || "").trim();
  const coverUrl = (row["Uploaded Image URL"] || "").trim();
  const discogsId = Number(row["discogs Release ID"]) || undefined;
  const format = parseFormat(row.Media, row.Format);
  const dateAdded = parseDate(row["Date Added"]);
  const barcode = parseBarcode(row["UPC-EAN13"]);
  const catalogNumber = (row["Catalog Number"] || "").trim() || undefined;
  const country = (row.Country || "").trim() || undefined;
  const releaseYear = Number(row["Release Year"]) || undefined;
  const originalReleaseYear = Number(row["Original Release Year"]) || undefined;
  const year = releaseYear || originalReleaseYear || undefined;
  const genres = parseGenres(row.Genres);
  const styles = parseGenres(row.Styles);
  const labels = parseLabels(row.Labels);
  const label = pickPrimaryLabel(labels);
  const edition = (row.Edition || "").trim() || undefined;
  const numVol = Number(row["Number Of Volumes"]) || undefined;
  const numberOfVolumes = numVol && numVol > 1 ? numVol : undefined;
  const { tracklist, trackDurations } = parseTracks(row.Tracks);
  const producers = parseCommaList(row.Producers);
  const composers = parseCommaList(row.Composers);
  const orchestras = parseCommaList(row.Orchestras);
  const conductors = parseCommaList(row.Conductors);
  const performers = parsePerformers(row.Performers);
  const writers = parseCommaList(row.Writers);
  const productionCompanies = parseCommaList(row["Production Companies"]);
  const purchaseDate = parseDate(row["Purchase Date"]);
  const purchasePrice = (row["Purchase Price"] || "").trim() || undefined;
  const purchasePlace = (row["Purchase Place"] || "").trim() || undefined;
  const notes = (row.Notes || "").trim() || undefined;
  const media = (row.Media || "").trim() || undefined;
  const formatDetail = (row.Format || "").trim() || undefined;
  const vinylSize = (row["Vinyl Size"] || "").trim() || undefined;
  const vinylSpeed = (row["Vinyl Speed"] || "").trim() || undefined;

  // Generate stable ID
  const uniqueKey = [discogsId, title, rawArtist, format, dateAdded]
    .join("|").toLocaleLowerCase();
  const generatedId = `musicbuddy-${stableHash(uniqueKey)}`;

  // Map artist name
  const mappedArtist = mapArtistName(rawArtist);

  // Build sourceMetadata from non-empty extra fields
  const sourceMetadata = {};
  if (media) sourceMetadata.media = media;
  if (formatDetail) sourceMetadata.format = formatDetail;
  if (vinylSize) sourceMetadata.vinylSize = vinylSize;
  if (vinylSpeed) sourceMetadata.vinylSpeed = vinylSpeed;
  if (purchasePlace) sourceMetadata.purchasePlace = purchasePlace;
  if (notes) sourceMetadata.notes = notes;
  if (row["Content Type"]?.trim()) sourceMetadata.contentType = row["Content Type"].trim();
  if (row.Length?.trim()) sourceMetadata.length = row.Length.trim();

  return {
    rowIndex,
    rawTitle: title,
    rawArtist,
    generatedId,
    title,
    artist: mappedArtist,
    discogsId,
    format,
    dateAdded,
    coverUrl: coverUrl || undefined,
    barcode,
    catalogNumber,
    country,
    year,
    releaseYear,
    originalReleaseYear,
    genres,
    styles,
    labels,
    label,
    edition,
    numberOfVolumes,
    tracklist,
    trackDurations,
    producers,
    composers,
    orchestras,
    conductors,
    performers,
    writers,
    productionCompanies,
    purchaseDate,
    purchasePrice,
    sourceMetadata: Object.keys(sourceMetadata).length > 0 ? sourceMetadata : undefined,
  };
}

/* ------------------------------------------------------------------ */
/*  Load data                                                          */
/* ------------------------------------------------------------------ */
console.log("Loading CSV...");
const csvContent = readFileSync(resolve(CSV_PATH), "utf8");
const csvResult = Papa.parse(csvContent.replace(/^\uFEFF/, ""), {
  header: true,
  skipEmptyLines: true,
  transformHeader: h => h.trim(),
});

if (csvResult.errors.some(e => e.type === "Quotes")) {
  console.error("CSV parse error:", csvResult.errors[0].message);
  process.exit(1);
}

const csvRows = csvResult.data.map((row, i) => parseFullCsvRow(row, i + 1));
console.log(`CSV: ${csvRows.length} rows, ${csvResult.meta.fields.length} fields`);

console.log("Loading library...");
const library = JSON.parse(readFileSync(LIBRARY_PATH, "utf8"));
console.log(`Library: ${library.length} albums\n`);

/* ------------------------------------------------------------------ */
/*  Build indexes for existing library                                 */
/* ------------------------------------------------------------------ */
const existingById = new Map(library.map(a => [a.id, a]));

const existingByDateAdded = new Map();
for (const a of library) {
  if (existingByDateAdded.has(a.dateAdded)) {
    existingByDateAdded.set(a.dateAdded, null); // not unique
  } else {
    existingByDateAdded.set(a.dateAdded, a);
  }
}

const existingByDiscogsId = new Map();
for (const a of library) {
  if (a.discogsId) {
    if (existingByDiscogsId.has(a.discogsId)) {
      existingByDiscogsId.set(a.discogsId, null);
    } else {
      existingByDiscogsId.set(a.discogsId, a);
    }
  }
}

const existingByBarcode = new Map();
for (const a of library) {
  if (a.barcode && a.barcode !== "none") {
    if (existingByBarcode.has(a.barcode)) {
      existingByBarcode.set(a.barcode, null);
    } else {
      existingByBarcode.set(a.barcode, a);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Matching                                                           */
/* ------------------------------------------------------------------ */
console.log("=== Matching ===");
const matchResults = [];
const newCandidates = [];
const duplicateReview = [];
const matched = new Set(); // existing IDs already matched

for (const csvRow of csvRows) {
  let matchMethod = null;
  let matchedAlbum = null;

  // Strategy 1: stable ID
  if (existingById.has(csvRow.generatedId) && !matched.has(csvRow.generatedId)) {
    matchMethod = "stableId";
    matchedAlbum = existingById.get(csvRow.generatedId);
  }

  // Strategy 2: unique dateAdded
  if (!matchedAlbum && csvRow.dateAdded) {
    const existing = existingByDateAdded.get(csvRow.dateAdded);
    if (existing && !matched.has(existing.id)) {
      matchMethod = "dateAdded";
      matchedAlbum = existing;
    }
  }

  // Strategy 3: Discogs ID (unique match only)
  if (!matchedAlbum && csvRow.discogsId) {
    const existing = existingByDiscogsId.get(csvRow.discogsId);
    if (existing && !matched.has(existing.id)) {
      matchMethod = "discogsId";
      matchedAlbum = existing;
    }
  }

  // Strategy 4: barcode
  if (!matchedAlbum && csvRow.barcode) {
    const existing = existingByBarcode.get(csvRow.barcode);
    if (existing && !matched.has(existing.id)) {
      matchMethod = "barcode";
      matchedAlbum = existing;
    }
  }

  if (matchedAlbum) {
    matched.add(matchedAlbum.id);
    matchResults.push({
      csvRow: csvRow.rowIndex,
      method: matchMethod,
      existingId: matchedAlbum.id,
      csvTitle: csvRow.rawTitle,
      csvArtist: csvRow.rawArtist,
      existingTitle: matchedAlbum.title,
      existingArtist: matchedAlbum.artist,
      csvData: csvRow,
      existingData: matchedAlbum,
    });
  } else {
    // Special case: Row 12 (崇拜 duplicate)
    if (csvRow.discogsId === 34418386 && csvRow.rawTitle === "崇拜") {
      // Check if this discogsId already matched
      const alreadyMatched = matchResults.find(
        m => m.existingData.discogsId === 34418386
      );
      if (alreadyMatched) {
        duplicateReview.push({
          csvRow: csvRow.rowIndex,
          title: csvRow.rawTitle,
          artist: csvRow.rawArtist,
          discogsId: csvRow.discogsId,
          barcode: csvRow.barcode,
          dateAdded: csvRow.dateAdded,
          matchedExistingId: alreadyMatched.existingId,
          reason: "同一 Discogs Release ID 的第二条记录。可能是重复扫描，也可能用户确实拥有两张相同唱片。",
          csvData: csvRow,
        });
        continue;
      }
    }
    newCandidates.push(csvRow);
  }
}

/* ------------------------------------------------------------------ */
/*  Validation gates                                                   */
/* ------------------------------------------------------------------ */
const idMatchCount = matchResults.filter(m => m.method === "stableId").length;
const dateMatchCount = matchResults.filter(m => m.method === "dateAdded").length;
const discogsMatchCount = matchResults.filter(m => m.method === "discogsId").length;
const barcodeMatchCount = matchResults.filter(m => m.method === "barcode").length;

console.log(`Stable ID match: ${idMatchCount}`);
console.log(`DateAdded match: ${dateMatchCount}`);
console.log(`DiscogsId match: ${discogsMatchCount}`);
console.log(`Barcode match:   ${barcodeMatchCount}`);
console.log(`Total matched:   ${matchResults.length}`);
console.log(`New candidates:  ${newCandidates.length}`);
console.log(`Duplicate review: ${duplicateReview.length}`);
console.log();

// Hard gate checks
const EXPECTED_CSV = 141;
const EXPECTED_LIBRARY = 106;
const EXPECTED_MATCH = 106;
const EXPECTED_NEW = 35;

let gatePass = true;
if (csvRows.length !== EXPECTED_CSV) {
  console.error(`❌ CSV row count mismatch: got ${csvRows.length}, expected ${EXPECTED_CSV}`);
  gatePass = false;
}
if (library.length !== EXPECTED_LIBRARY) {
  console.error(`❌ Library count mismatch: got ${library.length}, expected ${EXPECTED_LIBRARY}`);
  gatePass = false;
}
if (matchResults.length !== EXPECTED_MATCH) {
  console.error(`❌ Match count mismatch: got ${matchResults.length}, expected ${EXPECTED_MATCH}`);
  gatePass = false;
}
if (idMatchCount !== 97) {
  console.error(`❌ Stable ID match count: got ${idMatchCount}, expected 97`);
  gatePass = false;
}
if (dateMatchCount !== 8) {
  console.error(`❌ DateAdded match count: got ${dateMatchCount}, expected 8`);
  gatePass = false;
}
if (discogsMatchCount !== 1) {
  console.error(`❌ DiscogsId match count: got ${discogsMatchCount}, expected 1`);
  gatePass = false;
}

if (!gatePass) {
  console.error("\n❌ Gate checks FAILED. Aborting — no writes.\n");
  // Still generate reports for analysis
  writeFileSync(
    resolve(REPORT_DIR, "match-report.json"),
    JSON.stringify({ matchResults, newCandidates, duplicateReview }, null, 2)
  );
  process.exit(1);
}

console.log("✅ All gate checks passed.\n");

/* ------------------------------------------------------------------ */
/*  Safe merge: field-level diff & merge for matched records           */
/* ------------------------------------------------------------------ */
const changes = [];
const mergedLibrary = [];
const coversBefore = new Map(library.map(a => [a.id, a.coverUrl]));
const favoritesBefore = new Set(library.filter(a => a.favorite).map(a => a.id));

function safeStringMerge(field, existing, incoming, albumId, csvRow, changes) {
  if (incoming === undefined || incoming === null || incoming === "") {
    return existing; // no new evidence → keep existing
  }
  if (existing === undefined || existing === null || existing === "" || existing === "none") {
    // Fill missing
    changes.push({
      albumId, sourceRow: csvRow, field,
      before: existing || null, after: incoming,
      confidence: "structured-source", reason: "CSV 补充缺失字段",
    });
    return incoming;
  }
  // Both have values — check if different
  if (String(existing).trim() === String(incoming).trim()) {
    return existing; // same value
  }
  // Conflict: keep existing, log for review
  changes.push({
    albumId, sourceRow: csvRow, field,
    before: existing, after: `[CONFLICT] ${incoming}`,
    confidence: "uncertain", reason: "新旧值冲突，保留现有值",
  });
  return existing;
}

function safeNumberMerge(field, existing, incoming, albumId, csvRow, changes) {
  if (incoming === undefined || incoming === null) return existing;
  if (existing === undefined || existing === null) {
    changes.push({
      albumId, sourceRow: csvRow, field,
      before: null, after: incoming,
      confidence: "structured-source", reason: "CSV 补充缺失字段",
    });
    return incoming;
  }
  if (existing === incoming) return existing;
  changes.push({
    albumId, sourceRow: csvRow, field,
    before: existing, after: `[CONFLICT] ${incoming}`,
    confidence: "uncertain", reason: "新旧值冲突，保留现有值",
  });
  return existing;
}

function safeArrayMerge(field, existing, incoming, albumId, csvRow, changes) {
  if (!incoming || incoming.length === 0) return existing;
  if (!existing || existing.length === 0) {
    changes.push({
      albumId, sourceRow: csvRow, field,
      before: null, after: incoming,
      confidence: "structured-source", reason: "CSV 补充缺失字段",
    });
    return incoming;
  }
  // Both have values — compare as sets
  const existSet = new Set(existing.map(s => String(s).trim()));
  const incomSet = new Set(incoming.map(s => String(s).trim()));
  const same = existSet.size === incomSet.size &&
    [...existSet].every(s => incomSet.has(s));
  if (same) return existing;
  // Different order is ok for some fields
  return existing;
}

function safeTrackMerge(existingTracklist, existingDurations, incomingTracklist, incomingDurations, albumId, csvRow, changes) {
  let finalTracklist = existingTracklist;
  let finalDurations = existingDurations;

  if (incomingTracklist && incomingTracklist.length > 0) {
    if (!existingTracklist || existingTracklist.length === 0) {
      // Fill missing tracklist
      finalTracklist = incomingTracklist;
      changes.push({
        albumId, sourceRow: csvRow, field: "tracklist",
        before: null, after: `[${incomingTracklist.length} tracks]`,
        confidence: "structured-source", reason: "CSV 补充曲目列表",
      });
    } else {
      // Both have tracklist — keep existing
      finalTracklist = existingTracklist;
    }
  }

  if (incomingDurations && incomingDurations.length > 0) {
    if (!existingDurations || existingDurations.length === 0) {
      // Only set durations if they align with final tracklist
      if (finalTracklist && incomingDurations.length === finalTracklist.length) {
        finalDurations = incomingDurations;
        const nonZero = incomingDurations.filter(d => d > 0).length;
        if (nonZero > 0) {
          changes.push({
            albumId, sourceRow: csvRow, field: "trackDurations",
            before: null, after: `[${nonZero} non-zero durations]`,
            confidence: "structured-source", reason: "CSV 补充曲目时长",
          });
        }
      }
    } else if (existingDurations && existingDurations.length === finalTracklist?.length) {
      // Merge durations: CSV 0 must not overwrite existing non-zero
      const merged = existingDurations.map((ed, i) => {
        const id = incomingDurations[i] || 0;
        if (ed > 0) return ed; // keep existing non-zero
        if (id > 0) return id; // fill with incoming non-zero
        return 0;
      });
      if (JSON.stringify(merged) !== JSON.stringify(existingDurations)) {
        finalDurations = merged;
        changes.push({
          albumId, sourceRow: csvRow, field: "trackDurations",
          before: existingDurations, after: merged,
          confidence: "structured-source", reason: "合并曲目时长（0秒不覆盖非零值）",
        });
      }
    }
  }

  return { tracklist: finalTracklist, trackDurations: finalDurations };
}

/* ------------------------------------------------------------------ */
/*  Process matched records                                            */
/* ------------------------------------------------------------------ */
console.log("=== Merging matched records ===");

for (const match of matchResults) {
  const existing = { ...match.existingData };
  const csv = match.csvData;
  const albumId = existing.id;
  const csvRow = csv.rowIndex;

  // PROTECTED fields: id, favorite, zone, dateAdded, coverUrl
  const merged = {
    id: existing.id,
    favorite: existing.favorite,
    zone: existing.zone || "unsorted",
    dateAdded: existing.dateAdded,
    coverUrl: existing.coverUrl, // NEVER change cover
  };

  // Safe merge each field
  merged.title = existing.title; // Keep existing (already Chinese-ized)
  merged.artist = existing.artist; // Keep existing (already Chinese-ized)
  merged.discogsId = safeNumberMerge("discogsId", existing.discogsId, csv.discogsId, albumId, csvRow, changes);
  merged.year = safeNumberMerge("year", existing.year, csv.year, albumId, csvRow, changes);
  merged.format = existing.format !== "unknown" ? existing.format : (csv.format !== "unknown" ? csv.format : existing.format);
  if (existing.format === "unknown" && csv.format !== "unknown") {
    changes.push({
      albumId, sourceRow: csvRow, field: "format",
      before: existing.format, after: csv.format,
      confidence: "structured-source", reason: "CSV 补充格式信息",
    });
    merged.format = csv.format;
  }

  // releaseDate: clean up fake YYYY-01-01
  let existingReleaseDate = existing.releaseDate;
  if (isFakeJan1(existingReleaseDate)) {
    changes.push({
      albumId, sourceRow: csvRow, field: "releaseDate",
      before: existingReleaseDate, after: null,
      confidence: "structured-source", reason: "清理虚假的 YYYY-01-01 日期",
    });
    existingReleaseDate = undefined;
  }
  merged.releaseDate = existingReleaseDate; // keep cleaned value

  // originalReleaseYear
  merged.originalReleaseYear = safeNumberMerge(
    "originalReleaseYear", existing.originalReleaseYear, csv.originalReleaseYear, albumId, csvRow, changes
  );

  // Barcode
  merged.barcode = safeStringMerge("barcode", existing.barcode, csv.barcode, albumId, csvRow, changes);

  // Catalog number
  merged.catalogNumber = safeStringMerge("catalogNumber", existing.catalogNumber, csv.catalogNumber, albumId, csvRow, changes);

  // Country
  merged.country = safeStringMerge("country", existing.country, csv.country, albumId, csvRow, changes);

  // Label
  merged.label = safeStringMerge("label", existing.label, csv.label, albumId, csvRow, changes);

  // Labels (new array field)
  merged.labels = safeArrayMerge("labels", existing.labels, csv.labels, albumId, csvRow, changes);

  // Genres
  merged.genres = safeArrayMerge("genres", existing.genres, csv.genres, albumId, csvRow, changes);

  // Styles
  merged.styles = safeArrayMerge("styles", existing.styles, csv.styles, albumId, csvRow, changes);

  // Producers
  merged.producers = safeArrayMerge("producers", existing.producers, csv.producers, albumId, csvRow, changes);

  // Edition
  merged.edition = safeStringMerge("edition", existing.edition, csv.edition, albumId, csvRow, changes);

  // Number of volumes
  merged.numberOfVolumes = safeNumberMerge("numberOfVolumes", existing.numberOfVolumes, csv.numberOfVolumes, albumId, csvRow, changes);

  // Purchase info
  merged.purchaseDate = safeStringMerge("purchaseDate", existing.purchaseDate, csv.purchaseDate, albumId, csvRow, changes);
  merged.purchasePrice = safeStringMerge("purchasePrice", existing.purchasePrice, csv.purchasePrice, albumId, csvRow, changes);

  // Tracks
  const { tracklist, trackDurations } = safeTrackMerge(
    existing.tracklist, existing.trackDurations,
    csv.tracklist, csv.trackDurations,
    albumId, csvRow, changes
  );
  merged.tracklist = tracklist;
  merged.trackDurations = trackDurations;

  // New structured fields
  merged.composers = safeArrayMerge("composers", existing.composers, csv.composers, albumId, csvRow, changes);
  merged.orchestras = safeArrayMerge("orchestras", existing.orchestras, csv.orchestras, albumId, csvRow, changes);
  merged.conductors = safeArrayMerge("conductors", existing.conductors, csv.conductors, albumId, csvRow, changes);
  merged.performers = safeArrayMerge("performers", existing.performers, csv.performers, albumId, csvRow, changes);
  merged.writers = safeArrayMerge("writers", existing.writers, csv.writers, albumId, csvRow, changes);
  merged.productionCompanies = safeArrayMerge("productionCompanies", existing.productionCompanies, csv.productionCompanies, albumId, csvRow, changes);

  // Keep existing fields that CSV doesn't have
  if (existing.doubanUrl) merged.doubanUrl = existing.doubanUrl;
  if (existing.vinylColor) merged.vinylColor = existing.vinylColor;
  if (existing.vinylStyle) merged.vinylStyle = existing.vinylStyle;

  // musicBuddySourceKey: derive from discogsId or dateAdded
  if (!existing.musicBuddySourceKey) {
    const sourceKey = csv.discogsId
      ? `discogs-${csv.discogsId}`
      : `dateadded-${csv.dateAdded}`;
    merged.musicBuddySourceKey = sourceKey;
  } else {
    merged.musicBuddySourceKey = existing.musicBuddySourceKey;
  }

  // Source metadata (store non-empty extra CSV fields)
  if (csv.sourceMetadata) {
    merged.sourceMetadataJson = JSON.stringify(csv.sourceMetadata);
  }

  // Clean up: remove undefined/null fields for clean JSON
  const cleaned = {};
  for (const [k, v] of Object.entries(merged)) {
    if (v !== undefined && v !== null && v !== "" &&
        !(Array.isArray(v) && v.length === 0)) {
      cleaned[k] = v;
    }
  }

  mergedLibrary.push(cleaned);
}

/* ------------------------------------------------------------------ */
/*  Process new candidates                                             */
/* ------------------------------------------------------------------ */
console.log("\n=== Processing new candidates ===");
const unresolved = [];
const newAlbums = [];

for (const csv of newCandidates) {
  const isArtistNone = csv.rawArtist === "NONE" || csv.rawArtist === "";
  const hasMultilineTitle = csv.rawTitle.includes("\n");
  const isOCRRecord = isArtistNone || hasMultilineTitle;

  // --- Special case: Row 23, 忽然有一天我离开了台北 (CD, different dateAdded) ---
  if (csv.rawTitle === "忽然有一天我离开了台北" && csv.rawArtist === "郑兴") {
    const existingMatch = matchResults.find(
      m => m.existingData.title === "忽然有一天我离开了台北"
    );
    if (existingMatch && csv.dateAdded !== existingMatch.existingData.dateAdded) {
      unresolved.push({
        csvRow: csv.rowIndex,
        title: csv.rawTitle, artist: csv.rawArtist,
        format: csv.format, dateAdded: csv.dateAdded,
        reason: "与现有记录标题相同但 Date Added 不同，可能是独立 CD 版本。需要人工确认是独立版本还是重复记录。",
        suggestion: "如确认是独立版本，建议新增。",
        csvData: csv,
      });
      continue;
    }
  }

  // --- Special case: 垂直活着 vinyl version ---
  if (csv.rawTitle.includes("垂直活") && csv.rawArtist === "艾怡良" && csv.format === "vinyl") {
    const newId = `musicbuddy-${stableHash(`new-${csv.discogsId || ""}-${csv.rawTitle}-${csv.rawArtist}-${csv.format}-${csv.dateAdded}`.toLowerCase())}`;
    const newAlbum = buildNewAlbum(csv, newId);
    newAlbum.title = "垂直活着，水平留恋着。";
    newAlbum.artist = "艾怡良";
    newAlbums.push(newAlbum);
    console.log(`  ✅ New (vinyl): Row ${csv.rowIndex} - ${newAlbum.title} / ${newAlbum.artist}`);
    continue;
  }

  // --- Special case: 盆地 vinyl version ---
  if (csv.rawTitle === "盆地" && csv.rawArtist === "郑兴" && csv.format === "vinyl") {
    const newId = `musicbuddy-${stableHash(`new-${csv.discogsId}-${csv.rawTitle}-${csv.rawArtist}-${csv.format}-${csv.dateAdded}`.toLowerCase())}`;
    const newAlbum = buildNewAlbum(csv, newId);
    newAlbums.push(newAlbum);
    console.log(`  ✅ New (vinyl): Row ${csv.rowIndex} - ${newAlbum.title} / ${newAlbum.artist}`);
    continue;
  }

  // --- Verified OCR records with confirmed identities ---

  // Row 71: ANDRE WATTS ILA CAMPANELIA → André Watts - Liszt: La Campanella
  // Verified via CBS Sony 23AC-548, pianistdiscography.com
  if (csv.rawArtist === "CAMPANELIA" && csv.rawTitle.includes("ANDRE WATTS")) {
    const newId = `musicbuddy-${stableHash(`new-andre-watts-la-campanella-${csv.dateAdded}`.toLowerCase())}`;
    const newAlbum = buildNewAlbum(csv, newId);
    newAlbum.artist = "André Watts";
    newAlbum.title = "Liszt: La Campanella";
    newAlbum.composers = ["Franz Liszt"];
    newAlbum.performers = ["André Watts"];
    newAlbum.format = "vinyl";
    changes.push({
      albumId: newId, sourceRow: csv.rowIndex, field: "artist",
      before: csv.rawArtist, after: "André Watts",
      sourceName: "pianistdiscography.com / Sekaimen",
      sourceUrl: "https://www.pianistdiscography.com/discography/pianistLabel.php?cdnum=17195",
      confidence: "cross-verified",
      reason: "通过 Agent Reach 搜索确认：André Watts 演奏 Liszt La Campanella，CBS Sony LP",
    });
    changes.push({
      albumId: newId, sourceRow: csv.rowIndex, field: "title",
      before: csv.rawTitle, after: "Liszt: La Campanella",
      confidence: "cross-verified",
      reason: "ILA CAMPANELIA 是 OCR 识别错误，应为 La Campanella",
    });
    newAlbums.push(newAlbum);
    console.log(`  ✅ New (verified): Row ${csv.rowIndex} - Liszt: La Campanella / André Watts`);
    continue;
  }

  // Row 87: GERISTMAS EVE / Seven on Seven → verified as Christmas Eve by Seven On Seven
  if (isArtistNone && csv.rawTitle.includes("GERISTMAS EVE")) {
    const newId = `musicbuddy-${stableHash(`new-seven-on-seven-christmas-eve-${csv.dateAdded}`.toLowerCase())}`;
    const newAlbum = buildNewAlbum(csv, newId);
    newAlbum.artist = "Seven On Seven";
    newAlbum.title = "Christmas Eve";
    newAlbum.format = "vinyl";
    // Year confirmed by some sources as 1999, others 1998 — leave empty per rules
    delete newAlbum.year;
    changes.push({
      albumId: newId, sourceRow: csv.rowIndex, field: "artist",
      before: "NONE", after: "Seven On Seven",
      sourceName: "FATMAN RECORDS / Yahoo Auctions Japan",
      sourceUrl: "https://fatman.ocnk.net/product/27605",
      confidence: "cross-verified",
      reason: "通过 Agent Reach 搜索确认：Seven On Seven - Christmas Eve，日本 12\" 单曲",
    });
    changes.push({
      albumId: newId, sourceRow: csv.rowIndex, field: "title",
      before: csv.rawTitle, after: "Christmas Eve",
      confidence: "cross-verified", reason: "GERISTMAS EVE 是 OCR 识别错误，应为 Christmas Eve",
    });
    newAlbums.push(newAlbum);
    console.log(`  ✅ New (verified): Row ${csv.rowIndex} - Christmas Eve / Seven On Seven`);
    continue;
  }

  // --- OCR / NONE artist → unresolved ---
  if (isOCRRecord) {
    unresolved.push({
      csvRow: csv.rowIndex,
      title: csv.rawTitle, artist: csv.rawArtist,
      format: csv.format, dateAdded: csv.dateAdded,
      reason: isArtistNone
        ? "Artist=NONE，无法确认专辑身份。需要人工通过封面、目录号或条码验证。"
        : "OCR 多行标题，可能存在拼写错误或信息位置混乱。需要人工验证。",
      coverUrl: csv.coverUrl, csvData: csv,
    });
    continue;
  }

  // --- Normal new candidate ---
  if (csv.rawTitle && csv.rawArtist) {
    const newId = `musicbuddy-${stableHash(`new-${csv.discogsId || ""}-${csv.rawTitle}-${csv.rawArtist}-${csv.format}-${csv.dateAdded}`.toLowerCase())}`;
    const newAlbum = buildNewAlbum(csv, newId);

    // Apply verified corrections
    applyVerifiedCorrections(newAlbum, csv, changes);

    newAlbums.push(newAlbum);
    console.log(`  ✅ New: Row ${csv.rowIndex} - ${newAlbum.title} / ${newAlbum.artist}`);
  } else {
    unresolved.push({
      csvRow: csv.rowIndex, title: csv.rawTitle, artist: csv.rawArtist,
      reason: "缺少必要的标题或艺人信息", csvData: csv,
    });
  }
}

function buildNewAlbum(csv, id) {
  const album = {
    id,
    title: csv.title,
    artist: csv.artist,
    format: csv.format,
    zone: "unsorted",
    dateAdded: csv.dateAdded || new Date().toISOString(),
  };

  // New albums can use CSV cover (including user-taken photos)
  if (csv.coverUrl) album.coverUrl = csv.coverUrl;
  else album.coverUrl = "/covers/cover-fallback.svg";

  if (csv.discogsId) album.discogsId = csv.discogsId;
  if (csv.year) album.year = csv.year;
  if (csv.originalReleaseYear) album.originalReleaseYear = csv.originalReleaseYear;
  if (csv.barcode) album.barcode = csv.barcode;
  if (csv.catalogNumber && csv.catalogNumber !== "none") album.catalogNumber = csv.catalogNumber;
  if (csv.country) album.country = csv.country;
  if (csv.label) album.label = csv.label;
  if (csv.labels) album.labels = csv.labels;
  if (csv.genres) album.genres = csv.genres;
  if (csv.styles) album.styles = csv.styles;
  if (csv.edition) album.edition = csv.edition;
  if (csv.numberOfVolumes) album.numberOfVolumes = csv.numberOfVolumes;
  if (csv.tracklist) album.tracklist = csv.tracklist;
  if (csv.trackDurations) album.trackDurations = csv.trackDurations;
  if (csv.producers) album.producers = csv.producers;
  if (csv.composers) album.composers = csv.composers;
  if (csv.orchestras) album.orchestras = csv.orchestras;
  if (csv.conductors) album.conductors = csv.conductors;
  if (csv.performers) album.performers = csv.performers;
  if (csv.writers) album.writers = csv.writers;
  if (csv.productionCompanies) album.productionCompanies = csv.productionCompanies;
  if (csv.purchaseDate) album.purchaseDate = csv.purchaseDate;
  if (csv.purchasePrice) album.purchasePrice = csv.purchasePrice;
  if (csv.sourceMetadata) album.sourceMetadataJson = JSON.stringify(csv.sourceMetadata);

  // musicBuddySourceKey
  album.musicBuddySourceKey = csv.discogsId
    ? `discogs-${csv.discogsId}`
    : `dateadded-${csv.dateAdded}`;

  return album;
}

/**
 * Apply verified corrections for records with confirmed identities.
 * Each correction is tracked in changes.json with source URL and confidence.
 */
function applyVerifiedCorrections(album, csv, changes) {
  const row = csv.rowIndex;

  // Row 15: Julie Sue - 搭錯車 → 苏芮 - 搭错车
  // Verified via Discogs 8720530, Bad Times Records, multiple sources
  if (csv.discogsId === 8720530 && csv.rawArtist === "Julie Sue") {
    const oldArtist = album.artist;
    const oldTitle = album.title;
    album.artist = "苏芮";
    album.title = "搭错车";
    changes.push({
      albumId: album.id, sourceRow: row, field: "artist",
      before: oldArtist, after: "苏芮",
      sourceName: "Discogs / Bad Times Records",
      sourceUrl: "https://badtimesrecords.com/shop/julie-sue-%E6%90%AD%E9%8C%AF%E8%BB%8A/",
      confidence: "cross-verified",
      reason: "Julie Sue 是苏芮（蘇芮）的英文名，已通过 Discogs 和唱片店确认",
    });
    changes.push({
      albumId: album.id, sourceRow: row, field: "title",
      before: oldTitle, after: "搭错车",
      sourceName: "Discogs",
      sourceUrl: "https://www.discogs.com/release/8720530",
      confidence: "cross-verified",
      reason: "繁体→简体规范化",
    });
  }

  // Row 94: L,V,MATACIC CZECH PHIL → structured classical data
  if (csv.rawArtist === "L,V,MATACIC CZECH PHIL") {
    album.title = "Bruckner: Symphony No. 7";
    album.artist = "Lovro von Matačić";
    album.conductors = ["Lovro von Matačić"];
    album.orchestras = ["Czech Philharmonic"];
    album.composers = ["Anton Bruckner"];
    album.format = "vinyl";
    changes.push({
      albumId: album.id, sourceRow: row, field: "artist",
      before: csv.rawArtist, after: "Lovro von Matačić",
      confidence: "cross-verified",
      reason: "L,V,MATACIC = Lovro von Matačić，知名指挥家",
    });
    changes.push({
      albumId: album.id, sourceRow: row, field: "title",
      before: csv.rawTitle, after: "Bruckner: Symphony No. 7",
      confidence: "structured-source",
      reason: "从 OCR 标题拆分出作品信息",
    });
  }

  // Row 72: ASHKENAZY → Vladimir Ashkenazy
  if (csv.rawArtist === "ASHKENAZY" && csv.rawTitle === "ASHKENAZY IN CONCERT") {
    album.artist = "Vladimir Ashkenazy";
    album.title = "Ashkenazy in Concert";
    album.format = "vinyl";
    changes.push({
      albumId: album.id, sourceRow: row, field: "artist",
      before: "ASHKENAZY", after: "Vladimir Ashkenazy",
      confidence: "cross-verified",
      reason: "ASHKENAZY = Vladimir Ashkenazy，知名钢琴家",
    });
  }

  // Row 67: young people's concerts → Leonard Bernstein
  if (csv.rawArtist === "young people's concerts") {
    album.artist = "Leonard Bernstein";
    album.title = "A Midsummer Night's Dream";
    album.conductors = ["Leonard Bernstein"];
    album.composers = ["Felix Mendelssohn"];
    album.format = "vinyl";
    changes.push({
      albumId: album.id, sourceRow: row, field: "artist",
      before: "young people's concerts", after: "Leonard Bernstein",
      confidence: "structured-source",
      reason: "Young People's Concerts 是 Leonard Bernstein 的教育音乐会系列",
    });
  }

  // Row 139: Mozart → proper formatting
  if (csv.rawArtist === "Mozart" && csv.rawTitle === "Wolfgang Amadeus Mozart Requiem") {
    album.title = "Mozart: Requiem";
    album.artist = "Wolfgang Amadeus Mozart";
    album.composers = ["Wolfgang Amadeus Mozart"];
    album.format = "vinyl";
    changes.push({
      albumId: album.id, sourceRow: row, field: "artist",
      before: "Mozart", after: "Wolfgang Amadeus Mozart",
      confidence: "structured-source", reason: "完整作曲家姓名",
    });
  }
}

/* ------------------------------------------------------------------ */
/*  Verify integrity                                                   */
/* ------------------------------------------------------------------ */
console.log("\n=== Integrity checks ===");

// Check all existing IDs preserved
const mergedIds = new Set(mergedLibrary.map(a => a.id));
let idIssues = 0;
for (const a of library) {
  if (!mergedIds.has(a.id)) {
    console.error(`  ❌ Missing existing ID: ${a.id} (${a.title})`);
    idIssues++;
  }
}
if (idIssues === 0) console.log("  ✅ All 106 existing IDs preserved");

// Check favorites preserved
const favoritesAfter = new Set(mergedLibrary.filter(a => a.favorite).map(a => a.id));
const favBefore = [...favoritesBefore];
const favAfter = [...favoritesAfter];
if (favBefore.length === favAfter.length &&
    favBefore.every(id => favoritesAfter.has(id))) {
  console.log(`  ✅ Favorites preserved (${favBefore.length})`);
} else {
  console.error(`  ❌ Favorites changed! Before: ${favBefore}, After: ${favAfter}`);
}

// Check covers preserved
let coverChanges = 0;
for (const a of mergedLibrary) {
  const before = coversBefore.get(a.id);
  if (before && a.coverUrl !== before) {
    console.error(`  ❌ Cover changed for ${a.id}: ${before} → ${a.coverUrl}`);
    coverChanges++;
  }
}
if (coverChanges === 0) console.log("  ✅ All existing covers preserved");

/* ------------------------------------------------------------------ */
/*  Statistics                                                         */
/* ------------------------------------------------------------------ */
const actualChanges = changes.filter(c => !c.after?.toString().startsWith("[CONFLICT]"));
const conflicts = changes.filter(c => c.after?.toString().startsWith("[CONFLICT]"));

// Field coverage analysis
function fieldCoverage(albums, field) {
  return albums.filter(a => {
    const v = a[field];
    if (v === undefined || v === null || v === "") return false;
    if (Array.isArray(v) && v.length === 0) return false;
    return true;
  }).length;
}

const coverageFields = [
  "discogsId", "year", "releaseDate", "originalReleaseYear", "barcode", "catalogNumber",
  "country", "label", "labels", "genres", "styles", "edition",
  "tracklist", "trackDurations", "producers", "composers", "conductors",
  "orchestras", "performers", "writers", "productionCompanies",
  "musicBuddySourceKey", "sourceMetadataJson",
];

const coverageBefore = {};
const coverageAfter = {};
for (const f of coverageFields) {
  coverageBefore[f] = fieldCoverage(library, f);
  coverageAfter[f] = fieldCoverage(mergedLibrary, f);
}

// Count fake Jan 1 cleaned
const fakeJan1Cleaned = changes.filter(c =>
  c.field === "releaseDate" && c.reason?.includes("虚假的 YYYY-01-01")
).length;

// Count new tracks
const newTrackChanges = changes.filter(c => c.field === "tracklist" && c.before === null);
const newDurationChanges = changes.filter(c => c.field === "trackDurations" && c.before === null);

/* ------------------------------------------------------------------ */
/*  Generate reports                                                   */
/* ------------------------------------------------------------------ */
console.log("\n=== Generating reports ===");

// match-report.json
const matchReport = matchResults.map(m => ({
  csvRow: m.csvRow,
  method: m.method,
  existingId: m.existingId,
  csvTitle: m.csvTitle,
  csvArtist: m.csvArtist,
  existingTitle: m.existingTitle,
  existingArtist: m.existingArtist,
}));
writeFileSync(resolve(REPORT_DIR, "match-report.json"), JSON.stringify(matchReport, null, 2));

// match-report.csv
const matchCsvHeader = "csvRow,method,existingId,csvTitle,csvArtist,existingTitle,existingArtist";
const matchCsvRows = matchReport.map(m =>
  `${m.csvRow},${m.method},"${m.existingId}","${(m.csvTitle || "").replace(/"/g, '""')}","${(m.csvArtist || "").replace(/"/g, '""')}","${(m.existingTitle || "").replace(/"/g, '""')}","${(m.existingArtist || "").replace(/"/g, '""')}"`
);
writeFileSync(resolve(REPORT_DIR, "match-report.csv"), [matchCsvHeader, ...matchCsvRows].join("\n"));

// changes.json
writeFileSync(resolve(REPORT_DIR, "changes.json"), JSON.stringify(changes, null, 2));

// unresolved.json
const unresolvedReport = unresolved.map(u => ({
  csvRow: u.csvRow,
  title: u.title,
  artist: u.artist,
  format: u.format,
  dateAdded: u.dateAdded,
  reason: u.reason,
  suggestion: u.suggestion,
  coverUrl: u.coverUrl,
}));
writeFileSync(resolve(REPORT_DIR, "unresolved.json"), JSON.stringify(unresolvedReport, null, 2));

// duplicate-review.json
writeFileSync(resolve(REPORT_DIR, "duplicate-review.json"), JSON.stringify(duplicateReview.map(d => ({
  csvRow: d.csvRow,
  title: d.title,
  artist: d.artist,
  discogsId: d.discogsId,
  barcode: d.barcode,
  dateAdded: d.dateAdded,
  matchedExistingId: d.matchedExistingId,
  reason: d.reason,
})), null, 2));

// coverage-before-after.md
let coverageMd = "# 字段覆盖率对比\n\n";
coverageMd += `| 字段 | 对账前 (/${library.length}) | 对账后 (/${mergedLibrary.length}) | 变化 |\n`;
coverageMd += "|------|------|------|------|\n";
for (const f of coverageFields) {
  const b = coverageBefore[f] || 0;
  const a = coverageAfter[f] || 0;
  const diff = a - b;
  coverageMd += `| ${f} | ${b} | ${a} | ${diff > 0 ? "+" : ""}${diff} |\n`;
}
coverageMd += `\n## 统计\n\n`;
coverageMd += `- CSV 总行数: ${csvRows.length}\n`;
coverageMd += `- 当前记录数: ${library.length}\n`;
coverageMd += `- 精确匹配数: ${matchResults.length}\n`;
coverageMd += `  - 稳定 ID: ${idMatchCount}\n`;
coverageMd += `  - 唯一 DateAdded: ${dateMatchCount}\n`;
coverageMd += `  - Discogs ID: ${discogsMatchCount}\n`;
coverageMd += `  - Barcode: ${barcodeMatchCount}\n`;
coverageMd += `- 实际变更字段: ${actualChanges.length}\n`;
coverageMd += `- 冲突（保留原值）: ${conflicts.length}\n`;
coverageMd += `- 新增专辑: ${newAlbums.length}\n`;
coverageMd += `- 待确认: ${unresolved.length}\n`;
coverageMd += `- 重复候选: ${duplicateReview.length}\n`;
coverageMd += `- 清理虚假 YYYY-01-01: ${fakeJan1Cleaned}\n`;
coverageMd += `- 新增曲目列表: ${newTrackChanges.length}\n`;
coverageMd += `- 新增时长数据: ${newDurationChanges.length}\n`;
writeFileSync(resolve(REPORT_DIR, "coverage-before-after.md"), coverageMd);

// merged-library.json (existing + new)
const fullMergedLibrary = [...mergedLibrary, ...newAlbums];
writeFileSync(resolve(REPORT_DIR, "merged-library.json"),
  JSON.stringify(fullMergedLibrary, null, 2) + "\n"
);

console.log(`  📄 match-report.json / .csv`);
console.log(`  📄 changes.json (${changes.length} entries)`);
console.log(`  📄 unresolved.json (${unresolved.length} entries)`);
console.log(`  📄 duplicate-review.json (${duplicateReview.length} entries)`);
console.log(`  📄 coverage-before-after.md`);
console.log(`  📄 merged-library.json (${fullMergedLibrary.length} albums)`);

/* ------------------------------------------------------------------ */
/*  Apply local                                                        */
/* ------------------------------------------------------------------ */
if (APPLY_LOCAL) {
  console.log("\n=== Applying to local seed ===");

  // Backup current
  const backupPath = resolve(REPORT_DIR, "initial-library.json.backup");
  copyFileSync(LIBRARY_PATH, backupPath);
  console.log(`  💾 Backup: ${backupPath}`);

  // Write merged library
  writeFileSync(LIBRARY_PATH, JSON.stringify(fullMergedLibrary, null, 2) + "\n");
  console.log(`  ✅ Updated ${LIBRARY_PATH} (${fullMergedLibrary.length} albums)`);
}

if (APPLY_LIVE) {
  console.log("\n=== Apply live ===");
  console.log("  ⚠️  线上写入需要 D1 鉴权和备份机制。");
  console.log("  ⚠️  当前脚本不直接写入线上 D1。");
  console.log("  ⚠️  请通过 wrangler d1 或应用 API 完成线上同步。");
}

/* ------------------------------------------------------------------ */
/*  Final summary                                                      */
/* ------------------------------------------------------------------ */
console.log("\n" + "=".repeat(60));
console.log("=== 对账结果汇总 ===");
console.log("=".repeat(60));
console.log(`CSV 总行数:      ${csvRows.length}`);
console.log(`当前记录数:      ${library.length}`);
console.log(`精确匹配数:      ${matchResults.length}`);
console.log(`  稳定 ID:       ${idMatchCount}`);
console.log(`  唯一 DateAdded: ${dateMatchCount}`);
console.log(`  Discogs ID:    ${discogsMatchCount}`);
console.log(`  Barcode:       ${barcodeMatchCount}`);
console.log(`新增专辑:        ${newAlbums.length}`);
console.log(`待确认:          ${unresolved.length}`);
console.log(`重复候选:        ${duplicateReview.length}`);
console.log(`字段补充:        ${actualChanges.length}`);
console.log(`字段冲突(保留):  ${conflicts.length}`);
console.log(`YYYY-01-01清理:  ${fakeJan1Cleaned}`);
console.log(`合并后总数:      ${fullMergedLibrary.length}`);
console.log();

// Per-field change counts
const fieldChangeCounts = {};
for (const c of actualChanges) {
  fieldChangeCounts[c.field] = (fieldChangeCounts[c.field] || 0) + 1;
}
console.log("字段级变更统计:");
for (const [f, n] of Object.entries(fieldChangeCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${f}: ${n}`);
}

if (unresolved.length > 0) {
  console.log("\nUnresolved 列表:");
  for (const u of unresolved) {
    console.log(`  Row ${u.csvRow}: [${u.artist}] ${u.title} — ${u.reason}`);
  }
}

if (duplicateReview.length > 0) {
  console.log("\nDuplicate review 列表:");
  for (const d of duplicateReview) {
    console.log(`  Row ${d.csvRow}: [${d.artist}] ${d.title} — ${d.reason}`);
  }
}

console.log(`\nReports saved to: ${REPORT_DIR}`);
console.log(`Mode: ${APPLY_LOCAL ? "✅ 已写入本地" : APPLY_LIVE ? "⚠️ 线上写入待确认" : "🔍 dry-run 模式"}`);
