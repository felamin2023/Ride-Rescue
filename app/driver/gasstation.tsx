// app/(driver)/gasstation.tsx
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

const shadow = Platform.select({
  ios: {
    shadowColor: "#0F172A",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  android: { elevation: 2 },
});

/* ----------------------------- Types & Mock Data ---------------------------- */
type Shop = {
  id: string;
  name: string;
  category: "repair" | "vulcanize" | "gas" | "hospital";
  address1: string;
  address2?: string;
  plusCode?: string;
  avatar?: string;
  rating?: number;
  lat?: number;
  lng?: number;
  distanceKm?: number;
};

const MOCK: Shop[] = [
  {
    id: "g1",
    name: "Shell Argao",
    category: "gas",
    address1: "Natalio B. Bacalso S National Hwy, Argao, Cebu",
    address2: "VJR2+X8 Argao",
    plusCode: "VJR2+X8",
    rating: 4.4,
    lat: 9.8791,
    lng: 123.5967,
    avatar: "https://i.pravatar.cc/100?img=17",
    distanceKm: 0.9,
  },
  {
    id: "g2",
    name: "Petron San Miguel",
    category: "gas",
    address1: "San Miguel St, Argao, Cebu",
    address2: "VJM3+QP Argao",
    plusCode: "VJM3+QP",
    rating: 4.1,
    lat: 9.8818,
    lng: 123.6012,
    avatar: "https://i.pravatar.cc/100?img=44",
    distanceKm: 1.4,
  },
  {
    id: "g3",
    name: "Caltex Poblacion",
    category: "gas",
    address1: "Poblacion, Argao, Cebu",
    rating: 4.6,
    lat: 9.8755,
    lng: 123.5988,
    avatar: "https://i.pravatar.cc/100?img=23",
    distanceKm: 2.1,
  },
];

/* --------------------------------- Filters (reusable) -------------------------------- */
const FILTERS: FilterItem[] = [
  { key: "mdrrmo",   icon: "megaphone-outline", label: "MDRRMO" },
  { key: "hospital", icon: "medical-outline",   label: "Hospital" },
  { key: "police",   icon: "shield-outline",    label: "Police" },
  { key: "gas",      icon: "flash-outline",     label: "Gas" },
  { key: "repair",   icon: "construct-outline", label: "Repair" },
  { key: "fire",      icon: "flame-outline",        label: "Fire Station" },
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
        shadow,
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
  shop,
  onOpenMaps,
}: {
  visible: boolean;
  onClose: () => void;
  shop?: Shop | null;
  onOpenMaps: (s: Shop) => void;
}) {
  const insets = useSafeAreaInsets();
  if (!shop) return null;

  return (
    <Modal transparent statusBarTranslucent animationType="fade" visible={visible} onRequestClose={onClose}>
      {/* Dark overlay */}
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
            shadow,
          ]}
        >
          <View className="items-center mb-3">
            <View style={{ width: 44, height: 5, borderRadius: 999, backgroundColor: "#E2E8F0" }} />
          </View>

          <View className="flex-row items-center gap-3 pb-3">
            <View className="overflow-hidden rounded-xl" style={{ width: 44, height: 44, backgroundColor: "#F1F5F9" }}>
              {shop.avatar ? (
                <RNImage source={{ uri: shop.avatar }} style={{ width: "100%", height: "100%" }} />
              ) : (
                <View className="h-full w-full items-center justify-center">
                  <Ionicons name="storefront-outline" size={20} color="#475569" />
                </View>
              )}
            </View>
            <View className="flex-1">
              <Text className="text-[15px] font-bold text-slate-900" numberOfLines={1}>
                {shop.name}
              </Text>
              <Text className="text-[12px] text-slate-500" numberOfLines={1}>
                {shop.address1}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} className="h-9 w-9 items-center justify-center rounded-xl" accessibilityLabel="Close">
              <Ionicons name="close" size={20} color={COLORS.text} />
            </Pressable>
          </View>

          <View className="h-[1px] bg-slate-200" />

          {/* Actions */}
          <View className="mt-3 gap-3">
            <PrimaryButton
              label="Open in Google Maps"
              icon="navigate-outline"
              onPress={() => {
                onOpenMaps(shop);
                onClose();
              }}
            />
            <PrimaryButton
              label={shop.plusCode ? `Copy Plus Code (${shop.plusCode})` : "Copy Address"}
              variant="secondary"
              icon="copy-outline"
              onPress={() => {
                const text = shop.plusCode || shop.address1 || shop.name;
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
  shop,
  onClose,
  onOpenMaps,
}: {
  visible: boolean;
  shop: Shop | null;
  onClose: () => void;
  onOpenMaps: (s: Shop) => void;
}) {
  if (!shop) return null;
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable
        className="flex-1"
        style={{ backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 16 }}
        onPress={onClose}
      >
        <Pressable onPress={() => {}}>
          <View className="rounded-2xl bg-white p-4" style={[{ borderWidth: 1, borderColor: COLORS.border }, shadow]}>
            <View className="flex-row items-center gap-3">
              <View className="overflow-hidden rounded-xl" style={{ width: 56, height: 56, backgroundColor: "#F1F5F9" }}>
                {shop.avatar ? (
                  <RNImage source={{ uri: shop.avatar }} style={{ width: "100%", height: "100%" }} />
                ) : (
                  <View className="h-full w-full items-center justify-center">
                    <Ionicons name="storefront-outline" size={22} color="#475569" />
                  </View>
                )}
              </View>
              <View className="flex-1">
                <Text className="text-[18px] font-extrabold text-slate-900" numberOfLines={2}>
                  {shop.name}
                </Text>
                <View className="mt-1 flex-row items-center gap-2">
                  <View className="rounded-full bg-[#F1F5FF] px-2 py-[2px]">
                    <Text className="text-[11px] font-semibold text-[#1E3A8A] capitalize">
                      {shop.category}
                    </Text>
                  </View>
                  <Text className="text-slate-300">•</Text>
                  <Stars rating={shop.rating ?? 0} />
                  <Text className="text-[12px] text-slate-500">{(shop.rating ?? 0).toFixed(1)}</Text>
                  {typeof shop.distanceKm === "number" && (
                    <>
                      <Text className="text-slate-300">•</Text>
                      <Text className="text-[12px] text-slate-500">{shop.distanceKm.toFixed(1)} km away</Text>
                    </>
                  )}
                </View>
              </View>
            </View>

            <View className="mt-3 h-[1px] bg-slate-200" />

            <View className="mt-3 gap-1">
              <Text className="text-[13px] text-slate-700">{shop.address1}</Text>
              {shop.address2 ? <Text className="text-[12px] text-slate-500">{shop.address2}</Text> : null}
              {shop.plusCode ? (
                <View className="flex-row items-center gap-2">
                  <Ionicons name="locate-outline" size={14} color={COLORS.sub} />
                  <Text className="text-[12px] text-slate-600">Plus Code: {shop.plusCode}</Text>
                </View>
              ) : null}
              {shop.lat && shop.lng ? (
                <View className="flex-row items-center gap-2">
                  <Ionicons name="pin-outline" size={14} color={COLORS.sub} />
                  <Text className="text-[12px] text-slate-600">
                    ({shop.lat.toFixed(5)}, {shop.lng.toFixed(5)})
                  </Text>
                </View>
              ) : null}
            </View>

            <View className="mt-4">
              <PrimaryButton label="Open in Maps" icon="navigate-outline" onPress={() => onOpenMaps(shop)} />
            </View>

            <View className="mt-3">
              <PrimaryButton
                label={shop.plusCode ? `Copy Plus Code (${shop.plusCode})` : "Copy Address"}
                icon="copy-outline"
                variant="secondary"
                onPress={() => {
                  const text = shop.plusCode || shop.address1 || shop.name;
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
function ShopCard({
  shop,
  onLocation,
  onPressCard,
}: {
  shop: Shop;
  onLocation: (s: Shop) => void;
  onPressCard: (s: Shop) => void;
}) {
  return (
    <Pressable
      onPress={() => onPressCard(shop)}
      className="mx-4 my-2 rounded-2xl bg-white p-4"
      style={[{ borderColor: COLORS.border, borderWidth: 1 }, shadow]}
    >
      <View className="flex-row items-start gap-3">
        <View className="overflow-hidden rounded-xl" style={{ width: 64, height: 64, backgroundColor: "#F1F5F9" }}>
          {shop.avatar ? (
            <RNImage source={{ uri: shop.avatar }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
          ) : (
            <View className="h-full w-full items-center justify-center">
              <Ionicons name="storefront-outline" size={22} color="#475569" />
            </View>
          )}
        </View>

        <View className="flex-1">
          <View className="flex-row items-center justify-between">
            <Text className="text-[16px] font-extrabold text-slate-900 flex-1" numberOfLines={2}>
              {shop.name}
            </Text>
            <View className="ml-3 rounded-full bg-[#F1F5FF] px-2 py-1">
              <Text className="text-[11px] font-semibold text-[#1E3A8A] capitalize">{shop.category}</Text>
            </View>
          </View>

          <View className="mt-1 flex-row items-center gap-2">
            <Stars rating={shop.rating ?? 0} />
            <Text className="text-[12px] text-slate-500">{(shop.rating ?? 0).toFixed(1)}</Text>
            {typeof shop.distanceKm === "number" && (
              <>
                <Text className="text-slate-300">•</Text>
                <Text className="text-[12px] text-slate-500">{shop.distanceKm.toFixed(1)} km</Text>
              </>
            )}
          </View>

          <Text className="mt-2 text-[13px] text-slate-700" numberOfLines={2}>
            {shop.address1}
          </Text>
          {shop.address2 ? (
            <Text className="text-[12px] text-slate-500" numberOfLines={1}>
              {shop.address2}
            </Text>
          ) : null}

          <View className="mt-3 flex-row items-center justify-end gap-2">
            <View className="flex-1" />
            <View className="flex-1">
              <PrimaryButton label="Open Location" icon="navigate-outline" variant="primary" onPress={() => onLocation(shop)} />
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/* --------------------------------- Screen --------------------------------- */
export default function GasStationScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<string[]>(["gas"]); // ← string[] works with FilterChips
  const [sheetOpen, setSheetOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);

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

  const openMaps = (s: Shop) => {
    if (s.lat && s.lng) {
      const url = `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`;
      Linking.openURL(url).catch(() => {});
    } else if (s.address1) {
      const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address1)}`;
      Linking.openURL(url).catch(() => {});
    }
  };

  const openActions = (s: Shop) => {
    setSelectedShop(s);
    setSheetOpen(true);
  };
  const closeActions = () => setSheetOpen(false);
  const openDetails = (s: Shop) => {
    setSelectedShop(s);
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
          <Text className="text-2xl font-extrabold text-slate-900">Gas Stations</Text>
          <View style={{ width: 36 }} />
        </View>
      </SafeAreaView>

      {/* Search */}
      <View className="px-4">
        <View className="flex-row items-center rounded-2xl bg-white px-3" style={[{ borderColor: COLORS.border, borderWidth: 1 }, shadow]}>
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
        accessibilityLabel="Service filters"
      />

      {/* List */}
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingVertical: 10, paddingBottom: 24 }}
        renderItem={({ item }) => (
          <ShopCard
            shop={item}
            onLocation={openMaps}
            onPressCard={(s) => openActions(s)}
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

      {/* Bottom Sheet */}
      <QuickActions visible={sheetOpen} onClose={closeActions} shop={selectedShop} onOpenMaps={openMaps} />

      {/* Details Modal */}
      <DetailsModal visible={detailsOpen} shop={selectedShop} onClose={closeDetails} onOpenMaps={openMaps} />
    </View>
  );
}
