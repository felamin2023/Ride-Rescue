import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

const TABLE_NAME = "live_locations";
const VIEW_NAME = "live_locations_public";
const DEBOUNCE_MS = 1_500;

export type LiveLocationRow = {
  user_id: string;
  lat: number;
  lng: number;
  heading: number | null;
  speed: number | null;
  updated_at?: string | null;
};

type LocationUpsertInput = {
  user_id: string;
  lat: number;
  lng: number;
  heading?: number | null;
  speed?: number | null;
};

type PendingEntry = {
  latest: LocationUpsertInput;
  timeout: ReturnType<typeof setTimeout>;
  resolvers: Array<{
    resolve: () => void;
    reject: (reason?: unknown) => void;
  }>;
};

const pending = new Map<string, PendingEntry>();

function sanitizeNumeric(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function flushUpsert(userId: string) {
  const entry = pending.get(userId);
  if (!entry) return;
  pending.delete(userId);
  clearTimeout(entry.timeout);

  try {
    const payload = {
      user_id: entry.latest.user_id,
      lat: entry.latest.lat,
      lng: entry.latest.lng,
      heading: sanitizeNumeric(entry.latest.heading ?? null),
      speed: sanitizeNumeric(entry.latest.speed ?? null),
    };

    const { error } = await supabase.from(TABLE_NAME).upsert(payload);

    if (error) throw error;

    entry.resolvers.forEach(({ resolve }) => resolve());
  } catch (error) {
    console.warn("[live_locations] upsert failed", error);
    entry.resolvers.forEach(({ reject }) => reject(error));
  }
}

export function upsertMyLocation(input: LocationUpsertInput) {
  if (!input?.user_id) {
    return Promise.reject(new Error("user_id is required"));
  }

  return new Promise<void>((resolve, reject) => {
    const existing = pending.get(input.user_id);
    if (existing) {
      existing.latest = { ...existing.latest, ...input };
      existing.resolvers.push({ resolve, reject });
      return;
    }

    const timeout = setTimeout(() => {
      flushUpsert(input.user_id).catch((err) => {
        console.warn("[live_locations] flush error", err);
      });
    }, DEBOUNCE_MS);

    pending.set(input.user_id, {
      latest: { ...input },
      timeout,
      resolvers: [{ resolve, reject }],
    });
  });
}

function attachChannel(
  userId: string,
  cb: (row: LiveLocationRow | null) => void,
) {
  return supabase
    .channel(`${TABLE_NAME}:user_id=eq.${userId}`)
    .on<RealtimePostgresChangesPayload<LiveLocationRow>>(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: TABLE_NAME,
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const next =
          (payload.new as LiveLocationRow | null) ??
          (payload.old as LiveLocationRow | null) ??
          null;
        cb(next);
      },
    )
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR") {
        console.warn("[live_locations] channel error for", userId);
      }
    });
}

export function subscribeToLiveLocation(
  userId: string,
  cb: (row: LiveLocationRow | null) => void,
) {
  if (!userId) {
    console.warn("[live_locations] cannot subscribe without userId");
    return () => undefined;
  }

  let active = true;
  const channel = attachChannel(userId, cb);

  supabase
    .from(VIEW_NAME)
    .select("*")
    .eq("user_id", userId)
    .maybeSingle()
    .then(({ data, error }) => {
      if (!active) return;
      if (error) {
        console.warn("[live_locations] initial fetch failed", error);
        return;
      }
      if (data) {
        cb(data as LiveLocationRow);
      }
    });

  return () => {
    active = false;
    supabase.removeChannel(channel);
  };
}
