// components/FilterChips.tsx
import React from "react";
import {
  FlatList,
  Platform,
  Pressable,
  Text,
  View,
  ViewStyle,
  StyleProp,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

/* --------------------------------- Design --------------------------------- */
const COLORS = {
  border: "#E5E7EB",
  text: "#0F172A",
  sub: "#475569",
  primary: "#2563EB",
  chipBg: "#FFFFFF",
  chipBgSelected: "#EEF2FF",
  chipBorderSelected: "#C7D2FE",
  chipTextSelected: "#1E3A8A",
};

const MICRO_SHADOW = Platform.select({
  ios: {
    shadowColor: "#0F172A",
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  android: { elevation: 1 },
});

/* ---------------------------------- Types --------------------------------- */
export type FilterItem = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

export type FilterChipsProps = {
  /** Items to render as selectable pills */
  items: FilterItem[];
  /** Currently selected keys (multi-select supported) */
  selected: string[];
  /** Toggle callback (receives the item's key) */
  onToggle: (key: string) => void;
  /** Optional outer padding/margin control */
  containerStyle?: StyleProp<ViewStyle>;
  /** Space between chips (default 12) */
  gap?: number;
  /** Horizontal scrolling (default true) */
  horizontal?: boolean;
  /** Accessibility label for the list */
  accessibilityLabel?: string;
};

/* --------------------------------- Chip ----------------------------------- */
function Chip({
  selected,
  icon,
  label,
  onPress,
}: {
  selected: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: "rgba(0,0,0,0.06)", borderless: false }}
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          borderRadius: 999,
          paddingHorizontal: 16,
          paddingVertical: 8,
          borderWidth: 1,
          backgroundColor: selected ? COLORS.chipBgSelected : COLORS.chipBg,
          borderColor: selected ? COLORS.chipBorderSelected : COLORS.border,
        },
        MICRO_SHADOW as any,
      ]}
      accessibilityRole="button"
    >
      <Ionicons
        name={icon}
        size={16}
        color={selected ? COLORS.primary : COLORS.sub}
      />
      <Text
        style={{
          fontSize: 13,
          fontWeight: "600",
          color: selected ? COLORS.chipTextSelected : "#475569",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/* ------------------------------- Main bar --------------------------------- */
export default function FilterChips({
  items,
  selected,
  onToggle,
  containerStyle,
  gap = 12,
  horizontal = true,
  accessibilityLabel = "Filter chips",
}: FilterChipsProps) {
  return (
    <View style={containerStyle}>
      <FlatList
        horizontal={horizontal}
        showsHorizontalScrollIndicator={false}
        data={items}
        keyExtractor={(i) => i.key}
        ItemSeparatorComponent={() => <View style={{ width: gap }} />}
        contentContainerStyle={{ paddingVertical: 2 }}
        renderItem={({ item }) => (
          <Chip
            selected={selected.includes(item.key)}
            icon={item.icon}
            label={item.label}
            onPress={() => onToggle(item.key)}
          />
        )}
        accessibilityLabel={accessibilityLabel}
      />
    </View>
  );
}
