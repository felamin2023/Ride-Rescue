// app/shop/mechanicAcceptedrequests.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  FlatList,
  Pressable,
  Platform,
  Alert,
  Animated,
  Easing,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import LoadingScreen from "../../components/LoadingScreen";
import { supabase } from "../../utils/supabase";
import { upsertMyLocation } from "../../lib/realtimeLocation";
import { metersBetween } from "../../utils/haversine";
import PaymentModal from "../../components/PaymentModal";
import CancelRepairModal from "../../components/CancelRepairModal";
/* ----------------------------- Helpers ----------------------------- */
const DEBUG_PRINTS = false;
const dbg = (...args: any[]) => DEBUG_PRINTS && console.log("[SHOP-ACCEPTED]", ...args);

const AVATAR_PLACEHOLDER =
  "https://images.unsplash.com/photo-1527980965255-d3b416303d12?q=80&w=256&auto=format&fit=crop";

const cardShadow = Platform.select({
  ios: { shadowColor: "#0F172A", shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
  android: { elevation: 2 },
});

const peso = (n: number | null | undefined) => `₱${(Number(n) || 0).toFixed(2)}`;

const MIN_DISPLACEMENT_METERS = 12;
const SLOW_SPEED_THRESHOLD = 1;
const SLOW_UPDATE_COOLDOWN_MS = 15_000;

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
  shop_hidden?: boolean;
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
  canceled_reason?: string | null;
};

type AppUserRow = { user_id: string; full_name: string | null; photo_url: string | null };

type TxRow = {
  transaction_id: string;
  emergency_id: string;
  service_id: string;
  shop_id: string;
  rate_per_km: number;
  distance_km: number;
  distance_fee: number;
  labor_cost: number;
  extra_total: number;
  total_amount: number;
  status: "pending" | "to_pay" | "paid" | "canceled";
  cancel_option: "incomplete" | "diagnose_only" | null; 
  created_at: string;
  updated_at: string | null;
  paid_at: string | null;
  proof_image_url: string | null;
};

type Charges = {
  ratePerKm: number;
  distanceKm: number;
  distanceFee: number;
  laborCost: number;
  extraTotal: number;
  totalAmount: number;
  txStatus: TxRow["status"];
};

type CardItem = {
  serviceId: string;
  emergencyId: string;
  driverUserId: string | null;
  driverName: string;
  driverAvatar: string;
  vehicleType: string;
  info: string;
  lat: number;
  lon: number;
  landmark: string;
  location: string;
  dateTime: string;
  sentWhen: string;
  emStatus: EmergencyStatus;
  distanceKm?: number;
  imageUrls?: string[];
  charges?: Charges; // 👈 populated from payment_transaction
};

/* ----------------------------- Small UI helpers ----------------------------- */
function fmtDateTime(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
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
    const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
    if (results.length > 0) {
      const p = results[0];
      const parts = [p.name, p.street, p.district, p.city, p.region, p.postalCode, p.country].filter(Boolean);
      return parts.join(", ") || "Address not available";
    }
  } catch {}
  return "Unknown location";
}
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
const STATUS_STYLES: Record<EmergencyStatus, { bg?: string; border?: string; text?: string }> = {
  in_process: { bg: "bg-emerald-50", border: "border-emerald-300/70", text: "text-emerald-700" },
  waiting: { bg: "bg-amber-50", border: "border-amber-300/70", text: "text-amber-700" },
  completed: { bg: "bg-blue-50", border: "border-blue-300/70", text: "text-blue-700" },
  canceled: { bg: "bg-rose-50", border: "border-rose-300/70", text: "text-rose-700" },
};
const prettyStatus = (s: EmergencyStatus) =>
  s === "in_process" ? "In Process" : s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/* ----------------------------- Cute spinner ----------------------------- */
function SpinningGear({ size = 14, color = "#059669" }) {
  const spin = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    const anim = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1200, easing: Easing.linear, useNativeDriver: true }));
    anim.start();
    return () => anim.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <Ionicons name="settings-outline" size={size} color={color} />
    </Animated.View>
  );
}

/* ----------------------------- CenterConfirm ----------------------------- */
function CenterConfirm({
  visible, title, message, onCancel, onConfirm, confirmLabel = "Confirm", cancelLabel = "Cancel", confirmColor = "#2563EB",
}: {
  visible: boolean; title: string; message?: string; onCancel: () => void; onConfirm: () => void;
  confirmLabel?: string; cancelLabel?: string; confirmColor?: string;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.35)" }}>
        <View className="w-11/12 max-w-md rounded-2xl bg-white p-5" style={cardShadow as any}>
          <View className="items-center mb-2"><Ionicons name="alert-circle-outline" size={28} color={confirmColor} /></View>
          <Text className="text-lg font-semibold text-slate-900 text-center">{title}</Text>
          {message ? <Text className="mt-2 text-[14px] text-slate-600 text-center">{message}</Text> : null}
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
export default function ShopAcceptedRequests() {
  const router = useRouter();

  const [loading, setLoading] = useState<{ visible: boolean; message?: string }>({ visible: false });
  const [userId, setUserId] = useState<string | null>(null);
  const [shopId, setShopId] = useState<string | null>(null);

  const [items, setItems] = useState<CardItem[]>([]);
  const [openCards, setOpenCards] = useState<Record<string, boolean>>({});
  const [actionLocked, setActionLocked] = useState<Record<string, boolean>>({});
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [selectedEmergency, setSelectedEmergency] = useState<{ emergencyId: string; distanceKm: number } | null>(null);

  const [confirmHideId, setConfirmHideId] = useState<string | null>(null);

  // amounts snapshot for PaymentModal
  const [originalTx, setOriginalTx] = useState<{ distance_fee: number; labor_cost: number; total_amount: number } | null>(null);

  const lastBroadcastRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastSlowUpdateRef = useRef(0);
  const hasActiveJob = useMemo(
    () => items.some((card) => card.emStatus === "in_process"),
    [items],
  );

  const toggleCard = (emId: string) => setOpenCards((m) => ({ ...m, [emId]: !m[emId] }));

  /* ----------------------------- Data fetchers ----------------------------- */
  const fetchAll = useCallback(async (withSpinner: boolean) => {
    try {
      if (withSpinner) setLoading({ visible: true, message: "Loading accepted requests…" });

      // who am I -> which shop
      let uid = userId;
      if (!uid) {
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) throw new Error("Please sign in.");
        uid = auth.user.id;
        setUserId(uid);
      }
      let sid = shopId;
      if (!sid) {
        const { data: srow, error: sErr } = await supabase.from("shop_details").select("shop_id").eq("user_id", uid!).single();
        if (sErr || !srow?.shop_id) throw new Error("Shop profile not found.");
        sid = srow.shop_id as string;
        setShopId(sid);
      }

      // 1) accepted SRs for this shop (and not soft-hidden)
      const { data: srs, error: srErr } = await supabase
        .from("service_requests")
        .select("service_id, emergency_id, shop_id, latitude, longitude, status, requested_at, accepted_at, shop_hidden")
        .eq("shop_id", sid!)
        .eq("status", "accepted")
        .eq("shop_hidden", false)
        .order("accepted_at", { ascending: false, nullsFirst: false })
        .order("requested_at", { ascending: false });
      if (srErr) throw srErr;
      const srRows = (srs as ServiceRequestRow[]) ?? [];
      if (srRows.length === 0) { setItems([]); return; }

      // 2) batch emergencies (exclude completed)
      const emIds = Array.from(new Set(srRows.map((r) => r.emergency_id)));
      const { data: ems, error: emErr } = await supabase
        .from("emergency")
        .select("emergency_id, user_id, vehicle_type, breakdown_cause, attachments, emergency_status, latitude, longitude, created_at, accepted_at, accepted_by")
        .in("emergency_id", emIds);
      if (emErr) throw emErr;

      const emMap = new Map<string, EmergencyRow>();
      (ems as EmergencyRow[]).forEach((e) => {
        if ((!e.accepted_by || e.accepted_by === uid) && e.emergency_status !== "completed") emMap.set(e.emergency_id, e);
      });
      const filteredSRs = srRows.filter((sr) => emMap.has(sr.emergency_id));
      if (filteredSRs.length === 0) { setItems([]); return; }

      // 3) driver profiles
      const driverIds = Array.from(new Set(Array.from(emMap.values()).map((e) => e.user_id)));
      const { data: users } = await supabase.from("app_user").select("user_id, full_name, photo_url").in("user_id", driverIds);
      const userMap = new Map<string, AppUserRow>();
      (users as AppUserRow[] | null)?.forEach((u) => userMap.set(u.user_id, u));

      // 4) payment_transaction for these emergencies (for this shop)
      const { data: txs } = await supabase
        .from("payment_transaction")
        .select("transaction_id, emergency_id, service_id, shop_id, rate_per_km, distance_km, distance_fee, labor_cost, extra_total, total_amount, status, created_at, updated_at, paid_at, proof_image_url")
        .eq("shop_id", sid!)
        .in("emergency_id", Array.from(emMap.keys()));
      // choose most recent per service_id
      const txByService = new Map<string, TxRow>();
      (txs as TxRow[] | null)?.forEach((t) => {
        const cur = txByService.get(t.service_id);
        if (!cur || new Date(t.created_at).getTime() > new Date(cur.created_at).getTime()) txByService.set(t.service_id, t);
      });

      // 5) compose cards
      const composed: CardItem[] = await Promise.all(
        filteredSRs.map(async (sr) => {
          const em = emMap.get(sr.emergency_id)!;
          const u = userMap.get(em.user_id);
          const driverName = u?.full_name || "Driver";
          const driverAvatar = u?.photo_url || AVATAR_PLACEHOLDER;
          const distanceKm = haversineKm(sr.latitude, sr.longitude, em.latitude, em.longitude);
          const landmark = await reverseGeocode(em.latitude, em.longitude);

          const tx = txByService.get(sr.service_id);
          const charges: Charges | undefined = tx
            ? {
                ratePerKm: Number(tx.rate_per_km || 0),
                distanceKm: Number(tx.distance_km || 0),
                distanceFee: Number(tx.distance_fee || 0),
                laborCost: Number(tx.labor_cost || 0),
                extraTotal: Number(tx.extra_total || 0),
                totalAmount: Number(tx.total_amount || 0),
                txStatus: tx.status,
              }
            : undefined;

          return {
            serviceId: sr.service_id,
            emergencyId: sr.emergency_id,
            driverUserId: u?.user_id ?? null,
            driverName,
            driverAvatar,
            vehicleType: em.vehicle_type,
            info: em.breakdown_cause || "—",
            lat: em.latitude, // driver's breakdown location
            lon: em.longitude,
            landmark,
            location: `(${em.latitude.toFixed(5)}, ${em.longitude.toFixed(5)})`,
            dateTime: fmtDateTime(em.created_at),
            sentWhen: timeAgo(sr.accepted_at || sr.requested_at),
            emStatus: em.emergency_status,
            distanceKm,
            imageUrls: (em.attachments || []).filter(Boolean) || undefined,
            charges,
          };
        })
      );

      // sort: in_process first, then canceled (completed excluded)
      composed.sort((a, b) => {
        const order = (s: EmergencyStatus) => (s === "in_process" ? 0 : s === "canceled" ? 1 : 2);
        return order(a.emStatus) - order(b.emStatus);
      });

      setItems(composed);
      setActionLocked((prev) => {
        const active = new Set(composed.map((c) => c.emergencyId));
        const next = { ...prev };
        Object.keys(next).forEach((id) => {
          if (!active.has(id)) delete next[id];
        });
        return next;
      });
    } catch (e: any) {
      Alert.alert("Unable to load", e?.message ?? "Please try again.");
    } finally {
      if (withSpinner) setLoading({ visible: false });
    }
  }, [shopId, userId]);

  // Load one tx (used by PaymentModal open)
  const loadPaymentTx = useCallback(
    async (emergencyId: string) => {
      if (!shopId) return null;
      const { data: tx, error } = await supabase
        .from("payment_transaction")
        .select("transaction_id, distance_fee, labor_cost, total_amount")
        .eq("emergency_id", emergencyId)
        .eq("shop_id", shopId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) dbg("loadPaymentTx error", error);
      return tx ?? null;
    },
    [shopId]
  );

  /* ----------------------------- Message & In-App Location ----------------------------- */
  // Chat
  const messageDriver = async (emergencyId: string, driverUserId: string | null) => {
    try {
      setLoading({ visible: true, message: "Opening chat..." });

      if (!driverUserId) {
        Alert.alert("Error", "Driver information is not available.");
        return;
      }

      // Check if conversation exists for this emergency
      const { data: existingConvs } = await supabase
        .from("conversations")
        .select("id")
        .eq("emergency_id", emergencyId)
        .order("updated_at", { ascending: false });

      let conversationId;

      if (existingConvs && existingConvs.length > 0) {
        conversationId = existingConvs[0].id;
      } else {
        const { data: newConv, error } = await supabase
          .from("conversations")
          .insert({
            emergency_id: emergencyId,
            customer_id: driverUserId, // driver is the customer in emergency context
            driver_id: userId,         // shop is the driver
          })
          .select()
          .single();

        if (error) {
          Alert.alert("Error", "Could not start conversation. Please try again.");
          return;
        }
        conversationId = newConv.id;
      }

      router.push(`/driver/chat/${conversationId}`);
    } catch (error) {
      Alert.alert("Error", "Could not start conversation. Please try again.");
    } finally {
      setLoading({ visible: false });
    }
  };

  const openTracking = useCallback(
    (driverUserId: string | null) => {
      if (!driverUserId) {
        Alert.alert(
          "Locate unavailable",
          "Driver information is missing. Please refresh and try again.",
        );
        return;
      }
      router.push({
        pathname: "/(tracking)/track/[targetId]",
        params: { targetId: driverUserId, viewer: "mechanic" },
      });
    },
    [router],
  );

  /* ----------------------------- Actions ----------------------------- */
  const handleMarkComplete = async (emergencyId: string, distanceKm?: number) => {
    if (actionLocked[emergencyId]) return;
    setActionLocked((prev) => ({ ...prev, [emergencyId]: true }));
    setSelectedEmergency({ emergencyId, distanceKm: distanceKm || 0 });

    const tx = await loadPaymentTx(emergencyId);
    if (tx) {
      setOriginalTx({
        distance_fee: Number(tx.distance_fee) || 0,
        labor_cost: Number(tx.labor_cost) || 0,
        total_amount: Number(tx.total_amount) || 0,
      });
    } else {
      setOriginalTx({ distance_fee: (distanceKm || 0) * 15, labor_cost: 0, total_amount: (distanceKm || 0) * 15 });
    }
    setShowPaymentModal(true);
  };

  const handleCancelRepair = (emergencyId: string, distanceKm?: number) => {
    if (actionLocked[emergencyId]) return;
    setActionLocked((prev) => ({ ...prev, [emergencyId]: true }));
    setSelectedEmergency({ emergencyId, distanceKm: distanceKm || 0 });
    setShowCancelModal(true);
  };

  const handleInvoiceSubmit = async (invoice: {
    offerId: string;            // emergencyId
    finalLaborCost: number;
    finalPartsCost?: number;    // unused
    finalServices: any[];       // extra items
    finalTotal?: number;        // recomputed
  }) => {
    try {
      setLoading({ visible: true, message: "Creating invoice… awaiting driver payment" });

      const tx = await loadPaymentTx(invoice.offerId);
      if (!tx) throw new Error("No payment transaction found for this emergency.");

      const now = new Date().toISOString();

      const baseDistance = Number(originalTx?.distance_fee ?? 0);
      const extraTotal = (invoice.finalServices || []).reduce((sum: number, s: any) => {
        const qty = Number(s?.qty ?? s?.quantity ?? 1) || 1;
        const unit = Number(s?.fee ?? s?.price ?? s?.amount ?? s?.cost ?? 0) || 0;
        return sum + qty * unit;
      }, 0);
      const labor = Number(invoice.finalLaborCost || 0);
      const computedTotal = baseDistance + labor + extraTotal;

      const { error: txErr } = await supabase
        .from("payment_transaction")
        .update({
          labor_cost: Number(labor.toFixed(2)),
          extra_items: invoice.finalServices ?? [],
          extra_total: Number(extraTotal.toFixed(2)),
          total_amount: Number(computedTotal.toFixed(2)),
          status: "to_pay",
          updated_at: now,
        })
        .eq("transaction_id", tx.transaction_id);
      if (txErr) throw txErr;

      setActionLocked((prev) => {
        if (!prev[invoice.offerId]) return prev;
        const next = { ...prev };
        delete next[invoice.offerId];
        return next;
      });
      setShowPaymentModal(false);
      setSelectedEmergency(null);
      setOriginalTx(null);
      Alert.alert("Invoice sent", "Waiting for the driver to pay.");
    } catch (e: any) {
      Alert.alert("Update failed", e?.message ?? "Please try again.");
    } finally {
      setLoading({ visible: false });
    }
  };

  const handleCancelSubmit = async (cancelData: {
    offerId: string; cancelOption: "incomplete" | "diagnose_only"; reason?: string; totalFees: number;
  }) => {
    try {
      setLoading({ visible: true, message: "Cancelling repair service..." });

      const now = new Date().toISOString();
      const isDiagnoseOnly = cancelData.cancelOption === "diagnose_only";

      // 1) emergency status update
      const emergencyUpdate =
        isDiagnoseOnly
          ? { emergency_status: "completed", completed_at: now }
          : { emergency_status: "canceled", canceled_at: now, canceled_reason: cancelData.reason || null };
      const { error: emergencyError } = await supabase
        .from("emergency")
        .update(emergencyUpdate)
        .eq("emergency_id", cancelData.offerId);
      if (emergencyError) throw emergencyError;

      // 2) payment_transaction adjustments
      const { data: tx } = await supabase
        .from("payment_transaction")
        .select("transaction_id, distance_fee, labor_cost")
        .eq("emergency_id", cancelData.offerId)
        .eq("shop_id", shopId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (tx) {
        const baseDistance = Number(tx.distance_fee || 0);
        const baseLabor = Number(tx.labor_cost || 0);

        if (isDiagnoseOnly) {
          const { error: txErr } = await supabase
            .from("payment_transaction")
            .update({
              distance_fee: 0,
              labor_cost: 0,
              extra_total: 0,
              total_amount: 0,
              status: "pending",
              cancel_option: cancelData.cancelOption,
              cancel_reason: cancelData.reason || null,
              paid_at: null,
              updated_at: now,
            })
            .eq("transaction_id", tx.transaction_id);
          if (txErr) throw txErr;
        } else {
          const halfLabor = Number((baseLabor * 0.5).toFixed(2));
          const computed = Number((baseDistance + halfLabor).toFixed(2));

          const { error: txErr } = await supabase
            .from("payment_transaction")
            .update({
              labor_cost: halfLabor,
              extra_total: 0,
              total_amount: computed,
              status: "to_pay",
              cancel_option: cancelData.cancelOption,
              cancel_reason: cancelData.reason || null,
              canceled_at: now,
              updated_at: now,
            })
            .eq("transaction_id", tx.transaction_id);
          if (txErr) throw txErr;
        }
      }

      setActionLocked((prev) => {
        if (!prev[cancelData.offerId]) return prev;
        const next = { ...prev };
        delete next[cancelData.offerId];
        return next;
      });
      setItems((prev) => prev.filter((it) => it.emergencyId !== cancelData.offerId));
      setShowCancelModal(false);
      setSelectedEmergency(null);
    } catch (e: any) {
      Alert.alert("Cancellation failed", e?.message ?? "Please try again.");
    } finally {
      setLoading({ visible: false });
    }
  };

  // soft-hide accepted row for this shop
  const hideAccepted = async (serviceId: string) => {
    try {
      setLoading({ visible: true, message: "Hiding from list…" });
      const { error } = await supabase.from("service_requests").update({ shop_hidden: true }).eq("service_id", serviceId);
      if (error) throw error;
      setItems((prev) => prev.filter((it) => it.serviceId !== serviceId));
    } catch (e: any) {
      Alert.alert("Hide failed", e?.message ?? "Please try again.");
    } finally {
      setLoading({ visible: false });
    }
  };

  /* ----------------------------- Realtime ----------------------------- */
  useEffect(() => {
    const chSR = supabase
      .channel("sr-shop-accepted")
      .on("postgres_changes", { event: "*", schema: "public", table: "service_requests" }, (payload) => {
        const row = (payload as any).new as ServiceRequestRow | undefined;
        if (!row) return;
        setItems((prev) => {
          if (row.status !== "accepted") return prev.filter((it) => it.serviceId !== row.service_id);
          return prev.map((it) =>
            it.serviceId === row.service_id ? { ...it, sentWhen: timeAgo(row.accepted_at || row.requested_at) } : it
          );
        });
      })
      .subscribe();

    const chEM = supabase
      .channel("em-shop-status")
      .on("postgres_changes", { event: "*", schema: "public", table: "emergency" }, (payload) => {
        const row = (payload as any).new as EmergencyRow | undefined;
        if (!row) return;
        setItems((prev) => {
          if (row.emergency_status === "completed") return prev.filter((it) => it.emergencyId !== row.emergency_id);
          return prev.map((it) => (it.emergencyId === row.emergency_id ? { ...it, emStatus: row.emergency_status } : it));
        });
      })
      .subscribe();

    const chTX = supabase
      .channel("tx-shop")
      .on("postgres_changes", { event: "*", schema: "public", table: "payment_transaction" }, (payload) => {
        const row = (payload as any).new as TxRow | undefined;
        if (!row || row.shop_id !== shopId) return;
        setItems((prev) =>
          prev.map((it) =>
            it.serviceId === row.service_id
              ? {
                  ...it,
                  charges: {
                    ratePerKm: Number(row.rate_per_km || 0),
                    distanceKm: Number(row.distance_km || 0),
                    distanceFee: Number(row.distance_fee || 0),
                    laborCost: Number(row.labor_cost || 0),
                    extraTotal: Number(row.extra_total || 0),
                    totalAmount: Number(row.total_amount || 0),
                    txStatus: row.status,
                  },
                }
              : it
          )
        );
      })
      .subscribe();

    return () => {
      supabase.removeChannel(chSR);
      supabase.removeChannel(chEM);
      supabase.removeChannel(chTX);
    };
  }, [shopId]);

  /* ----------------------------- Lifecycle ----------------------------- */
  useEffect(() => {
    fetchAll(true);
  }, [fetchAll]);

  useEffect(() => {
    const id = setInterval(() => fetchAll(false), 15000);
    return () => clearInterval(id);
  }, [fetchAll]);

  useEffect(() => {
    if (!userId || !hasActiveJob) return;
    let watcher: Location.LocationSubscription | null = null;
    let cancelled = false;

    const startTracking = async () => {
      try {
        const current = await Location.getForegroundPermissionsAsync();
        let status = current.status;
        if (status !== "granted") {
          const req = await Location.requestForegroundPermissionsAsync();
          status = req.status;
        }

        if (status !== "granted") {
          console.warn("[SHOP-ACCEPTED] Location permission denied for tracking");
          return;
        }

        watcher = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: MIN_DISPLACEMENT_METERS,
            timeInterval: 2000,
          },
          (position) => {
            if (cancelled) return;
            const { latitude, longitude, heading, speed } = position.coords;
            const currentPoint = { lat: latitude, lng: longitude };
            const displacement = metersBetween(
              lastBroadcastRef.current,
              currentPoint,
            );
            const numericSpeed =
              typeof speed === "number" && Number.isFinite(speed)
                ? Math.max(0, speed)
                : null;

            if (
              Number.isFinite(displacement) &&
              displacement < MIN_DISPLACEMENT_METERS
            ) {
              return;
            }

            const now = Date.now();
            if (
              numericSpeed !== null &&
              numericSpeed < SLOW_SPEED_THRESHOLD &&
              now - lastSlowUpdateRef.current < SLOW_UPDATE_COOLDOWN_MS
            ) {
              return;
            }

            lastSlowUpdateRef.current = now;
            lastBroadcastRef.current = currentPoint;

            upsertMyLocation({
              user_id: userId,
              lat: currentPoint.lat,
              lng: currentPoint.lng,
              heading:
                typeof heading === "number" && Number.isFinite(heading)
                  ? heading
                  : undefined,
              speed: numericSpeed ?? undefined,
            }).catch((err) =>
              console.warn("[SHOP-ACCEPTED] upsertMyLocation failed", err),
            );
          },
        );
      } catch (err) {
        console.warn("[SHOP-ACCEPTED] watchPositionAsync failed", err);
      }
    };

    startTracking();

    return () => {
      cancelled = true;
      watcher?.remove();
    };
  }, [userId, hasActiveJob]);

  /* ----------------------------- Render ----------------------------- */
  const renderItem = ({ item }: { item: CardItem }) => {
    const ST = STATUS_STYLES[item.emStatus];
    const isOpen = !!openCards[item.emergencyId];
    const hasCharges = !!item.charges;
    const buttonsVisible = item.emStatus === "in_process" && !actionLocked[item.emergencyId] && (item.charges?.txStatus === "pending" || !item.charges);

    return (
      <Pressable
        onPress={() => toggleCard(item.emergencyId)}
        className="bg-white rounded-2xl p-5 mb-4 border border-slate-200 relative"
        style={cardShadow as any}
      >
        {/* Trash on canceled */}
        {item.emStatus === "canceled" && (
          <View className="absolute top-3 right-3">
            <Pressable onPress={() => setConfirmHideId(item.serviceId)} hitSlop={8} className="p-1 rounded-full">
              <Ionicons name="trash-outline" size={20} color="#64748B" />
            </Pressable>
          </View>
        )}

        {/* Header */}
        <View className="flex-row items-center">
          <Image source={{ uri: item.driverAvatar }} className="w-12 h-12 rounded-full" />
          <View className="ml-3 flex-1">
            <Text className="text-[17px] font-semibold text-slate-900" numberOfLines={1}>{item.driverName}</Text>
            <Text className="text-[13px] text-slate-500 mt-0.5">Emergency Request • {item.vehicleType}</Text>
          </View>

        {/* Quick total pill */}
          {hasCharges && (
            <View className="ml-3 rounded-full bg-slate-100 border border-slate-300 px-3 py-1">
              <Text className="text-[12px] font-semibold text-slate-900">{peso(item.charges!.totalAmount)}</Text>
            </View>
          )}
        </View>

        <View className="h-px bg-slate-200 my-4" />

        {/* Driver info */}
        <View className="space-y-3">
          {!!item.info && item.info !== "—" && (
            <View className="flex-row items-start">
              <Ionicons name="document-text-outline" size={16} color="#64748B" />
              <View className="ml-3 flex-1">
                <Text className="text-slate-600 text-sm font-medium">Driver Notes</Text>
                <Text className="text-slate-800 text-sm mt-0.5 leading-5">{item.info}</Text>
              </View>
            </View>
          )}

          <View className="flex-row items-start">
            <Ionicons name="location-outline" size={16} color="#64748B" />
            <View className="ml-3 flex-1">
              <Text className="text-slate-600 text-sm font-medium">Landmark</Text>
              <Text className="text-slate-800 text-sm mt-0.5 leading-5">{item.landmark}</Text>
            </View>
          </View>

          <View className="flex-row items-start">
            <Ionicons name="map-outline" size={16} color="#64748B" />
            <View className="ml-3 flex-1">
              <Text className="text-slate-600 text-sm font-medium">Location</Text>
              <Text className="text-slate-800 text-sm mt-0.5">{item.location}</Text>
            </View>
          </View>

          <View className="flex-row items-start">
            <Ionicons name="calendar-outline" size={16} color="#64748B" />
            <View className="ml-3 flex-1">
              <Text className="text-slate-600 text-sm font-medium">Date & Time</Text>
              <Text className="text-slate-800 text-sm mt-0.5">{item.dateTime}</Text>
            </View>
          </View>
        </View>

        {/* Charges block */}
        {hasCharges && (
          <>
            <View className="h-px bg-slate-200 my-4" />
            <View className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <View className="flex-row justify-between items-center">
                <Text className="text-slate-600 text-sm">Distance Fee</Text>
                <Text className="text-slate-900 text-sm font-medium">{peso(item.charges!.distanceFee)}</Text>
              </View>
              <View className="flex-row justify-between items-center mt-2">
                <Text className="text-slate-600 text-sm">Labor</Text>
                <Text className="text-slate-900 text-sm font-medium">{peso(item.charges!.laborCost)}</Text>
              </View>
              {Number(item.charges!.extraTotal) > 0 && (
                <View className="flex-row justify-between items-center mt-2">
                  <Text className="text-slate-600 text-sm">Extras</Text>
                  <Text className="text-slate-900 text-sm font-medium">{peso(item.charges!.extraTotal)}</Text>
                </View>
              )}
              <View className="flex-row justify-between items-center pt-2 mt-2 border-t border-slate-300">
                <Text className="text-slate-800 text-sm font-semibold">Total</Text>
                <Text className="text-slate-900 text-sm font-bold">{peso(item.charges!.totalAmount)}</Text>
              </View>
            </View>
          </>
        )}

        <View className="h-px bg-slate-200 my-4" />

        {/* Status + meta */}
        <View className="flex-row items-center justify-between">
          <View className={`rounded-full px-3 py-1.5 border self-start flex-row items-center ${STATUS_STYLES[item.emStatus].bg ?? ""} ${STATUS_STYLES[item.emStatus].border ?? ""}`}>
            {item.emStatus === "in_process" ? (<View className="mr-1.5"><SpinningGear size={12} /></View>) : null}
            <Text className={`text-[12px] font-medium ${STATUS_STYLES[item.emStatus].text ?? "text-slate-800"}`}>
              {prettyStatus(item.emStatus)}
            </Text>
          </View>
          <Text className="text-[13px] text-slate-400">Sent {item.sentWhen}</Text>
        </View>

        {/* Expanded actions */}
        {isOpen && (
          <>
            <View className="h-px bg-slate-200 my-4" />

            {/* Primary actions */}
            <View className="flex-row gap-3">
              {/* Message Button */}
              <Pressable
                onPress={() => messageDriver(item.emergencyId, item.driverUserId)}
                className="flex-1 rounded-xl py-2.5 items-center border border-slate-300"
              >
                <View className="flex-row items-center gap-1.5">
                  <Ionicons name="chatbubbles-outline" size={16} color="#0F172A" />
                  <Text className="text-[14px] font-semibold text-slate-900">Message</Text>
                </View>
              </Pressable>

              {/* Location Button → in-app map */}
              <Pressable
                onPress={() => openTracking(item.driverUserId)}
                className="flex-1 rounded-xl py-2.5 items-center border border-slate-300"
              >
                <View className="flex-row items-center gap-1.5">
                  <Ionicons name="navigate-outline" size={16} color="#0F172A" />
                  <Text className="text-[14px] font-semibold text-slate-900">Location</Text>
                </View>
              </Pressable>
            </View>

            {/* Complete/Cancel buttons - Only for in_process status */}
            {buttonsVisible && (
              <View className="flex-row gap-3 mt-3">
                <Pressable 
                  onPress={() => handleMarkComplete(item.emergencyId, item.distanceKm)} 
                  className="flex-1 rounded-xl py-2.5 px-4 bg-blue-600 items-center"
                >
                  <Text className="text-white text-[14px] font-semibold">Complete</Text>
                </Pressable>

                <Pressable 
                  onPress={() => handleCancelRepair(item.emergencyId, item.distanceKm)} 
                  className="flex-1 rounded-xl py-2.5 px-4 border border-red-600 items-center bg-red-600"
                >
                  <Text className="text-white text-[14px] font-semibold">Cancel Repair</Text>
                </Pressable>
              </View>
            )}
          </>
        )}
      </Pressable>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-[#F4F6F8]">
      <View className="flex-row items-center justify-between px-4 py-3 bg-white border-b border-slate-200">
        <Pressable onPress={() => router.back()} hitSlop={8}><Ionicons name="arrow-back" size={26} color="#0F172A" /></Pressable>
        <Text className="text-xl font-bold text-[#0F172A]">Accepted Requests</Text>
        <View style={{ width: 26 }} />
      </View>

      <FlatList
        data={items}
        keyExtractor={(i) => i.serviceId}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        ListEmptyComponent={
          <View className="px-6 pt-16 items-center">
            <Ionicons name="document-text-outline" size={48} color="#94A3B8" />
            <Text className="text-center text-slate-500 mt-4 text-[15px]">No accepted requests to show.</Text>
          </View>
        }
      />

      {/* Payment Modal */}
      <PaymentModal
        visible={showPaymentModal}
        offerId={selectedEmergency?.emergencyId || ""} // emergencyId
        originalOffer={{
          labor_cost: originalTx?.labor_cost ?? 0,
          distance_fee: originalTx?.distance_fee ?? (selectedEmergency?.distanceKm || 0) * 15,
          total_cost: originalTx?.total_amount ?? ((originalTx?.labor_cost ?? 0) + (originalTx?.distance_fee ?? 0)),
        }}
        onClose={() => {
          const closingId = selectedEmergency?.emergencyId;
          if (closingId) {
            setActionLocked((prev) => {
              if (!prev[closingId]) return prev;
              const next = { ...prev };
              delete next[closingId];
              return next;
            });
          }
          setShowPaymentModal(false);
          setSelectedEmergency(null);
          setOriginalTx(null);
        }}
        onSubmit={handleInvoiceSubmit}
      />

      {/* Cancel Repair Modal */}
      <CancelRepairModal
        visible={showCancelModal}
        offerId={selectedEmergency?.emergencyId || ""}
        originalOffer={{
          labor_cost: 50,
          distance_fee: (selectedEmergency?.distanceKm || 0) * 15,
          total_cost: 50 + (selectedEmergency?.distanceKm || 0) * 15,
        }}
        onClose={() => {
          const closingId = selectedEmergency?.emergencyId;
          if (closingId) {
            setActionLocked((prev) => {
              if (!prev[closingId]) return prev;
              const next = { ...prev };
              delete next[closingId];
              return next;
            });
          }
          setShowCancelModal(false);
          setSelectedEmergency(null);
        }}
        onSubmit={handleCancelSubmit}
      />

      {/* Confirm: Hide accepted (trash) */}
      <CenterConfirm
        visible={!!confirmHideId}
        title="Delete request from your list?"
        message="Note: You cannot view this again once deleted."
        onCancel={() => setConfirmHideId(null)}
        onConfirm={() => { if (confirmHideId) { hideAccepted(confirmHideId); setConfirmHideId(null); } }}
        confirmLabel="Delete"
        cancelLabel="Back"
        confirmColor="#475569"
      />

      <LoadingScreen visible={loading.visible} message={loading.message} variant="spinner" />
    </SafeAreaView>
  );
}
