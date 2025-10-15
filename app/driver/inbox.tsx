import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, FlatList, Pressable, RefreshControl } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { supabase } from "../../utils/supabase";

/** DB row shape */
type NotifType =
  | "emergency_posted"
  | "emergency_nearby"
  | "service_request_accepted"
  | "service_request_rejected"
  | "system";

type NotifRow = {
  id: string;
  from_user_id: string | null;
  to_user_id: string;
  type: NotifType;
  title: string;
  body: string;
  data: any;
  read_at: string | null;
  created_at: string;
};

const ICON_BY_TYPE: Record<NotifType, keyof typeof Ionicons.glyphMap> = {
  emergency_posted: "megaphone-outline",
  emergency_nearby: "alert-circle-outline",
  service_request_accepted: "checkmark-done-outline",
  service_request_rejected: "close-circle-outline",
  system: "notifications-outline",
};

function timeAgo(iso: string) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  const units: [number, string][] = [
    [60, "s"],
    [60, "m"],
    [24, "h"],
    [7, "d"],
    [4.345, "w"],
    [12, "mo"],
    [Number.MAX_SAFE_INTEGER, "y"],
  ];
  let val = s;
  let unit = "s";
  for (const [step, label] of units) {
    if (val < step) { unit = label; break; }
    val = Math.floor(val / step);
    unit = label;
  }
  return `${val}${unit} ago`;
}

export default function DriverInbox() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<NotifRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const me = auth?.user?.id;
      if (!me) return;

      const { data, error } = await supabase
        .from("notifications")
        .select("id, from_user_id, to_user_id, type, title, body, data, read_at, created_at")
        .eq("to_user_id", me)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      setRows((data ?? []) as NotifRow[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime: push new notifications instantly
  useEffect(() => {
    let sub: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const me = auth?.user?.id;
      if (!me) return;

      sub = supabase
        .channel(`notifications:me:${me}`)
        .on("postgres_changes", {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `to_user_id=eq.${me}`,
        }, (payload) => {
          const row = payload.new as NotifRow;
          setRows(prev => [row, ...prev]);
        })
        .subscribe();
    })();

    return () => {
      if (sub) supabase.removeChannel(sub);
    };
  }, []);

  const unreadCount = useMemo(() => rows.filter(r => !r.read_at).length, [rows]);

  const markAllRead = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const me = auth?.user?.id;
    if (!me) return;
    const now = new Date().toISOString();
    await supabase.from("notifications").update({ read_at: now }).is("read_at", null).eq("to_user_id", me);
    setRows(prev => prev.map(r => r.read_at ? r : { ...r, read_at: now }));
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const open = useCallback(async (n: NotifRow) => {
    // mark read
    if (!n.read_at) {
      await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
      setRows(prev => prev.map(r => (r.id === n.id ? { ...r, read_at: new Date().toISOString() } : r)));
    }

    // Navigate based on the notification's intent
    // 1) Shop accepted & offered → driver views request status (where offers are shown)
    if (n.type === "service_request_accepted") {
      router.push("/driver/requeststatus");
      return;
    }

    // 2) Confirmation that your emergency was posted
    if (n.type === "emergency_posted") {
      router.push("/driver/requeststatus");
      return;
    }

    // 3) System events we created earlier (e.g., rating saved, payment proof status)
    // If rating posted by *you*, you might want to view your reviews page
    if (n.type === "system" && n?.data?.event === "rating_posted") {
      router.push("/driver/reviews");
      return;
    }

    // fallback: stay here or open request status
    router.push("/driver/requeststatus");
  }, [router]);

  const Header = () => (
    <View style={{ paddingTop: insets.top }} className="bg-blue-600">
      <View className="flex-row items-center justify-between px-4 pt-3 pb-3">
        <Pressable onPress={() => router.back()} className="p-2 rounded-lg active:opacity-80" android_ripple={{ color: "rgba(255,255,255,0.18)", borderless: true }}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </Pressable>
        <Text className="text-[18px] font-extrabold text-white">Inbox</Text>
        <Pressable onPress={markAllRead} className="p-2 rounded-lg active:opacity-80" android_ripple={{ color: "rgba(255,255,255,0.18)", borderless: true }}>
          <Ionicons name={unreadCount ? "mail-unread-outline" : "mail-outline"} size={22} color="#fff" />
        </Pressable>
      </View>
    </View>
  );

  const Item = ({ item }: { item: NotifRow }) => {
    const icon = ICON_BY_TYPE[item.type] || "notifications-outline";
    const isUnread = !item.read_at;
    // If you want a custom sentence, you can derive it here from item.type + data:
    let title = item.title;
    let body = item.body;

    // Suggested phrasing:
    if (item.type === "emergency_posted") {
      title ||= "Emergency posted";
      body ||= "Your emergency request has been posted and nearby shops have been notified.";
    } else if (item.type === "service_request_accepted") {
      // When a shop accepts & offers
      const shopName = item?.data?.shop_name || "";
      title ||= "Offer received";
      body ||= shopName
        ? `${shopName} accepted your request and made an offer. Tap to view details.`
        : "A shop accepted your request and made an offer. Tap to view details.";
    }

    return (
      <Pressable
        onPress={() => open(item)}
        className={`mx-4 mb-3 rounded-2xl border p-4 ${isUnread ? "bg-white border-blue-200" : "bg-white border-slate-200"}`}
      >
        <View className="flex-row items-start">
          <View className="mr-3 rounded-full p-2" style={{ backgroundColor: "rgba(15,37,71,0.95)" }}>
            <Ionicons name={icon} size={20} color={isUnread ? "rgba(15,37,71,0.95)" : "#334155"} />
          </View>
          <View className="flex-1">
            <Text className="text-[14px] font-semibold text-slate-900" numberOfLines={2}>
              {title}
            </Text>
            <Text className="mt-1 text-[13px] text-slate-600">{body}</Text>
            <View className="mt-2 flex-row items-center justify-between">
              <Text className="text-[11px] text-slate-500">{timeAgo(item.created_at)}</Text>
              {isUnread ? <View className="h-2 w-2 rounded-full bg-blue-500" /> : null}
            </View>
          </View>
        </View>
      </Pressable>
    );
  };

  const Empty = () => (
    <View className="items-center pt-16">
      <View className="h-14 w-14 items-center justify-center rounded-full bg-slate-100">
        <Ionicons name="mail-outline" size={22} color="#64748B" />
      </View>
      <Text className="mt-3 text-[15px] font-semibold text-slate-800">No notifications</Text>
      <Text className="mt-1 text-[13px] text-slate-500">You’ll see offers and updates here.</Text>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-[#F7F8FA]">
      <Header />
      <FlatList
        data={rows}
        keyExtractor={(it) => it.id}
        renderItem={({ item }) => <Item item={item} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingVertical: 8 }}
        ListEmptyComponent={loading ? undefined : Empty}
      />
    </SafeAreaView>
  );
}
