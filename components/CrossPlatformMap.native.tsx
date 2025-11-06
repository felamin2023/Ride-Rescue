import React, {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { View, Text } from "react-native";
import MapboxGL from "@rnmapbox/maps";
import { getMapboxAccessToken } from "../utils/mapbox";
import type { Feature, LineString } from "geojson";

type Nullable<T> = T | null | undefined;

type LatLng = {
  latitude: number;
  longitude: number;
};

type Region = LatLng & {
  latitudeDelta: number;
  longitudeDelta: number;
};

type EdgePadding = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export interface MapViewHandle {
  fitToCoordinates(
    coordinates: LatLng[],
    options?: { edgePadding?: EdgePadding; animated?: boolean },
  ): void;
  animateToRegion(region: Region, duration?: number): void;
}

type NativeMapProps = React.ComponentProps<typeof MapboxGL.MapView>;

type MapViewProps = Omit<
  NativeMapProps,
  "styleURL" | "zoomEnabled" | "logoEnabled" | "style"
> & {
  style?: NativeMapProps["style"];
  initialRegion?: Nullable<Region>;
  mapType?: "standard" | "satellite";
  onMapReady?: () => void;
};

const envToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "";
try {
  MapboxGL.setAccessToken(envToken);
} catch {
  // Mapbox may throw when setAccessToken runs in Jest/web; ignore here.
}

const MAPBOX_TOKEN = envToken || getMapboxAccessToken();

if (!MAPBOX_TOKEN) {
  console.warn(
    "[Mapbox] Missing EXPO_PUBLIC_MAPBOX_TOKEN. Map features will not render until a token is provided.",
  );
}

MapboxGL.setTelemetryEnabled(false);

const defaultPadding: EdgePadding = { top: 40, right: 40, bottom: 40, left: 40 };

function clampZoom(value: number) {
  return Math.max(0, Math.min(value, 20));
}

function regionToZoom(
  latitudeDelta?: Nullable<number>,
  longitudeDelta?: Nullable<number>,
) {
  if (!latitudeDelta || !longitudeDelta) return 14;
  const latZoom = Math.log2(360 / latitudeDelta);
  const lonZoom = Math.log2(360 / longitudeDelta);
  return clampZoom(Math.min(latZoom, lonZoom));
}

function toBounds(coords: LatLng[]) {
  const latitudes = coords.map((c) => Number(c.latitude) || 0);
  const longitudes = coords.map((c) => Number(c.longitude) || 0);
  const north = Math.max(...latitudes);
  const south = Math.min(...latitudes);
  const east = Math.max(...longitudes);
  const west = Math.min(...longitudes);
  return {
    northEast: [east, north] as [number, number],
    southWest: [west, south] as [number, number],
  };
}

const MapView = forwardRef<MapViewHandle, MapViewProps>(
  (
    {
      initialRegion,
      mapType = "standard",
      onMapReady,
      style,
      children,
      ...rest
    },
    ref,
  ) => {
    const mapRef = useRef<MapboxGL.MapView>(null);
    const cameraRef = useRef<MapboxGL.Camera>(null);
    const [hasAnnouncedReady, setHasAnnouncedReady] = useState(false);

    const cameraConfig = useMemo(() => {
      if (!initialRegion) return null;
      const latitude = Number(initialRegion.latitude) || 0;
      const longitude = Number(initialRegion.longitude) || 0;
      const zoom = regionToZoom(
        initialRegion.latitudeDelta,
        initialRegion.longitudeDelta,
      );
      return { latitude, longitude, zoom };
    }, [initialRegion]);

    useImperativeHandle(
      ref,
      () => ({
        fitToCoordinates: (coordinates, options) => {
          if (!coordinates || coordinates.length === 0) return;
          const { northEast, southWest } = toBounds(coordinates);
          const padding = options?.edgePadding ?? defaultPadding;
          (cameraRef.current as any)?.setCamera({
            bounds: {
              ne: northEast,
              sw: southWest,
              paddingTop: padding.top,
              paddingRight: padding.right,
              paddingBottom: padding.bottom,
              paddingLeft: padding.left,
            },
            animationDuration: options?.animated === false ? 0 : 1000,
          });
        },
        animateToRegion: (region, duration = 1000) => {
          if (!region) return;
          const lat = Number(region.latitude) || 0;
          const lon = Number(region.longitude) || 0;
          const latDelta = region.latitudeDelta ?? 0.02;
          const lonDelta = region.longitudeDelta ?? 0.02;
          const padding = defaultPadding;
          const { northEast, southWest } = toBounds([
            { latitude: lat + latDelta / 2, longitude: lon + lonDelta / 2 },
            { latitude: lat - latDelta / 2, longitude: lon - lonDelta / 2 },
          ]);
          (cameraRef.current as any)?.setCamera({
            bounds: {
              ne: northEast,
              sw: southWest,
              paddingTop: padding.top,
              paddingRight: padding.right,
              paddingBottom: padding.bottom,
              paddingLeft: padding.left,
            },
            animationDuration: duration,
          });
        },
      }),
      [],
    );

    const styleURL =
      mapType === "satellite"
        ? MapboxGL.StyleURL.SatelliteStreet
        : MapboxGL.StyleURL.Street;

    const handleMapReady = () => {
      if (!hasAnnouncedReady) {
        setHasAnnouncedReady(true);
        onMapReady?.();
      }
    };

    return (
      <MapboxGL.MapView
        ref={mapRef}
        style={style}
        styleURL={styleURL}
        onDidFinishRenderingMapFully={handleMapReady}
        onDidFinishLoadingMap={handleMapReady}
        {...rest}
      >
        <MapboxGL.Camera
          ref={cameraRef}
          centerCoordinate={
            cameraConfig
              ? [cameraConfig.longitude, cameraConfig.latitude]
              : undefined
          }
          zoomLevel={cameraConfig?.zoom}
          animationDuration={0}
        />
        {children}
      </MapboxGL.MapView>
    );
  },
);

MapView.displayName = "CrossPlatformMap(Mapbox)";

type MarkerProps = {
  id?: string;
  coordinate: LatLng;
  title?: string;
  pinColor?: string;
  children?: React.ReactElement;
};

const Marker: React.FC<MarkerProps> = ({
  id,
  coordinate,
  title,
  pinColor = "#2563EB",
  children,
}) => {
  const markerId = useMemo(
    () => id ?? `marker-${Math.random().toString(36).slice(2, 10)}`,
    [id],
  );

  const longitude = Number(coordinate.longitude) || 0;
  const latitude = Number(coordinate.latitude) || 0;

  const markerChild = React.isValidElement(children) ? (
    children
  ) : (
    <View
      style={{
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: pinColor,
        borderWidth: 2,
        borderColor: "#FFFFFF",
      }}
    />
  );

  return (
    <MapboxGL.PointAnnotation
      id={markerId}
      coordinate={[longitude, latitude]}
    >
      {title
        ? [
            markerChild,
            <MapboxGL.Callout key="callout" title={title}>
              <View
                style={{
                  backgroundColor: "rgba(15, 23, 42, 0.9)",
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 8,
                }}
              >
                <Text
                  style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "600" }}
                >
                  {title}
                </Text>
              </View>
            </MapboxGL.Callout>,
          ]
        : markerChild}
    </MapboxGL.PointAnnotation>
  );
};

type PolylineProps = {
  id?: string;
  coordinates: LatLng[];
  strokeColor?: string;
  strokeWidth?: number;
};

const Polyline: React.FC<PolylineProps> = ({
  id,
  coordinates,
  strokeColor = "#2563EB",
  strokeWidth = 3,
}) => {
  const sourceId = useMemo(
    () => `${id ?? `line-${Math.random().toString(36).slice(2, 10)}`}-source`,
    [id],
  );
  const layerId = `${sourceId}-layer`;

  const shape = useMemo<Feature<LineString>>(
    () => ({
      type: "Feature" as const,
      geometry: {
        type: "LineString",
        coordinates: coordinates.map((c) => [
          Number(c.longitude) || 0,
          Number(c.latitude) || 0,
        ]),
      },
      properties: {},
    }),
    [coordinates],
  );

  return (
    <MapboxGL.ShapeSource id={sourceId} shape={shape}>
      <MapboxGL.LineLayer
        id={layerId}
        style={{
          lineCap: "round",
          lineJoin: "round",
          lineColor: strokeColor,
          lineWidth: strokeWidth,
        }}
      />
    </MapboxGL.ShapeSource>
  );
};

export { Marker, Polyline };
export type { MapViewProps, LatLng as MapLatLng, Region as MapRegion };
export default MapView;
