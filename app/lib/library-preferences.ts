export type GalleryDisplayMode = "standard" | "covers";
export type LibraryFormatFilter = "all" | "vinyl" | "cd";
export type LibrarySortMode = "added" | "artist" | "title" | "year";

export type LibraryPreferences = {
  displayMode: GalleryDisplayMode;
  formatFilter: LibraryFormatFilter;
  sortMode: LibrarySortMode;
};

export const DEFAULT_LIBRARY_PREFERENCES: LibraryPreferences = {
  displayMode: "standard",
  formatFilter: "all",
  sortMode: "added",
};

const displayModes = new Set<GalleryDisplayMode>(["standard", "covers"]);
const formatFilters = new Set<LibraryFormatFilter>(["all", "vinyl", "cd"]);
const sortModes = new Set<LibrarySortMode>([
  "added",
  "artist",
  "title",
  "year",
]);

const PREFERENCES_CACHE_KEY = "vinylshop_library_preferences";
const PREFERENCES_CACHE_VERSION = 1;

export type CachedLibraryPreferences = {
  preferences: LibraryPreferences;
  pendingSync: boolean;
};

type PreferencesResponse = {
  preferences?: LibraryPreferences;
  error?: string;
};

export function parseLibraryPreferences(
  value: unknown,
): LibraryPreferences | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const input = value as Partial<LibraryPreferences>;
  if (
    !displayModes.has(input.displayMode as GalleryDisplayMode) ||
    !formatFilters.has(input.formatFilter as LibraryFormatFilter) ||
    !sortModes.has(input.sortMode as LibrarySortMode)
  ) {
    return null;
  }

  return {
    displayMode: input.displayMode as GalleryDisplayMode,
    formatFilter: input.formatFilter as LibraryFormatFilter,
    sortMode: input.sortMode as LibrarySortMode,
  };
}

export function readCachedLibraryPreferencesState():
  | CachedLibraryPreferences
  | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(PREFERENCES_CACHE_KEY);
    if (!raw) {
      return null;
    }
    const cached = JSON.parse(raw) as {
      version?: number;
      preferences?: unknown;
      pendingSync?: boolean;
    };
    if (cached.version !== PREFERENCES_CACHE_VERSION) {
      return null;
    }
    const preferences = parseLibraryPreferences(cached.preferences);
    if (!preferences) {
      return null;
    }
    return {
      preferences,
      pendingSync: cached.pendingSync === true,
    };
  } catch {
    return null;
  }
}

export function readCachedLibraryPreferences(): LibraryPreferences | null {
  return readCachedLibraryPreferencesState()?.preferences ?? null;
}

export function cacheLibraryPreferences(
  preferences: LibraryPreferences,
  pendingSync = false,
) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      PREFERENCES_CACHE_KEY,
      JSON.stringify({
        version: PREFERENCES_CACHE_VERSION,
        preferences,
        pendingSync,
      }),
    );
  } catch {
    // The D1 copy remains authoritative if browser storage is unavailable.
  }
}

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || "显示设置暂时无法同步");
  }
  return data;
}

export async function fetchLibraryPreferences(): Promise<LibraryPreferences> {
  const response = await fetch("/api/preferences", { cache: "no-store" });
  const data = await readJson<PreferencesResponse>(response);
  const preferences = parseLibraryPreferences(data.preferences);
  if (!preferences) {
    throw new Error("云端显示设置格式无效");
  }
  cacheLibraryPreferences(preferences);
  return preferences;
}

export async function saveLibraryPreferences(
  preferences: LibraryPreferences,
): Promise<LibraryPreferences> {
  cacheLibraryPreferences(preferences, true);
  const response = await fetch("/api/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(preferences),
  });
  const data = await readJson<PreferencesResponse>(response);
  const saved = parseLibraryPreferences(data.preferences);
  if (!saved) {
    throw new Error("云端没有返回有效的显示设置");
  }
  cacheLibraryPreferences(saved);
  return saved;
}
