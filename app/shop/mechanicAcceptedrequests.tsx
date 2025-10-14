// app/shop/mechanicAcceptedrequests.tsx
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
import PaymentModal from "../../components/PaymentModal";
import CancelRepairModal from "../../components/CancelRepairModal";

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
  shop_hidden?: boolean; // 👈 soft-hide for shops
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

const STATUS_STYLES: Record<
  EmergencyStatus,
  { bg?: string; border?: string; text?: string }
> = {
  in_process: {
    bg: "bg-emerald-50",
    border: "border-emerald-300/70",
    text: "text-emerald-700",
  },
  waiting: {
    bg: "bg-amber-50",
    border: "border-amber-300/70",
    text: "text-amber-700",
  },
  completed: {
    bg: "bg-blue-50",
    border: "border-blue-300/70",
    text: "text-blue-700",
  },
  canceled: {
    bg: "bg-rose-50",
    border: "border-rose-300/70",
    text: "text-rose-700",
  },
};

function prettyStatus(s: EmergencyStatus): string {
  return s === "in_process"
    ? "In Process"
    : s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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

/* ----------------------------- CenterConfirm (matches driver UI) ----------------------------- */
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

  const [loading, setLoading] = useState<{ visible: boolean; message?: string }>(
    { visible: false }
  );
  const [userId, setUserId] = useState<string | null>(null);
  const [shopId, setShopId] = useState<string | null>(null);

  const [items, setItems] = useState<CardItem[]>([]);
  const [openCards, setOpenCards] = useState<Record<string, boolean>>({});
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [selectedEmergency, setSelectedEmergency] = useState<{
    emergencyId: string;
    distanceKm: number;
  } | null>(null);

  const [confirmHideId, setConfirmHideId] = useState<string | null>(null); // 👈 for trash

  // amounts snapshot for PaymentModal
  const [originalTx, setOriginalTx] = useState<{
    distance_fee: number;
    labor_cost: number;
    total_amount: number;
  } | null>(null);

  const loadPaymentTx = useCallback(
    async (emergencyId: string) => {
      if (!shopId) return null;
      const { data: tx, error } = await supabase
        .from("payment_transaction")
        .select("transaction_id, distance_fee, labor_cost, parts_cost, total_amount")
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

  const toggleCard = (emId: string) => {
    setOpenCards((m) => ({ ...m, [emId]: !m[emId] }));
  };

  /* ----------------------------- Fetch accepted only (hide completed) ----------------------------- */
  const fetchAll = useCallback(
    async (withSpinner: boolean) => {
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
            "service_id, emergency_id, shop_id, latitude, longitude, status, requested_at, accepted_at, shop_hidden"
          )
          .eq("shop_id", sid!)
          .eq("status", "accepted")
          .eq("shop_hidden", false) // 👈 hide locally "deleted" rows
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
            "emergency_id, user_id, vehicle_type, breakdown_cause, attachments, emergency_status, latitude, longitude, created_at, accepted_at, accepted_by, completed_at, canceled_at, canceled_reason"
          )
          .in("emergency_id", emIds);
        if (emErr) throw emErr;

        // 4) keep emergencies for this user AND NOT completed
        const emMap = new Map<string, EmergencyRow>();
        (ems as EmergencyRow[]).forEach((e) => {
          if ((!e.accepted_by || e.accepted_by === uid) && e.emergency_status !== "completed") {
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
          (users as AppUserRow[] | null)?.forEach((u) => userMap.set(u.user_id, u));
        }

        // 6) compose cards (accepted-only, completed hidden)
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
                location: `(${em.latitude.toFixed(5)}, ${em.longitude.toFixed(5)})`,
                dateTime: fmtDateTime(em.created_at),
                sentWhen: timeAgo(sr.accepted_at || sr.requested_at),
                srStatus: "accepted",
                emStatus: em.emergency_status,
                distanceKm,
                imageUrls: (em.attachments || []).filter(Boolean) || undefined,
              };
            })
        );

        // sort: in_process first, then canceled (completed are excluded)
        composed.sort((a, b) => {
          const order = (s: EmergencyStatus) =>
            s === "in_process" ? 0 : s === "canceled" ? 1 : 2;
          return order(a.emStatus) - order(b.emStatus);
        });

        setItems(composed);
      } catch (e: any) {
        Alert.alert("Unable to load", e?.message ?? "Please try again.");
      } finally {
        if (withSpinner) setLoading({ visible: false });
      }
    },
    [shopId, userId]
  );

  /* ----------------------------- Actions ----------------------------- */
  const openDirections = (lat: number, lon: number) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
    Linking.openURL(url).catch(() => {});
  };

  // 🔵 UPDATED: Navigate directly to conversation instead of messages list
  const messageDriver = async (emergencyId: string, driverUserId: string | null) => {
    try {
      setLoading({ visible: true, message: "Opening chat..." });

      if (!driverUserId) {
        Alert.alert("Error", "Driver information is not available.");
        return;
      }

      // Check if conversation already exists for this emergency
      const { data: existingConvs, error: convError } = await supabase
        .from("conversations")
        .select("id")
        .eq("emergency_id", emergencyId)
        .order("updated_at", { ascending: false });

      if (convError) {
        console.error("Error checking conversations:", convError);
      }

      let conversationId;

      // Use the most recent existing conversation if found
      if (existingConvs && existingConvs.length > 0) {
        conversationId = existingConvs[0].id;
        console.log("Found existing emergency conversation:", conversationId);
      } else {
        // Create new conversation for this emergency
        const { data: newConv, error } = await supabase
          .from("conversations")
          .insert({
            emergency_id: emergencyId,
            customer_id: driverUserId, // driver is the customer in emergency context
            driver_id: userId, // shop is the driver in emergency context
          })
          .select()
          .single();

        if (error) {
          console.error("Error creating conversation:", error);
          Alert.alert("Error", "Could not start conversation. Please try again.");
          return;
        }
        conversationId = newConv.id;
        console.log("Created new emergency conversation:", conversationId);
      }

      // 🔵 FIXED: Use the correct route that exists in your app
      // Navigate to the driver chat screen (since that's what exists)
      router.push(`/driver/chat/${conversationId}`);
    } catch (error) {
      console.error("Error in messageDriver:", error);
      Alert.alert("Error", "Could not start conversation. Please try again.");
    } finally {
      setLoading({ visible: false });
    }
  };

  const handleMarkComplete = async (emergencyId: string, distanceKm?: number) => {
    setSelectedEmergency({ emergencyId, distanceKm: distanceKm || 0 });

    // Load original amounts from payment_transaction (distance + labor at accept time)
    const tx = await loadPaymentTx(emergencyId);
    if (tx) {
      setOriginalTx({
        distance_fee: Number(tx.distance_fee) || 0,
        labor_cost: Number(tx.labor_cost) || 0,
        total_amount: Number(tx.total_amount) || 0,
      });
    } else {
      // Fallback (should be rare once driver accepted)
      const df = (distanceKm || 0) * 15;
      setOriginalTx({ distance_fee: df, labor_cost: 0, total_amount: df });
    }

    setShowPaymentModal(true);
  };

  const handleCancelRepair = (emergencyId: string, distanceKm?: number) => {
    setSelectedEmergency({
      emergencyId,
      distanceKm: distanceKm || 0,
    });
    setShowCancelModal(true);
  };

  const handleInvoiceSubmit = async (invoice: {
    offerId: string;            // emergencyId
    finalLaborCost: number;
    finalPartsCost?: number;    // ignored
    finalServices: any[];       // array of extra items
    finalTotal?: number;        // ignored; we recompute below
  }) => {
    try {
      setLoading({ visible: true, message: "Creating invoice… awaiting driver payment" });

      const tx = await loadPaymentTx(invoice.offerId);
      if (!tx) throw new Error("No payment transaction found for this emergency.");

      const now = new Date().toISOString();

      // Base distance fee comes from the tx snapshot we loaded when opening the modal
      const baseDistance = Number(originalTx?.distance_fee ?? 0);

      // Sum extras from the services array (support flexible keys)
      const extraTotal = (invoice.finalServices || []).reduce((sum: number, s: any) => {
        const qty  = Number(s?.qty ?? s?.quantity ?? 1) || 1;
        const unit = Number(s?.fee ?? s?.price ?? s?.amount ?? s?.cost ?? 0) || 0; // support `fee`
        return sum + qty * unit;
      }, 0);

      const labor = Number(invoice.finalLaborCost || 0);
      const computedTotal = baseDistance + labor + extraTotal;

      const { error: txErr } = await supabase
        .from("payment_transaction")
        .update({
          // keep original distance_fee (already in the row)
          labor_cost: Number(labor.toFixed(2)),
          parts_cost: 0, // 🚫 no separate parts input anymore
          extra_items: invoice.finalServices ?? [],
          extra_total: Number(extraTotal.toFixed(2)),
          total_amount: Number(computedTotal.toFixed(2)),
          status: "to_pay",
          updated_at: now
        })
        .eq("transaction_id", tx.transaction_id);
      if (txErr) throw txErr;

      // Do NOT mark emergency completed yet — driver needs to pay first
      setItems((prev) => prev.filter((it) => it.emergencyId !== invoice.offerId));
      setShowPaymentModal(false);
      setSelectedEmergency(null);
      setOriginalTx(null);

      // Go to Completed screen (shows Awaiting Payment / Paid)
      try { router.push("/shop/completedrequest"); } catch {}

      Alert.alert("Invoice sent", "Waiting for the driver to pay.");
    } catch (e: any) {
      Alert.alert("Update failed", e?.message ?? "Please try again.");
    } finally {
      setLoading({ visible: false });
    }
  };

  // Cancel Repair -> save in emergency + payment_transaction (with option logic)
  const handleCancelSubmit = async (cancelData: {
    offerId: string; // emergencyId
    cancelOption: "incomplete" | "diagnose_only";
    reason?: string;
    totalFees: number; // computed in modal
  }) => {
    try {
      setLoading({ visible: true, message: "Cancelling repair service…" });

      const now = new Date().toISOString();

      // 1) Update emergency
      const { error: emergencyError } = await supabase
        .from("emergency")
        .update({
          emergency_status: "canceled",
          canceled_at: now,
          canceled_reason: cancelData.reason || null,
        })
        .eq("emergency_id", cancelData.offerId);
      if (emergencyError) throw emergencyError;

      // 2) Update payment_transaction
      const tx = await loadPaymentTx(cancelData.offerId);
      if (tx) {
        // re-read base amounts from DB for safety
        const { data: txFull } = await supabase
          .from("payment_transaction")
          .select("transaction_id, distance_fee, labor_cost")
          .eq("transaction_id", tx.transaction_id)
          .maybeSingle();

        const baseDistance = Number(txFull?.distance_fee || 0);
        const baseLabor = Number(txFull?.labor_cost || 0);
        const computed =
          cancelData.cancelOption === "incomplete"
            ? baseDistance + baseLabor * 0.5 // distance + 50% labor
            : baseDistance;                   // diagnose only = distance only

        const charge = Number(computed.toFixed(2));

        const { error: txErr } = await supabase
          .from("payment_transaction")
          .update({
            total_amount: charge,
            status: "canceled",
            cancel_option: cancelData.cancelOption,
            cancel_reason: cancelData.reason || null,
            canceled_at: now,
            updated_at: now,
          })
          .eq("transaction_id", tx.transaction_id);
        if (txErr) throw txErr;
      }

      // Local UI
      setItems((prev) =>
        prev.map((it) =>
          it.emergencyId === cancelData.offerId ? { ...it, emStatus: "canceled" } : it
        )
      );

      setShowCancelModal(false);
      setSelectedEmergency(null);

      Alert.alert(
        "Repair Cancelled",
        `The repair has been cancelled successfully. Total fees: ₱${cancelData.totalFees.toFixed(2)}`
      );
    } catch (e: any) {
      Alert.alert("Cancellation failed", e?.message ?? "Please try again.");
    } finally {
      setLoading({ visible: false });
    }
  };

  // Soft-hide accepted row for this shop
  const hideAccepted = async (serviceId: string) => {
    try {
      setLoading({ visible: true, message: "Hiding from list…" });
      const { error } = await supabase
        .from("service_requests")
        .update({ shop_hidden: true })
        .eq("service_id", serviceId);
      if (error) throw error;

      // Optimistic UI
      setItems((prev) => prev.filter((it) => it.serviceId !== serviceId));
    } catch (e: any) {
      Alert.alert("Hide failed", e?.message ?? "Please try again.");
    } finally {
      setLoading({ visible: false });
    }
  };

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

          setItems((prev) => {
            // 🚫 If completed, remove from this page (details live in completedrequest.tsx)
            if (row.emergency_status === "completed") {
              return prev.filter((it) => it.emergencyId !== row.emergency_id);
            }
            // Otherwise, just update status if present in list
            return prev.map((it) =>
              it.emergencyId === row.emergency_id ? { ...it, emStatus: row.emergency_status } : it
            );
          });
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
    const ST = STATUS_STYLES[item.emStatus];
    const isOpen = !!openCards[item.emergencyId];

    return (
      <Pressable
        onPress={() => toggleCard(item.emergencyId)}
        className="bg-white rounded-2xl p-5 mb-4 border border-slate-200 relative"
        style={cardShadow as any}
      >
        {/* Trash (soft-hide) — keep for canceled */}
        {item.emStatus === "canceled" && (
          <View className="absolute top-3 right-3">
            <Pressable
              onPress={() => setConfirmHideId(item.serviceId)}
              hitSlop={8}
              className="p-1 rounded-full"
            >
              <Ionicons name="trash-outline" size={20} color="#64748B" />
            </Pressable>
          </View>
        )}

        {/* Header */}
        <View className="flex-row items-center">
          <Image
            source={{ uri: item.driverAvatar }}
            className="w-12 h-12 rounded-full"
          />
          <View className="ml-3 flex-1">
            <Text className="text-[17px] font-semibold text-slate-900" numberOfLines={1}>
              {item.driverName}
            </Text>
            <Text className="text-[13px] text-slate-500 mt-0.5">
              Emergency Request • {item.vehicleType}
            </Text>
          </View>
        </View>

        <View className="h-px bg-slate-200 my-4" />

        {/* Driver info */}
        <View className="space-y-3">
          {/* Notes */}
          {item.info && item.info !== "—" && (
            <View className="flex-row items-start">
              <Ionicons name="document-text-outline" size={16} color="#64748B" />
              <View className="ml-3 flex-1">
                <Text className="text-slate-600 text-sm font-medium">Driver Notes</Text>
                <Text className="text-slate-800 text-sm mt-0.5 leading-5">{item.info}</Text>
              </View>
            </View>
          )}

          {/* Landmark */}
          <View className="flex-row items-start">
            <Ionicons name="location-outline" size={16} color="#64748B" />
            <View className="ml-3 flex-1">
              <Text className="text-slate-600 text-sm font-medium">Landmark</Text>
              <Text className="text-slate-800 text-sm mt-0.5 leading-5">{item.landmark}</Text>
            </View>
          </View>

          {/* Location */}
          <View className="flex-row items-start">
            <Ionicons name="map-outline" size={16} color="#64748B" />
            <View className="ml-3 flex-1">
              <Text className="text-slate-600 text-sm font-medium">Location</Text>
              <Text className="text-slate-800 text-sm mt-0.5">{item.location}</Text>
            </View>
          </View>

          {/* Date & Time */}
          <View className="flex-row items-start">
            <Ionicons name="calendar-outline" size={16} color="#64748B" />
            <View className="ml-3 flex-1">
              <Text className="text-slate-600 text-sm font-medium">Date & Time</Text>
              <Text className="text-slate-800 text-sm mt-0.5">{item.dateTime}</Text>
            </View>
          </View>
        </View>

        <View className="h-px bg-slate-200 my-4" />

        {/* Status + meta */}
        <View className="flex-row items-center justify-between">
          <View
            className={`rounded-full px-3 py-1.5 border self-start flex-row items-center ${
              ST.bg ?? ""
            } ${ST.border ?? ""}`}
          >
            {item.emStatus === "in_process" ? (
              <View className="mr-1.5">
                <SpinningGear size={12} />
              </View>
            ) : null}
            <Text className={`text-[12px] font-medium ${ST.text ?? "text-slate-800"}`}>
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
              {/* 🔵 UPDATED: Message Button - now passes driverUserId */}
              <Pressable
                onPress={() => messageDriver(item.emergencyId, item.driverUserId)}
                className="flex-1 rounded-xl py-2.5 items-center border border-slate-300"
              >
                <View className="flex-row items-center gap-1.5">
                  <Ionicons name="chatbubbles-outline" size={16} color="#0F172A" />
                  <Text className="text-[14px] font-semibold text-slate-900">Message</Text>
                </View>
              </Pressable>

              {/* Location */}
              <Pressable
                onPress={() => openDirections(item.lat, item.lon)}
                className="flex-1 rounded-xl py-2.5 items-center border border-slate-300"
              >
                <View className="flex-row items-center gap-1.5">
                  <Ionicons name="navigate-outline" size={16} color="#0F172A" />
                  <Text className="text-[14px] font-semibold text-slate-900">Location</Text>
                </View>
              </Pressable>
            </View>

            {/* Complete / Cancel */}
            {item.emStatus === "in_process" && (
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
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 bg-white border-b border-slate-200">
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={26} color="#0F172A" />
        </Pressable>
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
            <Text className="text-center text-slate-500 mt-4 text-[15px]">
              No accepted requests to show.
            </Text>
          </View>
        }
      />

      {/* Payment Modal */}
      <PaymentModal
        visible={showPaymentModal}
        offerId={selectedEmergency?.emergencyId || ""} // we treat this as emergencyId
        originalOffer={{
          labor_cost: originalTx?.labor_cost ?? 0,
          distance_fee: originalTx?.distance_fee ?? (selectedEmergency?.distanceKm || 0) * 15,
          total_cost:
            originalTx?.total_amount ??
            ((originalTx?.labor_cost ?? 0) + (originalTx?.distance_fee ?? 0)),
        }}
        onClose={() => {
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
          labor_cost: 50, // default shown value only; real base comes from tx on submit
          distance_fee: (selectedEmergency?.distanceKm || 0) * 15, // 15 PHP per km
          total_cost: 50 + (selectedEmergency?.distanceKm || 0) * 15,
        }}
        onClose={() => {
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
        onConfirm={() => {
          if (confirmHideId) {
            hideAccepted(confirmHideId);
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
