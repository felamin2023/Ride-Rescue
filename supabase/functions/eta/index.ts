// supabase/functions/eta/index.ts
// Edge function that proxies Mapbox Directions for ETA + distance data.

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

type LineString = {
  type: "LineString";
  coordinates: [number, number][];
};

type MapboxRoute = {
  distance: number;
  duration: number;
  geometry: LineString;
};

type MapboxDirectionsResponse = {
  code: string;
  routes: MapboxRoute[];
  message?: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const MAPBOX_SECRET_TOKEN = Deno.env.get("MAPBOX_SECRET_TOKEN") ?? "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function parseLngLat(label: string, value: string | null): [number, number] {
  if (!value) throw new Error(`Missing '${label}' query param (lng,lat)`);
  const [lngRaw, latRaw] = value.split(",").map((v) => v.trim());
  const lng = Number(lngRaw);
  const lat = Number(latRaw);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    throw new Error(`Invalid '${label}' value. Expected "lng,lat".`);
  }
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new Error(`'${label}' is out of range.`);
  }
  return [lng, lat];
}

async function callMapbox(from: [number, number], to: [number, number]) {
  if (!MAPBOX_SECRET_TOKEN) {
    throw new Error("MAPBOX_SECRET_TOKEN is not configured");
  }

  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/` +
    `${from[0]},${from[1]};${to[0]},${to[1]}?${new URLSearchParams({
      access_token: MAPBOX_SECRET_TOKEN,
      geometries: "geojson",
      overview: "full",
      alternatives: "false",
    }).toString()}`;

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Mapbox error: ${text}`);
  }

  const payload = (await res.json()) as MapboxDirectionsResponse;

  if (payload.code !== "Ok" || !payload.routes?.length) {
    throw new Error(payload.message || "No route found");
  }

  const [route] = payload.routes;
  if (!route.geometry || route.geometry.type !== "LineString") {
    throw new Error("Route missing geometry");
  }

  return route;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const url = new URL(req.url);
    const from = parseLngLat("from", url.searchParams.get("from"));
    const to = parseLngLat("to", url.searchParams.get("to"));

    const route = await callMapbox(from, to);

    return json({
      durationSec: route.duration,
      distanceMeters: route.distance,
      geometry: route.geometry,
    });
  } catch (error) {
    console.error("ETA error:", error);
    return json(
      {
        error:
          error instanceof Error ? error.message : "Unexpected server error",
      },
      error instanceof Error && /Missing|Invalid|range/i.test(error.message)
        ? 400
        : 500,
    );
  }
});
