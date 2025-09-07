// components/LoadingScreen.tsx
import React, { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Modal,
  Platform,
  Text,
  View,
} from "react-native";

type LoadingScreenProps = {
  visible: boolean;
  message?: string;
  /** "spinner" | "dots" */
  variant?: "spinner" | "dots";
  /** 0..1 (if provided, shows a minimal linear progress bar) */
  progress?: number;
  /** Optional logo (e.g., require('.../logo.png')) */
  logo?: any;
};

export default function LoadingScreen({
  visible,
  message,
  variant = "spinner",
  progress,
  logo,
}: LoadingScreenProps) {
  // Dots animation
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (variant !== "dots") return;
    const mk = (v: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, {
            toValue: 1,
            duration: 420,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
            delay,
          }),
          Animated.timing(v, {
            toValue: 0,
            duration: 420,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      );
    const a1 = mk(dot1, 0);
    const a2 = mk(dot2, 140);
    const a3 = mk(dot3, 280);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, [variant, dot1, dot2, dot3]);

  // Progress width for determinate bar
  const clamped = typeof progress === "number"
    ? Math.max(0, Math.min(1, progress))
    : undefined;

  return (
    <Modal transparent animationType="fade" visible={visible} statusBarTranslucent>
      {/* Dimmed backdrop */}
      <View
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
        accessibilityLiveRegion="polite"
      >
        {/* Minimal card */}
        <View className="items-center rounded-2xl bg-white px-6 py-7 shadow-lg w-72">
          {logo ? (
            <Image source={logo} resizeMode="contain" className="h-10 w-10 mb-3" />
          ) : null}

          {/* Indicator area */}
          {typeof clamped === "number" ? (
            // Determinate linear bar (subtle)
            <View className="w-full mb-3">
              <View className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
                <View
                  className="h-2 rounded-full"
                  style={{ width: `${clamped * 100}%`, backgroundColor: "#2563EB" }}
                />
              </View>
            </View>
          ) : variant === "dots" ? (
            <View className="flex-row items-center justify-center mb-1">
              {[dot1, dot2, dot3].map((v, i) => (
                <Animated.View
                  key={i}
                  style={{
                    transform: [
                      {
                        translateY: v.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, -6],
                        }),
                      },
                    ],
                    opacity: v.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.5, 1],
                    }),
                  }}
                  className="mx-1 h-2 w-2 rounded-full"
                >
                  <View
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: "#2563EB" }}
                  />
                </Animated.View>
              ))}
            </View>
          ) : (
            <ActivityIndicator
              size={Platform.OS === "ios" ? "large" : 40}
              color="#2563EB"
            />
          )}

          {message ? (
            <Text className="mt-3 text-base text-gray-700 text-center">
              {message}
            </Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
