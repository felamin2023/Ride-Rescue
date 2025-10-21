// app/(driver)/police.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
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
  ActivityIndicator,
  Alert,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Location from "expo-location";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import FilterChips, { type FilterItem } from "../../components/FilterChips";
import { supabase } from "../../utils/supabase";
import RNMapView, { Marker, Polyline } from "react-native-maps";
import LoadingScreen from "../../components/LoadingScreen";

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
  success: "#16A34A",
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

/* ------------------------------ Avatars ------------------------------ */
const POLICE_AVATAR_PLACEHOLDER =
  "https://images.unsplash.com/photo-1555361677-9c2580dc1d8f?w=256&h=256&fit=crop&crop=faces&auto=format"; // safe placeholder

function CircleImage({ uri, size = 56 }: { uri?: string | null; size?: number }) {
  const [errored, setErrored] = useState(false);
  const source = !errored && uri ? { uri } : { uri: POLICE_AVATAR_PLACEHOLDER };
  return (
    <RNImage
      source={source}
      onError={() => setErrored(true)}
      style={{ width: size, height: size, borderRadius: 999, backgroundColor: "#F1F5F9" }}
      resizeMode="cover"
    />
  );
}

/* ----------------------------- Types ---------------------------- */
type PlaceRow = {
  place_id: string;
  name: string | null;
  category: "police_station" | (string & {});
  address: string | null;
  plus_code: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
  maps_link: string | null;
  phones: string[] | null;
  // avatar?: string | null; // ← add this in DB if you want, then map below
};

type Station = {
  id: string;
  name: string;
  category: "police";
  address1: string;
  plusCode?: string;
  avatar?: string | null;
  lat?: number;
  lng?: number;
  distanceKm?: number;
  maps_link?: string;
  phones?: string[];
};

/* --------------------------------- Filters -------------------------------- */
const FILTERS: FilterItem[] = [{ key: "police", icon: "shield-outline", label: "Police" }];

/* ----------------------- Phone chips (tap to call, long-press copy) ---------------------- */
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

/* -------------------------------- Buttons -------------------------------- */
function PrimaryButton({
  label,
  onPress,
  variant = "primary",
  icon,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
  icon?: keyof typeof Ionicons.glyphMap;
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
        <Ionicons name={icon} size={16} color={isPrimary ? "#FFFFFF" : COLORS.text} style={{ marginRight: 6 }} />
      ) : null}
      <Text className={`text-[13px] font-semibold ${isPrimary ? "text-white" : "text-slate-800"}`}>{label}</Text>
    </TouchableOpacity>
  );
}

/* ----------------------- Bottom Sheet (no Call button) ---------------------- */
function QuickActions({
  visible,
  onClose,
  station,
  onOpenMaps,
}: {
  visible: boolean;
  onClose: () => void;
  station?: Station | null;
  onOpenMaps: (s: Station) => void;
}) {
  const insets = useSafeAreaInsets();
  if (!station) return null;

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
            panelShadow,
          ]}
        >
          <View className="items-center mb-3">
            <View style={{ width: 44, height: 5, borderRadius: 999, backgroundColor: "#E2E8F0" }} />
          </View>

          <View className="flex-row items-center gap-3 pb-3">
            {/* Avatar image (44px) */}
            <View style={{ width: 44, height: 44, borderRadius: 999, overflow: "hidden", backgroundColor: "#F1F5F9" }}>
              <CircleImage uri={station.avatar} size={44} />
            </View>
            <View className="flex-1">
              <Text className="text-[15px] font-medium text-slate-900" numberOfLines={1}>{station.name}</Text>
              <Text className="text-[12px] text-slate-500" numberOfLines={1}>{station.address1}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} className="h-9 w-9 items-center justify-center rounded-xl" accessibilityLabel="Close quick actions">
              <Ionicons name="close" size={20} color={COLORS.text} />
            </Pressable>
          </View>

          <View className="h-[1px] bg-slate-200" />

          <View className="mt-3 gap-3">
            <PrimaryButton label="Location" icon="navigate-outline" onPress={() => { onOpenMaps(station); onClose(); }} />
            <PrimaryButton
              label={station.plusCode ? `Copy Plus Code (${station.plusCode})` : "Copy Address"}
              variant="secondary"
              icon="copy-outline"
              onPress={() => {
                Clipboard.setStringAsync(station.plusCode || station.address1 || station.name);
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
  station,
  onClose,
  onOpenMaps,
  onCall,
}: {
  visible: boolean;
  station: Station | null;
  onClose: () => void;
  onOpenMaps: (s: Station) => void;
  onCall: (phone: string) => void;
}) {
  if (!station) return null;
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable className="flex-1" style={{ backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 16 }} onPress={onClose}>
        <Pressable onPress={() => {}}>
          <View className="rounded-2xl bg-white p-4" style={[{ borderWidth: 1, borderColor: COLORS.border }, panelShadow]}>
            <View className="flex-row items-start gap-3">
              {/* Avatar image (56px) */}
              <View style={{ width: 56, height: 56, borderRadius: 999, overflow: "hidden", backgroundColor: "#F1F5F9" }}>
                <CircleImage uri={station.avatar} size={56} />
              </View>

              <View className="flex-1">
                <View className="flex-row items-start justify-between">
                  <Text className="text-[18px] text-slate-900" numberOfLines={2}>{station.name}</Text>
                  <View className="ml-3 rounded-full bg-[#F1F5FF] px-2 py-[2px] self-start">
                    <Text className="text-[10px] font-bold text-[#1E3A8A] capitalize">{station.category}</Text>
                  </View>
                </View>
              </View>
            </View>

            <View className="mt-3 gap-1">
              <Text className="text-[13px] text-slate-700">{station.address1}</Text>
            </View>

            <View style={{ height: 1, backgroundColor: "#E5E7EB", marginTop: 12, marginHorizontal: 8 }} />

            <Text className="mt-3 text-[12px] font-semibold text-slate-700">Contact numbers</Text>
            <PhoneChips phones={station.phones} onCall={onCall} />

            <View className="mt-4">
              <PrimaryButton label="Location" icon="navigate-outline" onPress={() => onOpenMaps(station)} />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ------------------------------ Distance utils ------------------------------ */
const toRad = (deg: number) => (deg * Math.PI) / 180;
function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s1 = Math.sin(dLat / 2) ** 2;
  const s2 = Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s1 + s2));
}

/* --------------------------------- Card ---------------------------------- */
function StationCard({
  station,
  onLocation,
  onPressCard,
  onCall,
  isNearest = false,
}: {
  station: Station;
  onLocation: (s: Station) => void;
  onPressCard: (s: Station) => void;
  onCall: (phone: string) => void;
  isNearest?: boolean;
}) {
  return (
    <Pressable
      onPress={() => onPressCard(station)}
      className="mx-4 my-2 rounded-2xl bg-white p-4"
      style={[{ borderColor: COLORS.border, borderWidth: 1 }, cardShadow]}
      accessibilityRole="button"
      accessibilityLabel={`Open actions for ${station.name}`}
    >
      <View className="flex-row items-start gap-3">
        {/* Avatar image (56px) */}
        <View style={{ width: 56, height: 56, borderRadius: 999, overflow: "hidden", backgroundColor: "#F1F5F9" }}>
          <CircleImage uri={station.avatar} size={56} />
        </View>

        <View className="flex-1">
          <View className="flex-row items-start justify-between">
            <Text className="text-[16px] text-slate-900 flex-1" numberOfLines={2}>
              {station.name}
            </Text>
            <View className="ml-3 flex-row items-center gap-1 self-start">
              {isNearest && (
                <View className="rounded-full px-2 py-[2px]" style={{ backgroundColor: "#ECFDF5", borderWidth: 1, borderColor: "#A7F3D0" }}>
                  <Text className="text-[10px] font-bold" style={{ color: COLORS.success }}>NEAREST</Text>
                </View>
              )}
              <View className="rounded-full bg-[#F1F5FF] px-2 py-[2px]">
                <Text className="text-[10px] font-semibold text-[#1E3A8A] capitalize">{station.category}</Text>
              </View>
            </View>
          </View>
        </View>
      </View>

      <View style={{ height: 1, backgroundColor: "#E5E7EB", marginTop: 8, marginHorizontal: 8 }} />

      <View style={{ paddingTop: 8, paddingLeft: 68 }}>
        <Text className="text-[13px] text-slate-700" numberOfLines={2}>
          {station.address1}
        </Text>

        <PhoneChips phones={station.phones} onCall={onCall} />

        <View className="mt-3 flex-row items-center gap-2">
          {typeof station.distanceKm === "number" && (
            <Text className="text-[12px] text-slate-500">{station.distanceKm.toFixed(1)} km</Text>
          )}
          <View style={{ flex: 1 }} />
          <View style={{ width: 140 }}>
            <PrimaryButton label="Location" icon="navigate-outline" variant="primary" onPress={() => onLocation(station)} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/* --------------------------------- Screen --------------------------------- */
export default function PoliceScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<string[]>(["police"]);

  const [stations, setStations] = useState<Station[]>([]);
  const [nearest, setNearest] = useState<Station | null>(null);
  const [gotLocation, setGotLocation] = useState<"idle" | "ok" | "denied" | "error">("idle");

  const [sheetOpen, setSheetOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  // 🔵 In-app map state
  const [mapVisible, setMapVisible] = useState(false);
  const [mapBusy, setMapBusy] = useState(false);
  const [driverCoords, setDriverCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [destCoords, setDestCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [destName, setDestName] = useState<string>("");
  const mapRef = useRef<any>(null);

  // 🔵 Global loading modal
  const [loading, setLoading] = useState<{ visible: boolean; message?: string }>({ visible: false });

  const toggleFilter = (k: string) =>
    setFilters((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));

  // 🔵 Open in-app satellite map (no external apps)
  const openMaps = async (s: Station) => {
    try {
      if (typeof s.lat !== "number" || typeof s.lng !== "number") {
        Alert.alert("Location Unavailable", "This station doesn't have coordinates yet.");
        return;
      }

      setLoading({ visible: true, message: "Loading map…" });
      setMapBusy(true);

      setDestCoords({ lat: s.lat, lon: s.lng });
      setDestName(s.name);

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Denied", "Please allow location access to view directions.");
        setMapBusy(false);
        setLoading({ visible: false });
        return;
      }

      let pos = await Location.getLastKnownPositionAsync({ maxAge: 15000, requiredAccuracy: 100 });
      if (!pos) pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (!pos) {
        Alert.alert("Error", "Couldn't get your current location.");
        setMapBusy(false);
        setLoading({ visible: false });
        return;
      }

      setDriverCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      setMapVisible(true); // modal shows; onMapReady clears mapBusy
    } catch (e) {
      console.warn("openMaps error:", e);
      Alert.alert("Error", "Could not open map.");
      setMapBusy(false);
    } finally {
      setLoading({ visible: false });
    }
  };

  const callNumber = (raw: string) => {
    if (!raw) return;
    const num = raw.replace(/[^\d+]/g, "");
    if (!num) return;
    Linking.openURL(`tel:${num}`).catch(() => {});
  };

  // Fetch stations (with phones[])
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("places")
        .select("place_id, name, category, address, plus_code, latitude, longitude, maps_link, phones")
        .eq("category", "police_station")
        .order("name", { ascending: true });

      if (error) {
        console.warn("places fetch error:", error.message);
        if (!cancelled) setStations([]);
        return;
      }

      const mapped: Station[] = (data ?? []).map((p: PlaceRow) => {
        const lat = p.latitude != null ? Number(p.latitude) : undefined;
        const lng = p.longitude != null ? Number(p.longitude) : undefined;
        return {
          id: p.place_id,
          name: p.name ?? "Unnamed Police Station",
          category: "police",
          address1: p.address ?? "",
          plusCode: p.plus_code ?? undefined,
          lat: Number.isFinite(lat) ? (lat as number) : undefined,
          lng: Number.isFinite(lng) ? (lng as number) : undefined,
          maps_link: p.maps_link ?? undefined,
          phones: p.phones ?? undefined,
          // avatar: p.avatar ?? null, // ← map this if you add avatar column in DB
        };
      });

      if (!cancelled) setStations(mapped);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Get location → compute distances → pick nearest
  useEffect(() => {
    let cancelled = false;
    async function locateAndMeasure() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          if (!cancelled) setGotLocation("denied");
          return;
        }

        let pos = await Location.getLastKnownPositionAsync({ maxAge: 15000, requiredAccuracy: 100 });
        if (!pos) pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!pos || cancelled) return;

        const { latitude, longitude } = pos.coords;

        setStations((prev) => {
          const updated = prev.map((s) =>
            typeof s.lat === "number" && typeof s.lng === "number"
              ? { ...s, distanceKm: haversineKm(latitude, longitude, s.lat, s.lng) }
              : { ...s, distanceKm: undefined }
          );
          let n: Station | null = null;
          for (const s of updated) {
            if (typeof s.distanceKm !== "number") continue;
            if (!n || (n.distanceKm ?? Infinity) > s.distanceKm) n = s;
          }
          setNearest(n);
          return updated;
        });

        if (!cancelled) setGotLocation("ok");
      } catch {
        if (!cancelled) setGotLocation("error");
      }
    }
    if (stations.length) locateAndMeasure();
    return () => {
      cancelled = true;
    };
  }, [stations.length]);

  // Search + sort
  const data = useMemo(() => {
    const q = query.trim().toLowerCase();
    return stations
      .filter((s) => {
        const byFilter = filters.length === 0 || filters.includes(s.category);
        const byText =
          !q ||
          s.name.toLowerCase().includes(q) ||
          s.address1.toLowerCase().includes(q) ||
          (s.plusCode ?? "").toLowerCase().includes(q) ||
          (s.phones ?? []).some((ph) => ph.toLowerCase().includes(q));
        return byFilter && byText;
      })
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
  }, [filters, query, stations]);

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
        {/* Header */}
        <View className="relative px-4 py-3">
          <View className="flex-row items-center justify-between">
            <Pressable
              onPress={() => {
                try {
                  // @ts-ignore
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
                  style={[{ borderColor: COLORS.border, borderWidth: 1, width: "100%", minWidth: 0 }, panelShadow]}
                >
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
              <Text className="text-xl font-bold text-[#0F172A]">Police Stations</Text>
            </View>
          )}
        </View>

        <View style={{ height: 1, backgroundColor: COLORS.border }} />
      </SafeAreaView>

      {/* Nearest panel */}
      {gotLocation === "ok" && nearest && (
        <View className="mx-4 mt-3 rounded-2xl" style={[{ backgroundColor: "#ECFDF5", borderWidth: 1, borderColor: "#A7F3D0", padding: 12 }, panelShadow]}>
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-[12px] font-semibold" style={{ color: COLORS.success }}>
                Nearest to you
              </Text>
              <Text className="text-[15px] font-medium text-slate-900" numberOfLines={1}>
                {nearest.name}
              </Text>
              {typeof nearest.distanceKm === "number" && (
                <Text className="text-[12px] text-slate-600">{nearest.distanceKm.toFixed(1)} km away</Text>
              )}
            </View>
            <PrimaryButton
              label="View"
              variant="primary"
              icon="navigate-outline"
              onPress={() => {
                setSelectedStation(nearest);
                setSheetOpen(true);
              }}
            />
          </View>
        </View>
      )}

      {(gotLocation === "denied" || gotLocation === "error") && (
        <View className="mx-4 mt-3 rounded-2xl bg-white p-3" style={[{ borderColor: COLORS.border, borderWidth: 1 }, panelShadow]}>
          <Text className="text-[12px] text-slate-600">We couldn’t access your location. Showing police stations without distance.</Text>
        </View>
      )}

      {/* Filter chips */}
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
            onPressCard={openActions}
            onCall={callNumber}
            isNearest={nearest?.id === item.id}
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

      {/* Bottom sheet (no call) */}
      <QuickActions visible={sheetOpen} onClose={closeActions} station={selectedStation} onOpenMaps={openMaps} />

      {/* Details modal (shows phone chips) */}
      <DetailsModal visible={detailsOpen} station={selectedStation} onClose={closeDetails} onOpenMaps={openMaps} onCall={callNumber} />

      {/* 🔵 In-app Map Modal (satellite) */}
      <Modal visible={mapVisible} animationType="slide" onRequestClose={() => setMapVisible(false)}>
        <SafeAreaView className="flex-1 bg-black">
          <View className="flex-1">
            {driverCoords && destCoords ? (
              <>
                <RNMapView
                  ref={mapRef}
                  style={{ flex: 1 }}
                  mapType="satellite"
                  initialRegion={{
                    latitude: driverCoords.lat,
                    longitude: driverCoords.lon,
                    latitudeDelta: 0.05,
                    longitudeDelta: 0.05,
                  }}
                  onMapReady={() => {
                    if (mapRef.current && driverCoords && destCoords) {
                      mapRef.current.fitToCoordinates(
                        [
                          { latitude: driverCoords.lat, longitude: driverCoords.lon },
                          { latitude: destCoords.lat, longitude: destCoords.lon },
                        ],
                        { edgePadding: { top: 80, right: 80, bottom: 80, left: 80 }, animated: true }
                      );
                    }
                    setMapBusy(false);
                  }}
                >
                  {/* You (driver) */}
                  <Marker coordinate={{ latitude: driverCoords.lat, longitude: driverCoords.lon }} title="You" pinColor="red" />
                  {/* Destination (station) */}
                  <Marker coordinate={{ latitude: destCoords.lat, longitude: destCoords.lon }} title={destName || "Police Station"} pinColor="#2563EB" />
                  <Polyline
                    coordinates={[
                      { latitude: driverCoords.lat, longitude: driverCoords.lon },
                      { latitude: destCoords.lat, longitude: destCoords.lon },
                    ]}
                    strokeWidth={4}
                    strokeColor="#2563EB"
                  />
                </RNMapView>

                {mapBusy && (
                  <View className="absolute inset-0 items-center justify-center bg-black/30">
                    <ActivityIndicator size="large" color="#FFF" />
                    <Text className="text-white mt-3">Preparing map…</Text>
                  </View>
                )}

                <Pressable onPress={() => setMapVisible(false)} className="absolute top-5 right-5 bg-white/90 rounded-full px-4 py-2">
                  <Text className="text-[14px] font-semibold text-slate-900">Close</Text>
                </Pressable>
              </>
            ) : (
              <View className="flex-1 items-center justify-center bg-black">
                <ActivityIndicator size="large" color="#FFF" />
                <Text className="text-white text-[14px] mt-3">Loading map…</Text>
              </View>
            )}
          </View>
        </SafeAreaView>
      </Modal>

      {/* 🔵 Global Loading Modal */}
      <LoadingScreen visible={loading.visible} message={loading.message} variant="spinner" />
    </View>
  );
}
