import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, FlatList, Pressable, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
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

export default function ShopInbox() {
  const router = useRouter();
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

  // Realtime
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
          setRows(prev => [payload.new as NotifRow, ...prev]);
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

    // Navigate destination for a shop/mechanic:
    // 1) A driver posted nearby → go to the page where shops can view/offer
    if (n.type === "emergency_nearby" || n.type === "emergency_posted") {
      router.push("/shop/mechanicLandingpage");
      return;
    }

    // 2) Driver accepted your offer → go to accepted-requests dashboard
    if (n.type === "service_request_accepted" && n?.data?.event === "driver_accepted_offer") {
      router.push("/shop/mechanicAcceptedrequests");
      return;
    }

    // 3) System: payment proof uploaded → also check in accepted-requests (where you'd verify/mark paid)
    if (n.type === "system" && n?.data?.event === "payment_proof_uploaded") {
      router.push("/shop/completedrequest");
      return;
    }

    // 4) System: rating received → view ratings
    if (n.type === "system" && n?.data?.event === "rating_posted") {
      router.push("/shop/ratings");
      return;
    }

    // fallback
    // router.push("/shop/inbox");
  }, [router]);

  const Header = () => (
    <SafeAreaView edges={["top"]} className="bg-white border-b border-slate-200">
      <View className="flex-row items-center justify-between px-4 py-3">
        <Pressable 
          onPress={() => router.back()} 
          hitSlop={8}
          className="p-2 rounded-lg active:opacity-80"
        >
          <Ionicons name="arrow-back" size={24} color="#0F172A" />
        </Pressable>
        
        <Text className="text-xl font-bold text-[#0F172A]">Notifications</Text>
        
        {/* Empty view to balance the layout - removed envelope icon */}
        <View style={{ width: 40 }} />
      </View>
    </SafeAreaView>
  );

  const Item = ({ item }: { item: NotifRow }) => {
    const icon = ICON_BY_TYPE[item.type] || "notifications-outline";
    const isUnread = !item.read_at;

    // Suggested copy for shops
    let title = item.title;
    let body = item.body;

    if (item.type === "emergency_nearby" || item.type === "emergency_posted") {
      title ||= "Emergency nearby";
      body ||= "An emergency request was posted in your area. Tap to view and make an offer.";
    } else if (item.type === "service_request_accepted" && item?.data?.event === "driver_accepted_offer") {
      const driverName = item?.data?.driver_name || "The driver";
      title ||= "Offer accepted";
      body ||= `${driverName} accepted your offer. You may now proceed to the driver's location.`;
    }

    return (
      <Pressable
        onPress={() => open(item)}
        className={`mx-4 mb-3 rounded-2xl border p-4 ${isUnread ? "bg-white border-blue-200" : "bg-white border-slate-200"}`}
        style={{
          shadowColor: "#000",
          shadowOpacity: 0.06,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
          elevation: 2,
        }}
      >
        <View className="flex-row items-start">
          <View 
            className="mr-3 rounded-full p-2" 
            style={{ 
              backgroundColor: isUnread ? "rgba(37, 99, 235, 0.1)" : "rgba(100, 116, 139, 0.1)" 
            }}
          >
            <Ionicons 
              name={icon} 
              size={20} 
              color={isUnread ? "#2563EB" : "#64748B"} 
            />
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
      <Text className="mt-1 text-[13px] text-slate-500">You'll see driver requests and updates here.</Text>
    </View>
  );

  return (
    <View className="flex-1 bg-[#F4F6F8]">
      <Header />
      <FlatList
        data={rows}
        keyExtractor={(it) => it.id}
        renderItem={({ item }) => <Item item={item} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingVertical: 8 }}
        ListEmptyComponent={loading ? undefined : Empty}
      />
    </View>
  );
}