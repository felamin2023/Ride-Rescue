// app/driver/reviews.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  Platform,
  Modal,
  Image,
  ScrollView,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { supabase } from "../../utils/supabase";

/* ------------------------------ Design tokens ------------------------------ */
const COLORS = {
  bg: "#F7F8FA",
  card: "#FFFFFF",
  border: "#E5E7EB",
  text: "#0F172A",
  sub: "#475569",
  muted: "#94A3B8",
  primary: "#2563EB",
  success: "#16A34A",
};
const cardShadow = Platform.select({
  ios: { shadowColor: "#0F172A", shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  android: { elevation: 2 },
});

/* ---------------------------------- Types --------------------------------- */
type RatingRow = {
  id: string;               // <- PRIMARY KEY in your table
  transaction_id: string;
  emergency_id: string;
  shop_id: string;
  driver_user_id: string;
  stars: number;
  comment: string | null;
  photo_url: string | null; // <- single photo column
  created_at: string;
  updated_at: string | null;
};

type ShopRow   = { shop_id: string; shop_name?: string | null; business_name?: string | null; name?: string | null; place_id?: string | null };
type PlaceRow  = { place_id: string; name?: string | null; owner?: string | null };
type AppUserRow = { user_id: string; full_name?: string | null };

type ReviewItem = {
  id: string;                // rating id
  shop_id: string;
  shopName: string;
  stars: number;
  dateISO: string;
  comment?: string | null;
  photos: string[];          // normalized to array for the viewer
};

/* --------------------------------- Utils ---------------------------------- */
const MONTHS_ABBR = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "Jun.", "Jul.", "Aug.", "Sep.", "Oct.", "Nov.", "Dec."];
function formatDate(iso: string) {
  const d = new Date(iso);
  return `${MONTHS_ABBR[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
const pickShopName = (s?: ShopRow | null, u?: AppUserRow | null, p?: PlaceRow | null) =>
  s?.shop_name?.trim() ||
  s?.business_name?.trim() ||
  p?.name?.trim() ||
  u?.full_name?.trim() ||
  s?.name?.trim() ||
  "Mechanic/Shop";

// normalize a storage path to a public URL (no-op if already a URL)
const toPublicUrl = (path: string): string => {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  const { data } = supabase.storage.from("review-attachments").getPublicUrl(path);
  return data.publicUrl || path;
};

/* ================================ Page ==================================== */
export default function Reviews() {
  const router = useRouter();

  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // full-screen photo viewer
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerPhotos, setViewerPhotos] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);

  const openViewer = (photos: string[], idx: number) => {
    setViewerPhotos(photos);
    setViewerIndex(idx);
    setViewerOpen(true);
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);

      // 1) who am i
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id;
      if (!userId) throw new Error("Please sign in.");

      // 2) fetch MY ratings (one row per transaction per driver)
      const { data: rows, error } = await supabase
        .from("ratings")
        .select(
          [
            "id",
            "transaction_id",
            "emergency_id",
            "shop_id",
            "driver_user_id",
            "stars",
            "comment",
            "photo_url",
            "created_at",
            "updated_at",
          ].join(",")
        )
        .eq("driver_user_id", userId)
        .order("created_at", { ascending: false })
        .returns<RatingRow[]>();
      if (error) throw error;

      const list = rows ?? [];
      if (!list.length) {
        setItems([]);
        return;
      }

      // 3) resolve shop display names
      const shopIds = Array.from(new Set(list.map((r) => r.shop_id)));

      // places by place_id (when shop_id IS a place_id)
      const { data: placeById } = await supabase
        .from("places")
        .select("place_id, name")
        .in("place_id", shopIds)
        .returns<PlaceRow[]>();
      const placeDirectById = new Map<string, PlaceRow>();
      (placeById ?? []).forEach((p) => placeDirectById.set(p.place_id, p));

      // places by owner (when shop_id is a user id who owns a place)
      const { data: placeByOwner } = await supabase
        .from("places")
        .select("owner, place_id, name")
        .in("owner", shopIds)
        .returns<PlaceRow[]>();
      const placeByOwnerMap = new Map<string, PlaceRow>();
      (placeByOwner ?? []).forEach((p) => p.owner && placeByOwnerMap.set(p.owner, p));

      // shop_details
      const { data: shops } = await supabase
        .from("shop_details")
        .select("shop_id, shop_name, business_name, name, place_id")
        .in("shop_id", shopIds)
        .returns<ShopRow[]>();
      const shopById = new Map<string, ShopRow>();
      (shops ?? []).forEach((s) => shopById.set(s.shop_id, s));

      // place names for those shops
      const placeIds = Array.from(new Set((shops ?? []).map((s) => s.place_id).filter(Boolean) as string[]));
      const { data: placesForShops } = placeIds.length
        ? await supabase.from("places").select("place_id, name").in("place_id", placeIds).returns<PlaceRow[]>()
        : { data: [] as PlaceRow[] };
      const placeByShopPlaceId = new Map<string, PlaceRow>();
      (placesForShops ?? []).forEach((p) => placeByShopPlaceId.set(p.place_id, p));

      // app_user (when shop_id is a user id)
      const { data: users } = await supabase
        .from("app_user")
        .select("user_id, full_name")
        .in("user_id", shopIds)
        .returns<AppUserRow[]>();
      const userById = new Map<string, AppUserRow>();
      (users ?? []).forEach((u) => userById.set(u.user_id, u));

      // 4) map to view model (normalize single photo_url -> array)
      const mapped: ReviewItem[] = list.map((r) => {
        let title = "Mechanic/Shop";

        // try owner place (if shop_id is a user id that owns a place)
        const ownerPlace = placeByOwnerMap.get(r.shop_id);
        if (ownerPlace?.name?.trim()) {
          title = ownerPlace.name.trim();
        } else {
          // try direct place id
          const directPlace = placeDirectById.get(r.shop_id);
          if (directPlace?.name?.trim()) {
            title = directPlace.name.trim();
          } else {
            // try shop_details + its place
            const srow = shopById.get(r.shop_id);
            const prow = srow?.place_id ? placeByShopPlaceId.get(srow.place_id) : undefined;
            const urow = userById.get(r.shop_id);
            title = pickShopName(srow, urow, prow);
          }
        }

        const photos = r.photo_url ? [toPublicUrl(r.photo_url)] : [];

        return {
          id: r.id,
          shop_id: r.shop_id,
          shopName: title,
          stars: r.stars,
          dateISO: r.created_at,
          comment: r.comment,
          photos,
        };
      });

      setItems(mapped);
    } catch (e: any) {
      console.warn("reviews load error:", e?.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const empty = useMemo(
    () => (
      <View className="px-6 pt-16 items-center">
        <View className="h-14 w-14 items-center justify-center rounded-full bg-slate-100">
          <Ionicons name="star-outline" size={22} color="#64748B" />
        </View>
        <Text className="mt-3 text-[15px] font-semibold text-slate-800">No reviews yet</Text>
        <Text className="mt-1 text-center text-[12px] text-slate-500">
          When you rate a shop, it will appear here with your comments and photos.
        </Text>
      </View>
    ),
    []
  );

  /* ------------------------------ UI bits ---------------------------------- */
  const Stars = ({ value }: { value: number }) => (
    <View className="flex-row">
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons key={i} name={i <= value ? "star" : "star-outline"} size={16} color={COLORS.primary} />
      ))}
    </View>
  );

  const PhotoStrip = ({ photos }: { photos: string[] }) => {
    if (!photos?.length) return null;
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2">
        <View className="flex-row">
          {photos.map((uri, idx) => (
            <Pressable key={`${uri}-${idx}`} onPress={() => openViewer(photos, idx)} className="mr-2 active:opacity-90">
              <Image source={{ uri }} style={{ width: 88, height: 88, borderRadius: 10, backgroundColor: "#E2E8F0" }} />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    );
  };

  const ItemCard = ({ it }: { it: ReviewItem }) => (
    <View className="mx-4 mb-3 rounded-2xl bg-white p-4" style={cardShadow as any}>
      {/* Header row */}
      <View className="flex-row items-center justify-between">
        <Text className="flex-1 pr-2 text-[15px] font-semibold text-slate-900" numberOfLines={2}>
          {it.shopName}
        </Text>
        <Stars value={it.stars} />
      </View>

      <View className="mt-1 flex-row items-center">
        <Ionicons name="calendar-outline" size={14} color={COLORS.sub} />
        <Text className="ml-1.5 text-[12px] text-slate-600">Reviewed {formatDate(it.dateISO)}</Text>
      </View>

      {/* Comment */}
      {it.comment ? (
        <View className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <Text className="text-[13px] text-slate-800">{it.comment}</Text>
        </View>
      ) : null}

      {/* Photos */}
      <PhotoStrip photos={it.photos} />
    </View>
  );

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: COLORS.bg }}>
      {/* Header */}
      <View className="relative h-14 flex-row items-center border-b border-slate-200 bg-white">
        <Pressable onPress={() => router.back()} hitSlop={12} className="absolute left-4">
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </Pressable>
        <View className="absolute inset-0 items-center justify-center">
          <Text className="text-lg font-semibold text-slate-900">My Reviews</Text>
        </View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        renderItem={({ item }) => <ItemCard it={item} />}
        ListEmptyComponent={!loading ? empty : null}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingVertical: 10, paddingBottom: 16 }}
      />

      {/* Full-screen photo viewer */}
      <Modal visible={viewerOpen} animationType="fade" transparent onRequestClose={() => setViewerOpen(false)}>
        <View className="flex-1 bg-black/90">
          <View className="flex-row items-center justify-between px-4 pt-10 pb-3">
            <Pressable onPress={() => setViewerOpen(false)} hitSlop={10}>
              <Ionicons name="close" size={26} color="#fff" />
            </Pressable>
            <Text className="text-white text-[13px]">
              {viewerPhotos.length ? `${viewerIndex + 1} / ${viewerPhotos.length}` : ""}
            </Text>
            <View style={{ width: 26, height: 26 }} />
          </View>

          <ScrollView
            horizontal
            pagingEnabled
            onMomentumScrollEnd={(e) => {
              const w = e.nativeEvent.layoutMeasurement.width;
              const x = e.nativeEvent.contentOffset.x;
              const idx = Math.round(x / (w || 1));
              setViewerIndex(idx);
            }}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ alignItems: "center" }}
          >
            {viewerPhotos.map((uri, i) => (
              <View key={`${uri}-${i}`} style={{ width: "100%", alignItems: "center" }}>
                <Image source={{ uri }} resizeMode="contain" style={{ width: "100%", height: 520 }} />
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
