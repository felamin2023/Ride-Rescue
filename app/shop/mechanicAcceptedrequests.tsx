// app/shop/requeststatus.tsx
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  FlatList,
  Pressable,
  Platform,
  Alert,
  Linking,
  Modal,
  Animated,
  Easing,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import LoadingScreen from "../../components/LoadingScreen";
import { supabase } from "../../utils/supabase";

/* ----------------------------- Debug helper ----------------------------- */
const DEBUG_PRINTS = true;
const dbg = (...args: any[]) => {
  if (DEBUG_PRINTS) console.log("[SHOP-REQSTATUS]", ...args);
};

/* ----------------------------- Types ----------------------------- */
type SRStatus = "pending" | "accepted" | "rejected" | "canceled";
type EmergencyStatus = "waiting" | "in_process" | "completed" | "canceled";

type ServiceRequestRow = {
  service_id: string;
  emergency_id: string;
  shop_id: string;
  latitude: number;
  longitude: number;
  status: SRStatus;
  requested_at: string;
  accepted_at?: string | null;
  rejected_at?: string | null;
};

type EmergencyRow = {
  emergency_id: string;
  user_id: string; // driver
  vehicle_type: string;
  breakdown_cause: string | null;
  attachments: string[] | null;
  emergency_status: EmergencyStatus;
  latitude: number;
  longitude: number;
  created_at: string;
  accepted_at?: string | null;
  accepted_by?: string | null;
  completed_at?: string | null;
  canceled_at?: string | null;
};

type AppUserRow = {
  user_id: string;
  full_name: string | null;
  photo_url: string | null;
};

type CardItem = {
  // ids
  serviceId: string;
  emergencyId: string;
  // driver
  driverUserId: string | null;
  driverName: string;
  driverAvatar: string;
  // emergency
  vehicleType: string;
  info: string;
  lat: number;
  lon: number;
  landmark: string;
  location: string;
  dateTime: string; // emergency created_at formatted
  sentWhen: string; // request accepted/requested -> "x ago"
  // statuses
  srStatus: SRStatus;
  emStatus: EmergencyStatus;
  // meta
  distanceKm?: number;
  imageUrls?: string[];
};

const AVATAR_PLACEHOLDER =
  "https://images.unsplash.com/photo-1527980965255-d3b416303d12?q=80&w=256&auto=format&fit=crop";

/* ----------------------------- Helpers ----------------------------- */
function fmtDateTime(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} - ${time}`;
}
function timeAgo(iso: string) {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const diff = Math.max(0, now - t) / 1000;
  if (diff < 60) return "Just now";
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const results = await Location.reverseGeocodeAsync({
      latitude: lat,
      longitude: lon,
    });
    if (results.length > 0) {
      const p = results[0];
      return (
        p.name ||
        p.street ||
        `${p.city ?? ""} ${p.region ?? ""} ${p.country ?? ""}`.trim()
      );
    }
  } catch {}
  return "Unknown location";
}
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
function fmtDistance(km?: number) {
  if (!Number.isFinite(km || NaN)) return "—";
  const v = km as number;
  if (v < 1) return `${Math.round(v * 1000)} m`;
  if (v < 10) return `${v.toFixed(1)} km`;
  return `${Math.round(v)} km`;
}

/* ----------------------------- UI helpers ----------------------------- */
const cardShadow = Platform.select({
  ios: {
    shadowColor: "#0F172A",
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  android: { elevation: 2 },
});

const SR_STYLES: Record<
  SRStatus,
  { bg?: string; border?: string; text?: string; dot?: string }
> = {
  pending: {
    bg: "bg-amber-50",
    border: "border-amber-300/70",
    text: "text-amber-700",
    dot: "#f59e0b",
  },
  accepted: {
    bg: "bg-emerald-50",
    border: "border-emerald-300/70",
    text: "text-emerald-700",
    dot: "#10b981",
  },
  rejected: {
    bg: "bg-rose-50",
    border: "border-rose-300/70",
    text: "text-rose-700",
    dot: "#ef4444",
  },
  canceled: {
    bg: "bg-slate-50",
    border: "border-slate-300/70",
    text: "text-slate-700",
    dot: "#64748b",
  },
};

function prettyEM(s: EmergencyStatus) {
  return s === "in_process"
    ? "In Progress"
    : s.replace(/^\w/, (c) => c.toUpperCase());
}

/* ----------------------------- Cute spinner ----------------------------- */
function SpinningGear({ size = 14, color = "#059669" }) {
  const spin = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    anim.start();
    return () => anim.stop();
  }, [spin]);
  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });
  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <Ionicons name="settings-outline" size={size} color={color} />
    </Animated.View>
  );
}

/* ----------------------- Centered Confirmation ----------------------- */
function CenterConfirm({
  visible,
  title,
  message,
  onCancel,
  onConfirm,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmColor = "#2563EB",
}: {
  visible: boolean;
  title: string;
  message?: string;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmColor?: string;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: "rgba(0,0,0,0.35)" }}
      >
        <View
          className="w-11/12 max-w-md rounded-2xl bg-white p-5"
          style={cardShadow as any}
        >
          <View className="items-center mb-2">
            <Ionicons
              name="alert-circle-outline"
              size={28}
              color={confirmColor}
            />
          </View>
          <Text className="text-lg font-semibold text-slate-900 text-center">
            {title}
          </Text>
          {message ? (
            <Text className="mt-2 text-[14px] text-slate-600 text-center">
              {message}
            </Text>
          ) : null}
          <View className="mt-5 flex-row gap-10">
            <Pressable
              onPress={onCancel}
              className="flex-1 rounded-2xl border border-slate-300 py-2.5 items-center"
            >
              <Text className="text-[14px] text-slate-900">{cancelLabel}</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              className="flex-1 rounded-2xl py-2.5 items-center"
              style={{ backgroundColor: confirmColor }}
            >
              <Text className="text-[14px] text-white font-semibold">
                {confirmLabel}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/* ----------------------------- Screen ----------------------------- */
export default function ShopAcceptedRequests() {
  const router = useRouter();

  const [loading, setLoading] = useState<{ visible: boolean; message?: string }>(
    { visible: false }
  );
  const [userId, setUserId] = useState<string | null>(null);
  const [shopId, setShopId] = useState<string | null>(null);

  const [items, setItems] = useState<CardItem[]>([]);
  const [openCards, setOpenCards] = useState<Record<string, boolean>>({});
  const [confirmComplete, setConfirmComplete] = useState<{
    emergencyId: string;
  } | null>(null);

  const toggleCard = (emId: string) => {
    setOpenCards((m) => ({ ...m, [emId]: !m[emId] }));
  };

  /* ----------------------------- Fetch accepted only ----------------------------- */
  const fetchAll = useCallback(async (withSpinner: boolean) => {
    try {
      if (withSpinner)
        setLoading({ visible: true, message: "Loading accepted requests…" });

      // 1) ensure user -> shop
      let uid = userId;
      if (!uid) {
        const { data: auth, error: authErr } = await supabase.auth.getUser();
        if (authErr || !auth?.user) throw new Error("Please sign in.");
        uid = auth.user.id;
        setUserId(uid);
      }

      let sid = shopId;
      if (!sid) {
        const { data: srow, error: sErr } = await supabase
          .from("shop_details")
          .select("shop_id")
          .eq("user_id", uid!)
          .single();
        if (sErr || !srow?.shop_id) throw new Error("Shop profile not found.");
        sid = srow.shop_id as string;
        setShopId(sid);
      }

      // 2) find only ACCEPTED service_requests for this shop
      const { data: srs, error: srErr } = await supabase
        .from("service_requests")
        .select(
          "service_id, emergency_id, shop_id, latitude, longitude, status, requested_at, accepted_at"
        )
        .eq("shop_id", sid!)
        .eq("status", "accepted")
        .order("accepted_at", { ascending: false, nullsFirst: false })
        .order("requested_at", { ascending: false });
      if (srErr) throw srErr;

      const srRows = (srs as ServiceRequestRow[]) ?? [];
      if (srRows.length === 0) {
        setItems([]);
        return;
      }

      // 3) batch load emergencies referenced
      const emIds = Array.from(new Set(srRows.map((r) => r.emergency_id)));
      const { data: ems, error: emErr } = await supabase
        .from("emergency")
        .select(
          "emergency_id, user_id, vehicle_type, breakdown_cause, attachments, emergency_status, latitude, longitude, created_at, accepted_at, accepted_by, completed_at, canceled_at"
        )
        .in("emergency_id", emIds);
      if (emErr) throw emErr;

      // 4) keep emergencies where accepted_by is this user (if set)
      const emMap = new Map<string, EmergencyRow>();
      (ems as EmergencyRow[]).forEach((e) => {
        if (!e.accepted_by || e.accepted_by === uid) {
          emMap.set(e.emergency_id, e);
        }
      });

      // 5) load driver profiles in batch
      const driverIds = Array.from(
        new Set(Array.from(emMap.values()).map((e) => e.user_id))
      );
      const userMap = new Map<string, AppUserRow>();
      if (driverIds.length) {
        const { data: users } = await supabase
          .from("app_user")
          .select("user_id, full_name, photo_url")
          .in("user_id", driverIds);
        (users as AppUserRow[] | null)?.forEach((u) =>
          userMap.set(u.user_id, u)
        );
      }

      // 6) compose cards (accepted-only)
      const composed: CardItem[] = await Promise.all(
        srRows
          .filter((sr) => emMap.has(sr.emergency_id))
          .map(async (sr) => {
            const em = emMap.get(sr.emergency_id)!;
            const u = userMap.get(em.user_id);
            const driverName = u?.full_name || "Driver";
            const driverAvatar = u?.photo_url || AVATAR_PLACEHOLDER;
            const distanceKm = haversineKm(
              sr.latitude,
              sr.longitude,
              em.latitude,
              em.longitude
            );
            const landmark = await reverseGeocode(em.latitude, em.longitude);

            return {
              serviceId: sr.service_id,
              emergencyId: sr.emergency_id,
              driverUserId: u?.user_id ?? null,
              driverName,
              driverAvatar,
              vehicleType: em.vehicle_type,
              info: em.breakdown_cause || "—",
              lat: em.latitude,
              lon: em.longitude,
              landmark,
              location: `(${em.latitude.toFixed(5)}, ${em.longitude.toFixed(
                5
              )})`,
              dateTime: fmtDateTime(em.created_at),
              sentWhen: timeAgo(sr.accepted_at || sr.requested_at),
              srStatus: "accepted",
              emStatus: em.emergency_status,
              distanceKm,
              imageUrls: (em.attachments || []).filter(Boolean) || undefined,
            };
          })
      );

      // sort: in_progress first, then completed, then canceled (if any)
      composed.sort((a, b) => {
        const order = (s: EmergencyStatus) =>
          s === "in_process" ? 0 : s === "completed" ? 1 : s === "canceled" ? 2 : 3;
        return order(a.emStatus) - order(b.emStatus);
      });

      setItems(composed);
    } catch (e: any) {
      Alert.alert("Unable to load", e?.message ?? "Please try again.");
    } finally {
      if (withSpinner) setLoading({ visible: false });
    }
  }, [shopId, userId]);

  /* ----------------------------- Actions ----------------------------- */
  const openDirections = (lat: number, lon: number) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
    Linking.openURL(url).catch(() => {});
  };

  const messageDriver = (emergencyId: string) => {
    try {
      router.push({
        pathname: "/shop/messages",
        params: { to: emergencyId } as any,
      });
    } catch {
      router.push("/shop/messages");
    }
  };

  const completeEmergency = useCallback(async (emergencyId: string) => {
    try {
      setLoading({ visible: true, message: "Marking as completed…" });
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("emergency")
        .update({ emergency_status: "completed", completed_at: now })
        .eq("emergency_id", emergencyId);
      if (error) throw error;

      setItems((prev) =>
        prev.map((it) =>
          it.emergencyId === emergencyId ? { ...it, emStatus: "completed" } : it
        )
      );
    } catch (e: any) {
      Alert.alert("Update failed", e?.message ?? "Please try again.");
    } finally {
      setLoading({ visible: false });
    }
  }, []);

  /* ----------------------------- Realtime ----------------------------- */
  useEffect(() => {
    const ch1 = supabase
      .channel("sr-shop-accepted")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "service_requests" },
        (payload) => {
          const row = (payload as any).new as ServiceRequestRow | undefined;
          if (!row) return;

          setItems((prev) => {
            if (row.status !== "accepted") {
              return prev.filter((it) => it.serviceId !== row.service_id);
            }
            return prev.map((it) =>
              it.serviceId === row.service_id
                ? {
                    ...it,
                    srStatus: "accepted",
                    sentWhen: timeAgo(row.accepted_at || row.requested_at),
                  }
                : it
            );
          });
        }
      )
      .subscribe();

    const ch2 = supabase
      .channel("em-shop-status")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "emergency" },
        (payload) => {
          const row = (payload as any).new as EmergencyRow | undefined;
          if (!row) return;
          setItems((prev) =>
            prev.map((it) =>
              it.emergencyId === row.emergency_id
                ? { ...it, emStatus: row.emergency_status }
                : it
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch1);
      supabase.removeChannel(ch2);
    };
  }, []);

  /* ----------------------------- Lifecycle ----------------------------- */
  useEffect(() => {
    fetchAll(true);
  }, [fetchAll]);

  useEffect(() => {
    const id = setInterval(() => fetchAll(false), 15000);
    return () => clearInterval(id);
  }, [fetchAll]);

  /* ----------------------------- Render ----------------------------- */
  const renderItem = ({ item }: { item: CardItem }) => {
    const ST = SR_STYLES["accepted"];
    const isOpen = !!openCards[item.emergencyId];

    const showComplete = item.emStatus === "in_process";

    return (
      <Pressable
        onPress={() => toggleCard(item.emergencyId)}
        className="bg-white rounded-2xl p-4 mb-4 border border-slate-200"
        style={cardShadow as any}
      >
        {/* Header */}
        <View className="flex-row items-center">
          <Image
            source={{ uri: item.driverAvatar }}
            className="w-12 h-12 rounded-full"
          />
          <View className="ml-3 flex-1">
            <Text
              className="text-[16px] font-semibold text-slate-900"
              numberOfLines={1}
            >
              {item.driverName}
            </Text>
            <Text className="text-[12px] text-slate-500">
              Driver Emergency • {item.vehicleType}
            </Text>
            <View className="flex-row items-center mt-1">
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  marginRight: 6,
                  backgroundColor: ST.dot,
                }}
              />
              <Text className="text-[12px] text-slate-600" numberOfLines={1}>
                {item.info}
              </Text>
            </View>
          </View>
          
        </View>

        <View className="h-px bg-slate-200 my-4" />

        {/* Body rows */}
        <Row label="Landmark/Remarks" value={item.landmark} />
        <Row label="Location" value={item.location} />
        <Row label="Date & Time" value={item.dateTime} muted />

        <View className="h-px bg-slate-200 my-4" />

        {/* Status + meta */}
        <View className="flex-row items-center justify-between">
          <View
            className={`rounded-full px-3 py-1 border self-start flex-row items-center ${
              ST.bg ?? ""
            } ${ST.border ?? ""}`}
          >
            {item.emStatus === "in_process" ? (
              <View className="mr-1.5">
                {/* cog to the LEFT of the label */}
                <SpinningGear size={12} />
              </View>
            ) : null}
            <Text
              className={`text-[12px] font-medium ${
                ST.text ?? "text-slate-800"
              }`}
            >
              {item.emStatus === "in_process"
                ? "In Progress"
                : prettyEM(item.emStatus)}
            </Text>
          </View>

          <View className="items-end">
            <Text className="text-[12px] text-slate-400">
              {/* make wording simpler: Sent X ago */}
              Sent {item.sentWhen}
            </Text>
          </View>
        </View>

        {/* Expanded actions */}
        {isOpen ? (
          <>
            <View className="h-px bg-slate-200 my-4" />
            <View className="flex-row gap-3">
              {/* Message (white bg) */}
              <Pressable
                onPress={() => messageDriver(item.emergencyId)}
                className="flex-1 rounded-2xl py-2.5 items-center border border-slate-300"
              >
                <View className="flex-row items-center gap-1.5">
                  <Ionicons
                    name="chatbubbles-outline"
                    size={16}
                    color="#0F172A"
                  />
                  <Text className="text-[14px] font-semibold text-slate-900">
                    Message
                  </Text>
                </View>
              </Pressable>

              {/* Location (match Message style, white bg, icon left) */}
              <Pressable
                onPress={() => openDirections(item.lat, item.lon)}
                className="flex-1 rounded-2xl py-2.5 items-center border border-slate-300"
              >
                <View className="flex-row items-center gap-1.5">
                  <Ionicons name="navigate-outline" size={16} color="#0F172A" />
                  <Text className="text-[14px] font-semibold text-slate-900">
                    Location
                  </Text>
                </View>
              </Pressable>
            </View>

            {showComplete ? (
              <Pressable
                onPress={() =>
                  setConfirmComplete({ emergencyId: item.emergencyId })
                }
                className="mt-3 rounded-2xl py-2.5 items-center bg-blue-600"
              >
                <Text className="text-[14px] font-semibold text-white">
                  Mark as Completed
                </Text>
              </Pressable>
            ) : null}
          </>
        ) : null}
      </Pressable>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-[#F4F6F8]">
      {/* Top bar */}
      <View className="flex-row items-center justify-between px-4 py-3">
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={26} color="#0F172A" />
        </Pressable>
        <Text className="text-xl font-bold text-[#0F172A]">
          Accepted Requests
        </Text>
        <View style={{ width: 26 }} />
      </View>

      {/* Divider under the header title */}
      <View className="h-px bg-slate-200" />

      <FlatList
        data={items}
        keyExtractor={(i) => i.serviceId}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        ListEmptyComponent={
          <View className="px-6 pt-10">
            <Text className="text-center text-slate-500">
              No accepted requests yet.
            </Text>
          </View>
        }
      />

      {/* Confirm: Complete */}
      <CenterConfirm
        visible={!!confirmComplete}
        title="Mark job as completed?"
        message="This will set the emergency status to Completed."
        onCancel={() => setConfirmComplete(null)}
        onConfirm={() => {
          if (confirmComplete) {
            completeEmergency(confirmComplete.emergencyId);
            setConfirmComplete(null);
          }
        }}
        confirmLabel="Yes, Complete"
        cancelLabel="Back"
        confirmColor="#2563EB"
      />

      <LoadingScreen
        visible={loading.visible}
        message={loading.message}
        variant="spinner"
      />
    </SafeAreaView>
  );
}

/* ----------------------------- Row Helper ----------------------------- */
function Row({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <View className="flex-row items-baseline py-0.5">
      <Text className="w-40 pr-2 text-[13px] text-slate-600">{label}:</Text>
      <Text
        className={`flex-1 text-[13px] ${
          muted ? "text-slate-500" : "text-slate-800"
        }`}
      >
        {value}
      </Text>
    </View>
  );
}
