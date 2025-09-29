// app/(driver)/firestation.tsx
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  Image as RNImage,
  Linking,
  Modal,
  Platform,
  TouchableOpacity,
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

// Same shadow set as vulcanize
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
type Facility = {
  id: string;
  name: string;
  category: "fire" | "hospital" | "police" | "gas" | "repair" | "vulcanize" | "mdrrmo";
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

const MOCK: Facility[] = [
  {
    id: "f1",
    name: "BFP Argao Fire Station",
    category: "fire",
    address1: "Argao, Cebu",
    address2: "VJP2+7QM, Argao, Cebu",
    plusCode: "VJP2+7QM",
    rating: 4.6,
    lat: 9.8809,
    lng: 123.6042,
    avatar: "https://i.pravatar.cc/100?img=33",
    distanceKm: 0.9,
    phone: "+63324885555",
  },
  {
    id: "f2",
    name: "Taloot Sub-Station",
    category: "fire",
    address1: "Taloot, Argao, Cebu",
    rating: 4.3,
    lat: 9.8748,
    lng: 123.5955,
    avatar: "https://i.pravatar.cc/100?img=34",
    distanceKm: 2.0,
    phone: "+639175551234",
  },
  {
    id: "f3",
    name: "Lamacan Fire Volunteer Unit",
    category: "fire",
    address1: "Lamacan, Argao, Cebu",
    rating: 4.1,
    lat: 9.8702,
    lng: 123.6001,
    avatar: "https://i.pravatar.cc/100?img=35",
    distanceKm: 3.1,
    phone: "+639171231234",
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
  facility,
  onOpenMaps,
  onCall,
}: {
  visible: boolean;
  onClose: () => void;
  facility?: Facility | null;
  onOpenMaps: (s: Facility) => void;
  onCall: (s: Facility) => void;
}) {
  const insets = useSafeAreaInsets();
  if (!facility) return null;

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
              {facility.avatar ? (
                <RNImage source={{ uri: facility.avatar }} style={{ width: "100%", height: "100%" }} />
              ) : (
                <View className="h-full w-full items-center justify-center">
                  <Ionicons name="flame-outline" size={20} color="#475569" />
                </View>
              )}
            </View>
            <View className="flex-1">
              <Text className="text-[15px] font-medium text-slate-900" numberOfLines={1}>
                {facility.name}
              </Text>
              <Text className="text-[12px] text-slate-500" numberOfLines={1}>
                {facility.address1}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} className="h-9 w-9 items-center justify-center rounded-xl" accessibilityLabel="Close quick actions">
              <Ionicons name="close" size={20} color={COLORS.text} />
            </Pressable>
          </View>

          <View className="h-[1px] bg-slate-200" />

          <View className="mt-3 gap-3">
            {/* Keep 1:1 layout; adapt labels */}
            <PrimaryButton
              label="Location"
              icon="navigate-outline"
              onPress={() => {
                onOpenMaps(facility);
                onClose();
              }}
            />
            <PrimaryButton
              label="Call Station"
              variant="secondary"
              icon="call-outline"
              onPress={() => {
                onCall(facility);
                onClose();
              }}
            />
            <PrimaryButton
              label={facility.plusCode ? `Copy Plus Code (${facility.plusCode})` : "Copy Address"}
              variant="secondary"
              icon="copy-outline"
              onPress={() => {
                const text = facility.plusCode || facility.address1 || facility.name;
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
  facility,
  onClose,
  onOpenMaps,
  onCall,
}: {
  visible: boolean;
  facility: Facility | null;
  onClose: () => void;
  onOpenMaps: (s: Facility) => void;
  onCall: (s: Facility) => void;
}) {
  if (!facility) return null;
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
                {facility.avatar ? (
                  <RNImage source={{ uri: facility.avatar }} style={{ width: "100%", height: "100%" }} />
                ) : (
                  <View className="h-full w-full items-center justify-center">
                    <Ionicons name="flame-outline" size={22} color="#475569" />
                  </View>
                )}
              </View>

              <View className="flex-1">
                <View className="flex-row items-start justify-between">
                  <Text className="text-[18px] text-slate-900" numberOfLines={2}>
                    {facility.name}
                  </Text>
                  <View className="ml-3 rounded-full bg-[#F1F5FF] px-2 py-[2px] self-start">
                    <Text className="text-[10px] font-bold text-[#1E3A8A] capitalize">{facility.category}</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Address FIRST */}
            <View className="mt-3 gap-1">
              <Text className="text-[13px] text-slate-700">{facility.address1}</Text>
              {facility.address2 ? <Text className="text-[12px] text-slate-500">{facility.address2}</Text> : null}
            </View>

            {/* Divider */}
            <View style={{ height: 1, backgroundColor: "#E5E7EB", marginTop: 12, marginHorizontal: 8 }} />

            {/* Ratings / distance */}
            <View className="mt-2 flex-row items-center gap-2">
              <Stars rating={facility.rating ?? 0} />
              <Text className="text-[12px] text-slate-500">{(facility.rating ?? 0).toFixed(1)}</Text>
              {typeof facility.distanceKm === "number" && (
                <>
                  <Text className="text-slate-300">•</Text>
                  <Text className="text-[12px] text-slate-500">{facility.distanceKm.toFixed(1)} km away</Text>
                </>
              )}
            </View>

            {/* Actions */}
            <View className="mt-4 flex-row items-center gap-2">
              <View className="flex-1">
                <PrimaryButton label="Call" icon="call-outline" variant="secondary" onPress={() => onCall(facility)} />
              </View>
              <View style={{ width: 10 }} />
              <View className="flex-1">
                <PrimaryButton label="Location" icon="navigate-outline" onPress={() => onOpenMaps(facility)} />
              </View>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* --------------------------------- Card (identical sizes/layout to vulcanize) ---------------------------------- */
function FacilityCard({
  facility,
  onLocation,
  onCall,
  onPressCard,
}: {
  facility: Facility;
  onLocation: (s: Facility) => void;
  onCall: (s: Facility) => void;
  onPressCard: (s: Facility) => void;
}) {
  return (
    <Pressable
      onPress={() => onPressCard(facility)}
      className="mx-4 my-2 rounded-2xl bg-white p-4"
      style={[{ borderColor: COLORS.border, borderWidth: 1 }, cardShadow]}
      accessibilityRole="button"
      accessibilityLabel={`Open actions for ${facility.name}`}
    >
      {/* Header row with avatar + title/badge */}
      <View className="flex-row items-start gap-3">
        {/* Circular image — 56x56 */}
        <View style={{ width: 56, height: 56, borderRadius: 999, overflow: "hidden", backgroundColor: "#F1F5F9" }}>
          {facility.avatar ? (
            <RNImage source={{ uri: facility.avatar }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
          ) : (
            <View className="h-full w-full items-center justify-center">
              <Ionicons name="flame-outline" size={22} color="#475569" />
            </View>
          )}
        </View>

        <View className="flex-1">
          {/* Title row: 16px, not bold; badge self-start */}
          <View className="flex-row items-start justify-between">
            <Text className="text-[16px] text-slate-900 flex-1" numberOfLines={2}>
              {facility.name}
            </Text>
            <View className="ml-3 rounded-full bg-[#F1F5FF] px-2 py-[2px] self-start">
              <Text className="text-[10px] font-semibold text-[#1E3A8A] capitalize">{facility.category}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Divider under header — marginTop:8, marginHorizontal:8 */}
      <View style={{ height: 1, backgroundColor: "#E5E7EB", marginTop: 8, marginHorizontal: 8 }} />

      {/* Body aligned with text column — paddingLeft:68 */}
      <View style={{ paddingTop: 8, paddingLeft: 68 }}>
        {/* Address */}
        <Text className="text-[13px] text-slate-700" numberOfLines={2}>
          {facility.address1}
        </Text>
        {facility.address2 ? (
          <Text className="text-[12px] text-slate-500" numberOfLines={1}>
            {facility.address2}
          </Text>
        ) : null}

        {/* Ratings / distance */}
        <View className="mt-2 flex-row items-center gap-2">
          <Stars rating={facility.rating ?? 0} />
          <Text className="text-[12px] text-slate-500">{(facility.rating ?? 0).toFixed(1)}</Text>
          {typeof facility.distanceKm === "number" && (
            <>
              <Text className="text-slate-300">•</Text>
              <Text className="text-[12px] text-slate-500">{facility.distanceKm.toFixed(1)} km</Text>
            </>
          )}
        </View>

        {/* Actions — Call (secondary) left, Location (primary) right */}
        <View className="mt-3 flex-row items-center gap-2">
          <View className="flex-1">
            <PrimaryButton label="Call" icon="call-outline" variant="secondary" onPress={() => onCall(facility)} />
          </View>
          <View style={{ width: 12 }} />
          <View className="flex-1">
            <PrimaryButton label="Location" icon="navigate-outline" variant="primary" onPress={() => onLocation(facility)} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/* --------------------------------- Screen (vulcanize-style header/search + divider kept) --------------------------------- */
export default function FireStationScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<string[]>(["fire"]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedFacility, setSelectedFacility] = useState<Facility | null>(null);

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

  const openMaps = (s: Facility) => {
    if (s.lat && s.lng) {
      const url = `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`;
      Linking.openURL(url).catch(() => {});
    } else if (s.address1) {
      const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address1)}`;
      Linking.openURL(url).catch(() => {});
    }
  };

  const callFacility = (s: Facility) => {
    if (!s.phone) return;
    const telUrl = `tel:${s.phone}`;
    Linking.openURL(telUrl).catch(() => {});
  };

  const openActions = (s: Facility) => {
    setSelectedFacility(s);
    setSheetOpen(true);
  };
  const closeActions = () => setSheetOpen(false);
  const openDetails = (s: Facility) => {
    setSelectedFacility(s);
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
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View
                  className="flex-row items-center rounded-2xl bg-white px-3 py-1"
                  style={[
                    { borderColor: COLORS.border, borderWidth: 1, width: "100%", minWidth: 0 },
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
                    <Pressable onPress={() => setQuery("")} hitSlop={8} accessibilityLabel="Clear search">
                      <Ionicons name="close-circle" size={18} color={COLORS.muted} />
                    </Pressable>
                  )}
                  <Pressable onPress={() => setSearchOpen(false)} hitSlop={8} accessibilityLabel="Close search" style={{ marginLeft: 6 }}>
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
              style={{ position: "absolute", left: 0, right: 0, top: 12, alignItems: "center" }}
            >
              <Text className="text-xl font-bold text-[#0F172A]">Fire Stations</Text>
            </View>
          )}
        </View>

        {/* Full-width divider under the header (kept as requested) */}
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
        accessibilityLabel="Facility filters"
      />

      {/* List */}
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingVertical: 10, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <FacilityCard
            facility={item}
            onLocation={openMaps}
            onCall={callFacility}
            onPressCard={openActions} // tap card => quick actions (bottom sheet)
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 2 }} />}
        ListEmptyComponent={
          <View className="mt-16 items-center">
            <Ionicons name="search-outline" size={28} color={COLORS.muted} />
            <Text className="mt-2 text-slate-500">No facilities match your filters.</Text>
          </View>
        }
      />

      {/* Bottom sheet */}
      <QuickActions
        visible={sheetOpen}
        onClose={closeActions}
        facility={selectedFacility}
        onOpenMaps={openMaps}
        onCall={callFacility}
      />

      {/* Details modal (present for reuse, not opened by default) */}
      <DetailsModal
        visible={detailsOpen}
        facility={selectedFacility}
        onClose={closeDetails}
        onOpenMaps={openMaps}
        onCall={callFacility}
      />
    </View>
  );
}
