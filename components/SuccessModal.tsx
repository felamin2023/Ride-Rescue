// components/SuccessModal.tsx
import React, { useEffect } from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Tone = "success" | "info" | "warning" | "danger";
type Position = "top-right" | "top-center" | "bottom-right" | "bottom-center";

const COLORS = {
  text: "#0F172A",
  successBG: "#DCFCE7",
  successBorder: "#86EFAC",
  successText: "#166534",
  infoBG: "#DBEAFE",
  infoBorder: "#93C5FD",
  infoText: "#1D4ED8",
  warnBG: "#FEF3C7",
  warnBorder: "#FCD34D",
  warnText: "#92400E",
  dangerBG: "#FEE2E2",
  dangerBorder: "#FCA5A5",
  dangerText: "#991B1B",
};

const cardShadow = Platform.select({
  ios: { shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 8 } },
  android: { elevation: 2 },
  default: {},
});

const toneSet = (tone: Tone) => {
  switch (tone) {
    case "info": return { bg: COLORS.infoBG, border: COLORS.infoBorder, text: COLORS.infoText, icon: "information-circle" as const };
    case "warning": return { bg: COLORS.warnBG, border: COLORS.warnBorder, text: COLORS.warnText, icon: "alert-circle" as const };
    case "danger": return { bg: COLORS.dangerBG, border: COLORS.dangerBorder, text: COLORS.dangerText, icon: "close-circle" as const };
    default: return { bg: COLORS.successBG, border: COLORS.successBorder, text: COLORS.successText, icon: "checkmark-circle" as const };
  }
};

export default function SuccessModal({
  visible,
  title = "Success",
  message,
  tone = "success",
  position = "top-right",
  autoCloseMs,
  onClose,
}: {
  visible: boolean;
  title?: string;
  message?: string;
  tone?: Tone;
  position?: Position;
  autoCloseMs?: number; // e.g., 1600
  onClose: () => void;
}) {
  useEffect(() => {
    if (!visible || !autoCloseMs) return;
    const t = setTimeout(onClose, autoCloseMs);
    return () => clearTimeout(t);
  }, [visible, autoCloseMs, onClose]);

  if (!visible) return null;

  const s = toneSet(tone);
  const posStyle =
    position === "top-center"
      ? { top: 16, left: 0, right: 0, alignItems: "center" as const }
      : position === "bottom-right"
      ? { bottom: 16, right: 16, alignItems: "flex-end" as const }
      : position === "bottom-center"
      ? { bottom: 16, left: 0, right: 0, alignItems: "center" as const }
      : { top: 16, right: 16, alignItems: "flex-end" as const }; // top-right default

  return (
    <View style={[StyleSheet.absoluteFillObject, { position: "absolute", zIndex: 12000, pointerEvents: "box-none" }]}>
      <View style={[{ position: "absolute" }, posStyle]}>
        <View
          style={[
            styles.card,
            { backgroundColor: s.bg, borderColor: s.border },
            cardShadow as any,
          ]}
        >
          <Ionicons name={s.icon} size={18} color={s.text} />
          <View style={{ marginLeft: 8, flexShrink: 1 }}>
            {!!title && <Text style={[styles.title, { color: s.text }]} numberOfLines={1}>{title}</Text>}
            {!!message && <Text style={[styles.msg, { color: s.text }]} numberOfLines={3}>{message}</Text>}
          </View>
          <Pressable onPress={onClose} hitSlop={8} style={{ marginLeft: 8 }}>
            <Ionicons name="close" size={16} color={s.text} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    maxWidth: 420,
  },
  title: { fontSize: 12, fontWeight: "700" },
  msg: { fontSize: 12, marginTop: 2, lineHeight: 16 },
});
