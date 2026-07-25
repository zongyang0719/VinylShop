const MB_BASE = "https://musicbrainz.org/ws/2";
const COVER_BASE = "https://coverartarchive.org";
const UA = "VinylShop/1.0 (https://github.com/vinylshop)";

function escapeLucene(value: string) {
  return value.replace(/([+\-&|!(){}[\]^"~*?:\\/])/g, "\\$1");
}

type MBRelease = {
  id: string;
  score: number;
  title: string;
  status?: string;
  date?: string;
  country?: string;
  "artist-credit"?: Array<{
    name: string;
    artist: { id: string; name: string };
  }>;
  "release-group"?: {
    id: string;
    title: string;
    "primary-type"?: string;
  };
  "label-info"?: Array<{
    "catalog-number"?: string;
    label?: { name: string };
  }>;
  media?: Array<{
    format?: string;
    "track-count"?: number;
  }>;
  "track-count"?: number;
};

type MBRecording = {
  id: string;
  title: string;
  length?: number;
  number?: string;
  position?: number;
};

function getCoverUrl(mbid: string): string {
  return `${COVER_BASE}/release/${mbid}/front-500`;
}

function fallbackImage() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">
    <rect width="800" height="800" fill="#29231f"/>
    <circle cx="400" cy="400" r="250" fill="#151311" stroke="#52453c" stroke-width="3"/>
    <circle cx="400" cy="400" r="80" fill="#9c4636"/>
    <circle cx="400" cy="400" r="12" fill="#ddc68f"/>
    <path d="M205 400h390M400 205v390" stroke="#4b413a" stroke-width="2" opacity=".5"/>
    <text x="400" y="720" text-anchor="middle" fill="#b9aa9e" font-family="serif" font-size="34" letter-spacing="9">VINYLSHOP</text>
  </svg>`;
  return new Response(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();
  const title = searchParams.get("title")?.trim();
  const artist = searchParams.get("artist")?.trim();
  const id = searchParams.get("id");
  const imageUrl = searchParams.get("img");

  if (imageUrl) {
    try {
      const res = await fetch(imageUrl, {
        headers: { "User-Agent": UA },
        redirect: "follow",
      });
      if (!res.ok) return fallbackImage();
      const ct = res.headers.get("content-type") || "image/jpeg";
      const body = await res.arrayBuffer();
      return new Response(body, {
        headers: { "Content-Type": ct, "Cache-Control": "public, max-age=86400" },
      });
    } catch {
      return fallbackImage();
    }
  }

  if (id) {
    try {
      const res = await fetch(
        `${MB_BASE}/release/${id}?inc=recordings+artists+labels&fmt=json`,
        { headers: { "User-Agent": UA } },
      );
      if (!res.ok) {
        return Response.json(
          { error: `MusicBrainz 暂时没有回应（${res.status}）` },
          { status: res.status },
        );
      }
      const data = (await res.json()) as MBRelease & {
        media?: Array<{
          format?: string;
          tracks?: MBRecording[];
        }>;
      };

      const tracks: string[] = [];
      if (data.media) {
        for (const medium of data.media) {
          if (medium.tracks) {
            for (const t of medium.tracks) {
              const prefix = t.number || t.position ? `${t.number || t.position}. ` : "";
              tracks.push(`${prefix}${t.title}`);
            }
          }
        }
      }

      return Response.json({
        id: data.id,
        title: data.title,
        artist: data["artist-credit"]?.map((c) => c.name).join(", ") || "",
        date: data.date || "",
        country: data.country || "",
        label: data["label-info"]?.[0]?.label?.name || "",
        format: data.media?.[0]?.format || "",
        coverUrl: getCoverUrl(data.id),
        tracks,
      });
    } catch {
      return Response.json({ error: "无法连接 MusicBrainz" }, { status: 502 });
    }
  }

  if (query) {
    try {
      const structuredQuery =
        title && artist
          ? `release:"${escapeLucene(title)}" AND artist:"${escapeLucene(artist)}"`
          : query;
      const params = new URLSearchParams({
        query: structuredQuery,
        fmt: "json",
        limit: "15",
      });
      const res = await fetch(`${MB_BASE}/release/?${params.toString()}`, {
        headers: { "User-Agent": UA },
      });
      if (!res.ok) {
        return Response.json(
          { error: `MusicBrainz 搜索失败（${res.status}）` },
          { status: res.status },
        );
      }
      const data = (await res.json()) as { releases?: MBRelease[] };

      const results = (data.releases ?? []).map((r) => ({
        id: r.id,
        title: r.title,
        artist: r["artist-credit"]?.map((c) => c.name).join(", ") || "",
        year: r.date?.slice(0, 4) || "",
        country: r.country || "",
        label: r["label-info"]?.[0]?.label?.name || "",
        format: r.media?.[0]?.format || "",
        trackCount: r["track-count"] || 0,
        type: r["release-group"]?.["primary-type"] || "",
        coverUrl: getCoverUrl(r.id),
        score: r.score,
      }));

      return Response.json({ results });
    } catch {
      return Response.json({ error: "无法连接 MusicBrainz" }, { status: 502 });
    }
  }

  return Response.json({ error: "缺少搜索词或条目 ID" }, { status: 400 });
}
