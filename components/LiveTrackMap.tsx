import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import MapboxGL from "@rnmapbox/maps";
import type { Feature, LineString } from "geojson";
import { metersBetween } from "../utils/haversine";

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "";

try {
  if (MAPBOX_TOKEN) {
    MapboxGL.setAccessToken(MAPBOX_TOKEN);
  }
  MapboxGL.setTelemetryEnabled(false);
} catch (error) {
  console.warn("[LiveTrackMap] Unable to configure Mapbox:", error);
}

type Coordinate = { lat: number; lng: number; heading?: number | null };

export type RouteMetrics = {
  durationSec: number | null;
  distanceMeters: number | null;
  geometry?: LineString | Feature<LineString> | null;
  fetchedAt?: number;
  isStale?: boolean;
};

export type LiveTrackMapProps = {
  me?: Coordinate;
  other?: Coordinate;
  onNear?: () => void;
  metrics?: RouteMetrics | null;
  meLabel?: string;
  otherLabel?: string;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F172A",
  },
  map: {
    flex: 1,
  },
  emptyState: {
    position: "absolute",
    bottom: 30,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(15, 23, 42, 0.85)",
  },
  emptyText: {
    color: "#CBD5F5",
    fontSize: 13,
  },
  pinWrapper: {
    alignItems: "center",
  },
  pinHead: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    minWidth: 64,
    alignItems: "center",
  },
  pinTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 12,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    marginTop: -2,
  },
  markerLabel: {
    color: "#F8FAFC",
    fontWeight: "700",
    fontSize: 12,
  },
  markerCaption: {
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(15, 23, 42, 0.8)",
  },
  markerCaptionText: {
    fontSize: 10,
    color: "#F8FAFC",
    fontWeight: "500",
  },
  headingNeedle: {
    position: "absolute",
    width: 4,
    height: 20,
    borderRadius: 4,
    bottom: 2,
    backgroundColor: "#F8FAFC",
  },
});

function toFeature(geometry?: LineString | Feature<LineString> | null) {
  if (!geometry) return null;
  if ((geometry as Feature<LineString>).type === "Feature") {
    return geometry as Feature<LineString>;
  }
  return {
    type: "Feature",
    geometry: geometry as LineString,
    properties: {},
  } as Feature<LineString>;
}

export function LiveTrackMap({
  me,
  other,
  onNear,
  metrics,
  meLabel = "You",
  otherLabel = "Target",
}: LiveTrackMapProps) {
  const [routeShape, setRouteShape] = useState<Feature<LineString> | null>(
    () => (metrics?.geometry ? toFeature(metrics.geometry) : null),
  );
  const firedNearRef = useRef(false);

  useEffect(() => {
    setRouteShape(metrics?.geometry ? toFeature(metrics.geometry) : null);
  }, [metrics?.geometry]);

  const distanceMeters = useMemo(() => {
    if (metrics?.distanceMeters && metrics.distanceMeters > 0) {
      return metrics.distanceMeters;
    }
    return metersBetween(me, other);
  }, [metrics?.distanceMeters, me, other]);

  const fallbackRoute = useMemo(() => {
    if (!me || !other) return null;
    return {
      type: "Feature" as const,
      geometry: {
        type: "LineString" as const,
        coordinates: [
          [me.lng, me.lat],
          [other.lng, other.lat],
        ],
      },
      properties: {},
    } satisfies Feature<LineString>;
  }, [me, other]);

  const displayRoute = routeShape ?? fallbackRoute;

  useEffect(() => {
    if (distanceMeters < 300 && !firedNearRef.current && me && other) {
      firedNearRef.current = true;
      onNear?.();
    }
  }, [distanceMeters, me, other, onNear]);

  const bounds = useMemo(() => {
    const coords = [me, other].filter(Boolean) as Coordinate[];
    if (!coords.length) return null;
    const longitudes = coords.map((c) => c.lng);
    const latitudes = coords.map((c) => c.lat);
    const east = Math.max(...longitudes);
    const west = Math.min(...longitudes);
    const north = Math.max(...latitudes);
    const south = Math.min(...latitudes);
    if (coords.length === 1) {
      return {
        center: [coords[0].lng, coords[0].lat] as [number, number],
      };
    }
    return {
      ne: [east, north] as [number, number],
      sw: [west, south] as [number, number],
    };
  }, [me, other]);

  const hasPositions = Boolean(me || other);
  const hudEta =
    typeof metrics?.durationSec === "number" && metrics.durationSec >= 0
      ? metrics.durationSec
      : null;
  const hudDistance =
    typeof distanceMeters === "number" && Number.isFinite(distanceMeters)
      ? distanceMeters
      : null;

  return (
    <View style={styles.container}>
      <MapboxGL.MapView
        style={styles.map}
        styleURL={MapboxGL.StyleURL.Satellite}
        logoEnabled={false}
        compassEnabled
      >
        <MapboxGL.Camera
          animationMode="flyTo"
          animationDuration={500}
          centerCoordinate={
            bounds?.center
              ? bounds.center
              : bounds?.ne && bounds?.sw
                ? undefined
                : me
                  ? [me.lng, me.lat]
                  : other
                    ? [other.lng, other.lat]
                    : undefined
          }
          bounds={
            bounds?.ne && bounds?.sw
              ? {
                  ne: bounds.ne,
                  sw: bounds.sw,
                  paddingTop: 60,
                  paddingBottom: 60,
                  paddingLeft: 60,
                  paddingRight: 60,
                }
              : undefined
          }
        />

        {displayRoute ? (
          <MapboxGL.ShapeSource id="route" shape={displayRoute}>
            <MapboxGL.LineLayer
              id="route-line"
              style={{
                lineColor: metrics?.isStale ? "#94A3B8" : "#FDBA21",
                lineWidth: 6,
                lineCap: "round",
                lineJoin: "round",
                lineOpacity: metrics?.isStale ? 0.5 : 0.9,
                lineDasharray: metrics?.geometry ? undefined : [1.5, 1.2],
              }}
            />
          </MapboxGL.ShapeSource>
        ) : null}

        {other ? (
          <MapboxGL.PointAnnotation
            id="target"
            coordinate={[other.lng, other.lat]}
          >
            <View style={styles.pinWrapper}>
              <View
                style={[
                  styles.pinHead,
                  { backgroundColor: "#F97316", borderColor: "#FFECD1" },
                ]}
              >
                <Text style={styles.markerLabel}>{otherLabel}</Text>
              </View>
              <View
                style={[
                  styles.pinTail,
                  { borderTopColor: "#F97316" },
                ]}
              />
            </View>
          </MapboxGL.PointAnnotation>
        ) : null}

        {me ? (
          <MapboxGL.PointAnnotation id="me" coordinate={[me.lng, me.lat]}>
            <View style={styles.pinWrapper}>
              <View
                style={[
                  styles.pinHead,
                  { backgroundColor: "#0EA5E9", borderColor: "#BAE6FD" },
                ]}
              >
                <Text style={styles.markerLabel}>{meLabel}</Text>
              </View>
              <View
                style={[
                  styles.pinTail,
                  { borderTopColor: "#0EA5E9" },
                ]}
              />
            </View>
          </MapboxGL.PointAnnotation>
        ) : null}
      </MapboxGL.MapView>

      {!hasPositions ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Waiting for GPS lock…</Text>
        </View>
      ) : null}
      {hasPositions && !other ? (
        <View style={[styles.emptyState, { bottom: 70 }]}>
          <Text style={styles.emptyText}>Target is offline</Text>
        </View>
      ) : null}
    </View>
  );
}

export default LiveTrackMap;
