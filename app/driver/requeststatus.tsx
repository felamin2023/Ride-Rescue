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
  acceptedBy?: string | null;
  serviceType: "vulcanize" | "repair" | "gas" | null;
  fuelType: string | null;
  customFuelType: string | null;
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
  driver_hidden: boolean;
  service_type: "vulcanize" | "repair" | "gas" | null;
  fuel_type: string | null;
  custom_fuel_type: string | null;
};

type AppUserRow = { full_name: string | null; photo_url: string | null };

// service_requests + joins (UI)
type SRStatus = "pending" | "canceled" | "rejected" | "accepted";
type ServiceRequestRow = {
  service_id: string; // assume non-null in your schema
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
  name: string;     // Shop name from places
  avatar: string;
  distanceKm: number;
  status: SRStatus;
  offerDetails?: {
    distanceFee: string;
    laborCost: string;
    fuelCost: string; // Added fuel cost
    totalCost: string;
    notes?: string;
  } | null; // can be null to render the fallback panel
};

type ShopOfferRow = {
  offer_id: string;
  service_id: string | null;
  emergency_id: string;
  shop_id: string;
  distance_km: number | string;
  rate_per_km: number | string;
  distance_fee: number | string;
  labor_cost: number | string;
  fuel_cost: number | string; // Added fuel cost
  total_amount: number | string;
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
  cancelled: "CANCELED",
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
    createdAtIso: r.created_at,
    status: statusMap[r.emergency_status],
    seen: r.emergency_status !== "waiting",
    sentWhen: timeAgo(r.created_at),
    lat,
    lon,
    acceptedBy: r.accepted_by ?? null,
    serviceType: r.service_type,
    fuelType: r.fuel_type,
    customFuelType: r.custom_fuel_type,
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
  if (s === "CANCELED") return "Cancelled";
  return s
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Service type display
function getServiceTypeLabel(serviceType: "vulcanize" | "repair" | "gas" | null): string {
  switch (serviceType) {
    case "vulcanize": return "Vulcanize";
    case "repair": return "Repair";
    case "gas": return "Gas";
    default: return "—";
  }
}

// Fuel type display
function getFuelTypeDisplay(fuelType: string | null, customFuelType: string | null): string {
  if (!fuelType) return "—";
  if (fuelType === "Others" && customFuelType) {
    return `Others: ${customFuelType}`;
  }
  return fuelType;
}

// Chat opener (unchanged)
async function openChatForEmergency(emergencyId: string, router: any) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      Alert.alert("Error", "You need to be logged in.");
      return;
    }

    const { data: emergency, error: emError } = await supabase
      .from("emergency")
      .select("accepted_by")
      .eq("emergency_id", emergencyId)
      .single();

    if (emError || !emergency) {
      Alert.alert("Error", "Emergency not found.");
      return;
    }

    const shopOwnerUserId = emergency.accepted_by;
    if (!shopOwnerUserId) {
      Alert.alert("Error", "No shop has accepted this emergency yet.");
      return;
    }

    const { data: existingConvs } = await supabase
      .from("conversations")
      .select(`
        id,
        emergency_id,
        customer_id,
        driver_id,
        shop_place_id
      `)
      .or(`and(customer_id.eq.${user.id},driver_id.eq.${shopOwnerUserId}),and(customer_id.eq.${shopOwnerUserId},driver_id.eq.${user.id})`)
      .order("updated_at", { ascending: false });

    let conversationId: string | undefined;
    const existingConv = existingConvs && existingConvs.length > 0 ? existingConvs[0] : null;

    if (existingConv) {
      conversationId = existingConv.id;
      if (!existingConv.emergency_id || existingConv.emergency_id !== emergencyId) {
        await supabase
          .from("conversations")
          .update({ emergency_id: emergencyId, updated_at: new Date().toISOString() })
          .eq("id", conversationId);
      }
    } else {
      const { data: newConv, error } = await supabase
        .from("conversations")
        .insert({
          emergency_id: emergencyId,
          customer_id: user.id,
          driver_id: shopOwnerUserId,
        })
        .select()
        .single();
      if (error) {
        Alert.alert("Error", "Could not start conversation.");
        return;
      }
      conversationId = newConv.id;
    }

    if (conversationId) router.push(`/driver/chat/${conversationId}`);
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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.35)" }}>
        <View className="w-11/12 max-w-md rounded-2xl bg-white p-5" style={cardShadow as any}>
          <View className="items-center mb-2">
            <Ionicons name="alert-circle-outline" size={28} color={confirmColor} />
          </View>
          <Text className="text-lg font-semibold text-slate-900 text-center">{title}</Text>
          {message ? (
            <Text className="mt-2 text-[14px] text-slate-600 text-center">{message}</Text>
          ) : null}
          <View className="mt-5 flex-row gap-10">
            <Pressable onPress={onCancel} className="flex-1 rounded-2xl border border-slate-300 py-2.5 items-center">
              <Text className="text-[14px] text-slate-900">{cancelLabel}</Text>
            </Pressable>
            <Pressable onPress={onConfirm} className="flex-1 rounded-2xl py-2.5 items-center" style={{ backgroundColor: confirmColor }}>
              <Text className="text-[14px] text-white font-semibold">{confirmLabel}</Text>
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
  const [loading, setLoading] = useState<{ visible: boolean; message?: string }>({ visible: false });
  const [userId, setUserId] = useState<string | null>(null);

  // counts and lists only for PENDING
  const [reqCounts, setReqCounts] = useState<Record<string, number>>({});
  const [reqLists, setReqLists] = useState<Record<string, SRUI[] | undefined>>({});
  const [openCards, setOpenCards] = useState<Record<string, boolean>>({});
  const [revealedReject, setRevealedReject] = useState<Record<string, boolean>>({});
  const [reqLoading, setReqLoading] = useState<Record<string, boolean>>({});
  const [expandedOffers, setExpandedOffers] = useState<Record<string, boolean>>({});

  // confirms
  const [confirmReject, setConfirmReject] = useState<{ serviceId: string; emergencyId: string } | null>(null);
  const [confirmAccept, setConfirmAccept] = useState<{ serviceId: string; emergencyId: string; userId?: string } | null>(null);
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
    setExpandedOffers((prev) => ({ ...prev, [serviceId]: !prev[serviceId] }));
  };

  /* ----------------------------- Data fetchers ----------------------------- */
  const fetchItems = useCallback(
    async (withSpinner: boolean) => {
      try {
        if (withSpinner) setLoading({ visible: true, message: "Loading requests…" });

        // Ensure auth
        let uid = userId;
        if (!uid) {
          const { data: auth, error: authErr } = await supabase.auth.getUser();
          if (authErr || !auth.user) throw new Error("Please sign in.");
          uid = auth.user.id;
          setUserId(uid);
        }

        if (emergency_id) {
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
          await fetchSRCounts([item.id]);
        } else {
          const { data: rows, error } = await supabase
            .from("emergency")
            .select("*")
            .eq("user_id", uid!)
            .eq("driver_hidden", false)
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
          await fetchSRCounts(mapped.map((m) => m.id));
        }
      } catch (e: any) {
        Alert.alert("Unable to load", e?.message ?? "Please try again.");
      } finally {
        if (withSpinner) setLoading({ visible: false });
      }
    },
    [emergency_id, userId]
  );

  // counts of PENDING requests only
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

  // service_requests → shop_details → places + app_user → latest shop_offers
  // with robust latest-per-key picking & a visible fallback panel
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
        dbg("SR rows:", srRows.length);

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

        // ---------- OFFERS (primary: by service_id) ----------
        const serviceIds = srRows.map((r) => r.service_id).filter(Boolean);
        let latestOfferByService: Record<string, ShopOfferRow> = {};
        if (serviceIds.length) {
          const { data: offersByService } = await supabase
            .from("shop_offers")
            .select(
              "offer_id, emergency_id, service_id, shop_id, distance_km, rate_per_km, distance_fee, labor_cost, fuel_cost, total_amount, note, created_at"
            )
            .in("service_id", serviceIds)
            .order("created_at", { ascending: false });

          (offersByService as ShopOfferRow[] | null)?.forEach((o) => {
            const key = o.service_id ?? "";
            if (!key) return;
            const prev = latestOfferByService[key];
            if (!prev || new Date(o.created_at) > new Date(prev.created_at)) {
              latestOfferByService[key] = o;
            }
          });
        }

        // ---------- FALLBACK OFFERS (by emergency_id + shop_id where service_id is NULL) ----------
        let latestOfferByShop: Record<string, ShopOfferRow> = {};
        if (shopIds.length) {
          const { data: offersByShop } = await supabase
            .from("shop_offers")
            .select(
              "offer_id, emergency_id, service_id, shop_id, distance_km, rate_per_km, distance_fee, labor_cost, fuel_cost, total_amount, note, created_at"
            )
            .eq("emergency_id", emergencyId)
            .is("service_id", null)
            .in("shop_id", shopIds)
            .order("created_at", { ascending: false });

          (offersByShop as ShopOfferRow[] | null)?.forEach((o) => {
            const key = o.shop_id;
            const prev = latestOfferByShop[key];
            if (!prev || new Date(o.created_at) > new Date(prev.created_at)) {
              latestOfferByShop[key] = o;
            }
          });
        }

        dbg("Offers found → byService:", Object.keys(latestOfferByService).length, "byShop(NULL sid):", Object.keys(latestOfferByShop).length);

        // 6) map to UI
        const list: SRUI[] = srRows.map((r) => {
          const uid = shopToUser[r.shop_id];
          const u = uid ? userMap[uid] : undefined;
          const placeId = shopToPlace[r.shop_id];
          const place = placeId ? placeMap[placeId] : undefined;

          const avatar = u?.photo_url || AVATAR_PLACEHOLDER;
          const name = place?.name || u?.full_name || "Auto Repair Shop";
          const distanceKm = haversineKm(emLat, emLon, r.latitude, r.longitude);

          // Prefer by service_id; fallback to (emergency_id, shop_id, service_id NULL)
          const offer =
            latestOfferByService[r.service_id] || latestOfferByShop[r.shop_id];

          const offerDetails: SRUI["offerDetails"] =
            offer
              ? {
                  distanceFee: `₱${Number(offer.distance_fee).toFixed(2)}`,
                  laborCost: `₱${Number(offer.labor_cost).toFixed(2)}`,
                  fuelCost: `₱${Number(offer.fuel_cost ?? 0).toFixed(2)}`,
                  totalCost: `₱${Number(offer.total_amount).toFixed(2)}`,
                  notes: offer.note ?? undefined,
                }
              : null;

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
      } catch (err) {
        console.error("[fetchSRListFor] error:", err);
        setReqLists((m) => ({ ...m, [emergencyId]: [] }));
      } finally {
        setReqLoading((m) => ({ ...m, [emergencyId]: false }));
      }
    },
    []
  );

  // Reject a single service request
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
  // ✅ UPDATED: Now properly includes fuel_cost for gas emergencies
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
      "offer_id, emergency_id, service_id, shop_id, distance_km, rate_per_km, distance_fee, labor_cost, fuel_cost, total_amount"
    )
    .eq("service_id", serviceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (offErr) throw offErr;
  if (!offer) throw new Error("No offer found for this request.");

  // Get emergency details to check service type
  const { data: em } = await supabase
    .from("emergency")
    .select("user_id, service_type")
    .eq("emergency_id", emergencyId)
    .maybeSingle();

  // ✅ CRITICAL FIX: For gas emergencies, ensure fuel_cost is properly set
  // For non-gas emergencies, fuel_cost should be 0
  const isGasEmergency = em?.service_type === 'gas';
  const fuelCost = isGasEmergency ? Number(offer.fuel_cost ?? 0) : 0;
  
  // For gas emergencies, labor_cost should be 0, and vice versa
  const laborCost = isGasEmergency ? 0 : Number(offer.labor_cost ?? 0);

  // 🔥 FIX: Use correct column names that match your schema
  const { error: insErr } = await supabase.from("payment_transaction").insert({
    emergency_id: emergencyId,
    service_id: serviceId,
    shop_id: offer.shop_id,
    driver_user_id: em?.user_id ?? null,
    offer_id: offer.offer_id,
    rate_per_km: offer.rate_per_km,
    distance_km: offer.distance_km,
    distance_fee: offer.distance_fee,
    labor_cost: laborCost, // 0 for gas emergencies
    fuel_cost: fuelCost,   // Actual value for gas emergencies, 0 for others
    parts_cost: 0,
    total_amount: offer.total_amount,
    status: "pending",
  });

  if (insErr) throw insErr;
}
  // ✅ FIXED: Remove automatic conversation creation from acceptService
const acceptService = useCallback(
  async (opts: {
    serviceId: string;
    emergencyId: string;
    userId?: string;
  }) => {
    const { serviceId, emergencyId, userId: acceptedByUser } = opts;
    const now = new Date().toISOString();

      try {
        setLoading({ visible: true, message: "Accepting request…" });

      console.log("🟢 [ACCEPT] Starting accept process");
      console.log("🟢 [ACCEPT] Service ID:", serviceId);
      console.log("🟢 [ACCEPT] Emergency ID:", emergencyId);

      // ════════════════════════════════════════════════════════════════
      // CRITICAL: Get authenticated user FIRST to verify auth context
      // ════════════════════════════════════════════════════════════════
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        console.error("🔴 [ACCEPT ERROR] Authentication failed:", authError);
        throw new Error("You must be logged in to accept requests");
      }

      console.log("🟢 [ACCEPT] Authenticated driver:", user.id);

      // ════════════════════════════════════════════════════════════════
      // Get driver's name for notifications
      // ════════════════════════════════════════════════════════════════
      const { data: driverProfile, error: profileError } = await supabase
        .from("app_user")
        .select("full_name")
        .eq("user_id", user.id)
        .single();

      if (profileError) {
        console.warn("🟡 [ACCEPT] Failed to fetch driver profile:", profileError);
      }

      const driverName = driverProfile?.full_name || "a driver";
      console.log("🟢 [ACCEPT] Driver name:", driverName);

      // ════════════════════════════════════════════════════════════════
      // Get ALL service requests for this emergency BEFORE any updates
      // ════════════════════════════════════════════════════════════════
      console.log("🟢 [ACCEPT] Fetching ALL service requests for emergency...");
      const { data: allServiceRequests, error: srError } = await supabase
        .from("service_requests")
        .select("service_id, shop_id, status")
        .eq("emergency_id", emergencyId)
        .eq("status", "pending"); // Only get pending requests

      if (srError) {
        console.error("🔴 [ACCEPT ERROR] Failed to fetch service requests:", srError);
        throw new Error(`Failed to fetch service requests: ${srError.message}`);
      }

      console.log("🟢 [ACCEPT] Found service requests:", allServiceRequests);

      if (!allServiceRequests || allServiceRequests.length === 0) {
        throw new Error("No pending service requests found");
      }

      // ════════════════════════════════════════════════════════════════
      // Fetch shop details for ALL shops at once (performance optimization)
      // ════════════════════════════════════════════════════════════════
      const shopIds = allServiceRequests.map(sr => sr.shop_id);
      const { data: allShopDetails, error: shopError } = await supabase
        .from("shop_details")
        .select("shop_id, user_id")
        .in("shop_id", shopIds);

      if (shopError) {
        console.error("🔴 [ACCEPT ERROR] Failed to fetch shop details:", shopError);
        throw new Error(`Failed to fetch shop details: ${shopError.message}`);
      }

      // Create map for quick lookup: shop_id -> user_id
      const shopOwnerMap = new Map<string, string>();
      allShopDetails?.forEach(shop => {
        if (shop.shop_id && shop.user_id) {
          shopOwnerMap.set(shop.shop_id, shop.user_id);
        }
      });

      console.log("🟢 [ACCEPT] Shop owner mapping:", Object.fromEntries(shopOwnerMap));

      // ════════════════════════════════════════════════════════════════
      // Update the accepted service request
      // ════════════════════════════════════════════════════════════════
      console.log("🟢 [ACCEPT] Updating service request status to 'accepted'...");
      const { error: srErr } = await supabase
        .from("service_requests")
        .update({ status: "accepted", accepted_at: now })
        .eq("service_id", serviceId)
        .eq("emergency_id", emergencyId);
      
      if (srErr) {
        console.error("🔴 [ACCEPT ERROR] Failed to update service request:", srErr);
        throw srErr;
      }
      console.log("✅ [ACCEPT] Service request marked as accepted");

      // ════════════════════════════════════════════════════════════════
      // Update emergency status
      // ════════════════════════════════════════════════════════════════
      const emergencyPatch: Partial<EmergencyRow> & any = {
        emergency_status: "in_process",
        accepted_at: now,
      };
      if (acceptedByUser) {
        emergencyPatch.accepted_by = acceptedByUser;
      }

      console.log("🟢 [ACCEPT] Updating emergency status to 'in_process'...");
      const { error: emErr } = await supabase
        .from("emergency")
        .update(emergencyPatch)
        .eq("emergency_id", emergencyId);
      
      if (emErr) {
        console.error("🔴 [ACCEPT ERROR] Failed to update emergency:", emErr);
        throw emErr;
      }
      console.log("✅ [ACCEPT] Emergency marked as in_process");

      // ════════════════════════════════════════════════════════════════
      // ✅ CRITICAL: Create payment transaction with fuel cost for gas emergencies
      // ════════════════════════════════════════════════════════════════
      console.log("🟢 [PAYMENT] Creating payment transaction...");
      await ensurePaymentTransaction(emergencyId, serviceId);
      console.log("✅ [PAYMENT] Payment transaction created with fuel cost");

      // ════════════════════════════════════════════════════════════════
      // Send notifications to all shops
      // ════════════════════════════════════════════════════════════════
      console.log("🟢 [NOTIFICATION] Starting notification process...");

      // Track results for debugging
      const notificationResults: Array<{
        serviceId: string;
        shopId: string;
        type: "accepted" | "rejected";
        success: boolean;
        error?: string;
      }> = [];

      // Process EACH service request and send appropriate notification
      for (const request of allServiceRequests) {
        const shopOwnerId = shopOwnerMap.get(request.shop_id);

        if (!shopOwnerId) {
          console.error("🔴 [NOTIFICATION ERROR] No shop owner found for shop:", request.shop_id);
          notificationResults.push({
            serviceId: request.service_id,
            shopId: request.shop_id,
            type: request.service_id === serviceId ? "accepted" : "rejected",
            success: false,
            error: "Shop owner not found",
          });
          continue;
        }

        // Determine if this is the accepted or rejected shop
        const isAccepted = request.service_id === serviceId;
        const notificationType = isAccepted ? "accepted" : "rejected";

        console.log(`🟢 [NOTIFICATION] Processing ${notificationType.toUpperCase()} shop:`, {
          serviceId: request.service_id,
          shopId: request.shop_id,
          shopOwnerId,
        });

        // Prepare notification data
        const notificationData = isAccepted
          ? {
              from_user_id: user.id, // CRITICAL: Must match auth.uid()
              to_user_id: shopOwnerId,
              type: "service_request_accepted",
              title: "Offer Accepted! 🎉",
              body: `Your offer has been accepted by ${driverName}. You may now proceed to the location.`,
              data: {
                emergency_id: emergencyId,
                service_id: serviceId,
                driver_name: driverName,
                event: "driver_accepted_offer",
              },
            }
          : {
              from_user_id: user.id, // CRITICAL: Must match auth.uid()
              to_user_id: shopOwnerId,
              type: "service_request_rejected",
              title: "Request Closed",
              body: `${driverName} has accepted another mechanic's offer. Thank you for your willingness to help!`,
              data: {
                emergency_id: emergencyId,
                service_id: request.service_id,
                driver_name: driverName,
                event: "driver_chose_another_mechanic",
              },
            };

        console.log(`🟢 [NOTIFICATION] Inserting ${notificationType} notification:`, {
          from: user.id,
          to: shopOwnerId,
          type: notificationData.type,
        });

        // Insert notification with .select() to catch silent failures
        const { data: notifData, error: notifError } = await supabase
          .from("notifications")
          .insert(notificationData)
          .select(); // CRITICAL: Returns inserted row, exposes RLS errors

        if (notifError) {
          console.error(`🔴 [NOTIFICATION ERROR] ${notificationType} notification failed:`, {
            error: notifError,
            code: notifError.code,
            message: notifError.message,
            details: notifError.details,
            hint: notifError.hint,
          });

          // Provide helpful error messages for common RLS errors
          if (notifError.code === "42501") {
            console.error("🔴 [RLS ERROR] Row-level security policy blocked this insert.");
            console.error("🔴 [RLS ERROR] Check that:");
            console.error("   1. RLS policy allows INSERT where from_user_id = auth.uid()");
            console.error("   2. auth.uid() matches:", user.id);
            console.error("   3. Policy uses WITH CHECK clause, not just USING");
          }

          notificationResults.push({
            serviceId: request.service_id,
            shopId: request.shop_id,
            type: notificationType as "accepted" | "rejected",
            success: false,
            error: notifError.message,
          });
        } else if (!notifData || notifData.length === 0) {
          console.error(`🔴 [NOTIFICATION ERROR] ${notificationType} notification returned no data (possible RLS block)`);
          notificationResults.push({
            serviceId: request.service_id,
            shopId: request.shop_id,
            type: notificationType as "accepted" | "rejected",
            success: false,
            error: "No data returned - RLS may be blocking",
          });
        } else {
          console.log(`✅ [NOTIFICATION SUCCESS] ${notificationType} notification created:`, notifData[0]);
          notificationResults.push({
            serviceId: request.service_id,
            shopId: request.shop_id,
            type: notificationType as "accepted" | "rejected",
            success: true,
          });
        }

        // If rejected, update the service request status
        if (!isAccepted) {
          const { error: updateError } = await supabase
            .from("service_requests")
            .update({ 
              status: "rejected", 
              rejected_at: now,
            })
            .eq("service_id", request.service_id);

          if (updateError) {
            console.error("🔴 [NOTIFICATION ERROR] Failed to update rejected service request:", updateError);
          }
        }
      }

      // ════════════════════════════════════════════════════════════════
      // Log notification summary
      // ════════════════════════════════════════════════════════════════
      const successCount = notificationResults.filter(r => r.success).length;
      const failCount = notificationResults.filter(r => !r.success).length;

      console.log("🟢 [NOTIFICATION SUMMARY]", {
        total: notificationResults.length,
        successful: successCount,
        failed: failCount,
        results: notificationResults,
      });

      // Check if accepted notification failed (critical)
      const acceptedNotifFailed = notificationResults.find(
        r => r.type === "accepted" && !r.success
      );

      if (acceptedNotifFailed) {
        console.warn("⚠️ [CRITICAL WARNING] Accepted notification failed to send");
        Alert.alert(
          "Partial Success",
          "Request accepted, but the mechanic may not have been notified. Please contact them directly.",
          [{ text: "OK" }]
        );
      } else if (failCount > 0) {
        console.warn(`⚠️ [WARNING] ${failCount} notification(s) failed to send`);
      }

      // ════════════════════════════════════════════════════════════════
      // Update optimistic UI
      // ════════════════════════════════════════════════════════════════
      setItems((prev) =>
        prev.map((it) =>
          it.id === emergencyId
            ? {
                ...it,
                status: "IN_PROCESS",
                acceptedBy: acceptedByUser ?? it.acceptedBy ?? null,
              }
            : it
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

      // Refresh from server to ensure consistency
      const em = items.find((i) => i.id === emergencyId);
      if (em) {
        await fetchSRListFor(emergencyId, em.lat, em.lon);
      }

      console.log("✅ [ACCEPT] Accept process completed successfully");

    } catch (e: any) {
      console.error("🔴 [ACCEPT ERROR] Accept process failed:", {
        error: e,
        message: e?.message,
        stack: e?.stack,
      });
      
      Alert.alert(
        "Accept failed",
        e?.message || "An unexpected error occurred. Please try again."
      );
    } finally {
      setLoading({ visible: false });
    }
  },
  [items, fetchSRListFor, setItems, setReqLists, setReqCounts, setLoading]
);

  const cancelEmergency = useCallback(async (emergencyId: string) => {
    try {
      setLoading({ visible: true, message: "Cancelling emergency…" });

      const { error } = await supabase
        .from("emergency")
        .update({
          emergency_status: "canceled",
          canceled_at: new Date().toISOString(),
        })
        .eq("emergency_id", emergencyId);

      if (error) throw error;

      setItems((prev) =>
        prev.map((item) => (item.id === emergencyId ? { ...item, status: "CANCELED" } : item))
      );
      setOpenCards((prev) => ({ ...prev, [emergencyId]: false }));
    } catch (e: any) {
      Alert.alert("Cancel failed", e?.message ?? "Please try again.");
    } finally {
      setLoading({ visible: false });
    }
  }, []);

  const hideEmergency = useCallback(async (emergencyId: string) => {
    try {
      setLoading({ visible: true, message: "Removing request…" });

    const { error } = await supabase
      .from("emergency")
      .update({ driver_hidden: true })
      .eq("emergency_id", emergencyId);

      if (error) throw error;

      setItems((prev) => prev.filter((item) => item.id !== emergencyId));
    } catch (e: any) {
      Alert.alert("Delete failed", e?.message ?? "Please try again.");
    } finally {
      setLoading({ visible: false });
    }
  }, []);

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

          fetchSRCounts([emId]);

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

  /* ----------------------------- Locate helpers ----------------------------- */
  const openLiveTracking = useCallback(
    async ({
      emergencyId,
      targetUserId,
      viewer = "driver",
    }: {
      emergencyId: string;
      targetUserId?: string | null;
      viewer?: "driver" | "mechanic";
    }) => {
      try {
        let resolvedTarget = targetUserId ?? null;
        if (!resolvedTarget) {
          const { data, error } = await supabase
            .from("emergency")
            .select("accepted_by")
            .eq("emergency_id", emergencyId)
            .maybeSingle();
          if (error) throw error;
          resolvedTarget = (data as { accepted_by: string | null } | null)?.accepted_by ?? null;
        }

        if (!resolvedTarget) {
          Alert.alert(
            "Locate unavailable",
            "No mechanic is linked to this request yet. Accept an offer first.",
          );
          return;
        }

        router.push({
          pathname: "/(tracking)/track/[targetId]",
          params: { targetId: resolvedTarget, viewer },
        });
      } catch (err) {
        console.error("[RequestStatus] openLiveTracking", err);
        Alert.alert(
          "Unable to open tracking",
          "Please try again with a stable connection.",
        );
      }
    },
    [router],
  );

  /* -------------------------- Render helpers -------------------------- */
  const renderSRItem = (emId: string, it: SRUI, emLat: number, emLon: number) => {
    const blurred = !!revealedReject[it.service_id];
    const isExpanded = !!expandedOffers[it.service_id];
    
    // Get the emergency item to check service type
    const emergencyItem = items.find(item => item.id === emId);
    const isGasEmergency = emergencyItem?.serviceType === 'gas';

    return (
      <View key={it.service_id} className="relative py-3 border-b border-slate-200">
        <Pressable
          onLongPress={() => setRevealedReject((m) => ({ ...m, [it.service_id]: true }))}
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
            <Image source={{ uri: it.avatar }} className="w-10 h-10 rounded-full mt-1" />
            <View className="ml-3 flex-1">
              <View className="flex-row justify-between items-start">
                <View className="flex-1">
                  <Text className="text-[15px] font-semibold text-slate-900 leading-5" numberOfLines={2}>
                    {it.name}
                  </Text>
                  <Text className="text-[13px] text-slate-500 mt-1">
                    {fmtDistance(it.distanceKm)} away
                  </Text>
                </View>
                <View className="items-end">
                  <Ionicons
                    name={isExpanded ? "chevron-up" : "chevron-down"}
                    size={16}
                    color="#64748B"
                    className="mb-2"
                  />
                  <View className="flex-col space-y-2">
                    <Pressable
                      onPress={() =>
                        setConfirmAccept({
                          serviceId: it.service_id,
                          emergencyId: emId,
                          userId: it.user_id,
                        })
                      }
                      disabled={blurred}
                      className="rounded-xl py-2 px-5 bg-blue-600"
                    >
                      <Text className="text-white text-[13px] font-semibold text-center">Accept</Text>
                    </Pressable>
                  </View>
                </View>
              </View>

              {/* Offer Details - Collapsible */}
              {isExpanded && (
                it.offerDetails ? (
                  <View className="mt-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                    {it.offerDetails.notes && (
                      <View className="mb-3 pb-3 border-b border-slate-200">
                        <Text className="text-slate-600 text-xs font-medium mb-1">Notes</Text>
                        <Text className="text-slate-700 text-sm leading-5">{it.offerDetails.notes}</Text>
                      </View>
                    )}

                    <View className="space-y-2">
                      <View className="flex-row justify-between items-center">
                        <Text className="text-slate-600 text-sm">Distance Fee</Text>
                        <Text className="text-slate-900 text-sm font-medium">{it.offerDetails.distanceFee}</Text>
                      </View>
                      
                      {/* Conditionally render Labor Cost or Fuel Cost based on service type */}
                      {isGasEmergency ? (
                        <>
                          <View className="flex-row justify-between items-center">
                            <Text className="text-slate-600 text-sm">Fuel Cost</Text>
                            <Text className="text-slate-900 text-sm font-medium">{it.offerDetails.fuelCost}</Text>
                          </View>
                          <View className="flex-row justify-between items-center">
                            <Text className="text-slate-600 text-sm">Fuel Type</Text>
                            <Text className="text-slate-900 text-sm font-medium">
                              {getFuelTypeDisplay(emergencyItem?.fuelType || null, emergencyItem?.customFuelType || null)}
                            </Text>
                          </View>
                        </>
                      ) : (
                        <View className="flex-row justify-between items-center">
                          <Text className="text-slate-600 text-sm">Labor Cost</Text>
                          <Text className="text-slate-900 text-sm font-medium">{it.offerDetails.laborCost}</Text>
                        </View>
                      )}
                      
                      <View className="flex-row justify-between items-center pt-2 border-t border-slate-300">
                        <Text className="text-slate-800 text-sm font-semibold">Total Cost</Text>
                        <Text className="text-slate-900 text-sm font-bold">{it.offerDetails.totalCost}</Text>
                      </View>
                    </View>
                  </View>
                ) : (
                  // 🔴 Visible fallback so "nothing happens" is not confusing
                  <View className="mt-3 p-4 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                    <Text className="text-slate-600 text-sm">
                      No offer details from this shop yet.
                    </Text>
                    <Text className="text-slate-500 text-xs mt-1">
                      (If you expect an offer, check Supabase RLS/permissions and that the offer rows reference this service or are NULL service_id with the same emergency/shop.)
                    </Text>
                  </View>
                )
              )}
            </View>
          </View>
        </Pressable>

        {blurred && (
          <View className="absolute inset-0 items-center justify-center">
            <Pressable
              onPress={() => setConfirmReject({ serviceId: it.service_id, emergencyId: emId })}
              className="rounded-2xl px-5 py-2 bg-rose-600"
            >
              <Text className="text-white text-[13px] font-semibold">Reject</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  const PlaceholderRow = ({ idx }: { idx: number }) => (
    <View
      key={`ph-${idx}`}
      style={{ height: REQ_ROW_HEIGHT, borderBottomWidth: 1, borderBottomColor: "#E5E7EB" }}
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
            <ScrollView contentContainerStyle={{ paddingVertical: 8 }} nestedScrollEnabled showsVerticalScrollIndicator>
              {real.map((row) => renderSRItem(em.id, row, em.lat, em.lon))}
            </ScrollView>
          ) : (
            <View className="flex-1 items-center justify-center py-8">
              <Ionicons name="build-outline" size={32} color="#94A3B8" />
              <Text className="text-[14px] text-slate-500 mt-2">No requests yet</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  const renderItem = ({ item }: { item: RequestItem }) => {
    const waiting = item.status === "WAITING";
    const inProcess = item.status === "IN_PROCESS";
    const completed = item.status === "COMPLETED";
    const canceled = item.status === "CANCELED";
    const isOpen = !!openCards[item.id];

    const ageMs = Date.now() - new Date(item.createdAtIso).getTime();
    const hasPending = (reqCounts[item.id] ?? 0) > 0;
    const canCancel = waiting && !hasPending && ageMs >= 5 * 60 * 1000;

    return (
      <Pressable
        onPress={() => toggleCard(item.id, item.lat, item.lon)}
        className="bg-white rounded-2xl p-5 mb-4 border border-slate-200 relative"
        style={cardShadow as any}
      >
        {(completed || canceled) && (
          <View className="absolute top-3 right-3">
            <Pressable onPress={() => setConfirmHideId(item.id)} hitSlop={8} className="p-1 rounded-full">
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

          {/* Service Type */}
          <View className="flex-row items-start">
            <Ionicons name="build-outline" size={16} color="#64748B" className="mt-0.5" />
            <View className="ml-3 flex-1">
              <Text className="text-slate-600 text-sm font-medium">Service Type</Text>
              <Text className="text-slate-800 text-sm mt-0.5 leading-5">
                {getServiceTypeLabel(item.serviceType)}
              </Text>
            </View>
          </View>

          {/* Fuel Type - only for gas service */}
          {item.serviceType === "gas" && (
            <View className="flex-row items-start">
              <Ionicons name="water-outline" size={16} color="#64748B" className="mt-0.5" />
              <View className="ml-3 flex-1">
                <Text className="text-slate-600 text-sm font-medium">Fuel Type</Text>
                <Text className="text-slate-800 text-sm mt-0.5 leading-5">
                  {getFuelTypeDisplay(item.fuelType, item.customFuelType)}
                </Text>
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
            <Text className={`text-[12px] font-medium ${STATUS_STYLES[item.status].text ?? "text-slate-800"}`}>
              {prettyStatus(item.status)}
            </Text>
          </View>

          {inProcess && (
            <View className="flex-row space-x-2">
              <Pressable onPress={() => openChatForEmergency(item.id, router)} className="flex-row items-center bg-blue-600 rounded-xl px-4 py-2">
                <Ionicons name="chatbubbles" size={14} color="#FFF" />
                <Text className="text-white text-[13px] font-semibold ml-1.5">Message</Text>
              </Pressable>

              <Pressable
                onPress={() =>
                  openLiveTracking({
                    emergencyId: item.id,
                    targetUserId: item.acceptedBy,
                    viewer: "driver",
                  })
                }
                className="flex-row items-center bg-emerald-600 rounded-xl px-4 py-2"
              >
                <Ionicons name="navigate" size={14} color="#FFF" />
                <Text className="text-white text-[13px] font-semibold ml-1.5">Locate</Text>
              </Pressable>
            </View>
          )}

          {!inProcess &&
            (canCancel ? (
              <Pressable onPress={() => setConfirmCancelId(item.id)} className="flex-row items-center bg-rose-600 rounded-xl px-4 py-2">
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
              {emergency_id ? "Loading or no record found." : "No emergency requests to show."}
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

      {/* Confirm: Cancel emergency */}
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

      {/* Confirm: Hide completed emergency */}
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

      <LoadingScreen visible={loading.visible} message={loading.message} variant="spinner" />
    </SafeAreaView>
  );
}