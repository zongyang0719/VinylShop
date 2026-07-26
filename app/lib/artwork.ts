declare const __IOS_COVER_MAP__: Record<string, string> | undefined;

function isNativePlatform() {
  if (typeof window === "undefined") return false;
  const capacitor = (
    window as Window & {
      Capacitor?: { isNativePlatform?: () => boolean };
    }
  ).Capacitor;
  return capacitor?.isNativePlatform?.() === true;
}

export function resolveArtworkURL(url: string) {
  if (url.startsWith("/")) return url;

  if (isNativePlatform()) {
    if (
      typeof __IOS_COVER_MAP__ !== "undefined" &&
      __IOS_COVER_MAP__[url]
    ) {
      return __IOS_COVER_MAP__[url];
    }
    return url;
  }

  return `/api/douban?img=${encodeURIComponent(url)}`;
}
