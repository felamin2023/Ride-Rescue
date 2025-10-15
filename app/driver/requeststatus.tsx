// app/(driver)/requeststatus.tsx
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Image,
  FlatList,
  Pressable,
  Platform,
  Alert,
  ScrollView,
  Modal,
  Animated,
  Easing,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Location from "expo-location";
import LoadingScreen from "../../components/LoadingScreen";
import { supabase } from "../../utils/supabase";

/* ----------------------------- Debug helper ----------------------------- */
const DEBUG_PRINTS = true;
const dbg = (...args: any[]) => {
  if (DEBUG_PRINTS) console.log("[REQUESTSTATUS]", ...args);
};

/* ----------------------------- Types ----------------------------- */
type RequestStatus =
  | "IN_PROCESS"
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
  dateTime: string;       // formatted
  createdAtIso: string;   // raw ISO for logic
  status: RequestStatus;
  seen: boolean;
  sentWhen: string;
  lat: number;
  lon: number;
};

type EmergencyRow = {
  emergency_id: string;
  user_id: string;
  vehicle_type: string;
  breakdown_cause: string | null;
  attachments: string[] | null;
  emergency_status:
    | "waiting"
    | "in_process"
    | "completed"
    | "canceled"
    | "cancelled";
  latitude: number;
  longitude: number;
  created_at: string;
  accepted_at: string | null;
  completed_at: string | null;
  canceled_at: string | null;
  accepted_by: string | null;
  driver_hidden: boolean; // 🔵 NEW
};

type AppUserRow = { full_name: string | null; photo_url: string | null };

// service_requests + joins (UI)
type SRStatus = "pending" | "canceled" | "rejected" | "accepted";
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
type ShopRow = { shop_id: string; user_id: string; place_id: string | null };
type UserRow = {
  user_id: string;
  full_name: string | null;
  photo_url: string | null;
};
type PlaceRow = {
  place_id: string;
  name: string | null;
};
type SRUI = {
  service_id: string;
  user_id?: string; // UUID of shop owner (app_user.user_id)
  name: string;     // 🔵 Shop name from places
  avatar: string;
  distanceKm: number;
  status: SRStatus;
  offerDetails?: {
    distanceFee: string;
    laborCost: string;
    totalCost: string;
    notes?: string;
  };
};

type ShopOfferRow = {
  offer_id: string;
  service_id: string | null;
  emergency_id: string;
  shop_id: string;
  distance_km: number;
  rate_per_km: number;
  distance_fee: number;
  labor_cost: number;
  total_amount: number;
  note: string | null;
  created_at: string;
};


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
  in_process: "IN_PROCESS",
  completed: "COMPLETED",
  canceled: "CANCELED",
  cancelled: "CANCELED", // ✅ normalize to CANCELED for UI logic
};

async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const results = await Location.reverseGeocodeAsync({
      latitude: lat,
      longitude: lon,
    });
    if (results.length > 0) {
      const p = results[0];
      const addressParts = [
        p.name,
        p.street,
        p.district,
        p.city,
        p.region,
        p.postalCode,
        p.country,
      ].filter(Boolean);
      return addressParts.join(", ") || "Address not available";
    }
  } catch {}
  return "Unknown location";
}
function mapEmergencyToItem(
  r: EmergencyRow,
  profile?: AppUserRow | null
): RequestItem {
  const lat = r.latitude;
  const lon = r.longitude;

  return {
    id: r.emergency_id,
    name: profile?.full_name || "You",
    avatar: profile?.photo_url || AVATAR_PLACEHOLDER,
    vehicleType: r.vehicle_type,
    info: r.breakdown_cause || "—",
    landmark: "—",
    location: `(${lat.toFixed(5)}, ${lon.toFixed(5)})`,
    imageUrls: (r.attachments || []).filter(Boolean),
    dateTime: fmtDateTime(r.created_at),
    createdAtIso: r.created_at,            // 🔵 keep raw for logic
    status: statusMap[r.emergency_status],
    seen: r.emergency_status !== "waiting",
    sentWhen: timeAgo(r.created_at),
    lat,
    lon,
  };
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

function fmtDistance(km: number) {
  if (!Number.isFinite(km)) return "—";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

/** Title-case + remove underscores for UI display */
function prettyStatus(s: RequestStatus): string {
  if (s === "CANCELED") return "Cancelled"; // ✅ display preference
  return s
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// 🔵 Helper to open chat for an emergency
async function openChatForEmergency(emergencyId: string, router: any) {
  try {
    const { data, error } = await supabase
      .from("conversations")
      .select("id")
      .eq("emergency_id", emergencyId)
      .single();

    if (error || !data) {
      Alert.alert(
        "Chat Not Available",
        "Conversation will be created shortly. Please try again in a moment."
      );
      return;
    }

    router.push(`/driver/chat/${data.id}`);
  } catch (err) {
    console.error("[openChatForEmergency] Error:", err);
    Alert.alert("Error", "Could not open chat. Please try again.");
  }
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
  IN_PROCESS: {
    bg: "bg-emerald-50",
    border: "border-emerald-300/70",
    text: "text-emerald-700",
  },
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

const REQ_ROW_HEIGHT = 72;
const REQ_LIST_HEIGHT = REQ_ROW_HEIGHT * 2.5;

/* ----------------------------- Shared components ----------------------------- */
function SpinningGear({ size = 14, color = "#059669" /* emerald-600 */ }) {
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

/** Centered confirmation modal (matches mechanicLandingpage.tsx style) */
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
export default function RequestStatus() {
  const router = useRouter();
  const { emergency_id } = useLocalSearchParams<{ emergency_id?: string }>();

  const [items, setItems] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState<{
    visible: boolean;
    message?: string;
  }>({ visible: false });
  const [userId, setUserId] = useState<string | null>(null);

  // counts and lists only for PENDING
  const [reqCounts, setReqCounts] = useState<Record<string, number>>({});
  const [reqLists, setReqLists] = useState<Record<string, SRUI[] | undefined>>(
    {}
  );
  const [openCards, setOpenCards] = useState<Record<string, boolean>>({});
  const [revealedReject, setRevealedReject] = useState<Record<string, boolean>>(
    {}
  );
  const [reqLoading, setReqLoading] = useState<Record<string, boolean>>({});
  const [expandedOffers, setExpandedOffers] = useState<Record<string, boolean>>(
    {}
  );

  // confirm dialogs
  const [confirmReject, setConfirmReject] = useState<{
    serviceId: string;
    emergencyId: string;
  } | null>(null);
  const [confirmAccept, setConfirmAccept] = useState<{
    serviceId: string;
    emergencyId: string;
    userId?: string; // app_user uuid for accepted_by
  } | null>(null);

  // 🔵 NEW: confirm cancel & confirm hide
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [confirmHideId, setConfirmHideId] = useState<string | null>(null);

  const toggleCard = async (emId: string, emLat: number, emLon: number) => {
    const isOpening = !openCards[emId];
    setOpenCards((s) => ({ ...s, [emId]: isOpening }));
    if (isOpening && reqLists[emId] === undefined) {
      dbg("open card → fetch list", emId);
      await fetchSRListFor(emId, emLat, emLon);
    }
  };

  const toggleOfferExpanded = (serviceId: string) => {
    setExpandedOffers((prev) => ({
      ...prev,
      [serviceId]: !prev[serviceId],
    }));
  };

  /* ----------------------------- Data fetchers ----------------------------- */
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
          // Single view: show even if hidden (so deep-links still work)
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
          await fetchSRCounts([item.id]); // pending only
        } else {
          // List view: hide rows the driver "deleted"
          const { data: rows, error } = await supabase
            .from("emergency")
            .select("*")
            .eq("user_id", uid!)
            .eq("driver_hidden", false) // 🔵 NEW
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
          await fetchSRCounts(mapped.map((m) => m.id)); // pending only
        }
      } catch (e: any) {
        Alert.alert("Unable to load", e?.message ?? "Please try again.");
      } finally {
        if (withSpinner) setLoading({ visible: false });
      }
    },
    [emergency_id, userId]
  );

  // 🔴 counts of PENDING requests only
  const fetchSRCounts = useCallback(async (emergencyIds: string[]) => {
    if (emergencyIds.length === 0) return;
    const { data, error } = await supabase
      .from("service_requests")
      .select("emergency_id, service_id, status")
      .in("emergency_id", emergencyIds)
      .eq("status", "pending");
    if (error) return;

    const grp: Record<string, number> = {};
    (data as { emergency_id: string; service_id: string }[]).forEach((r) => {
      grp[r.emergency_id] = (grp[r.emergency_id] ?? 0) + 1;
    });
    setReqCounts((prev) => ({ ...prev, ...grp }));
  }, []);

  // 🔵 UPDATED: service_requests → shop_details → places (for shop name) + app_user (for avatar)
  const fetchSRListFor = useCallback(
    async (emergencyId: string, emLat: number, emLon: number) => {
      setReqLoading((m) => ({ ...m, [emergencyId]: true }));
      try {
        // 1) pending service_requests for this emergency
        const { data: rows, error } = await supabase
          .from("service_requests")
          .select(
            "service_id, emergency_id, shop_id, latitude, longitude, status, requested_at"
          )
          .eq("emergency_id", emergencyId)
          .eq("status", "pending")
          .order("requested_at", { ascending: false });

        if (error) {
          setReqLists((m) => ({ ...m, [emergencyId]: [] }));
          return;
        }

        const srRows = (rows as ServiceRequestRow[]) ?? [];

        // 2) shop_details -> user_id + place_id
        const shopIds = Array.from(new Set(srRows.map((r) => r.shop_id)));
        const { data: shops } = await supabase
          .from("shop_details")
          .select("shop_id, user_id, place_id")
          .in("shop_id", shopIds.length ? shopIds : ["shp-void"]);

        const shopToUser: Record<string, string> = {};
        const shopToPlace: Record<string, string> = {};
        (shops as ShopRow[] | null)?.forEach((s) => {
          shopToUser[s.shop_id] = s.user_id;
          if (s.place_id) shopToPlace[s.shop_id] = s.place_id;
        });

        // 3) app_user for avatar/name fallback
        const userIds = Array.from(new Set(Object.values(shopToUser)));
        let userMap: Record<string, UserRow> = {};
        if (userIds.length) {
          const { data: users } = await supabase
            .from("app_user")
            .select("user_id, full_name, photo_url")
            .in("user_id", userIds);
          (users as UserRow[] | null)?.forEach((u) => (userMap[u.user_id] = u));
        }

        // 4) places for shop display name
        const placeIds = Array.from(new Set(Object.values(shopToPlace)));
        let placeMap: Record<string, PlaceRow> = {};
        if (placeIds.length) {
          const { data: places } = await supabase
            .from("places")
            .select("place_id, name")
            .in("place_id", placeIds);
          (places as PlaceRow[] | null)?.forEach((p) => (placeMap[p.place_id] = p));
        }

        // 5) latest offer per service_id from shop_offers
        const serviceIds = srRows.map((r) => r.service_id);
        let latestOfferByService: Record<string, ShopOfferRow> = {};
        if (serviceIds.length) {
          const { data: offers } = await supabase
            .from("shop_offers")
            .select(
              "offer_id, service_id, emergency_id, shop_id, distance_km, rate_per_km, distance_fee, labor_cost, total_amount, note, created_at"
            )
            .in(
              "service_id",
              serviceIds.length ? serviceIds : ["00000000-0000-0000-0000-000000000000"]
            )
            .order("created_at", { ascending: false });

          (offers as ShopOfferRow[] | null)?.forEach((o) => {
            const key = o.service_id ?? "";
            if (key && !latestOfferByService[key]) latestOfferByService[key] = o;
          });
        }

        // 6) map to UI
        const list: SRUI[] = srRows.map((r) => {
          const uid = shopToUser[r.shop_id];
          const u = uid ? userMap[uid] : undefined;
          const placeId = shopToPlace[r.shop_id];
          const place = placeId ? placeMap[placeId] : undefined;

          const avatar = u?.photo_url || AVATAR_PLACEHOLDER;
          const name = place?.name || u?.full_name || "Auto Repair Shop";
          const distanceKm = haversineKm(emLat, emLon, r.latitude, r.longitude);

          const off = latestOfferByService[r.service_id];

          const offerDetails = off
            ? {
                distanceFee: `₱${off.distance_fee.toFixed(2)}`,
                laborCost: `₱${off.labor_cost.toFixed(2)}`,
                totalCost: `₱${off.total_amount.toFixed(2)}`,
                notes: off.note ?? undefined,
              }
            : undefined;

          return {
            service_id: r.service_id,
            user_id: uid,
            name,
            avatar,
            distanceKm,
            status: r.status,
            offerDetails,
          };
        });

        setReqLists((m) => ({ ...m, [emergencyId]: list }));
        setReqCounts((m) => ({ ...m, [emergencyId]: list.length }));
      } finally {
        setReqLoading((m) => ({ ...m, [emergencyId]: false }));
      }
    },
    []
  );

  // 🚫 Reject a single service request (confirm first)
  const rejectService = useCallback(
    async (serviceId: string, emergencyId: string) => {
      try {
        const { error } = await supabase
          .from("service_requests")
          .update({ status: "rejected", rejected_at: new Date().toISOString() })
          .eq("service_id", serviceId)
          .eq("emergency_id", emergencyId);

        if (error) throw error;

        // Optimistic UI
        setReqLists((prev) => {
          const cur = prev[emergencyId] ?? [];
          const next = cur.filter((r) => r.service_id !== serviceId);
          return { ...prev, [emergencyId]: next };
        });
        setReqCounts((prev) => ({
          ...prev,
          [emergencyId]: Math.max(0, (prev[emergencyId] ?? 1) - 1),
        }));
        setRevealedReject((prev) => {
          const p = { ...prev };
          delete p[serviceId];
          return p;
        });
      } catch (e: any) {
        Alert.alert("Reject failed", e?.message ?? "Please try again.");
      }
    },
    []
  );

  // Copy latest offer → payment_transaction if not already created
  async function ensurePaymentTransaction(
    emergencyId: string,
    serviceId: string
  ): Promise<void> {
    const { data: existing } = await supabase
      .from("payment_transaction")
      .select("transaction_id")
      .eq("emergency_id", emergencyId)
      .eq("service_id", serviceId)
      .maybeSingle();

    if (existing) return;

    const { data: offer, error: offErr } = await supabase
      .from("shop_offers")
      .select(
        "offer_id, emergency_id, service_id, shop_id, distance_km, rate_per_km, distance_fee, labor_cost, total_amount"
      )
      .eq("service_id", serviceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (offErr) throw offErr;
    if (!offer) throw new Error("No offer found for this request.");

    const { data: em } = await supabase
      .from("emergency")
      .select("user_id")
      .eq("emergency_id", emergencyId)
      .maybeSingle();

    const { error: insErr } = await supabase.from("payment_transaction").insert({
      emergency_id: emergencyId,
      service_id: serviceId,
      shop_id: offer.shop_id,
      driver_user_id: em?.user_id ?? null,
      offer_id: offer.offer_id,
      rate_per_km: offer.rate_per_km,
      distance_km: offer.distance_km,
      distance_fee: offer.distance_fee,
      labor_cost: offer.labor_cost,
      parts_cost: 0,
      total_amount: offer.total_amount,
      status: "pending",
    });

    if (insErr) throw insErr;
  }

  // ✅ Accept a service request (confirm first)
  const acceptService = useCallback(
    async (opts: { serviceId: string; emergencyId: string; userId?: string }) => {
      const { serviceId, emergencyId, userId: acceptedByUser } = opts;
      const now = new Date().toISOString();

      try {
        setLoading({ visible: true, message: "Accepting request…" });

        // 1) Mark service_request as accepted
        const { error: srErr } = await supabase
          .from("service_requests")
          .update({ status: "accepted", accepted_at: now })
          .eq("service_id", serviceId)
          .eq("emergency_id", emergencyId);
        if (srErr) throw srErr;

        // 2) Move emergency → in_process (+ accepted_by)
        const patch: any = { emergency_status: "in_process", accepted_at: now };
        if (acceptedByUser) patch.accepted_by = acceptedByUser;

        const { error: emErr } = await supabase
          .from("emergency")
          .update(patch)
          .eq("emergency_id", emergencyId);
        if (emErr) throw emErr;

        // 3) Ensure payment transaction
        await ensurePaymentTransaction(emergencyId, serviceId);

        // Optimistic UI
        setItems((prev) =>
          prev.map((it) =>
            it.id === emergencyId ? { ...it, status: "IN_PROCESS" } : it
          )
        );
        setReqLists((prev) => {
          const cur = prev[emergencyId] ?? [];
          const next = cur.filter((r) => r.service_id !== serviceId);
          return { ...prev, [emergencyId]: next };
        });
        setReqCounts((prev) => ({
          ...prev,
          [emergencyId]: Math.max(0, (prev[emergencyId] ?? 1) - 1),
        }));

        const em = items.find((i) => i.id === emergencyId);
        if (em) await fetchSRListFor(emergencyId, em.lat, em.lon);
      } catch (e: any) {
        Alert.alert("Accept failed", e?.message ?? "Please try again.");
      } finally {
        setLoading({ visible: false });
      }
    },
    [items, fetchSRListFor]
  );

  // 🔵 NEW: Cancel emergency (driver-initiated after 5 min no offers)
  const cancelEmergency = useCallback(async (emergencyId: string) => {
    try {
      setLoading({ visible: true, message: "Canceling emergency…" });
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("emergency")
        .update({ emergency_status: "canceled", canceled_at: now })
        .eq("emergency_id", emergencyId);
      if (error) throw error;

      // Optimistic UI
      setItems((prev) =>
        prev.map((it) =>
          it.id === emergencyId ? { ...it, status: "CANCELED" } : it
        )
      );
      setOpenCards((s) => ({ ...s, [emergencyId]: false }));
    } catch (e: any) {
      Alert.alert("Cancel failed", e?.message ?? "Please try again.");
    } finally {
      setLoading({ visible: false });
    }
  }, []);

  // 🔵 NEW: Hide completed emergency (soft delete)
  const hideEmergency = useCallback(
    async (emergencyId: string) => {
      try {
        setLoading({ visible: true, message: "Hiding from list…" });
        const patch: any = { driver_hidden: true };
        // If you added a timestamp column, also set it here:
        // patch.driver_hidden_at = new Date().toISOString();

        const { error } = await supabase
          .from("emergency")
          .update(patch)
          .eq("emergency_id", emergencyId);
        if (error) throw error;

        // Optimistic UI
        if (emergency_id) {
          // If viewing a single item, go back once hidden
          router.back();
        } else {
          setItems((prev) => prev.filter((it) => it.id !== emergencyId));
        }
      } catch (e: any) {
        Alert.alert("Hide failed", e?.message ?? "Please try again.");
      } finally {
        setLoading({ visible: false });
      }
    },
    [emergency_id, router]
  );

  /* ----------------------------- Realtime & lifecycle ----------------------------- */
  useEffect(() => {
    const channel = supabase
      .channel("sr-counts")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "service_requests" },
        (payload) => {
          const emId =
            (payload as any).new?.emergency_id ??
            (payload as any).old?.emergency_id;
          if (!emId) return;

          // refresh pending count
          fetchSRCounts([emId]);

          // if this card is open, refresh its list too (pending only)
          const opened = openCards[emId];
          const em = items.find((i) => i.id === emId);
          if (opened && em) fetchSRListFor(emId, em.lat, em.lon);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [openCards, items, fetchSRCounts, fetchSRListFor]);

  useEffect(() => {
    fetchItems(true);
  }, [fetchItems]);

  useEffect(() => {
    const id = setInterval(() => fetchItems(false), 15000);
    return () => clearInterval(id);
  }, [fetchItems]);

  /* -------------------------- Render helpers -------------------------- */
  const renderSRItem = (emId: string, it: SRUI) => {
    const blurred = !!revealedReject[it.service_id];
    const isExpanded = !!expandedOffers[it.service_id];

    return (
      <View
        key={it.service_id}
        className="relative py-3 border-b border-slate-200"
      >
        <Pressable
          onLongPress={() =>
            setRevealedReject((m) => ({ ...m, [it.service_id]: true }))
          }
          onPress={() => {
            if (blurred) {
              setRevealedReject((m) => ({ ...m, [it.service_id]: false }));
            } else {
              toggleOfferExpanded(it.service_id);
            }
          }}
          style={{ opacity: blurred ? 0.05 : 1 }}
        >
          <View className="flex-row items-start px-3">
            <Image
              source={{ uri: it.avatar }}
              className="w-10 h-10 rounded-full mt-1"
            />
            <View className="ml-3 flex-1">
              <View className="flex-row justify-between items-start">
                <View className="flex-1">
                  <Text
                    className="text-[15px] font-semibold text-slate-900 leading-5"
                    numberOfLines={2}
                  >
                    {it.name}
                  </Text>
                  <Text className="text-[13px] text-slate-500 mt-1">
                    {fmtDistance(it.distanceKm)} away
                  </Text>
                </View>
                <View className="flex-row items-center">
                  <Ionicons
                    name={isExpanded ? "chevron-up" : "chevron-down"}
                    size={16}
                    color="#64748B"
                    className="mr-2"
                  />
                  <Pressable
                    onPress={() =>
                      setConfirmAccept({
                        serviceId: it.service_id,
                        emergencyId: emId,
                        userId: it.user_id,
                      })
                    }
                    disabled={blurred}
                    className="rounded-xl py-2 px-4 bg-blue-600"
                  >
                    <Text className="text-white text-[13px] font-semibold">
                      Accept
                    </Text>
                  </Pressable>
                </View>
              </View>

              {/* Offer Details - Collapsible */}
              {isExpanded && it.offerDetails && (
                <View className="mt-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                  {it.offerDetails.notes && (
                    <View className="mb-3 pb-3 border-b border-slate-200">
                      <Text className="text-slate-600 text-xs font-medium mb-1">
                        Notes
                      </Text>
                      <Text className="text-slate-700 text-sm leading-5">
                        {it.offerDetails.notes}
                      </Text>
                    </View>
                  )}

                  <View className="space-y-2">
                    <View className="flex-row justify-between items-center">
                      <Text className="text-slate-600 text-sm">Distance Fee</Text>
                      <Text className="text-slate-900 text-sm font-medium">
                        {it.offerDetails.distanceFee}
                      </Text>
                    </View>

                    <View className="flex-row justify-between items-center">
                      <Text className="text-slate-600 text-sm">Labor Cost</Text>
                      <Text className="text-slate-900 text-sm font-medium">
                        {it.offerDetails.laborCost}
                      </Text>
                    </View>

                    <View className="flex-row justify-between items-center pt-2 border-t border-slate-300">
                      <Text className="text-slate-800 text-sm font-semibold">
                        Total Cost
                      </Text>
                      <Text className="text-slate-900 text-sm font-bold">
                        {it.offerDetails.totalCost}
                      </Text>
                    </View>
                  </View>
                </View>
              )}
            </View>
          </View>
        </Pressable>

        {blurred && (
          <View className="absolute inset-0 items-center justify-center">
            <Pressable
              onPress={() =>
                setConfirmReject({
                  serviceId: it.service_id,
                  emergencyId: emId,
                })
              }
              className="rounded-2xl px-5 py-2 bg-rose-600"
            >
              <Text className="text-white text-[13px] font-semibold">
                Reject
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  const PlaceholderRow = ({ idx }: { idx: number }) => (
    <View
      key={`ph-${idx}`}
      style={{
        height: REQ_ROW_HEIGHT,
        borderBottomWidth: 1,
        borderBottomColor: "#E5E7EB",
      }}
      className="flex-row items-center px-3 opacity-50"
    >
      <View className="w-10 h-10 rounded-full bg-slate-200" />
      <View className="ml-3 flex-1">
        <View className="h-4 w-32 rounded bg-slate-200 mb-1" />
        <View className="h-3 w-24 rounded bg-slate-200" />
      </View>
      <View className="rounded-xl py-1.5 px-6 bg-slate-200" />
    </View>
  );

  const renderSRList = (em: RequestItem) => {
    const list = reqLists[em.id];
    const isLoading = reqLoading[em.id] || list === undefined;
    const real = list ?? [];

    return (
      <View className="mt-3 rounded-2xl border border-slate-200 overflow-hidden bg-white">
        <View className="px-4 py-3 bg-slate-50 border-b border-slate-200">
          <Text className="text-[13px] font-medium text-slate-700">
            Service Requests {reqCounts[em.id] ? `(${reqCounts[em.id]})` : ""}
          </Text>
        </View>

        <View style={{ height: REQ_LIST_HEIGHT }}>
          {isLoading ? (
            <View className="flex-1">
              {Array.from({ length: 3 }).map((_, i) => (
                <PlaceholderRow key={i} idx={i} />
              ))}
            </View>
          ) : real.length > 0 ? (
            <ScrollView
              contentContainerStyle={{ paddingVertical: 8 }}
              nestedScrollEnabled
              showsVerticalScrollIndicator
            >
              {real.map((row) => renderSRItem(em.id, row))}
            </ScrollView>
          ) : (
            <View className="flex-1 items-center justify-center py-8">
              <Ionicons name="build-outline" size={32} color="#94A3B8" />
              <Text className="text-[14px] text-slate-500 mt-2">
                No requests yet
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  // ⬇️ place this right after renderSRList(...)
const renderItem = ({ item }: { item: RequestItem }) => {
  const waiting = item.status === "WAITING";
  const inProcess = item.status === "IN_PROCESS";
  const completed = item.status === "COMPLETED";
  const canceled  = item.status === "CANCELED"; // normalized value
  const isOpen = !!openCards[item.id];

  // Show "Cancel" if: waiting, age ≥ 5 min, and no pending requests
  const ageMs = Date.now() - new Date(item.createdAtIso).getTime();
  const hasPending = (reqCounts[item.id] ?? 0) > 0;
  const canCancel = waiting && !hasPending && ageMs >= 5 * 60 * 1000;

  return (
    <Pressable
      onPress={() => toggleCard(item.id, item.lat, item.lon)}
      className="bg-white rounded-2xl p-5 mb-4 border border-slate-200 relative"
      style={cardShadow as any}
    >
      {/* Trash on completed OR canceled (soft-hide) */}
      {(completed || canceled) && (
        <View className="absolute top-3 right-3">
          <Pressable
            onPress={() => setConfirmHideId(item.id)}
            hitSlop={8}
            className="p-1 rounded-full"
          >
            <Ionicons name="trash-outline" size={20} color="#64748B" />
          </Pressable>
        </View>
      )}

      <View className="flex-row items-center">
        <Image source={{ uri: item.avatar }} className="w-12 h-12 rounded-full" />
        <View className="ml-3 flex-1">
          <Text className="text-[17px] font-semibold text-slate-900" numberOfLines={1}>
            {item.name}
          </Text>
          <Text className="text-[13px] text-slate-500 mt-0.5">
            Emergency Request • {item.vehicleType}
          </Text>
        </View>
      </View>

      <View className="h-px bg-slate-200 my-4" />

      {/* Driver Info */}
      <View className="space-y-3">
        {item.info && item.info !== "—" && (
          <View className="flex-row items-start">
            <Ionicons name="document-text-outline" size={16} color="#64748B" className="mt-0.5" />
            <View className="ml-3 flex-1">
              <Text className="text-slate-600 text-sm font-medium">Driver Notes</Text>
              <Text className="text-slate-800 text-sm mt-0.5 leading-5">{item.info}</Text>
            </View>
          </View>
        )}

        <View className="flex-row items-start">
          <Ionicons name="location-outline" size={16} color="#64748B" className="mt-0.5" />
          <View className="ml-3 flex-1">
            <Text className="text-slate-600 text-sm font-medium">Landmark</Text>
            <Text className="text-slate-800 text-sm mt-0.5 leading-5">{item.landmark}</Text>
          </View>
        </View>

        <View className="flex-row items-start">
          <Ionicons name="map-outline" size={16} color="#64748B" className="mt-0.5" />
          <View className="ml-3 flex-1">
            <Text className="text-slate-600 text-sm font-medium">Location</Text>
            <Text className="text-slate-800 text-sm mt-0.5">{item.location}</Text>
          </View>
        </View>

        <View className="flex-row items-start">
          <Ionicons name="calendar-outline" size={16} color="#64748B" className="mt-0.5" />
          <View className="ml-3 flex-1">
            <Text className="text-slate-600 text-sm font-medium">Date & Time</Text>
            <Text className="text-slate-800 text-sm mt-0.5">{item.dateTime}</Text>
          </View>
        </View>
      </View>

      <View className="h-px bg-slate-200 my-4" />

      <View className="flex-row items-center justify-between">
        <View
          className={`rounded-full px-3 py-1.5 border self-start flex-row items-center ${
            STATUS_STYLES[item.status].bg ?? ""
          } ${STATUS_STYLES[item.status].border ?? ""}`}
        >
          {item.status === "IN_PROCESS" ? (
            <View className="mr-1.5">
              <SpinningGear size={12} />
            </View>
          ) : null}
          <Text
            className={`text-[12px] font-medium ${
              STATUS_STYLES[item.status].text ?? "text-slate-800"
            }`}
          >
            {prettyStatus(item.status)}
          </Text>
        </View>

        {inProcess && (
          <Pressable
            onPress={() => openChatForEmergency(item.id, router)}
            className="flex-row items-center bg-blue-600 rounded-xl px-4 py-2"
          >
            <Ionicons name="chatbubbles" size={14} color="#FFF" />
            <Text className="text-white text-[13px] font-semibold ml-1.5">Message</Text>
          </Pressable>
        )}

        {!inProcess &&
          (canCancel ? (
            <Pressable
              onPress={() => setConfirmCancelId(item.id)}
              className="flex-row items-center bg-rose-600 rounded-xl px-4 py-2"
            >
              <Ionicons name="close-circle" size={14} color="#FFF" />
              <Text className="text-white text-[13px] font-semibold ml-1.5">Cancel</Text>
            </Pressable>
          ) : (
            <Text className="text-[13px] text-slate-400">Sent {item.sentWhen}</Text>
          ))}
      </View>

      {waiting && isOpen ? renderSRList(item) : null}
    </Pressable>
  );
};


  return (
    <SafeAreaView className="flex-1 bg-[#F4F6F8]">
      <View className="flex-row items-center justify-between px-4 py-3 bg-white border-b border-slate-200">
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
          <View className="px-6 pt-16 items-center">
            <Ionicons name="document-text-outline" size={48} color="#94A3B8" />
            <Text className="text-center text-slate-500 mt-4 text-[15px]">
              {emergency_id
                ? "Loading or no record found."
                : "No emergency requests to show."}
            </Text>
          </View>
        }
      />

      {/* Confirm: Reject */}
      <CenterConfirm
        visible={!!confirmReject}
        title="Reject this request?"
        message="This will remove the mechanic's request from your list."
        onCancel={() => setConfirmReject(null)}
        onConfirm={() => {
          if (confirmReject) {
            rejectService(confirmReject.serviceId, confirmReject.emergencyId);
            setConfirmReject(null);
          }
        }}
        confirmLabel="Reject"
        cancelLabel="Back"
        confirmColor="#DC2626"
      />

      {/* Confirm: Accept */}
      <CenterConfirm
        visible={!!confirmAccept}
        title="Accept this request?"
        message="The mechanic will be notified, wait for them to arrive."
        onCancel={() => setConfirmAccept(null)}
        onConfirm={() => {
          if (confirmAccept) {
            acceptService({
              serviceId: confirmAccept.serviceId,
              emergencyId: confirmAccept.emergencyId,
              userId: confirmAccept.userId,
            });
            setConfirmAccept(null);
          }
        }}
        confirmLabel="Accept"
        cancelLabel="Back"
        confirmColor="#2563EB"
      />

      {/* 🔵 Confirm: Cancel emergency */}
      <CenterConfirm
        visible={!!confirmCancelId}
        title="Cancel this emergency?"
        message="No shop offers were received within 5 minutes. You can cancel now."
        onCancel={() => setConfirmCancelId(null)}
        onConfirm={() => {
          if (confirmCancelId) {
            cancelEmergency(confirmCancelId);
            setConfirmCancelId(null);
          }
        }}
        confirmLabel="Cancel Emergency"
        cancelLabel="Back"
        confirmColor="#DC2626"
      />

      {/* 🔵 Confirm: Hide completed emergency */}
      <CenterConfirm
        visible={!!confirmHideId}
        title="Delete request from your list?"
        message="Note: You cannot view this again once deleted."
        onCancel={() => setConfirmHideId(null)}
        onConfirm={() => {
          if (confirmHideId) {
            hideEmergency(confirmHideId);
            setConfirmHideId(null);
          }
        }}
        confirmLabel="Delete"
        cancelLabel="Back"
        confirmColor="#475569"
      />

      <LoadingScreen
        visible={loading.visible}
        message={loading.message}
        variant="spinner"
      />
    </SafeAreaView>
  );
}