// app/(driver)/requeststatus.tsx
import React, {
  useMemo,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import {
  View,
  Text,
  Image,
  FlatList,
  Pressable,
  Platform,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Location from "expo-location"; // ⬅️ reverse geocoding
import LoadingScreen from "../../components/LoadingScreen";
import { supabase } from "../../utils/supabase";

/* ----------------------------- Types ----------------------------- */
type RequestStatus =
  | "ACCEPTED"
  | "WAITING"
  | "COMPLETED"
  | "CANCELED"
  | "TO_PAY"
  | "PAID";

type RequestItem = {
  id: string;
  name: string;
  avatar: string;
  vehicleType: string;
  info: string;
  landmark: string;
  location: string;
  imageUrls?: string[];
  dateTime: string;
  status: RequestStatus;
  seen: boolean;
  sentWhen: string;
  amountDue?: number;
};

type EmergencyRow = {
  emergency_id: string;
  user_id: string;
  vehicle_type: string;
  breakdown_cause: string | null;
  attachments: string[] | null;
  emergency_status: "waiting" | "in_process" | "completed" | "canceled";
  latitude: number;
  longitude: number;
  created_at: string;
  accepted_at: string | null;
  completed_at: string | null;
  canceled_at: string | null;
};

type AppUserRow = { full_name: string | null; photo_url: string | null };

/* ----------------------------- Helpers ----------------------------- */
const AVATAR_PLACEHOLDER =
  "https://images.unsplash.com/photo-1527980965255-d3b416303d12?q=80&w=256&auto=format&fit=crop";

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
const statusMap: Record<EmergencyRow["emergency_status"], RequestStatus> = {
  waiting: "WAITING",
  in_process: "ACCEPTED",
  completed: "COMPLETED",
  canceled: "CANCELED",
};

// 🔹 reverse geocode
async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const results = await Location.reverseGeocodeAsync({
      latitude: lat,
      longitude: lon,
    });
    if (results.length > 0) {
      const place = results[0];
      return (
        place.name ||
        place.street ||
        `${place.city ?? ""} ${place.region ?? ""} ${
          place.country ?? ""
        }`.trim()
      );
    }
    return "Unknown location";
  } catch {
    return "Unknown location";
  }
}

function mapEmergencyToItem(
  r: EmergencyRow,
  profile?: AppUserRow | null
): RequestItem {
  const lat = Number((r.latitude as any)?.toFixed?.(5) ?? r.latitude);
  const lon = Number((r.longitude as any)?.toFixed?.(5) ?? r.longitude);
  return {
    id: r.emergency_id,
    name: profile?.full_name || "You",
    avatar: profile?.photo_url || AVATAR_PLACEHOLDER,
    vehicleType: r.vehicle_type,
    info: r.breakdown_cause || "—",
    landmark: "—", // updated async
    location: `(${lat}, ${lon})`,
    imageUrls: (r.attachments || []).filter(Boolean),
    dateTime: fmtDateTime(r.created_at),
    status: statusMap[r.emergency_status],
    seen: r.emergency_status !== "waiting",
    sentWhen: timeAgo(r.created_at),
  };
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
const STATUS_STYLES: Record<
  RequestStatus,
  { bg?: string; border?: string; text?: string }
> = {
  ACCEPTED: {
    bg: "bg-emerald-50",
    border: "border-emerald-300/70",
    text: "text-emerald-700",
  },
  WAITING: {
    bg: "bg-amber-50",
    border: "border-amber-300/70",
    text: "text-amber-700",
  },
  COMPLETED: {
    bg: "bg-blue-50",
    border: "border-blue-300/70",
    text: "text-blue-700",
  },
  CANCELED: {
    bg: "bg-rose-50",
    border: "border-rose-300/70",
    text: "text-rose-700",
  },
  TO_PAY: {},
  PAID: {
    bg: "bg-teal-50",
    border: "border-teal-300/70",
    text: "text-teal-700",
  },
};

/* ----------------------------- Screen ----------------------------- */
export default function RequestStatus() {
  const router = useRouter();
  const { emergency_id } = useLocalSearchParams<{ emergency_id?: string }>();

  const [items, setItems] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState<{
    visible: boolean;
    message?: string;
  }>({ visible: false });
  const [userId, setUserId] = useState<string | null>(null);

  // Single source of truth loader (used by initial load and refresh)
  const fetchItems = useCallback(
    async (withSpinner: boolean) => {
      try {
        if (withSpinner)
          setLoading({ visible: true, message: "Loading requests…" });

        // Ensure auth
        let uid = userId;
        if (!uid) {
          const { data: auth, error: authErr } = await supabase.auth.getUser();
          if (authErr || !auth.user) throw new Error("Please sign in.");
          uid = auth.user.id;
          setUserId(uid);
        }

        if (emergency_id) {
          // single emergency
          const { data: erow, error } = await supabase
            .from("emergency")
            .select("*")
            .eq("emergency_id", emergency_id)
            .single<EmergencyRow>();
          if (error) throw error;

          let profile: AppUserRow | null = null;
          try {
            const { data: prow } = await supabase
              .from("app_user")
              .select("full_name,photo_url")
              .eq("user_id", erow.user_id)
              .single<AppUserRow>();
            profile = prow ?? null;
          } catch {}

          const item = mapEmergencyToItem(erow, profile);
          item.landmark = await reverseGeocode(erow.latitude, erow.longitude);
          setItems([item]);
        } else {
          // all emergencies of this user
          const { data: rows, error } = await supabase
            .from("emergency")
            .select("*")
            .eq("user_id", uid!)
            .order("created_at", { ascending: false });
          if (error) throw error;

          const mapped = await Promise.all(
            (rows as EmergencyRow[]).map(async (r) => {
              let profile: AppUserRow | null = null;
              try {
                const { data: prow } = await supabase
                  .from("app_user")
                  .select("full_name,photo_url")
                  .eq("user_id", r.user_id)
                  .single<AppUserRow>();
                profile = prow ?? null;
              } catch {}
              const item = mapEmergencyToItem(r, profile);
              item.landmark = await reverseGeocode(r.latitude, r.longitude);
              return item;
            })
          );
          setItems(mapped);
        }
      } catch (e: any) {
        Alert.alert("Unable to load", e?.message ?? "Please try again.");
      } finally {
        if (withSpinner) setLoading({ visible: false });
      }
    },
    [emergency_id, userId]
  );

  // Patch UI instantly from a realtime payload (no full refetch)
  const applyRealtimePatch = useCallback((payload: any) => {
    const type = payload?.eventType as
      | "INSERT"
      | "UPDATE"
      | "DELETE"
      | undefined;
    const row: EmergencyRow | undefined = (
      type === "DELETE" ? payload?.old : payload?.new
    ) as EmergencyRow | undefined;
    if (!type || !row) return;

    setItems((prev) => {
      const next = [...prev];
      const idx = next.findIndex((x) => x.id === row.emergency_id);

      if (type === "DELETE") {
        if (idx >= 0) next.splice(idx, 1);
        return next;
      }

      // Build minimal patch (avoid heavy geocode here)
      const patch: Partial<RequestItem> = {
        status: statusMap[row.emergency_status],
        seen: row.emergency_status !== "waiting",
      };

      if (idx >= 0) {
        next[idx] = { ...next[idx], ...patch };
        return next;
      } else {
        // Not in list (e.g., new INSERT) — add a lightweight version, enrich async
        const lite: RequestItem = {
          id: row.emergency_id,
          name: "You",
          avatar: AVATAR_PLACEHOLDER,
          vehicleType: row.vehicle_type,
          info: row.breakdown_cause || "—",
          landmark: "—",
          location: `(${row.latitude}, ${row.longitude})`,
          imageUrls: (row.attachments || []).filter(Boolean),
          dateTime: fmtDateTime(row.created_at),
          status: statusMap[row.emergency_status],
          seen: row.emergency_status !== "waiting",
          sentWhen: timeAgo(row.created_at),
        };
        next.unshift(lite);
        // Enrich landmark/profile in background (no blocking)
        (async () => {
          const landmark = await reverseGeocode(row.latitude, row.longitude);
          let name = "You";
          let avatar = AVATAR_PLACEHOLDER;
          try {
            const { data: prow } = await supabase
              .from("app_user")
              .select("full_name,photo_url")
              .eq("user_id", row.user_id)
              .single<AppUserRow>();
            if (prow) {
              name = prow.full_name || name;
              avatar = prow.photo_url || avatar;
            }
          } catch {}
          setItems((curr) =>
            curr.map((it) =>
              it.id === row.emergency_id
                ? { ...it, landmark, name, avatar }
                : it
            )
          );
        })();
        return next;
      }
    });
  }, []);

  // Initial load
  useEffect(() => {
    fetchItems(true);
  }, [fetchItems]);

  // Realtime subscription (INSERT/UPDATE/DELETE) + instant UI patch + quiet refetch
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const setup = async () => {
      // Ensure user id (for filter)
      let uid = userId;
      if (!uid) {
        const { data: auth } = await supabase.auth.getUser();
        uid = auth?.user?.id ?? null;
        if (!uid) return;
        setUserId(uid);
      }

      const filter =
        emergency_id && typeof emergency_id === "string"
          ? `emergency_id=eq.${emergency_id}`
          : `user_id=eq.${uid}`;

      channel = supabase
        .channel(`emergency-realtime-${uid}-${emergency_id ?? "all"}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "emergency", filter },
          (payload) => {
            // 1) Patch immediately so you see the change at once
            applyRealtimePatch(payload);
            // 2) Also schedule a quiet refetch to keep everything consistent
            //    (e.g., if other fields changed or ordering should update)
            fetchItems(false);
          }
        )
        .subscribe();
    };

    setup();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [emergency_id, userId, fetchItems, applyRealtimePatch]);

  // Fallback polling (in case Realtime is disabled or drops)
  useEffect(() => {
    const id = setInterval(() => fetchItems(false), 15000); // 15s
    return () => clearInterval(id);
  }, [fetchItems]);

  const renderItem = ({ item }: { item: RequestItem }) => (
    <View
      className="bg-white rounded-2xl p-4 mb-4 border border-slate-200 relative"
      style={cardShadow as any}
    >
      <View className="absolute right-3 top-3 flex-row items-center">
        <Ionicons
          name={item.seen ? "checkmark-done" : "time-outline"}
          size={14}
          color={item.seen ? "#16a34a" : "#94a3b8"}
        />
        <Text
          className={`ml-1 text-[12px] ${
            item.seen ? "text-emerald-600" : "text-slate-500"
          }`}
        >
          {item.seen ? "Seen" : "Pending"}
        </Text>
      </View>

      {/* HEADER */}
      <View className="flex-row items-center">
        <Image
          source={{ uri: item.avatar }}
          className="w-12 h-12 rounded-full"
        />
        <View className="ml-3 flex-1">
          <Text
            className="text-[16px] font-semibold text-slate-900"
            numberOfLines={1}
          >
            {item.name}
          </Text>
          <Text className="text-[12px] text-slate-500">
            Emergency Request • {item.vehicleType}
          </Text>
          <View className="flex-row items-center mt-1">
            <View className="w-2 h-2 rounded-full mr-1 bg-emerald-500" />
            <Text className="text-[12px] text-slate-600">{item.info}</Text>
          </View>
        </View>
      </View>

      <View className="h-px bg-slate-200 my-4" />

      {/* BODY */}
      <Row label="Landmark/Remarks" value={item.landmark} />
      <Row label="Location" value={item.location} />
      <Row label="Date & Time" value={item.dateTime} muted />

      <View className="h-px bg-slate-200 my-4" />

      {/* FOOTER */}
      <View className="flex-row items-center justify-between">
        <View
          className={`rounded-full px-3 py-1 border self-start ${
            STATUS_STYLES[item.status].bg ?? ""
          } ${STATUS_STYLES[item.status].border ?? ""}`}
        >
          <Text
            className={`text-[12px] font-medium ${
              STATUS_STYLES[item.status].text ?? "text-slate-800"
            }`}
          >
            {item.status}
          </Text>
        </View>
        <Text className="text-[12px] text-slate-400">Sent {item.sentWhen}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-[#F4F6F8]">
      <View className="flex-row items-center justify-between px-4 py-3">
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={26} color="#0F172A" />
        </Pressable>
        <Text className="text-xl font-bold text-[#0F172A]">Request Status</Text>
        <View style={{ width: 26 }} />
      </View>

      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        ListEmptyComponent={
          <View className="px-6 pt-10">
            <Text className="text-center text-slate-500">
              {emergency_id
                ? "Loading or no record found."
                : "No requests to show."}
            </Text>
          </View>
        }
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
