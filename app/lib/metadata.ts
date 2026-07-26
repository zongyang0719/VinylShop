import type { Album } from "./store";

export type MetadataSource =
  | "apple"
  | "musicbrainz"
  | "discogs"
  | "wikidata"
  | "opencc";

export type MetadataField =
  | "title"
  | "artist"
  | "year"
  | "releaseDate"
  | "label"
  | "genres"
  | "styles"
  | "country"
  | "catalogNumber"
  | "producers"
  | "edition"
  | "barcode"
  | "tracklist";

export type MetadataProposal = Partial<
  Pick<
    Album,
    | MetadataField
  >
>;

export type MetadataSourceState = {
  source: Exclude<MetadataSource, "opencc">;
  label: string;
  status: "matched" | "no-match" | "unavailable";
};

export type MetadataSuggestion = {
  proposal: MetadataProposal;
  provenance: Partial<Record<MetadataField, MetadataSource[]>>;
  confidence: "high" | "medium" | "review";
  summary: string;
  sourceStates: MetadataSourceState[];
};

export type MetadataRequest = Pick<
  Album,
  | "title"
  | "artist"
  | "year"
  | "releaseDate"
  | "discogsId"
  | "barcode"
  | "format"
>;

export async function suggestAlbumMetadata(
  album: MetadataRequest,
): Promise<MetadataSuggestion> {
  const response = await fetch("/api/metadata", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(album),
  });
  const data = (await response.json()) as MetadataSuggestion & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(data.error || "暂时无法更新专辑信息");
  }
  return data;
}
