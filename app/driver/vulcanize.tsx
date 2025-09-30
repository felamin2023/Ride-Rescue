// app/(driver)/vulcanize.tsx
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

const cardShadow = Platform.select({
  ios: {
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  android: { elevation: 3 },
});

const panelShadow = Platform.select({
  ios: {
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  android: { elevation: 2 },
});

const buttonShadow = Platform.select({
  ios: {
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  android: { elevation: 1 },
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
    id: "1",
    name: "Tewe Vulcanizing Shop",
    category: "vulcanize",
    address1: "Natalio B. Bacalso S National Hwy, Argao, Cebu",
    rating: 0,
    lat: 9.8777,
    lng: 123.5958,
    avatar: "https://i.pravatar.cc/100?img=12",
    distanceKm: 0.8,
  },
  {
    id: "2",
    name: "IEM Argao Tire Shop & Vulcanizing",
    category: "vulcanize",
    address1: "San Miguel St, Argao, Cebu",
    rating: 0,
    lat: 9.881,
    lng: 123.601,
    avatar: "https://i.pravatar.cc/100?img=32",
    distanceKm: 1.2,
  },
  {
    id: "3",
    name: "QuickPatch Tire",
    category: "vulcanize",
    address1: "Natalio B. Bacalso Hwy, Argao, Cebu",
    rating: 4.5,
    lat: 9.874,
    lng: 123.599,
    avatar: "https://i.pravatar.cc/100?img=47",
    distanceKm: 2.3,
  },
];

/* --------------------------------- Small UI -------------------------------- */
const FILTERS: FilterItem[] = [
  { key: "vulcanize",icon: "trail-sign-outline",label: "Vulcanize" },
  { key: "repair",   icon: "construct-outline", label: "Repair" },
  { key: "gas",      icon: "flash-outline",     label: "Gas" },
  { key: "hospital", icon: "medical-outline",   label: "Hospital" },
  { key: "police",   icon: "shield-outline",    label: "Police" },
  { key: "fire",     icon: "flame-outline",     label: "Fire Station" },
  { key: "mdrrmo",   icon: "megaphone-outline", label: "MDRRMO" },
];

function Stars({ rating = 0 }: { rating?: number }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return (
    <View className="flex-row items-center">
      {Array.from({ length: 5 }).map((_, i) => {
        const name =
          i < full ? "star" : i === full && half ? "star-half" : "star-outline";
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

/* ----------------------- Bottom Sheet (flush to bottom) ---------------------- */
function QuickActions({
  visible,
  onClose,
  shop,
  onOpenMaps,
  onMessage,
}: {
  visible: boolean;
  onClose: () => void;
  shop?: Shop | null;
  onOpenMaps: (s: Shop) => void;
  onMessage: (s: Shop) => void;
}) {
  const insets = useSafeAreaInsets();
  if (!shop) return null;

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
            <View
              style={{
                width: 44,
                height: 5,
                borderRadius: 999,
                backgroundColor: "#E2E8F0",
              }}
            />
          </View>

          <View className="flex-row items-center gap-3 pb-3">
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 999,
                overflow: "hidden",
                backgroundColor: "#F1F5F9",
              }}
            >
              {shop.avatar ? (
                <RNImage
                  source={{ uri: shop.avatar }}
                  style={{ width: "100%", height: "100%" }}
                />
              ) : (
                <View className="h-full w-full items-center justify-center">
                  <Ionicons name="storefront-outline" size={20} color="#475569" />
                </View>
              )}
            </View>
            <View className="flex-1">
              <Text className="text-[15px] font-medium text-slate-900" numberOfLines={1}>
                {shop.name}
              </Text>
              <Text className="text-[12px] text-slate-500" numberOfLines={1}>
                {shop.address1}
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
                onOpenMaps(shop!);
                onClose();
              }}
            />
            <PrimaryButton
              label="Message Shop"
              variant="secondary"
              icon="chatbubble-ellipses-outline"
              onPress={() => {
                onMessage(shop!);
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

        {/* pad safe-area bottom */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: insets.bottom,
            backgroundColor: "#FFFFFF",
          }}
        />
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
  onMessage,
}: {
  visible: boolean;
  shop: Shop | null;
  onClose: () => void;
  onOpenMaps: (s: Shop) => void;
  onMessage: (s: Shop) => void;
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
          <View className="rounded-2xl bg-white p-4" style={[{ borderWidth: 1, borderColor: COLORS.border }, panelShadow]}>
            {/* Header */}
            <View className="flex-row items-start gap-3">
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 999,
                  overflow: "hidden",
                  backgroundColor: "#F1F5F9",
                }}
              >
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
                  <Text className="text-[18px] text-slate-900" numberOfLines={2}>
                    {shop.name}
                  </Text>
                  <View className="ml-3 rounded-full bg-[#F1F5FF] px-2 py-[2px] self-start">
                    <Text className="text-[10px] font-bold text-[#1E3A8A] capitalize">{shop.category}</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Address FIRST */}
            <View className="mt-3 gap-1">
              <Text className="text-[13px] text-slate-700">{shop.address1}</Text>
              {shop.address2 ? <Text className="text-[12px] text-slate-500">{shop.address2}</Text> : null}
            </View>

            {/* Divider */}
            <View style={{ height: 1, backgroundColor: "#E5E7EB", marginTop: 12, marginHorizontal: 8 }} />

            {/* Ratings / distance */}
            <View className="mt-2 flex-row items-center gap-2">
              <Stars rating={shop.rating ?? 0} />
              <Text className="text-[12px] text-slate-500">{(shop.rating ?? 0).toFixed(1)}</Text>
              {typeof shop.distanceKm === "number" && (
                <>
                  <Text className="text-slate-300">•</Text>
                  <Text className="text-[12px] text-slate-500">{shop.distanceKm.toFixed(1)} km away</Text>
                </>
              )}
            </View>

            {/* Actions */}
            <View className="mt-4 flex-row items-center gap-2">
              <View className="flex-1">
                <PrimaryButton label="Message" icon="chatbubble-ellipses-outline" variant="secondary" onPress={() => onMessage(shop)} />
              </View>
              <View style={{ width: 10 }} />
              <View className="flex-1">
                <PrimaryButton label="Location" icon="navigate-outline" onPress={() => onOpenMaps(shop)} />
              </View>
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
  onMessage,
  onPressCard,
}: {
  shop: Shop;
  onLocation: (s: Shop) => void;
  onMessage: (s: Shop) => void;
  onPressCard: (s: Shop) => void;
}) {
  return (
    <Pressable
      onPress={() => onPressCard(shop)}
      className="mx-4 my-2 rounded-2xl bg-white p-4"
      style={[{ borderColor: COLORS.border, borderWidth: 1 }, cardShadow]}
      accessibilityRole="button"
      accessibilityLabel={`Open actions for ${shop.name}`}
    >
      {/* Header row with avatar + title/badge */}
      <View className="flex-row items-start gap-3">
        {/* Circular image */}
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
          {/* Title row: name not bold; badge slightly higher */}
          <View className="flex-row items-start justify-between">
            <Text className="text-[16px] text-slate-900 flex-1" numberOfLines={2}>
              {shop.name}
            </Text>
            <View className="ml-3 rounded-full bg-[#F1F5FF] px-2 py-[2px] self-start">
              <Text className="text-[10px] font-semibold text-[#1E3A8A] capitalize">{shop.category}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Divider under header image/name to split content visually */}
      <View style={{ height: 1, backgroundColor: "#E5E7EB", marginTop: 8, marginHorizontal: 8 }} />

      {/* Body aligned with text column */}
      <View style={{ paddingTop: 8, paddingLeft: 68 }}>
        {/* Address */}
        <Text className="text-[13px] text-slate-700" numberOfLines={2}>
          {shop.address1}
        </Text>
        {shop.address2 ? (
          <Text className="text-[12px] text-slate-500" numberOfLines={1}>
            {shop.address2}
          </Text>
        ) : null}

        {/* Ratings / distance */}
        <View className="mt-2 flex-row items-center gap-2">
          <Stars rating={shop.rating ?? 0} />
          <Text className="text-[12px] text-slate-500">{(shop.rating ?? 0).toFixed(1)}</Text>
          {typeof shop.distanceKm === "number" && (
            <>
              <Text className="text-slate-300">•</Text>
              <Text className="text-[12px] text-slate-500">{shop.distanceKm.toFixed(1)} km</Text>
            </>
          )}
        </View>

        {/* Actions (Message left, Location right) */}
        <View className="mt-3 flex-row items-center gap-2">
          <View className="flex-1">
            <PrimaryButton
              label="Message"
              icon="chatbubble-ellipses-outline"
              variant="secondary"
              onPress={() => onMessage(shop)}
            />
          </View>
          <View style={{ width: 12 }} />
          <View className="flex-1">
            <PrimaryButton label="Location" icon="navigate-outline" variant="primary" onPress={() => onLocation(shop)} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/* --------------------------------- Screen --------------------------------- */
export default function VulcanizeScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<string[]>(["vulcanize"]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);

  // Inline header search toggle
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

  const openMaps = (s: Shop) => {
    if (s.lat && s.lng) {
      const url = `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`;
      Linking.openURL(url).catch(() => {});
    } else if (s.address1) {
      const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address1)}`;
      Linking.openURL(url).catch(() => {});
    }
  };

  const goChat = (s: Shop) => {
    // router.push(`/chat/${s.id}`)
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
                    <Pressable onPress={() => setQuery("")} hitSlop={8} accessibilityLabel="Clear search">
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
              <Text className="text-xl font-bold text-[#0F172A]">Vulcanizing Shops</Text>
              
            </View>
            
          )}
        </View>

        {/* Full-width divider below the header/title */}
        <View style={{ height: 1, backgroundColor: COLORS.border }} />
      </SafeAreaView>

      {/* Filter chips */}
      <FilterChips
        items={FILTERS}
        selected={filters}
        onToggle={toggleFilter}
        containerStyle={{ paddingHorizontal: 16, marginTop: 10 }}
        gap={8}
        horizontal
        accessibilityLabel="Service filters"
      />

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
            onMessage={goChat}
            onPressCard={openActions} // tap card => quick actions (bottom sheet)
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 2 }} />}
        ListEmptyComponent={
          <View className="mt-16 items-center">
            <Ionicons name="search-outline" size={28} color={COLORS.muted} />
            <Text className="mt-2 text-slate-500">No shops match your filters.</Text>
          </View>
        }
      />

      {/* Bottom sheet */}
      <QuickActions
        visible={sheetOpen}
        onClose={closeActions}
        shop={selectedShop}
        onOpenMaps={openMaps}
        onMessage={goChat}
      />

      {/* Details modal (kept if you want to use it somewhere else) */}
      <DetailsModal
        visible={detailsOpen}
        shop={selectedShop}
        onClose={closeDetails}
        onOpenMaps={openMaps}
        onMessage={goChat}
      />
    </View>
  );
}
