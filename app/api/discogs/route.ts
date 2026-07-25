const BASE = "https://api.discogs.com";

async function discogsFetch(path: string) {
  const token =
    process.env.DISCOGS_TOKEN || process.env.NEXT_PUBLIC_DISCOGS_TOKEN;

  if (!token || token === "你的_Personal_Access_Token") {
    return Response.json(
      { error: "Discogs Token 还没有配置" },
      { status: 503 },
    );
  }

  const response = await fetch(`${BASE}${path}`, {
    headers: {
      Authorization: `Discogs token=${token}`,
      Accept: "application/vnd.discogs.v2.discogs+json",
      "User-Agent": "VinylShop/1.0",
    },
  });

  if (!response.ok) {
    const message =
      response.status === 401
        ? "Discogs Token 无效"
        : response.status === 429
          ? "Discogs 请求太频繁，请稍后再试"
          : `Discogs 暂时没有回应（${response.status}）`;
    return Response.json({ error: message }, { status: response.status });
  }

  return Response.json(await response.json());
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();
  const id = Number(searchParams.get("id"));

  if (query) {
    const params = new URLSearchParams({
      q: query,
      type: "release",
      per_page: "3",
    });
    return discogsFetch(`/database/search?${params.toString()}`);
  }

  if (id > 0) {
    return discogsFetch(`/releases/${id}`);
  }

  return Response.json({ error: "缺少搜索词或条目 ID" }, { status: 400 });
}
