export type iTunesResult = {
  id: number;
  title: string;
  artist: string;
  coverUrl: string;
  year: string;
  releaseDate: string;
  genre: string;
  viewUrl: string;
};

export type iTunesAlbumDetail = iTunesResult & {
  tracks: string[];
};

export async function searchItunes(query: string): Promise<iTunesResult[]> {
  const url = `https://itunes.apple.com/search?${new URLSearchParams({
    term: query,
    entity: "album",
    limit: "50",
  })}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = (await res.json()) as {
    results: Array<{
      collectionId: number;
      collectionName: string;
      artistName: string;
      artworkUrl100: string;
      releaseDate?: string;
      primaryGenreName?: string;
      collectionViewUrl?: string;
    }>;
  };
  return (data.results || []).map((r) => ({
    id: r.collectionId,
    title: r.collectionName || "",
    artist: r.artistName || "",
    coverUrl: (r.artworkUrl100 || "").replace("100x100bb", "600x600bb"),
    year: r.releaseDate ? r.releaseDate.slice(0, 4) : "",
    releaseDate: r.releaseDate || "",
    genre: r.primaryGenreName || "",
    viewUrl: r.collectionViewUrl || "",
  }));
}

export async function getItunesAlbum(id: number): Promise<iTunesAlbumDetail> {
  const url = `https://itunes.apple.com/lookup?${new URLSearchParams({
    id: String(id),
    entity: "song",
  })}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Apple Music 暂时没有回应");
  const data = (await res.json()) as {
    results: Array<{
      wrapperType: string;
      collectionId?: number;
      collectionName?: string;
      artistName?: string;
      artworkUrl100?: string;
      releaseDate?: string;
      primaryGenreName?: string;
      collectionViewUrl?: string;
      trackName?: string;
      trackNumber?: number;
    }>;
  };
  const collection = data.results.find(
    (item) => item.wrapperType === "collection",
  );
  const tracks = data.results
    .filter(
      (item) =>
        item.wrapperType === "track" &&
        item.collectionId === id &&
        item.trackName,
    )
    .sort((a, b) => (a.trackNumber ?? 0) - (b.trackNumber ?? 0))
    .map((item) => item.trackName as string);

  return {
    id,
    title: collection?.collectionName || "",
    artist: collection?.artistName || "",
    coverUrl: (collection?.artworkUrl100 || "").replace(
      "100x100bb",
      "1200x1200bb",
    ),
    year: collection?.releaseDate?.slice(0, 4) || "",
    releaseDate: collection?.releaseDate || "",
    genre: collection?.primaryGenreName || "",
    viewUrl: collection?.collectionViewUrl || "",
    tracks,
  };
}
