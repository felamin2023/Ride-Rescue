import React, { forwardRef, useImperativeHandle } from "react";
import { View, Text } from "react-native";

type LatLng = { latitude: number; longitude: number };
type Region = LatLng & { latitudeDelta: number; longitudeDelta: number };
type EdgePadding = { top: number; right: number; bottom: number; left: number };

export interface MapViewHandle {
  fitToCoordinates(
    _coordinates: LatLng[],
    _options?: { edgePadding?: EdgePadding; animated?: boolean },
  ): void;
  animateToRegion(_region: Region, _duration?: number): void;
}

/** Web stub so the web bundle never touches native Mapbox runtime. */
const MapStub = forwardRef<MapViewHandle, any>(({ style, children }, ref) => {
  useImperativeHandle(ref, () => ({
    fitToCoordinates: () => void 0,
    animateToRegion: () => void 0,
  }));

  return (
    <View
      style={[
        {
          minHeight: 220,
          borderWidth: 1,
          borderColor: "#E5E9F0",
          borderRadius: 12,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#FFFFFF",
        },
        style,
      ]}
    >
      <Text style={{ color: "#64748B", padding: 12, textAlign: "center" }}>
        Map preview is disabled on web. Open this screen on iOS/Android to see the live map.
      </Text>
      {children}
    </View>
  );
});

MapStub.displayName = "CrossPlatformMap(WebStub)";

export const Marker: React.FC<any> = () => null;
export const Polyline: React.FC<any> = () => null;
export type {
  LatLng as MapLatLng,
  Region as MapRegion,
  EdgePadding,
};
export default MapStub;
