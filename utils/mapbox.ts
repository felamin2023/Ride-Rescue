const PUBLIC_TOKEN =
  process.env.EXPO_PUBLIC_MAPBOX_TOKEN ??
  process.env.MAPBOX_ACCESS_TOKEN ??
  "";

const DEFAULT_STYLE = "mapbox/streets-v12";

export const MAPBOX_BROWSER_BASE =
  "https://api.mapbox.com/styles/v1" as const;

export function getMapboxAccessToken() {
  return PUBLIC_TOKEN;
}

export function buildMapboxBrowserUrl(
  latitude: number,
  longitude: number,
  options?: {
    zoom?: number;
    styleId?: string;
    title?: string;
  },
) {
  const token = getMapboxAccessToken();
  if (!token) return null;

  const zoom = Math.max(0, Math.min(options?.zoom ?? 15, 20));
  const stylePath = options?.styleId ?? DEFAULT_STYLE;
  const label = options?.title ? encodeURIComponent(options.title) : "map";

  return `${MAPBOX_BROWSER_BASE}/${stylePath}.html?title=${label}&access_token=${encodeURIComponent(
    token,
  )}#${zoom.toFixed(2)}/${latitude}/${longitude}`;
}
