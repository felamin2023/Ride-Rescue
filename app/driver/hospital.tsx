// app/(driver)/hospital.tsx
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
import LoadingScreen from "../../components/LoadingScreen";
import FilterChips, { type FilterItem } from "../../components/FilterChips";

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
  ios: {
    shadowColor: "#0F172A",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  android: { elevation: 1 },
});

/** Keep default (slightly present) for tiny elements if needed */
const MICRO_SHADOW = Platform.select({
  ios: {
    shadowColor: "#0F172A",
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  android: { elevation: 1 },
});

/* ----------------------------- Types & Mock Data ---------------------------- */
type Facility = {
  id: string;
  name: string;
  category: "hospital" | "police" | "gas" | "repair" | "vulcanize" | "fire";
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
    id: "h1",
    name: "Cebu Provincial Hospital — Argao",
    category: "hospital",
    address1: "Argao, Cebu",
    address2: "VJP2+8RQ, Argao, Cebu",
    plusCode: "VJP2+8RQ",
    rating: 4.5,
    lat: 9.8799,
    lng: 123.6068,
    avatar: "https://i.pravatar.cc/100?img=20",
    distanceKm: 0.8,
    phone: "+63324880000",
  },
  {
    id: "h2",
    name: "Argao Community Clinic",
    category: "hospital",
    address1: "Poblacion, Argao, Cebu",
    rating: 4.2,
    lat: 9.8821,
    lng: 123.6041,
    avatar: "https://i.pravatar.cc/100?img=21",
    distanceKm: 1.7,
    phone: "+639178765432",
  },
  {
    id: "h3",
    name: "Lamacan Health Center",
    category: "hospital",
    address1: "Lamacan, Argao, Cebu",
    rating: 4.1,
    lat: 9.8706,
    lng: 123.5998,
    avatar: "https://i.pravatar.cc/100?img=22",
    distanceKm: 3.2,
    phone: "+639171112233",
  },
];

/* --------------------------------- Filters (reusable) -------------------------------- */
const FILTERS: FilterItem[] = [
  { key: "mdrrmo",   icon: "megaphone-outline", label: "MDRRMO" },
  { key: "hospital", icon: "medical-outline",   label: "Hospital" },
  { key: "police",   icon: "shield-outline",    label: "Police" },
  { key: "gas",      icon: "flash-outline",     label: "Gas" },
  { key: "repair",   icon: "construct-outline", label: "Repair" },
  { key: "fire",     icon: "flame-outline",     label: "Fire Station" },
  { key: "vulcanize",icon: "trail-sign-outline",label: "Vulcanize" },
];

/* --------------------------------- Small UI -------------------------------- */
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
        MICRO_SHADOW,
      ]}
      {...(Platform.OS === "android"
        ? { android_ripple: { color: "rgba(0,0,0,0.06)", borderless: false } }
        : {})}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={16}
          color={isPrimary ? "#FFFFFF" : COLORS.text}
          style={{ marginRight: 6 }}
        />
      ) : null}
      <Text className={`text-[13px] font-semibold ${isPrimary ? "text-white" : "text-slate-800"}`}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/* ----------------------- Bottom Sheet (flush to bottom) ---------------------- */
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
                  <Ionicons name="medical-outline" size={20} color="#475569" />
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
            <PrimaryButton
              label="Call Hospital"
              icon="call-outline"
              onPress={() => {
                onCall(facility);
                onClose();
              }}
            />
            <PrimaryButton
              label="Open in Google Maps"
              variant="secondary"
              icon="navigate-outline"
              onPress={() => {
                onOpenMaps(facility);
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
          <View className="rounded-2xl bg-white p-4" style={[{ borderWidth: 1, borderColor: COLORS.border }, SOFT_SHADOW]}>
            <View className="flex-row items-center gap-3">
              <View className="overflow-hidden rounded-xl" style={{ width: 56, height: 56, backgroundColor: "#F1F5N9".replace("N","9") }}>
                {facility.avatar ? (
                  <RNImage source={{ uri: facility.avatar }} style={{ width: "100%", height: "100%" }} />
                ) : (
                  <View className="h-full w-full items-center justify-center">
                    <Ionicons name="medical-outline" size={22} color="#475569" />
                  </View>
                )}
              </View>
              <View className="flex-1">
                <Text className="text-[18px] font-extrabold text-slate-900" numberOfLines={2}>
                  {facility.name}
                </Text>
                <View className="mt-1 flex-row items-center gap-2">
                  <View className="rounded-full bg-[#F1F5FF] px-2 py-[2px]">
                    <Text className="text-[11px] font-semibold text-[#1E3A8A] capitalize">
                      {facility.category}
                    </Text>
                  </View>
                  <Text className="text-slate-300">•</Text>
                  <Stars rating={facility.rating ?? 0} />
                  <Text className="text-[12px] text-slate-500">{(facility.rating ?? 0).toFixed(1)}</Text>
                  {typeof facility.distanceKm === "number" && (
                    <>
                      <Text className="text-slate-300">•</Text>
                      <Text className="text-[12px] text-slate-500">{facility.distanceKm.toFixed(1)} km away</Text>
                    </>
                  )}
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
              {facility.phone ? (
                <View className="flex-row items-center gap-2">
                  <Ionicons name="call-outline" size={14} color={COLORS.sub} />
                  <Text className="text-[12px] text-slate-600">{facility.phone}</Text>
                </View>
              ) : null}
            </View>

            <View className="mt-4 flex-row items-center gap-2">
              <View className="flex-1">
                <PrimaryButton label="Call" icon="call-outline" onPress={() => onCall(facility)} />
              </View>
              <View style={{ width: 10 }} />
              <View className="flex-1">
                <PrimaryButton
                  label="Open in Maps"
                  icon="navigate-outline"
                  variant="secondary"
                  onPress={() => onOpenMaps(facility)}
                />
              </View>
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
      style={[{ borderColor: COLORS.border, borderWidth: 1 }, SOFT_SHADOW]}
    >
      <View className="flex-row items-start gap-3">
        <View className="overflow-hidden rounded-xl" style={{ width: 64, height: 64, backgroundColor: "#F1F5F9" }}>
          {facility.avatar ? (
            <RNImage source={{ uri: facility.avatar }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
          ) : (
            <View className="h-full w-full items-center justify-center">
              <Ionicons name="medical-outline" size={22} color="#475569" />
            </View>
          )}
        </View>

        <View className="flex-1">
          <View className="flex-row items-center justify-between">
            <Text className="text-[16px] font-extrabold text-slate-900 flex-1" numberOfLines={2}>
              {facility.name}
            </Text>
            <View className="ml-3 rounded-full bg-[#F1F5FF] px-2 py-1">
              <Text className="text-[11px] font-semibold text-[#1E3A8A] capitalize">{facility.category}</Text>
            </View>
          </View>

          <View className="mt-1 flex-row items-center gap-2">
            <Stars rating={facility.rating ?? 0} />
            <Text className="text-[12px] text-slate-500">{(facility.rating ?? 0).toFixed(1)}</Text>
            {typeof facility.distanceKm === "number" && (
              <>
                <Text className="text-slate-300">•</Text>
                <Text className="text-[12px] text-slate-500">{facility.distanceKm.toFixed(1)} km</Text>
              </>
            )}
          </View>

          <Text className="mt-2 text-[13px] text-slate-700" numberOfLines={2}>
            {facility.address1}
          </Text>
          {facility.address2 ? (
            <Text className="text-[12px] text-slate-500" numberOfLines={1}>
              {facility.address2}
            </Text>
          ) : null}

          <View className="mt-3 flex-row items-center gap-2">
            <View className="flex-1">
              <PrimaryButton label="Open Location" icon="navigate-outline" variant="primary" onPress={() => onLocation(facility)} />
            </View>
            <View style={{ width: 12 }} />
            <View className="flex-1">
              <PrimaryButton label="Call" icon="call-outline" variant="secondary" onPress={() => onCall(facility)} />
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/* --------------------------------- Screen --------------------------------- */
export default function HospitalScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<string[]>(["hospital"]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedFacility, setSelectedFacility] = useState<Facility | null>(null);

  // Busy overlay + message (fix: LoadingScreen requires `visible`)
  const [busy, setBusy] = useState(false);
  const [busyMsg, setBusyMsg] = useState<string | undefined>(undefined);

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

  const openMaps = async (s: Facility) => {
    setBusyMsg("Opening Google Maps…");
    setBusy(true);
    try {
      if (s.lat && s.lng) {
        const url = `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`;
        await Linking.openURL(url);
      } else if (s.address1) {
        const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address1)}`;
        await Linking.openURL(url);
      }
    } finally {
      setBusy(false);
      setBusyMsg(undefined);
    }
  };

  const callFacility = async (s: Facility) => {
    if (!s.phone) return;
    const telUrl = `tel:${s.phone}`;
    setBusyMsg("Calling hospital…");
    setBusy(true);
    try {
      await Linking.openURL(telUrl);
    } finally {
      setBusy(false);
      setBusyMsg(undefined);
    }
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
        <View className="flex-row items-center justify-between px-4 py-3">
          <Pressable onPress={() => router.back()} hitSlop={10} className="h-9 w-9 items-center justify-center rounded-xl" accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={22} color={COLORS.text} />
          </Pressable>
          <Text className="text-2xl font-extrabold text-slate-900">Hospitals</Text>
          <View style={{ width: 36 }} />
        </View>
      </SafeAreaView>

      {/* Search */}
      <View className="px-4">
        <View className="flex-row items-center rounded-2xl bg-white px-3" style={[{ borderColor: COLORS.border, borderWidth: 1 }, MICRO_SHADOW]}>
          <Ionicons name="search" size={18} color={COLORS.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name, address, plus code…"
            placeholderTextColor={COLORS.muted}
            className="flex-1 px-2 py-3 text-[15px] text-slate-900"
            autoCapitalize="none"
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={COLORS.muted} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Reusable Filter Chips */}
      <FilterChips
        items={FILTERS}
        selected={filters}
        onToggle={toggleFilter}
        containerStyle={{ paddingHorizontal: 16, marginTop: 12 }}
        gap={12}
        horizontal
        accessibilityLabel="Facility filters"
      />

      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingVertical: 10, paddingBottom: 24 }}
        renderItem={({ item }) => (
          <FacilityCard facility={item} onLocation={openMaps} onCall={callFacility} onPressCard={openActions} />
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
      <QuickActions visible={sheetOpen} onClose={closeActions} facility={selectedFacility} onOpenMaps={openMaps} onCall={callFacility} />

      {/* Optional details modal */}
      <DetailsModal visible={detailsOpen} facility={selectedFacility} onClose={closeDetails} onOpenMaps={openMaps} onCall={callFacility} />

      {/* Loading overlay — FIX: pass required `visible` prop */}
      <LoadingScreen visible={busy} message={busyMsg} variant="spinner" />
    </View>
  );
}
