// app/(driver)/reviews.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, FlatList, Image, Modal, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { supabase } from "../../utils/supabase";

type RatingRow = {
  rating_id: string;
  transaction_id: string;
  emergency_id: string;
  service_id: string;
  shop_id: string;
  driver_user_id: string;
  stars: number;
  tags: any[];
  comment: string | null;
  photo_urls: string[] | null;
  created_at: string;
  updated_at: string | null;
};
type ShopRow = { shop_id: string; shop_name?: string | null; business_name?: string | null; name?: string | null; place_id?: string | null };
type PlaceOwnerRow = { owner: string | null; name?: string | null; place_id?: string | null };
type PlaceRow = { place_id: string; name?: string | null };

const MONTHS_ABBR = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "Jun.", "Jul.", "Aug.", "Sep.", "Oct.", "Nov.", "Dec."];
const fmt = (iso: string) => { const d = new Date(iso); return `${MONTHS_ABBR[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`; };

function pickShopName(s?: ShopRow | null, p?: PlaceRow | null) {
  return (p?.name?.trim() || s?.shop_name?.trim() || s?.business_name?.trim() || s?.name?.trim() || "Mechanic/Shop");
}

export default function ReviewsList() {
  const router = useRouter();
  const [rows, setRows] = useState<RatingRow[]>([]);
  const [titleByShop, setTitleByShop] = useState<Map<string, string>>(new Map());
  const [imgViewer, setImgViewer] = useState<{ open: boolean; urls: string[] }>({ open: false, urls: [] });

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) return;

    const { data } = await supabase
      .from("ratings")
      .select("*")
      .eq("driver_user_id", uid)
      .order("created_at", { ascending: false })
      .returns<RatingRow[]>();
    setRows(data ?? []);

    const shopIds = Array.from(new Set((data ?? []).map(r => r.shop_id)));
    const nameMap = new Map<string, string>();

    if (shopIds.length) {
      const { data: pByOwner } = await supabase
        .from("places")
        .select("owner, name, place_id")
        .in("owner", shopIds)
        .returns<PlaceOwnerRow[]>();
      pByOwner?.forEach((p) => p?.owner && p?.name && nameMap.set(p.owner, p.name));

      const missing = shopIds.filter(id => !nameMap.has(id));
      if (missing.length) {
        const { data: shops } = await supabase
          .from("shop_details")
          .select("shop_id, shop_name, business_name, name, place_id")
          .in("shop_id", missing)
          .returns<ShopRow[]>();

        const placeIds = Array.from(new Set((shops ?? []).map(s => s.place_id).filter(Boolean) as string[]));
        const { data: places } = placeIds.length
          ? await supabase.from("places").select("place_id, name").in("place_id", placeIds).returns<PlaceRow[]>()
          : { data: [] as PlaceRow[] };

        const placeById = new Map((places ?? []).map(p => [p.place_id, p]));
        (shops ?? []).forEach((s) => {
          const disp = pickShopName(s, placeById.get(String(s.place_id)));
          nameMap.set(s.shop_id, disp);
        });
      }
    }
    setTitleByShop(nameMap);
  }, []);

  useEffect(() => { load(); }, [load]);

  const items = useMemo(() => {
    return (rows ?? []).map(r => ({
      ...r,
      shopTitle: titleByShop.get(r.shop_id) || "Mechanic/Shop",
    }));
  }, [rows, titleByShop]);

  const Stars = ({ n }: { n: number }) => (
    <View className="flex-row">
      {[1,2,3,4,5].map(i => <Ionicons key={i} name={i <= n ? "star" : "star-outline"} size={16} color={i <= n ? "#F59E0B" : "#CBD5E1"} />)}
    </View>
  );

  const Item = ({ r }: { r: (typeof items)[number] }) => (
    <View className="mx-4 mb-3 rounded-2xl border border-slate-200 bg-white p-4">
      <View className="flex-row items-center justify-between">
        <Text className="flex-1 pr-2 text-[15px] font-semibold text-slate-900" numberOfLines={1}>{r.shopTitle}</Text>
        <Stars n={r.stars} />
      </View>

      {r.comment ? <Text className="mt-1 text-[12px] text-slate-700">{r.comment}</Text> : null}

      {r.tags?.length ? (
        <View className="mt-1 flex-row flex-wrap gap-1">
          {r.tags.map((t: string, i: number) => (
            <View key={`${t}-${i}`} className="rounded-full bg-slate-100 px-2 py-0.5">
              <Text className="text-[10px] text-slate-700">{t}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {r.photo_urls?.length ? (
        <ScrollView
          className="mt-2"
          horizontal
          showsHorizontalScrollIndicator={false}
          onTouchEnd={() => setImgViewer({ open: true, urls: r.photo_urls! })}
        >
          {r.photo_urls.slice(0, 8).map((u) => (
            <Image key={u} source={{ uri: u }} className="mr-2 h-16 w-16 rounded-lg" />
          ))}
        </ScrollView>
      ) : null}

      <View className="mt-2 flex-row items-center justify-between">
        <Text className="text-[11px] text-slate-500">Reviewed on {fmt(r.created_at)}</Text>
        {r.photo_urls?.length ? (
          <View className="flex-row items-center rounded-full bg-slate-100 px-2 py-1">
            <Ionicons name="image-outline" size={12} color="#475569" />
            <Text className="ml-1 text-[11px] text-slate-700">{r.photo_urls.length} photo{r.photo_urls.length > 1 ? "s" : ""}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Header */}
      <View className="relative h-14 flex-row items-center border-b border-slate-200">
        <Pressable onPress={() => router.back()} hitSlop={12} className="absolute left-4">
          <Ionicons name="arrow-back" size={24} color="#0F172A" />
        </Pressable>
        <View className="absolute inset-0 items-center justify-center">
          <Text className="text-[16px] font-semibold text-slate-900">My Reviews</Text>
        </View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(r) => r.rating_id}
        renderItem={({ item }) => <Item r={item} />}
        ListEmptyComponent={<Text className="mt-10 text-center text-[12px] text-slate-500">No reviews yet.</Text>}
        contentContainerStyle={{ paddingVertical: 8 }}
      />

      {/* Fullscreen viewer */}
      <Modal visible={imgViewer.open} transparent animationType="fade" onRequestClose={() => setImgViewer({ open:false, urls:[] })}>
        <View className="flex-1 bg-black/85">
          <View className="flex-row items-center justify-between px-4 pt-10 pb-3">
            <Pressable onPress={() => setImgViewer({ open:false, urls:[] })} hitSlop={10}>
              <Ionicons name="close" size={26} color="#fff" />
            </Pressable>
            <Text className="text-white font-semibold">Review photos</Text>
            <View style={{ width: 26, height: 26 }} />
          </View>
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
            {(imgViewer.urls || []).map((u) => (
              <View key={u} style={{ width: "100%" as any }} className="items-center justify-center px-4">
                <Image source={{ uri: u }} resizeMode="contain" style={{ width: "100%", height: 520 }} />
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
