import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useLocalSearchParams } from "expo-router";
import * as Location from "expo-location";
import type { LineString } from "geojson";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import LiveTrackMap, {
  type RouteMetrics,
} from "../../../components/LiveTrackMap";
import {
  functionsBaseUrl,
  supabase,
  supabaseAnonKey,
} from "../../../lib/supabaseClient";
import {
  subscribeToLiveLocation,
  upsertMyLocation,
  type LiveLocationRow,
} from "../../../lib/realtimeLocation";
import { metersBetween } from "../../../utils/haversine";

type Coordinate = {
  lat: number;
  lng: number;
  heading?: number | null;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ROUTE_REFRESH_MS = 10_000;
const ROUTE_TTL_MS = 60_000;
const MIN_DISPLACEMENT_METERS = 12;
const SLOW_SPEED_THRESHOLD = 1;
const SLOW_UPDATE_COOLDOWN_MS = 15_000;
const ASSUMED_SPEED_KMH = 55;

function useSupabaseUserId() {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then((result) => {
      if (mounted) setUserId(result.data.session?.user.id ?? null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        if (mounted) setUserId(session?.user.id ?? null);
      },
    );

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return userId;
}

export default function TrackTargetScreen() {
  const params =
    useLocalSearchParams<{ targetId?: string | string[]; viewer?: string | string[] }>();
  const rawTargetId = useMemo(() => {
    const value = params?.targetId;
    if (Array.isArray(value)) return value[0] ?? "";
    return value ?? "";
  }, [params?.targetId]);

  const rawViewer = useMemo(() => {
    const value = params?.viewer;
    if (Array.isArray(value)) return value[0] ?? "";
    return typeof value === "string" ? value : "";
  }, [params?.viewer]);

  const targetId = useMemo(() => {
    const trimmed = rawTargetId.trim();
    if (!trimmed) return null;
    return UUID_REGEX.test(trimmed) ? trimmed : null;
  }, [rawTargetId]);

  const viewerRole =
    rawViewer?.toLowerCase() === "mechanic" ? "mechanic" : "driver";
  const meLabel = viewerRole === "driver" ? "Driver" : "Mechanic";
  const otherLabel = viewerRole === "driver" ? "Mechanic" : "Driver";

  const userId = useSupabaseUserId();

  const [permissionStatus, setPermissionStatus] =
    useState<Location.PermissionStatus | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [locationServicesEnabled, setLocationServicesEnabled] = useState(true);

  const [meLocation, setMeLocation] = useState<Coordinate | undefined>();
  const [otherLocation, setOtherLocation] = useState<Coordinate | undefined>();
  const [targetOnline, setTargetOnline] = useState(false);
  const [nearNotice, setNearNotice] = useState(false);

  const [routeMetrics, setRouteMetrics] = useState<RouteMetrics | null>(null);
  const routeCacheRef = useRef<RouteMetrics | null>(null);

  const lastBroadcastRef = useRef<Coordinate | null>(null);
  const lastSlowUpdateRef = useRef(0);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (!mounted) return;
      setPermissionStatus(status);
      if (status !== Location.PermissionStatus.GRANTED) {
        setPermissionError(
          "Location permission is required to share live updates.",
        );
      } else {
        setPermissionError(null);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const check = async () => {
      const enabled = await Location.hasServicesEnabledAsync();
      if (active) setLocationServicesEnabled(enabled);
    };
    check();
    const interval = setInterval(check, 15_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (
      permissionStatus !== Location.PermissionStatus.GRANTED ||
      !userId ||
      !locationServicesEnabled
    ) {
      return;
    }

    let isMounted = true;
    let subscription: Location.LocationSubscription | null = null;

    const startWatch = async () => {
      try {
        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: MIN_DISPLACEMENT_METERS,
            timeInterval: 2_000,
            mayShowUserSettingsDialog: true,
          },
          (position) => {
            if (!isMounted) return;
            const { latitude, longitude, heading, speed } = position.coords;
            const current: Coordinate = {
              lat: latitude,
              lng: longitude,
              heading: typeof heading === "number" ? heading : null,
            };

            setMeLocation(current);

            const displacement = metersBetween(
              lastBroadcastRef.current,
              current,
            );
            const speedValue =
              typeof speed === "number" && Number.isFinite(speed)
                ? Math.max(0, speed)
                : null;

            if (
              Number.isFinite(displacement) &&
              displacement < MIN_DISPLACEMENT_METERS
            ) {
              return;
            }

            const now = Date.now();
            if (
              speedValue !== null &&
              speedValue < SLOW_SPEED_THRESHOLD &&
              now - lastSlowUpdateRef.current < SLOW_UPDATE_COOLDOWN_MS
            ) {
              return;
            }

            lastSlowUpdateRef.current = now;
            lastBroadcastRef.current = current;

            upsertMyLocation({
              user_id: userId,
              lat: current.lat,
              lng: current.lng,
              heading: current.heading ?? undefined,
              speed: speedValue ?? undefined,
            }).catch((error: unknown) => {
              console.warn("[tracking] upsertMyLocation failed", error);
            });
          },
        );
      } catch (error) {
        console.warn("[tracking] watchPositionAsync failed", error);
        setPermissionError(
          "Unable to start GPS tracking. Please check device settings.",
        );
      }
    };

    startWatch();

    return () => {
      isMounted = false;
      subscription?.remove();
    };
  }, [permissionStatus, userId, locationServicesEnabled]);

  useEffect(() => {
    if (!targetId || !userId) {
      setNearNotice(false);
      setOtherLocation(undefined);
      setTargetOnline(false);
      setRouteMetrics(null);
      routeCacheRef.current = null;
      return;
    }

    setNearNotice(false);

    setOtherLocation(undefined);
    setTargetOnline(false);

    const unsubscribe = subscribeToLiveLocation(
      targetId,
      (row: LiveLocationRow | null) => {
        if (row) {
          setOtherLocation({ lat: row.lat, lng: row.lng });
          setTargetOnline(true);
        } else {
          setOtherLocation(undefined);
          setTargetOnline(false);
        }
      },
    );

    return () => {
      unsubscribe();
    };
  }, [targetId, userId]);

  useEffect(() => {
    if (!otherLocation) {
      setRouteMetrics(null);
      routeCacheRef.current = null;
    }
  }, [otherLocation]);

  const fetchEta = useCallback(
    async (signal?: AbortSignal) => {
      if (!meLocation || !otherLocation || !targetId) {
        return;
      }
      if (!functionsBaseUrl) {
        console.warn(
          "[tracking] SUPABASE_URL is not configured; cannot fetch ETA.",
        );
        return;
      }
      const origin =
        viewerRole === "driver" ? otherLocation : meLocation;
      const destination =
        viewerRole === "driver" ? meLocation : otherLocation;

      try {
        const params = new URLSearchParams({
          from: `${origin.lng},${origin.lat}`,
          to: `${destination.lng},${destination.lat}`,
        });
        const response = await fetch(`${functionsBaseUrl}/eta?${params}`, {
          method: "GET",
          headers: supabaseAnonKey
            ? { apikey: supabaseAnonKey }
            : undefined,
          signal,
        });

        if (!response.ok) {
          throw new Error(await response.text());
        }

        const payload = (await response.json()) as {
          durationSec?: number;
          distanceMeters?: number;
          geometry?: LineString;
        };

        const snapshot: RouteMetrics = {
          durationSec:
            typeof payload.durationSec === "number"
              ? payload.durationSec
              : null,
          distanceMeters:
            typeof payload.distanceMeters === "number"
              ? payload.distanceMeters
              : null,
          geometry:
            payload.geometry && payload.geometry.type === "LineString"
              ? {
                  type: "Feature",
                  geometry: payload.geometry,
                  properties: {},
                }
              : null,
          fetchedAt: Date.now(),
          isStale: false,
        };

        routeCacheRef.current = snapshot;
        setRouteMetrics(snapshot);
      } catch (error: unknown) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        console.warn("[tracking] ETA fetch failed", error);
        const last = routeCacheRef.current;
        if (
          last &&
          last.fetchedAt &&
          Date.now() - last.fetchedAt < ROUTE_TTL_MS
        ) {
          setRouteMetrics({ ...last, isStale: true });
        }
      }
    },
    [meLocation, otherLocation, targetId],
  );

  useEffect(() => {
    if (!meLocation || !otherLocation || !targetId) return;
    let cancelled = false;
    let controller: AbortController | null = null;

    const invoke = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        await fetchEta(controller.signal);
      } catch {
        // fetchEta already logged errors.
      }
    };

    invoke();
    const interval = setInterval(() => {
      if (!cancelled) {
        void invoke();
      }
    }, ROUTE_REFRESH_MS);

    return () => {
      cancelled = true;
      controller?.abort();
      clearInterval(interval);
    };
  }, [fetchEta, meLocation, otherLocation, targetId]);

  const showSpinner =
    permissionStatus === null || (userId === null && !permissionError);

  if (!rawTargetId) {
    return (
      <View style={styles.centered}>
        <Text style={styles.message}>Missing target ID in route.</Text>
      </View>
    );
  }

  if (!targetId) {
    return (
      <View style={styles.centered}>
        <Text style={styles.message}>Invalid target ID provided.</Text>
      </View>
    );
  }

  if (showSpinner) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={[styles.message, { marginTop: 12 }]}>
          Preparing live tracking…
        </Text>
      </View>
    );
  }

  if (permissionError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.message}>{permissionError}</Text>
      </View>
    );
  }

  if (!userId) {
    return (
      <View style={styles.centered}>
        <Text style={styles.message}>
          Please sign in to broadcast your live location.
        </Text>
      </View>
    );
  }

  const bannerMessages: string[] = [];
  if (!locationServicesEnabled) {
    bannerMessages.push("Enable device location services to resume tracking.");
  }
  if (!targetOnline) {
    bannerMessages.push("Waiting for the target to come online…");
  }
  if (nearNotice) {
    bannerMessages.push("You are within 300 m of the target.");
  }

  const distanceMetersValue =
    routeMetrics?.distanceMeters ??
    (() => {
      const fallback = metersBetween(meLocation, otherLocation);
      return Number.isFinite(fallback) ? fallback : null;
    })();
  const distanceLabel =
    typeof distanceMetersValue === "number"
      ? `${(distanceMetersValue / 1000).toFixed(2)} km`
      : "Calculating…";
  const fallbackDurationSec =
    typeof distanceMetersValue === "number"
      ? (distanceMetersValue / 1000 / ASSUMED_SPEED_KMH) * 3600
      : null;
  const durationSecValue =
    typeof routeMetrics?.durationSec === "number"
      ? routeMetrics.durationSec
      : fallbackDurationSec;
  const etaLabel =
    durationSecValue && Number.isFinite(durationSecValue)
      ? `~${Math.max(1, Math.round(durationSecValue / 60))} min`
      : "Waiting for GPS…";
  const lastUpdatedLabel = formatRelativeTime(routeMetrics?.fetchedAt);

  return (
    <View style={styles.screen}>
      <LiveTrackMap
        key={targetId ?? "live-track"}
        me={meLocation}
        other={otherLocation}
        metrics={routeMetrics}
        meLabel={meLabel}
        otherLabel={otherLabel}
        onNear={() => setNearNotice(true)}
      />

      <View style={styles.infoCard}>
        <View style={styles.infoHeader}>
          <View>
            <Text style={styles.infoTitle}>{otherLabel} en route</Text>
            <Text style={styles.infoSubtitle}>
              Live updates every 10 seconds • Satellite view
            </Text>
          </View>
          {nearNotice ? (
            <View style={styles.nearBadge}>
              <Text style={styles.nearBadgeText}>Near</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.infoStatsRow}>
          <View style={styles.infoStat}>
            <Text style={styles.infoStatLabel}>Distance</Text>
            <Text style={styles.infoStatValue}>{distanceLabel}</Text>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoStat}>
            <Text style={styles.infoStatLabel}>ETA</Text>
            <Text style={styles.infoStatValue}>{etaLabel}</Text>
          </View>
        </View>

        {bannerMessages.length ? (
          <View style={styles.alertContainer}>
            {bannerMessages.map((msg) => (
              <Text key={msg} style={styles.alertText}>
                {msg}
              </Text>
            ))}
          </View>
        ) : null}

        <Text style={styles.infoFooter}>{lastUpdatedLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0F172A",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "#0F172A",
  },
  message: {
    color: "#F8FAFC",
    textAlign: "center",
    fontSize: 16,
    lineHeight: 22,
  },
  infoCard: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 24,
    backgroundColor: "rgba(15, 23, 42, 0.92)",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.35)",
  },
  infoHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  infoTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
  infoSubtitle: {
    color: "#94A3B8",
    fontSize: 12,
    marginTop: 2,
  },
  nearBadge: {
    backgroundColor: "#FDE68A",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  nearBadgeText: {
    color: "#92400E",
    fontWeight: "600",
    fontSize: 11,
  },
  infoStatsRow: {
    flexDirection: "row",
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  infoStat: {
    flex: 1,
    alignItems: "center",
  },
  infoStatLabel: {
    color: "#94A3B8",
    fontSize: 12,
    marginBottom: 2,
  },
  infoStatValue: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
  infoDivider: {
    width: 1,
    height: "80%",
    backgroundColor: "rgba(148,163,184,0.4)",
  },
  alertContainer: {
    marginTop: 12,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  alertText: {
    color: "#FECACA",
    fontSize: 12,
    marginBottom: 4,
  },
  infoFooter: {
    color: "#CBD5F5",
    fontSize: 11,
    marginTop: 12,
  },
});

/**
 * README — Live tracking screen
 * - Two devices on /track/:targetId share positions via Supabase Realtime (public.live_locations).
 * - ETA + distance refresh ~15s via Supabase Edge Function /functions/v1/eta that proxies Mapbox Directions.
 * - LiveTrackMap shows “Near” badge & onNear fires once once distance < 300 m.
 * - Background throttles low-speed updates, Balanced GPS accuracy, and pauses cleanly when permissions/services change.
 */
function formatRelativeTime(timestamp?: number | null) {
  if (!timestamp) return "Awaiting live route…";
  const diff = Date.now() - timestamp;
  if (diff < 30_000) return "Updated just now";
  if (diff < 60_000) return `Updated ${Math.round(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `Updated ${Math.round(diff / 60_000)}m ago`;
  return `Updated ${Math.round(diff / 3_600_000)}h ago`;
}
