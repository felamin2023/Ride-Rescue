// FILE: app/driver/inbox.tsx
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
  | "new_offer_received"
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
  new_offer_received: "cash-outline",
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
    // Mark as read
    if (!n.read_at) {
      await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
      setRows(prev => prev.map(r => (r.id === n.id ? { ...r, read_at: new Date().toISOString() } : r)));
    }

    // Navigate based on notification type
    if (n.type === "new_offer_received") {
      router.push("/driver/requeststatus");
      return;
    }

    if (n.type === "service_request_accepted") {
      router.push("/driver/requeststatus");
      return;
    }

    if (n.type === "emergency_posted") {
      router.push("/driver/requeststatus");
      return;
    }

    if (n.type === "system" && n?.data?.event === "rating_posted") {
      router.push("/driver/reviews");
      return;
    }

    // Fallback
    router.push("/driver/requeststatus");
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
        
        <View style={{ width: 40 }} />
      </View>
    </SafeAreaView>
  );

  const Item = ({ item }: { item: NotifRow }) => {
    const icon = ICON_BY_TYPE[item.type] || "notifications-outline";
    const isUnread = !item.read_at;
    let title = item.title;
    let body = item.body;
    let details: string | null = null;

    // Professional messaging with proper spacing and shop name
    if (item.type === "emergency_posted") {
      title ||= "Emergency Request Posted";
      body ||= "Your emergency has been successfully posted and nearby mechanics have been notified.";
    } 
    else if (item.type === "service_request_accepted") {
      const shopName = item?.data?.shop_name || "A mechanic";
      title ||= `${shopName} Accepted Your Request`;
      body ||= "Your request has been accepted. The mechanic is ready to assist you.";
      details = "Tap to view service details and contact information.";
    } 
    else if (item.type === "new_offer_received") {
      const shopName = item?.data?.shop_name || "A Mechanic";
      const totalAmount = item?.data?.total_amount;
      const distanceKm = item?.data?.distance_km;
      const laborCost = item?.data?.labor_cost || 0;
      const fuelCost = item?.data?.fuel_cost || 0;
      const note = item?.data?.note;

      title = `${shopName} has sent you an offer!`;

      if (totalAmount && distanceKm !== undefined) {
        // Determine if this is a gas emergency based on fuel cost presence
        const isGasEmergency = fuelCost > 0;
        const serviceCost = isGasEmergency ? fuelCost : laborCost;
        const distanceFee = totalAmount - serviceCost;
        
        body = `Total Amount: ₱${totalAmount.toFixed(2)}\n` +
               `• Distance Fee: ₱${distanceFee.toFixed(2)} (${distanceKm.toFixed(1)} km)\n` +
               `• ${isGasEmergency ? 'Fuel Cost' : 'Labor Cost'}: ₱${serviceCost.toFixed(2)}`;
        
        if (note && note.trim()) {
          details = `Note: ${note}`;
        } else {
          details = "Tap to review complete offer details and accept.";
        }
      } else {
        body = totalAmount 
          ? `Total Service Cost: ₱${totalAmount.toFixed(2)}`
          : "Service quote details available.";
        details = "Tap to view complete breakdown and respond.";
      }
    }
    else if (item.type === "service_request_rejected") {
      const shopName = item?.data?.shop_name || "A shop";
      const isGasService = item?.data?.is_gas_service;
      const cancelReason = item?.data?.cancel_reason;
      const noFeesCharged = item?.data?.no_fees_charged;

      if (isGasService) {
        // Updated: Shop name in the title for gas delivery cancellations
        title = `${shopName} cancelled your gas delivery`;
        body = cancelReason ? `Reason: ${cancelReason}` : "No reason provided";
        
        if (noFeesCharged) {
          details = "No fees were charged for this cancellation.";
        }
      } else {
        const serviceType = item?.data?.service_type || 'repair';
        const serviceDisplay = serviceType.charAt(0).toUpperCase() + serviceType.slice(1);
        title = `${shopName} cancelled your ${serviceDisplay} service`;
        body = cancelReason ? `Reason: ${cancelReason}` : "No reason provided";
      }
    }

    return (
      <Pressable
        onPress={() => open(item)}
        className={`mx-4 mb-3 rounded-2xl border ${
          isUnread ? "bg-white border-blue-200" : "bg-white border-slate-200"
        }`}
        style={{
          shadowColor: "#000",
          shadowOpacity: 0.06,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
          elevation: 2,
        }}
      >
        <View className="p-4">
          <View className="flex-row items-start">
            {/* Icon */}
            <View 
              className="mr-3 rounded-full p-2.5" 
              style={{ 
                backgroundColor: isUnread ? "rgba(37, 99, 235, 0.12)" : "rgba(100, 116, 139, 0.1)" 
              }}
            >
              <Ionicons 
                name={icon} 
                size={22} 
                color={isUnread ? "#2563EB" : "#64748B"} 
              />
            </View>

            {/* Content */}
            <View className="flex-1">
              {/* Title */}
              <Text 
                className="text-[15px] font-semibold text-slate-900 leading-5" 
                numberOfLines={2}
              >
                {title}
              </Text>

              {/* Body - FIX: Wrap text properly */}
              <Text 
                className="mt-2 text-[13px] text-slate-700 leading-5" 
                style={{ lineHeight: 20 }}
              >
                {body}
              </Text>

              {/* Additional details */}
              {details && (
                <Text 
                  className="mt-2 text-[12px] text-slate-500 italic leading-4"
                  numberOfLines={2}
                >
                  {details}
                </Text>
              )}

              {/* Footer */}
              <View className="mt-3 flex-row items-center justify-between">
                <Text className="text-[11px] text-slate-500">
                  {timeAgo(item.created_at)}
                </Text>
                {isUnread && (
                  <View className="flex-row items-center">
                    <Text className="text-[10px] text-blue-600 font-medium mr-1.5">
                      NEW
                    </Text>
                    <View className="h-2 w-2 rounded-full bg-blue-500" />
                  </View>
                )}
              </View>
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
      <Text className="mt-3 text-[15px] font-semibold text-slate-800">No notifications yet</Text>
      <Text className="mt-1 text-[13px] text-slate-500 text-center px-8">
        You'll receive service quotes and updates here
      </Text>
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