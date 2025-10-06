// app/(driver)/MDRRMO.tsx
import React, { useEffect, useMemo, useState } from "react";
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
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import LoadingScreen from "../../components/LoadingScreen";
import FilterChips, { type FilterItem } from "../../components/FilterChips";
import { supabase } from "../../utils/supabase";

/* ------------------------------ Design tokens ------------------------------ */
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

/** Softer, minimal shadow for cards & sheets */
const SOFT_SHADOW = Platform.select({
  ios: { shadowColor: "#0F172A", shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
  android: { elevation: 1 },
});

/** Light shadow for small controls */
const MICRO_SHADOW = Platform.select({
  ios: { shadowColor: "#0F172A", shadowOpacity: 0.03, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  android: { elevation: 1 },
});

/* ---------------------------------- Types ---------------------------------- */
type PlaceRow = {
  place_id: string;
  name: string | null;
  category: "rescue_station" | (string & {});
  address: string | null;
  plus_code: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
  maps_link: string | null;
  phones: string[] | null; // text[] from DB
};

type Facility = {
  id: string;
  name: string;
  category: "mdrrmo"; // normalized in-app
  address1: string;
  address2?: string;
  plusCode?: string;
  avatar?: string;
  lat?: number;
  lng?: number;
  distanceKm?: number;
  maps_link?: string;
  phones?: string[]; // array in-app
};

/* --------------------------- Reusable filter items -------------------------- */
const FILTERS: FilterItem[] = [
  { key: "vulcanize", icon: "trail-sign-outline", label: "Vulcanize" },
  { key: "repair", icon: "construct-outline", label: "Repair" },
  { key: "gas", icon: "flash-outline", label: "Gas" },
  { key: "hospital", icon: "medical-outline", label: "Hospital" },
  { key: "police", icon: "shield-outline", label: "Police" },
  { key: "fire", icon: "flame-outline", label: "Fire Station" },
  { key: "mdrrmo", icon: "megaphone-outline", label: "MDRRMO" },
];

/* ----------------------- Small UI: Primary Button ---------------------- */
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
    <Pressable
      onPress={onPress}
      android_ripple={{ color: "rgba(0,0,0,0.06)", borderless: false }}
      className={`flex-row items-center justify-center rounded-full px-4`}
      style={[
        { minHeight: 48, borderWidth: isPrimary ? 0 : 1, borderColor: COLORS.border, backgroundColor: isPrimary ? COLORS.primary : "#FFFFFF" },
        MICRO_SHADOW,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {icon ? <Ionicons name={icon} size={16} color={isPrimary ? "#FFFFFF" : COLORS.text} style={{ marginRight: 6 }} /> : null}
      <Text className={`text-[13px] font-semibold ${isPrimary ? "text-white" : "text-slate-800"}`}>{label}</Text>
    </Pressable>
  );
}

/* ----------------------- Phone chips (tap = call, long-press = copy) ---------------------- */
function PhoneChips({ phones, onCall }: { phones?: string[]; onCall: (phone: string) => void }) {
  if (!phones || phones.length === 0) {
    return <Text className="text-[12px] text-slate-500">No contact numbers available</Text>;
  }
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 8 }}>
      {phones.map((p, idx) => (
        <Pressable
          key={`${p}-${idx}`}
          onPress={() => onCall(p)}
          onLongPress={() => Clipboard.setStringAsync(p)}
          android_ripple={{ color: "rgba(0,0,0,0.06)", borderless: false }}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 999,
            backgroundColor: "#F8FAFC",
            borderWidth: 1,
            borderColor: COLORS.border,
            marginRight: 8,
            marginBottom: 8,
          }}
          accessibilityRole="button"
          accessibilityLabel={`Call ${p}`}
        >
          <Text className="text-[12px] text-slate-800">{p}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/* ----------------------- Bottom Sheet (no Call/Message buttons) ---------------------- */
function QuickActions({
  visible,
  onClose,
  facility,
  onOpenMaps,
}: {
  visible: boolean;
  onClose: () => void;
  facility?: Facility | null;
  onOpenMaps: (s: Facility) => void;
}) {
  const insets = useSafeAreaInsets();
  if (!facility) return null;

  return (
    <Modal transparent statusBarTranslucent animationType="fade" visible={visible} onRequestClose={onClose}>
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
            SOFT_SHADOW,
          ]}
        >
          <View className="items-center mb-3">
            <View style={{ width: 44, height: 5, borderRadius: 999, backgroundColor: "#E2E8F0" }} />
          </View>

          <View className="flex-row items-center gap-3 pb-3">
            <View className="overflow-hidden rounded-xl" style={{ width: 44, height: 44, backgroundColor: "#F1F5F9" }}>
              {facility.avatar ? (
                <RNImage source={{ uri: facility.avatar }} style={{ width: "100%", height: "100%" }} />
              ) : (
                <View className="h-full w-full items-center justify-center">
                  <Ionicons name="megaphone-outline" size={20} color="#475569" />
                </View>
              )}
            </View>
            <View className="flex-1">
              <Text className="text-[15px] font-bold text-slate-900" numberOfLines={1}>
                {facility.name}
              </Text>
              <Text className="text-[12px] text-slate-500" numberOfLines={1}>
                {facility.address1}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} className="h-9 w-9 items-center justify-center rounded-xl" accessibilityLabel="Close">
              <Ionicons name="close" size={20} color={COLORS.text} />
            </Pressable>
          </View>

          <View className="h-[1px] bg-slate-200" />

          <View className="mt-3 gap-3">
            <PrimaryButton label="Open in Google Maps" variant="secondary" icon="navigate-outline" onPress={() => { onOpenMaps(facility); onClose(); }} />
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

        <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: insets.bottom, backgroundColor: "#FFFFFF" }} />
      </View>
    </Modal>
  );
}

/* ------------------------------- Details Modal ------------------------------ */
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
  onCall: (phone: string) => void;
}) {
  if (!facility) return null;
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable className="flex-1" style={{ backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 16 }} onPress={onClose}>
        <Pressable onPress={() => {}}>
          <View className="rounded-2xl bg-white p-4" style={[{ borderWidth: 1, borderColor: COLORS.border }, SOFT_SHADOW]}>
            <View className="flex-row items-center gap-3">
              <View className="overflow-hidden rounded-xl" style={{ width: 56, height: 56, backgroundColor: "#F1F5F9" }}>
                {facility.avatar ? (
                  <RNImage source={{ uri: facility.avatar }} style={{ width: "100%", height: "100%" }} />
                ) : (
                  <View className="h-full w-full items-center justify-center">
                    <Ionicons name="megaphone-outline" size={22} color="#475569" />
                  </View>
                )}
              </View>
              <View className="flex-1">
                <Text className="text-[18px] font-extrabold text-slate-900" numberOfLines={2}>
                  {facility.name}
                </Text>
                <View className="mt-1 flex-row items-center gap-2">
                  <View className="rounded-full bg-[#F1F5FF] px-2 py-[2px]">
                    <Text className="text-[11px] font-semibold text-[#1E3A8A] capitalize">{facility.category}</Text>
                  </View>
                </View>
              </View>
            </View>

            <View className="mt-3 h-[1px] bg-slate-200" />

            <View className="mt-3 gap-1">
              <Text className="text-[13px] text-slate-700">{facility.address1}</Text>
              {facility.address2 ? <Text className="text-[12px] text-slate-500">{facility.address2}</Text> : null}
              {facility.plusCode ? (
                <View className="flex-row items-center gap-2">
                  <Ionicons name="locate-outline" size={14} color={COLORS.sub} />
                  <Text className="text-[12px] text-slate-600">Plus Code: {facility.plusCode}</Text>
                </View>
              ) : null}
              {facility.lat && facility.lng ? (
                <View className="flex-row items-center gap-2">
                  <Ionicons name="pin-outline" size={14} color={COLORS.sub} />
                  <Text className="text-[12px] text-slate-600">
                    ({facility.lat.toFixed(5)}, {facility.lng.toFixed(5)})
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Contact numbers */}
            <Text className="mt-3 text-[12px] font-semibold text-slate-700">Contact numbers</Text>
            <PhoneChips phones={facility.phones} onCall={onCall} />

            {/* Buttons */}
            <View className="mt-4">
              <PrimaryButton label="Open in Maps" icon="navigate-outline" variant="secondary" onPress={() => onOpenMaps(facility)} />
            </View>

            <View className="mt-3">
              <PrimaryButton
                label={facility.plusCode ? `Copy Plus Code (${facility.plusCode})` : "Copy Address"}
                icon="copy-outline"
                variant="secondary"
                onPress={() => {
                  const text = facility.plusCode || facility.address1 || facility.name;
                  Clipboard.setStringAsync(text);
                }}
              />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* --------------------------------- Card ---------------------------------- */
function FacilityCard({
  facility,
  onLocation,
  onPressCard,
  onCall,
}: {
  facility: Facility;
  onLocation: (s: Facility) => void;
  onPressCard: (s: Facility) => void;
  onCall: (phone: string) => void;
}) {
  return (
    <Pressable
      onPress={() => onPressCard(facility)}
      className="mx-4 my-2 rounded-2xl bg-white p-4"
      style={[{ borderColor: COLORS.border, borderWidth: 1 }, SOFT_SHADOW]}
    >
      <View className="flex-row items-start gap-3">
        <View className="overflow-hidden rounded-xl" style={{ width: 64, height: 64, backgroundColor: "#F1F5F9" }}>
          {facility.avatar ? (
            <RNImage source={{ uri: facility.avatar }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
          ) : (
            <View className="h-full w-full items-center justify-center">
              <Ionicons name="megaphone-outline" size={22} color="#475569" />
            </View>
          )}
        </View>

        <View className="flex-1">
          <View className="flex-row items-center justify-between">
            <Text className="flex-1 text-[16px] font-extrabold text-slate-900" numberOfLines={2}>
              {facility.name}
            </Text>
            <View className="ml-3 rounded-full bg-[#F1F5FF] px-2 py-1">
              <Text className="text-[11px] font-semibold text-[#1E3A8A] capitalize">{facility.category}</Text>
            </View>
          </View>

          <Text className="mt-2 text-[13px] text-slate-700" numberOfLines={2}>
            {facility.address1}
          </Text>

          {/* Contact numbers (chips) */}
          <PhoneChips phones={facility.phones} onCall={onCall} />

          {/* Location button */}
          <View className="mt-3">
            <PrimaryButton label="Open Location" icon="navigate-outline" variant="primary" onPress={() => onLocation(facility)} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/* --------------------------------- Screen --------------------------------- */
export default function MDRRMOScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<string[]>(["mdrrmo"]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedFacility, setSelectedFacility] = useState<Facility | null>(null);
  const [busy, setBusy] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [facilities, setFacilities] = useState<Facility[]>([]);

  const toggleFilter = (k: string) =>
    setFilters((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));

  // fetch MDRRMO (rescue stations) from Supabase
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("places")
        .select("place_id, name, category, address, plus_code, latitude, longitude, maps_link, phones")
        .eq("category", "rescue_station")
        .order("name", { ascending: true });

      if (error) {
        console.warn("places fetch error:", error.message);
        if (!cancelled) setFacilities([]);
        return;
      }

      const mapped: Facility[] = (data ?? []).map((p: PlaceRow) => {
        const lat = p.latitude != null ? Number(p.latitude) : undefined;
        const lng = p.longitude != null ? Number(p.longitude) : undefined;
        return {
          id: p.place_id,
          name: p.name ?? "Unnamed MDRRMO",
          category: "mdrrmo", // normalize
          address1: p.address ?? "",
          plusCode: p.plus_code ?? undefined,
          lat: Number.isFinite(lat) ? (lat as number) : undefined,
          lng: Number.isFinite(lng) ? (lng as number) : undefined,
          maps_link: p.maps_link ?? undefined,
          phones: p.phones ?? undefined,
        };
      });

      if (!cancelled) setFacilities(mapped);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const data = useMemo(() => {
    const q = query.trim().toLowerCase();
    return facilities
      .filter((s) => {
        const byFilter = filters.length === 0 || filters.includes(s.category);
        const byText =
          q.length === 0 ||
          s.name.toLowerCase().includes(q) ||
          s.address1.toLowerCase().includes(q) ||
          (s.plusCode ?? "").toLowerCase().includes(q) ||
          (s.phones ?? []).some((ph) => ph.toLowerCase().includes(q));
        return byFilter && byText;
      })
      .sort((a, b) => (a.name.localeCompare(b.name)));
  }, [filters, query, facilities]);

  const openMaps = async (s: Facility) => {
    setBusy(true);
    try {
      if (s.maps_link) {
        await Linking.openURL(s.maps_link);
      } else if (s.lat && s.lng) {
        await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`);
      } else if (s.address1) {
        await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address1)}`);
      }
    } finally {
      setBusy(false);
    }
  };

  const callNumber = async (raw: string) => {
    if (!raw) return;
    const num = raw.replace(/[^\d+]/g, ""); // keep digits and '+'
    if (!num) return;
    setBusy(true);
    try {
      await Linking.openURL(`tel:${num}`);
    } finally {
      setBusy(false);
    }
  };

  const openActions = (s: Facility) => { setSelectedFacility(s); setSheetOpen(true); };
  const closeActions = () => setSheetOpen(false);
  const openDetails = (s: Facility) => { setSelectedFacility(s); setDetailsOpen(true); };
  const closeDetails = () => setDetailsOpen(false);

  return (
    <View className="flex-1" style={{ backgroundColor: COLORS.bg }}>
      <SafeAreaView edges={["top"]} style={{ backgroundColor: COLORS.bg }}>
        {/* Header with search toggle */}
        <View className="relative px-4 py-3">
          <View className="flex-row items-center justify-between">
            <Pressable onPress={() => router.back()} hitSlop={10} className="h-9 w-9 items-center justify-center rounded-xl" accessibilityLabel="Go back">
              <Ionicons name="arrow-back" size={22} color={COLORS.text} />
            </Pressable>

            {!searchOpen ? (
              <Pressable onPress={() => setSearchOpen(true)} hitSlop={10} className="h-9 w-9 items-center justify-center rounded-xl" accessibilityLabel="Open search">
                <Ionicons name="search" size={20} color={COLORS.text} />
              </Pressable>
            ) : (
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View className="flex-row items-center rounded-2xl bg-white px-3 py-1" style={[{ borderColor: COLORS.border, borderWidth: 1, width: "100%", minWidth: 0 }, MICRO_SHADOW]}>
                  <Ionicons name="search" size={18} color={COLORS.muted} />
                  <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search by name, address, plus code, phone…"
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

          {!searchOpen && (
            <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 12, alignItems: "center" }}>
              <Text className="text-xl font-bold text-[#0F172A]">MDRRMO</Text>
            </View>
          )}
        </View>

        <View style={{ height: 1, backgroundColor: COLORS.border }} />
      </SafeAreaView>

      {/* Filter chips */}
      <FilterChips
        items={FILTERS}
        selected={filters}
        onToggle={toggleFilter}
        containerStyle={{ paddingHorizontal: 16, marginTop: 12 }}
        gap={12}
        horizontal
        accessibilityLabel="Service filters"
      />

      {/* List */}
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingVertical: 10, paddingBottom: 24 }}
        renderItem={({ item }) => (
          <FacilityCard
            facility={item}
            onLocation={openMaps}
            onPressCard={openActions}
            onCall={callNumber}
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

      {/* Bottom sheet actions (no call/message) */}
      <QuickActions visible={sheetOpen} onClose={closeActions} facility={selectedFacility} onOpenMaps={openMaps} />

      {/* Details modal (shows phone chips) */}
      <DetailsModal visible={detailsOpen} facility={selectedFacility} onClose={closeDetails} onOpenMaps={openMaps} onCall={callNumber} />

      {/* Loading overlay */}
      <LoadingScreen visible={busy} message="Please wait…" variant="dots" />
    </View>
  );
}
