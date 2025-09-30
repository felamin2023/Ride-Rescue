// app/(driver)/police.tsx
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  Pressable,
  Image as RNImage,
  Linking,
  Modal,
  Platform,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import FilterChips, { type FilterItem } from "../../components/FilterChips";

/* ------------------------------ Design tokens (match vulcanize) ------------------------------ */
const COLORS = {
  bg: "#F4F6F8",
  surface: "#FFFFFF",
  border: "#E5E7EB",
  text: "#0F172A",
  sub: "#475569",
  muted: "#94A3B8",
  primary: "#2563EB",
  primaryDark: "#1D4ED8",
};

const cardShadow = Platform.select({
  ios: { shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
  android: { elevation: 3 },
});

const panelShadow = Platform.select({
  ios: { shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
  android: { elevation: 2 },
});

const buttonShadow = Platform.select({
  ios: { shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  android: { elevation: 1 },
});

/* ----------------------------- Types & Mock Data ---------------------------- */
type Station = {
  id: string;
  name: string;
  category: "police" | "hospital" | "gas" | "repair" | "vulcanize" | "fire" | "mdrrmo";
  address1: string;
  address2?: string;
  plusCode?: string;
  avatar?: string;
  rating?: number;
  lat?: number;
  lng?: number;
  distanceKm?: number;
  phone?: string;
};

const MOCK: Station[] = [
  {
    id: "p1",
    name: "Argao Municipal Police Station",
    category: "police",
    address1: "Natalio B. Bacalso Ave, Argao, Cebu",
    address2: "VJR3+9V9, Argao, Cebu",
    plusCode: "VJR3+9V9",
    rating: 4.6,
    lat: 9.8792,
    lng: 123.6074,
    avatar: "https://i.pravatar.cc/100?img=5",
    distanceKm: 0.6,
    phone: "+63324882111",
  },
  {
    id: "p2",
    name: "PNP Station – Tulic Outpost",
    category: "police",
    address1: "Tulic, Argao, Cebu",
    plusCode: "VJPX+4C",
    rating: 4.2,
    lat: 9.8881,
    lng: 123.5913,
    avatar: "https://i.pravatar.cc/100?img=15",
    distanceKm: 2.1,
    phone: "+639171234567",
  },
  {
    id: "p3",
    name: "PNP Checkpoint – Lamacan",
    category: "police",
    address1: "Lamacan, Argao, Cebu",
    rating: 4.0,
    lat: 9.8702,
    lng: 123.6002,
    avatar: "https://i.pravatar.cc/100?img=45",
    distanceKm: 3.0,
    phone: "+639176543210",
  },
];

/* --------------------------------- Filters (order matches vulcanize) -------------------------------- */
const FILTERS: FilterItem[] = [
  { key: "vulcanize", icon: "trail-sign-outline",  label: "Vulcanize" },
  { key: "repair",    icon: "construct-outline",   label: "Repair" },
  { key: "gas",       icon: "flash-outline",       label: "Gas" },
  { key: "hospital",  icon: "medical-outline",     label: "Hospital" },
  { key: "police",    icon: "shield-outline",      label: "Police" },
  { key: "fire",      icon: "flame-outline",       label: "Fire Station" },
  { key: "mdrrmo",    icon: "megaphone-outline",   label: "MDRRMO" },
];

/* --------------------------------- Small UI (identical to vulcanize) -------------------------------- */
function Stars({ rating = 0 }: { rating?: number }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return (
    <View className="flex-row items-center">
      {Array.from({ length: 5 }).map((_, i) => {
        const name = i < full ? "star" : i === full && half ? "star-half" : "star-outline";
        return (
          <Ionicons
            key={i}
            name={name as any}
            size={14}
            color={"#F59E0B"}
            style={{ marginRight: i === 4 ? 0 : 2 }}
            accessibilityLabel={i < full ? "full star" : i === full && half ? "half star" : "empty star"}
            accessible
          />
        );
      })}
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  variant = "primary",
  icon,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
  icon?: any;
}) {
  const isPrimary = variant === "primary";
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.9}
      className={`flex-row items-center justify-center rounded-full px-4 py-2 ${isPrimary ? "" : "border"}`}
      style={[
        isPrimary
          ? { backgroundColor: COLORS.primary }
          : { backgroundColor: "#FFFFFF", borderColor: COLORS.border },
        buttonShadow,
      ]}
      {...(Platform.OS === "android"
        ? { android_ripple: { color: "rgba(0,0,0,0.06)", borderless: false } }
        : {})}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={16}
          color={isPrimary ? "#FFFFFF" : COLORS.text}
          style={{ marginRight: 6 }}
        />
      ) : null}
      <Text className={`text-[13px] font-semibold ${isPrimary ? "text-white" : "text-slate-800"}`}>{label}</Text>
    </TouchableOpacity>
  );
}

/* ----------------------- Bottom Sheet (match vulcanize layout) ---------------------- */
function QuickActions({
  visible,
  onClose,
  station,
  onOpenMaps,
  onCall,
}: {
  visible: boolean;
  onClose: () => void;
  station?: Station | null;
  onOpenMaps: (s: Station) => void;
  onCall: (s: Station) => void;
}) {
  const insets = useSafeAreaInsets();
  if (!station) return null;

  return (
    <Modal
      transparent
      statusBarTranslucent
      animationType="fade"
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View
          style={[
            {
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "#FFFFFF",
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 16,
              paddingBottom: 16 + insets.bottom,
              borderTopWidth: 1,
              borderColor: COLORS.border,
            },
            panelShadow,
          ]}
        >
          <View className="items-center mb-3">
            <View style={{ width: 44, height: 5, borderRadius: 999, backgroundColor: "#E2E8F0" }} />
          </View>

          <View className="flex-row items-center gap-3 pb-3">
            <View style={{ width: 44, height: 44, borderRadius: 999, overflow: "hidden", backgroundColor: "#F1F5F9" }}>
              {station.avatar ? (
                <RNImage source={{ uri: station.avatar }} style={{ width: "100%", height: "100%" }} />
              ) : (
                <View className="h-full w-full items-center justify-center">
                  <Ionicons name="shield-outline" size={20} color="#475569" />
                </View>
              )}
            </View>
            <View className="flex-1">
              <Text className="text-[15px] font-medium text-slate-900" numberOfLines={1}>
                {station.name}
              </Text>
              <Text className="text-[12px] text-slate-500" numberOfLines={1}>
                {station.address1}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              className="h-9 w-9 items-center justify-center rounded-xl"
              accessibilityLabel="Close quick actions"
            >
              <Ionicons name="close" size={20} color={COLORS.text} />
            </Pressable>
          </View>

          <View className="h-[1px] bg-slate-200" />

          <View className="mt-3 gap-3">
            <PrimaryButton
              label="Location"
              icon="navigate-outline"
              onPress={() => {
                onOpenMaps(station);
                onClose();
              }}
            />
            <PrimaryButton
              label="Call Station"
              variant="secondary"
              icon="call-outline"
              onPress={() => {
                onCall(station);
                onClose();
              }}
            />
            <PrimaryButton
              label={station.plusCode ? `Copy Plus Code (${station.plusCode})` : "Copy Address"}
              variant="secondary"
              icon="copy-outline"
              onPress={() => {
                const text = station.plusCode || station.address1 || station.name;
                Clipboard.setStringAsync(text);
                onClose();
              }}
            />
          </View>
        </View>

        {/* pad safe-area bottom */}
        <View
          pointerEvents="none"
          style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: insets.bottom, backgroundColor: "#FFFFFF" }}
        />
      </View>
    </Modal>
  );
}

/* ------------------------------- Details Modal (match vulcanize) ------------------------------ */
function DetailsModal({
  visible,
  station,
  onClose,
  onOpenMaps,
  onCall,
}: {
  visible: boolean;
  station: Station | null;
  onClose: () => void;
  onOpenMaps: (s: Station) => void;
  onCall: (s: Station) => void;
}) {
  if (!station) return null;
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable
        className="flex-1"
        style={{ backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 16 }}
        onPress={onClose}
      >
        <Pressable onPress={() => {}}>
          <View className="rounded-2xl bg-white p-4" style={[{ borderWidth: 1, borderColor: COLORS.border }, panelShadow]}>
            {/* Header */}
            <View className="flex-row items-start gap-3">
              <View style={{ width: 56, height: 56, borderRadius: 999, overflow: "hidden", backgroundColor: "#F1F5F9" }}>
                {station.avatar ? (
                  <RNImage source={{ uri: station.avatar }} style={{ width: "100%", height: "100%" }} />
                ) : (
                  <View className="h-full w-full items-center justify-center">
                    <Ionicons name="shield-outline" size={22} color="#475569" />
                  </View>
                )}
              </View>

              <View className="flex-1">
                <View className="flex-row items-start justify-between">
                  <Text className="text-[18px] text-slate-900" numberOfLines={2}>
                    {station.name}
                  </Text>
                  <View className="ml-3 rounded-full bg-[#F1F5FF] px-2 py-[2px] self-start">
                    <Text className="text-[10px] font-bold text-[#1E3A8A] capitalize">{station.category}</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Address FIRST */}
            <View className="mt-3 gap-1">
              <Text className="text-[13px] text-slate-700">{station.address1}</Text>
              {station.address2 ? <Text className="text-[12px] text-slate-500">{station.address2}</Text> : null}
            </View>

            {/* Divider */}
            <View style={{ height: 1, backgroundColor: "#E5E7EB", marginTop: 12, marginHorizontal: 8 }} />

            {/* Ratings / distance */}
            <View className="mt-2 flex-row items-center gap-2">
              <Stars rating={station.rating ?? 0} />
              <Text className="text-[12px] text-slate-500">{(station.rating ?? 0).toFixed(1)}</Text>
              {typeof station.distanceKm === "number" && (
                <>
                  <Text className="text-slate-300">•</Text>
                  <Text className="text-[12px] text-slate-500">{station.distanceKm.toFixed(1)} km away</Text>
                </>
              )}
            </View>

            {/* Actions */}
            <View className="mt-4 flex-row items-center gap-2">
              <View className="flex-1">
                <PrimaryButton label="Call" icon="call-outline" variant="secondary" onPress={() => onCall(station)} />
              </View>
              <View style={{ width: 10 }} />
              <View className="flex-1">
                <PrimaryButton label="Location" icon="navigate-outline" onPress={() => onOpenMaps(station)} />
              </View>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* --------------------------------- Card (1:1 with vulcanize) ---------------------------------- */
function StationCard({
  station,
  onLocation,
  onCall,
  onPressCard,
}: {
  station: Station;
  onLocation: (s: Station) => void;
  onCall: (s: Station) => void;
  onPressCard: (s: Station) => void;
}) {
  return (
    <Pressable
      onPress={() => onPressCard(station)}
      className="mx-4 my-2 rounded-2xl bg-white p-4"
      style={[{ borderColor: COLORS.border, borderWidth: 1 }, cardShadow]}
      accessibilityRole="button"
      accessibilityLabel={`Open actions for ${station.name}`}
    >
      {/* Header row with avatar + title/badge */}
      <View className="flex-row items-start gap-3">
        {/* Circular image — 56x56 */}
        <View style={{ width: 56, height: 56, borderRadius: 999, overflow: "hidden", backgroundColor: "#F1F5F9" }}>
          {station.avatar ? (
            <RNImage source={{ uri: station.avatar }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
          ) : (
            <View className="h-full w-full items-center justify-center">
              <Ionicons name="shield-outline" size={22} color="#475569" />
            </View>
          )}
        </View>

        <View className="flex-1">
          {/* Title row: 16px (not bold), badge self-start */}
          <View className="flex-row items-start justify-between">
            <Text className="text-[16px] text-slate-900 flex-1" numberOfLines={2}>
              {station.name}
            </Text>
            <View className="ml-3 rounded-full bg-[#F1F5FF] px-2 py-[2px] self-start">
              <Text className="text-[10px] font-semibold text-[#1E3A8A] capitalize">{station.category}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Divider under header */}
      <View style={{ height: 1, backgroundColor: "#E5E7EB", marginTop: 8, marginHorizontal: 8 }} />

      {/* Body aligned with text column */}
      <View style={{ paddingTop: 8, paddingLeft: 68 }}>
        {/* Address */}
        <Text className="text-[13px] text-slate-700" numberOfLines={2}>
          {station.address1}
        </Text>
        {station.address2 ? (
          <Text className="text-[12px] text-slate-500" numberOfLines={1}>
            {station.address2}
          </Text>
        ) : null}

        {/* Ratings / distance */}
        <View className="mt-2 flex-row items-center gap-2">
          <Stars rating={station.rating ?? 0} />
          <Text className="text-[12px] text-slate-500">{(station.rating ?? 0).toFixed(1)}</Text>
          {typeof station.distanceKm === "number" && (
            <>
              <Text className="text-slate-300">•</Text>
              <Text className="text-[12px] text-slate-500">{station.distanceKm.toFixed(1)} km</Text>
            </>
          )}
        </View>

        {/* Actions — Call (secondary) left, Location (primary) right */}
        <View className="mt-3 flex-row items-center gap-2">
          <View className="flex-1">
            <PrimaryButton label="Call" icon="call-outline" variant="secondary" onPress={() => onCall(station)} />
          </View>
          <View style={{ width: 12 }} />
          <View className="flex-1">
            <PrimaryButton label="Location" icon="navigate-outline" variant="primary" onPress={() => onLocation(station)} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/* --------------------------------- Screen (vulcanize-style header/search + divider) --------------------------------- */
export default function PoliceScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<string[]>(["police"]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);

  // Inline header search toggle (same as vulcanize)
  const [searchOpen, setSearchOpen] = useState(false);

  const toggleFilter = (k: string) =>
    setFilters((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));

  const data = useMemo(() => {
    const q = query.trim().toLowerCase();
    return MOCK.filter((s) => {
      const byFilter = filters.length === 0 || filters.includes(s.category);
      const byText =
        q.length === 0 ||
        s.name.toLowerCase().includes(q) ||
        s.address1.toLowerCase().includes(q) ||
        (s.address2 ?? "").toLowerCase().includes(q) ||
        (s.plusCode ?? "").toLowerCase().includes(q);
      return byFilter && byText;
    }).sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
  }, [filters, query]);

  const openMaps = (s: Station) => {
    if (s.lat && s.lng) {
      const url = `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`;
      Linking.openURL(url).catch(() => {});
    } else if (s.address1) {
      const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address1)}`;
      Linking.openURL(url).catch(() => {});
    }
  };

  const callStation = (s: Station) => {
    if (!s.phone) return;
    const telUrl = `tel:${s.phone}`;
    Linking.openURL(telUrl).catch(() => {});
  };

  const openActions = (s: Station) => {
    setSelectedStation(s);
    setSheetOpen(true);
  };
  const closeActions = () => setSheetOpen(false);
  const openDetails = (s: Station) => {
    setSelectedStation(s);
    setDetailsOpen(true);
  };
  const closeDetails = () => setDetailsOpen(false);

  return (
    <View className="flex-1" style={{ backgroundColor: COLORS.bg }}>
      <SafeAreaView edges={["top"]} style={{ backgroundColor: COLORS.bg }}>
        {/* Header is relative so title can be absolutely centered */}
        <View className="relative px-4 py-3">
          <View className="flex-row items-center justify-between">
            {/* Back button with safe fallback */}
            <Pressable
              onPress={() => {
                try {
                  // @ts-ignore expo-router may expose canGoBack
                  if ((router as any).canGoBack && (router as any).canGoBack()) router.back();
                  else router.replace("/");
                } catch {
                  router.replace("/");
                }
              }}
              hitSlop={10}
              className="h-9 w-9 items-center justify-center rounded-xl"
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={22} color={COLORS.text} />
            </Pressable>

            {/* Right side: search icon OR expanded search input (same row) */}
            {!searchOpen ? (
              <Pressable
                onPress={() => setSearchOpen(true)}
                hitSlop={10}
                className="h-9 w-9 items-center justify-center rounded-xl"
                accessibilityLabel="Open search"
              >
                <Ionicons name="search" size={20} color={COLORS.text} />
              </Pressable>
            ) : (
              // wrapper fills from after the back button to the right edge
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View
                  className="flex-row items-center rounded-2xl bg-white px-3 py-1"
                  style={[
                    {
                      borderColor: COLORS.border,
                      borderWidth: 1,
                      width: "100%",
                      minWidth: 0, // iOS flexbox quirk
                    },
                    panelShadow,
                  ]}
                >
                  <Ionicons name="search" size={18} color={COLORS.muted} />
                  <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search by name, address, plus code…"
                    placeholderTextColor={COLORS.muted}
                    className="flex-1 px-2 py-2 text-[15px] text-slate-900"
                    autoCapitalize="none"
                    returnKeyType="search"
                    autoFocus
                  />
                  {query.length > 0 && (
                    <Pressable
                      onPress={() => setQuery("")}
                      hitSlop={8}
                      accessibilityLabel="Clear search"
                    >
                      <Ionicons name="close-circle" size={18} color={COLORS.muted} />
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => setSearchOpen(false)}
                    hitSlop={8}
                    accessibilityLabel="Close search"
                    style={{ marginLeft: 6 }}
                  >
                    <Ionicons name="close" size={18} color={COLORS.text} />
                  </Pressable>
                </View>
              </View>
            )}
          </View>

          {/* Absolutely centered title; does NOT intercept touches */}
          {!searchOpen && (
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 12,
                alignItems: "center",
              }}
            >
              <Text className="text-xl font-bold text-[#0F172A]">Police Stations</Text>
            </View>
          )}
        </View>

        {/* Full-width divider under the header */}
        <View style={{ height: 1, backgroundColor: COLORS.border }} />
      </SafeAreaView>

      {/* Filter chips (same spacing/gap as vulcanize) */}
      <FilterChips
        items={FILTERS}
        selected={filters}
        onToggle={toggleFilter}
        containerStyle={{ paddingHorizontal: 16, marginTop: 10 }}
        gap={8}
        horizontal
        accessibilityLabel="Station filters"
      />

      {/* List */}
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingVertical: 10, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <StationCard
            station={item}
            onLocation={openMaps}
            onCall={callStation}
            onPressCard={openActions} // tap card => quick actions (bottom sheet)
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 2 }} />}
        ListEmptyComponent={
          <View className="mt-16 items-center">
            <Ionicons name="search-outline" size={28} color={COLORS.muted} />
            <Text className="mt-2 text-slate-500">No stations match your filters.</Text>
          </View>
        }
      />

      {/* Bottom sheet */}
      <QuickActions
        visible={sheetOpen}
        onClose={closeActions}
        station={selectedStation}
        onOpenMaps={openMaps}
        onCall={callStation}
      />

      {/* Details modal */}
      <DetailsModal
        visible={detailsOpen}
        station={selectedStation}
        onClose={closeDetails}
        onOpenMaps={openMaps}
        onCall={callStation}
      />
    </View>
  );
}
