import React from "react";
import { View, Text } from "react-native";

/** Web stub so the web bundle never touches `react-native-maps`. */
const MapStub: React.FC<any> = ({ style, children }) => (
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
      Map preview is disabled on Web. Open this screen on iOS/Android to see the live map.
    </Text>
    {children}
  </View>
);

export const Marker: React.FC<any> = () => null;
export const Polyline: React.FC<any> = () => null;
export default MapStub;
