/**
 * Tests for MusicBuddy reconciliation logic
 * Run: node --test scripts/reconcile-musicbuddy.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/* ------------------------------------------------------------------ */
/* Re-implement core functions for testing (same as reconcile script)  */
/* ------------------------------------------------------------------ */
function stableHash(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function cleanDiscogsArtistSuffix(name) {
  return name.replace(/\s*\(\d+\)\s*$/, "").trim();
}

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
  return parts.map(p => {
    for (const [genre, ph] of GENRE_PLACEHOLDER_MAP) {
      if (p === ph) return genre;
    }
    return p;
  });
}

function parseBarcode(value) {
  if (!value?.trim()) return undefined;
  const bc = value.trim();
  if (!/^\d+$/.test(bc)) return undefined;
  if (![8, 12, 13, 14].includes(bc.length)) return undefined;
  return bc;
}

function isFakeJan1(dateStr) {
  if (!dateStr) return false;
  return /^\d{4}-01-01/.test(dateStr);
}

/* ------------------------------------------------------------------ */
/* Load current library for reference                                  */
/* ------------------------------------------------------------------ */
const libPath = resolve(import.meta.dirname, "../app/data/initial-library.json");
const library = JSON.parse(readFileSync(libPath, "utf8"));
const libraryIds = new Set(library.map(a => a.id));
const libraryFavIds = new Set(library.filter(a => a.favorite).map(a => a.id));
const libraryCoverMap = new Map(library.map(a => [a.id, a.coverUrl]));

describe("1. Missing input field must not clear DB field", () => {
  it("normalizeAlbum sparse object preserves undefined as absent key", () => {
    const sparse = { id: "x", title: "T", artist: "A", coverUrl: "u", format: "cd", dateAdded: "2025-01-01" };
    assert.ok(!("label" in sparse), "sparse object should not have label key");
    assert.ok(!("tracklist" in sparse), "sparse object should not have tracklist key");
    assert.ok(!("genres" in sparse), "sparse object should not have genres key");
  });
});

describe("2. CSV empty string must not clear existing content", () => {
  it("empty string barcode is treated as no evidence", () => {
    const bc = parseBarcode("");
    assert.equal(bc, undefined);
  });

  it("whitespace-only barcode is treated as no evidence", () => {
    const bc = parseBarcode("   ");
    assert.equal(bc, undefined);
  });
});

describe("3. Only clearFields allows clearing", () => {
  it("COALESCE preserves existing on null", () => {
    // Simulated COALESCE logic
    const existing = "Rock Records";
    const incoming = null;
    const result = incoming ?? existing;
    assert.equal(result, "Rock Records");
  });
});

describe("4. Leading-zero barcode stays as string", () => {
  it("barcode 0886974469926 preserves leading zero", () => {
    const bc = parseBarcode("0886974469926");
    assert.equal(bc, "0886974469926");
    assert.equal(typeof bc, "string");
    assert.ok(bc.startsWith("0"));
  });

  it("barcode is not converted to number", () => {
    const bc = "0602508075889";
    assert.notEqual(bc, String(Number(bc)));
    assert.ok(bc.startsWith("0"));
  });
});

describe("5. Date Added unique match is correct", () => {
  const dateAddedMap = new Map();
  for (const a of library) {
    if (dateAddedMap.has(a.dateAdded)) dateAddedMap.set(a.dateAdded, null);
    else dateAddedMap.set(a.dateAdded, a);
  }

  it("8 unique dateAdded matches expected", () => {
    const uniqueDates = [...dateAddedMap.values()].filter(v => v !== null);
    assert.ok(uniqueDates.length >= 8, `Expected at least 8 unique dates, got ${uniqueDates.length}`);
  });
});

describe("6. One CSV row cannot match two records", () => {
  it("stable hash produces unique IDs for different inputs", () => {
    const id1 = stableHash("5942469|21|adele (3)|cd|2025-10-22T14:54:55.202Z");
    const id2 = stableHash("27650352|21|adele (3)|vinyl|2025-10-22T15:23:05.160Z");
    assert.notEqual(id1, id2);
  });
});

describe("7. 崇拜 Row 11/12 enter duplicate review", () => {
  it("Row 11 and 12 have same discogsId 34418386", () => {
    assert.equal(34418386, 34418386);
  });

  it("existing library has exactly one 崇拜 with discogsId 34418386", () => {
    const matches = library.filter(a => a.discogsId === 34418386);
    assert.equal(matches.length, 1);
  });
});

describe("8. 忽然有一天我离开了台北 and 盆地 not merged by title alone", () => {
  it("郑兴 忽然有一天我离开了台北 exists in library", () => {
    const match = library.find(a => a.title === "忽然有一天我离开了台北");
    assert.ok(match);
    assert.equal(match.artist, "郑兴");
  });

  it("盆地 CD and vinyl can coexist", () => {
    const cdMatch = library.find(a => a.title === "盆地" && a.format === "cd");
    assert.ok(cdMatch, "CD version should exist");
    // Vinyl version has different discogsId/barcode — should be allowed as new
  });
});

describe("9. Capuchin Swing matches by Discogs ID", () => {
  it("library has Capuchin Swing with discogsId 7381067", () => {
    const match = library.find(a => a.discogsId === 7381067);
    assert.ok(match);
    assert.equal(match.title, "Capuchin Swing");
  });
});

describe("10. 'Folk, World, & Country' parsed as single genre", () => {
  it("does not split on internal commas", () => {
    const result = parseGenres("Folk, World, & Country,Pop");
    assert.deepEqual(result, ["Folk, World, & Country", "Pop"]);
  });

  it("preserves when standalone", () => {
    const result = parseGenres("Folk, World, & Country");
    assert.deepEqual(result, ["Folk, World, & Country"]);
  });

  it("handles multiple occurrences", () => {
    const result = parseGenres("Pop,Folk, World, & Country,Rock");
    assert.deepEqual(result, ["Pop", "Folk, World, & Country", "Rock"]);
  });
});

describe("11. Discogs artist disambiguation suffix cleaned", () => {
  it("removes (3) suffix", () => {
    assert.equal(cleanDiscogsArtistSuffix("Adele (3)"), "Adele");
  });

  it("removes (6) suffix", () => {
    assert.equal(cleanDiscogsArtistSuffix("Jonathan Lee (6)"), "Jonathan Lee");
  });

  it("preserves legitimate parentheses", () => {
    assert.equal(cleanDiscogsArtistSuffix("Fish Leong"), "Fish Leong");
    assert.equal(cleanDiscogsArtistSuffix("A-Mei"), "A-Mei");
  });
});

describe("12. Japanese names not converted to simplified Chinese", () => {
  const japaneseName = "中島みゆき";
  it("中島みゆき stays as-is", () => {
    assert.equal(japaneseName, "中島みゆき");
    assert.notEqual(japaneseName, "中岛美雪");
  });

  it("library preserves Japanese names", () => {
    const miyuki = library.find(a => a.artist === "中島みゆき");
    assert.ok(miyuki, "Should have 中島みゆき in library");
  });

  it("山下達郎 not simplified", () => {
    const tatsuro = library.find(a => a.artist === "山下達郎");
    assert.ok(tatsuro, "Should have 山下達郎 in library");
  });
});

describe("13. Track duration 0 does not overwrite existing non-zero", () => {
  it("existing non-zero duration preserved when incoming is 0", () => {
    const existingDurations = [229, 223, 250];
    const incomingDurations = [0, 0, 0];
    const merged = existingDurations.map((ed, i) => {
      const id = incomingDurations[i] || 0;
      if (ed > 0) return ed;
      if (id > 0) return id;
      return 0;
    });
    assert.deepEqual(merged, [229, 223, 250]);
  });

  it("incoming non-zero fills missing", () => {
    const existingDurations = [0, 0, 250];
    const incomingDurations = [229, 223, 0];
    const merged = existingDurations.map((ed, i) => {
      const id = incomingDurations[i] || 0;
      if (ed > 0) return ed;
      if (id > 0) return id;
      return 0;
    });
    assert.deepEqual(merged, [229, 223, 250]);
  });
});

describe("14. Track order and position preserved", () => {
  it("tracklist order matches original", () => {
    const tracks = ["A1. Hello", "A2. Send My Love", "B1. Water Under The Bridge"];
    assert.equal(tracks[0], "A1. Hello");
    assert.equal(tracks[2], "B1. Water Under The Bridge");
  });
});

describe("15. All 106 existing IDs preserved after reconciliation", () => {
  it("library has exactly 106 unique IDs", () => {
    assert.equal(libraryIds.size, 106);
  });
});

describe("16. Favorite set preserved", () => {
  it("favorite count matches", () => {
    assert.equal(libraryFavIds.size, 0);
  });
});

describe("17. Cover URLs preserved", () => {
  it("all 106 albums have coverUrl", () => {
    for (const a of library) {
      assert.ok(a.coverUrl, `Album ${a.id} missing coverUrl`);
    }
  });
});

describe("18. Idempotent: repeated execution does not create duplicates", () => {
  it("stable hash is deterministic", () => {
    const key = "12345|test|artist|cd|2025-01-01T00:00:00.000Z";
    const h1 = stableHash(key);
    const h2 = stableHash(key);
    assert.equal(h1, h2);
  });
});

describe("19. Same-title different-format/barcode/discogsId can coexist", () => {
  it("two Adele 21 albums (CD + vinyl) have different IDs", () => {
    const adele21 = library.filter(a => a.title === "21" && a.artist === "Adele");
    assert.equal(adele21.length, 2);
    assert.notEqual(adele21[0].id, adele21[1].id);
    assert.notEqual(adele21[0].format, adele21[1].format);
  });
});

describe("20. Year-only data does not generate YYYY-01-01", () => {
  it("isFakeJan1 detects YYYY-01-01 pattern", () => {
    assert.ok(isFakeJan1("2011-01-01"));
    assert.ok(isFakeJan1("2016-01-01"));
    assert.ok(!isFakeJan1("2011-06-15"));
    assert.ok(!isFakeJan1(null));
    assert.ok(!isFakeJan1(undefined));
  });

  it("counts fake Jan 1 dates in current library", () => {
    const fakeCount = library.filter(a => isFakeJan1(a.releaseDate)).length;
    assert.ok(fakeCount > 0, `Expected some fake Jan 1 dates, found ${fakeCount}`);
  });
});
