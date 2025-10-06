// app/(driver)/gasstation.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import * as Location from "expo-location";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
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

/* ---------------------------------- Types ---------------------------------- */
type PlaceRow = {
  place_id: string;
  name: string | null;
  category: "gas_station" | "vulcanizing" | "repair_shop" | (string & {});
  address: string | null;
  plus_code: string | null;
  latitude: string | number | null;   // numeric comes as string in JS
  longitude: string | number | null;
  maps_link: string | null;
  profile_pic: string | null;         // 👈 image url
};

type Shop = {
  id: string;
  name: string;
  category: "gas_station";
  address1: string;
  plusCode?: string;
  avatar?: string;        // 👈 from profile_pic
  rating?: number;
  lat?: number;
  lng?: number;
  distanceKm?: number;
  maps_link?: string;
};

/* --------------------------------- Small UI -------------------------------- */
function Stars({ rating = 0 }: { rating?: number }) {
  const r = Math.max(0, Math.min(5, rating));
  const full = Math.floor(r);
  const half = r - full >= 0.5;
  return (
    <View className="flex-row items-center">
      {Array.from({ length: 5 }).map((_, i) => {
        const name = i < full ? "star" : i === full && half ? "star-half" : "star-outline";
        return <Ionicons key={i} name={name as any} size={14} color={"#F59E0B"} style={{ marginRight: i === 4 ? 0 : 2 }} />;
      })}
    </View>
  );
}

function PrimaryButton({
  label, onPress, variant = "primary", icon,
}: { label: string; onPress: () => void; variant?: "primary" | "secondary"; icon?: keyof typeof Ionicons.glyphMap; }) {
  const isPrimary = variant === "primary";
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: "rgba(0,0,0,0.06)", borderless: false }}
      style={[
        { flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
        isPrimary ? { backgroundColor: COLORS.primary } : { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: COLORS.border },
        buttonShadow,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {icon ? <Ionicons name={icon} size={16} color={isPrimary ? "#FFFFFF" : COLORS.text} style={{ marginRight: 6 }} /> : null}
      <Text className={`text-[13px] font-semibold ${isPrimary ? "text-white" : "text-slate-800"}`}>{label}</Text>
    </Pressable>
  );
}

/* ----------------------- Bottom Sheet ---------------------- */
function QuickActions({
  visible, onClose, shop, onOpenMaps,
}: { visible: boolean; onClose: () => void; shop?: Shop | null; onOpenMaps: (s: Shop) => void; }) {
  const insets = useSafeAreaInsets();
  if (!shop) return null;

  return (
    <Modal transparent statusBarTranslucent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View
          style={[
            { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "#FFFFFF",
              borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: 16 + insets.bottom,
              borderTopWidth: 1, borderColor: COLORS.border, },
            panelShadow,
          ]}
        >
          <View className="items-center mb-3">
            <View style={{ width: 44, height: 5, borderRadius: 999, backgroundColor: "#E2E8F0" }} />
          </View>

          <View className="flex-row items-center gap-3 pb-3">
            <View style={{ width: 44, height: 44, borderRadius: 999, overflow: "hidden", backgroundColor: "#F1F5F9" }}>
              {shop?.avatar ? (
                <RNImage source={{ uri: shop.avatar }} style={{ width: "100%", height: "100%" }} />
              ) : (
                <View className="h-full w-full items-center justify-center">
                  <Ionicons name="storefront-outline" size={20} color="#475569" />
                </View>
              )}
            </View>
            <View className="flex-1">
              <Text className="text-[15px] font-medium text-slate-900" numberOfLines={1}>{shop?.name}</Text>
              <Text className="text-[12px] text-slate-500" numberOfLines={1}>{shop?.address1}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} className="h-9 w-9 items-center justify-center rounded-xl" accessibilityLabel="Close quick actions">
              <Ionicons name="close" size={20} color={COLORS.text} />
            </Pressable>
          </View>

          <View className="h-[1px] bg-slate-200" />

          <View className="mt-3 gap-3">
            <PrimaryButton label="Location" icon="navigate-outline" onPress={() => { if (shop) onOpenMaps(shop); onClose(); }} />
            <PrimaryButton
              label={shop?.plusCode ? `Copy Plus Code (${shop.plusCode})` : "Copy Address"}
              variant="secondary"
              icon="copy-outline"
              onPress={() => { Clipboard.setStringAsync(shop?.plusCode || shop?.address1 || shop?.name || ""); onClose(); }}
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
  visible, shop, onClose, onOpenMaps,
}: { visible: boolean; shop: Shop | null; onClose: () => void; onOpenMaps: (s: Shop) => void; }) {
  if (!shop) return null;
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable className="flex-1" style={{ backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 16 }} onPress={onClose}>
        <Pressable onPress={() => {}}>
          <View className="rounded-2xl bg-white p-4" style={[{ borderWidth: 1, borderColor: COLORS.border }, panelShadow]}>
            <View className="flex-row items-start gap-3">
              <View style={{ width: 56, height: 56, borderRadius: 999, overflow: "hidden", backgroundColor: "#F1F5F9" }}>
                {shop.avatar ? (
                  <RNImage source={{ uri: shop.avatar }} style={{ width: "100%", height: "100%" }} />
                ) : (
                  <View className="h-full w-full items-center justify-center">
                    <Ionicons name="storefront-outline" size={22} color="#475569" />
                  </View>
                )}
              </View>

              <View className="flex-1">
                <View className="flex-row items-start justify-between">
                  <Text className="text-[18px] text-slate-900" numberOfLines={2}>{shop.name}</Text>
                  <View className="ml-3 rounded-full bg-[#F1F5FF] px-2 py-[2px] self-start">
                    <Text className="text-[10px] font-bold text-[#1E3A8A] capitalize">{shop.category}</Text>
                  </View>
                </View>
              </View>
            </View>

            <View className="mt-3 gap-1">
              <Text className="text-[13px] text-slate-700">{shop.address1}</Text>
            </View>

            <View style={{ height: 1, backgroundColor: "#E5E7EB", marginTop: 12, marginHorizontal: 8 }} />

            <View className="mt-2 flex-row items-center gap-2">
              <Stars rating={shop.rating ?? 0} />
              <Text className="text-[12px] text-slate-500">{(shop.rating ?? 0).toFixed(1)}</Text>
              {typeof shop.distanceKm === "number" && (<><Text className="text-slate-300">•</Text><Text className="text-[12px] text-slate-500">{shop.distanceKm.toFixed(1)} km away</Text></>)}
            </View>

            {/* Single action: Location */}
            <View className="mt-4">
              <PrimaryButton label="Location" icon="navigate-outline" onPress={() => onOpenMaps(shop)} />
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
function ShopCard({
  shop, onLocation, onPressCard, isNearest = false,
}: { shop: Shop; onLocation: (s: Shop) => void; onPressCard: (s: Shop) => void; isNearest?: boolean; }) {
  return (
    <Pressable
      onPress={() => onPressCard(shop)}
      className="mx-4 my-2 rounded-2xl bg-white p-4"
      style={[{ borderColor: COLORS.border, borderWidth: 1 }, cardShadow]}
      accessibilityRole="button"
      accessibilityLabel={`Open actions for ${shop.name}`}
    >
      <View className="flex-row items-start gap-3">
        <View style={{ width: 56, height: 56, borderRadius: 999, overflow: "hidden", backgroundColor: "#F1F5F9" }}>
          {shop.avatar ? (
            <RNImage source={{ uri: shop.avatar }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
          ) : (
            <View className="h-full w-full items-center justify-center">
              <Ionicons name="storefront-outline" size={22} color="#475569" />
            </View>
          )}
        </View>

        <View className="flex-1">
          <View className="flex-row items-start justify-between">
            <Text className="text-[16px] text-slate-900 flex-1" numberOfLines={2}>{shop.name}</Text>
            <View className="ml-3 flex-row items-center gap-1 self-start">
              {isNearest && (
                <View className="rounded-full bg-emerald-50 px-2 py-[2px]" style={{ borderWidth: 1, borderColor: "#A7F3D0" }}>
                  <Text className="text-[10px] font-bold" style={{ color: COLORS.success }}>NEAREST</Text>
                </View>
              )}
              <View className="rounded-full bg-[#F1F5FF] px-2 py-[2px]">
                <Text className="text-[10px] font-semibold text-[#1E3A8A] capitalize">{shop.category}</Text>
              </View>
            </View>
          </View>
        </View>
      </View>

      <View style={{ height: 1, backgroundColor: "#E5E7EB", marginTop: 8, marginHorizontal: 8 }} />

      <View style={{ paddingTop: 8, paddingLeft: 68 }}>
        <Text className="text-[13px] text-slate-700" numberOfLines={2}>{shop.address1}</Text>
        <View className="mt-2 flex-row items-center gap-2">
          <Stars rating={shop.rating ?? 0} />
          <Text className="text-[12px] text-slate-500">{(shop.rating ?? 0).toFixed(1)}</Text>
          {typeof shop.distanceKm === "number" && (<><Text className="text-slate-300">•</Text><Text className="text-[12px] text-slate-500">{shop.distanceKm.toFixed(1)} km</Text></>)}
        </View>

        <View className="mt-3">
          <PrimaryButton label="Location" icon="navigate-outline" variant="primary" onPress={() => onLocation(shop)} />
        </View>
      </View>
    </Pressable>
  );
}

/* --------------------------------- Screen --------------------------------- */
export default function GasStationScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const [shops, setShops] = useState<Shop[]>([]);
  const [nearest, setNearest] = useState<Shop | null>(null);
  const [gotLocation, setGotLocation] = useState<"idle" | "ok" | "denied" | "error">("idle");

  const [sheetOpen, setSheetOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);

  const [searchOpen, setSearchOpen] = useState(false);

  // open maps (prefer DB maps_link if present)
  const openMaps = (s: Shop) => {
    if (s.maps_link) { Linking.openURL(s.maps_link).catch(() => {}); return; }
    if (s.lat && s.lng) {
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`).catch(() => {});
    } else if (s.address1) {
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address1)}`).catch(() => {});
    }
  };

  const openActions = useCallback((s: Shop) => { setSelectedShop(s); setSheetOpen(true); }, []);
  const closeActions = () => setSheetOpen(false);
  const openDetails = (s: Shop) => { setSelectedShop(s); setDetailsOpen(true); };
  const closeDetails = () => setDetailsOpen(false);

  // fetch gas stations (include profile_pic)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("places")
        .select("place_id, name, category, address, plus_code, latitude, longitude, maps_link, profile_pic")
        .eq("category", "gas_station")
        .order("name", { ascending: true });

      if (error) {
        console.warn("places fetch error:", error.message);
        if (!cancelled) setShops([]);
        return;
      }

      const mapped: Shop[] = (data ?? []).map((p: PlaceRow) => {
        const lat = p.latitude != null ? Number(p.latitude) : undefined;
        const lng = p.longitude != null ? Number(p.longitude) : undefined;
        return {
          id: p.place_id,
          name: p.name ?? "Unnamed Gas Station",
          category: "gas_station",
          address1: p.address ?? "",
          plusCode: p.plus_code ?? undefined,
          rating: 0,
          lat: Number.isFinite(lat) ? (lat as number) : undefined,
          lng: Number.isFinite(lng) ? (lng as number) : undefined,
          maps_link: p.maps_link ?? undefined,
          avatar: p.profile_pic ?? undefined, // 👈 map image
        };
      });

      if (!cancelled) setShops(mapped);
    })();
    return () => { cancelled = true; };
  }, []);

  // get user location → compute distances → choose nearest
  useEffect(() => {
    let cancelled = false;
    async function locateAndMeasure() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") { if (!cancelled) setGotLocation("denied"); return; }

        let pos = await Location.getLastKnownPositionAsync({ maxAge: 15000, requiredAccuracy: 100 });
        if (!pos) pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!pos || cancelled) return;

        const { latitude, longitude } = pos.coords;

        setShops((prev) => {
          const updated = prev.map((s) =>
            typeof s.lat === "number" && typeof s.lng === "number"
              ? { ...s, distanceKm: haversineKm(latitude, longitude, s.lat, s.lng) }
              : { ...s, distanceKm: undefined }
          );
          let n: Shop | null = null;
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
    if (shops.length) locateAndMeasure();
    return () => { cancelled = true; };
  }, [shops.length]);

  // text search + distance sort
  const data = useMemo(() => {
    const q = query.trim().toLowerCase();
    return shops
      .filter((s) => {
        const byText =
          !q ||
          s.name.toLowerCase().includes(q) ||
          s.address1.toLowerCase().includes(q) ||
          (s.plusCode ?? "").toLowerCase().includes(q);
        return byText;
      })
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
  }, [query, shops]);

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
                } catch { router.replace("/"); }
              }}
              hitSlop={10}
              className="h-9 w-9 items-center justify-center rounded-xl"
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={22} color={COLORS.text} />
            </Pressable>

            {!searchOpen ? (
              <Pressable onPress={() => setSearchOpen(true)} hitSlop={10} className="h-9 w-9 items-center justify-center rounded-xl" accessibilityLabel="Open search">
                <Ionicons name="search" size={20} color={COLORS.text} />
              </Pressable>
            ) : (
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View className="flex-row items-center rounded-2xl bg-white px-3 py-1" style={[{ borderColor: COLORS.border, borderWidth: 1, width: "100%", minWidth: 0 }, panelShadow]}>
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

          {!searchOpen && (
            <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 12, alignItems: "center" }}>
              <Text className="text-xl font-bold text-[#0F172A]">Gas Stations</Text>
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
              <Text className="text-[12px] font-semibold" style={{ color: COLORS.success }}>Nearest to you</Text>
              <Text className="text-[15px] font-medium text-slate-900" numberOfLines={1}>{nearest.name}</Text>
              {typeof nearest.distanceKm === "number" && <Text className="text-[12px] text-slate-600">{nearest.distanceKm.toFixed(1)} km away</Text>}
            </View>
            <PrimaryButton label="View" variant="primary" icon="navigate-outline" onPress={() => { setSelectedShop(nearest); setSheetOpen(true); }} />
          </View>
        </View>
      )}

      {(gotLocation === "denied" || gotLocation === "error") && (
        <View className="mx-4 mt-3 rounded-2xl bg-white p-3" style={[{ borderColor: COLORS.border, borderWidth: 1 }, panelShadow]}>
          <Text className="text-[12px] text-slate-600">We couldn’t access your location. Showing gas stations without distance.</Text>
        </View>
      )}

      {/* List */}
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingVertical: 10, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <ShopCard
            shop={item}
            onLocation={openMaps}
            onPressCard={(s) => { setSelectedShop(s); setSheetOpen(true); }}
            isNearest={nearest?.id === item.id}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 2 }} />}
        ListEmptyComponent={
          <View className="mt-16 items-center">
            <Ionicons name="search-outline" size={28} color={COLORS.muted} />
            <Text className="mt-2 text-slate-500">No gas stations found.</Text>
          </View>
        }
      />

      {/* Bottom sheet + Details */}
      <QuickActions visible={sheetOpen} onClose={closeActions} shop={selectedShop} onOpenMaps={openMaps} />
      <DetailsModal visible={detailsOpen} shop={selectedShop} onClose={closeDetails} onOpenMaps={openMaps} />
    </View>
  );
}
