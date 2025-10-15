// app/driver/transactionhistory.tsx
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  RefreshControl,
  Modal,
  ScrollView,
  Image,
  Alert,
  TextInput,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { supabase } from "../../utils/supabase";
import SideDrawer from "../../components/SideDrawer";

/* ------------------------------ Design tokens ------------------------------ */
const COLORS = {
  bg: "#F7F8FA",
  surface: "#FFFFFF",
  border: "#E5E7EB",
  text: "#0F172A",
  sub: "#475569",
  primary: "#111827",
  success: "#059669",
  danger: "#DC2626",
};

const cardShadow = {
  shadowColor: "#0F172A",
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 6 },
  elevation: 2,
};

/* --------------------------------- Types ---------------------------------- */
type PaymentMethod = "Cash" | "GCash";

type PaymentTx = {
  transaction_id: string;
  emergency_id: string;
  service_id: string;
  shop_id: string;
  driver_user_id: string | null;
  offer_id: string | null;
  rate_per_km: number;
  distance_km: number;
  distance_fee: number;
  labor_cost: number;
  parts_cost: number;
  total_amount: number;
  status: "pending" | "to_pay" | "paid" | "canceled";
  cancel_option: string | null;
  cancel_reason: string | null;
  canceled_at: string | null;
  created_at: string;
  updated_at: string | null;
  extra_items: any[];
  extra_total: number;
  payment_method: string | null;
  paid_at: string | null;
  sender_user_id: string | null;
  receiver_shop_id: string | null;
  proof_image_url: string | null;
};

type PlaceByOwnerRow = { owner: string | null; name: string | null; place_id: string | null };
type PlaceRow = { place_id: string; name: string | null };
type ShopRow = { shop_id: string; place_id: string | null };
type UserRow = { user_id: string; full_name: string | null };

type TxItem = {
  id: string; // transaction_id
  title: string; // shop display name
  desc: string;
  method: PaymentMethod;
  amount: number;
  status: "pending" | "completed" | "refunded" | "failed";
  dateISO: string;
  raw: PaymentTx;
  canRate?: boolean;
};

/* --------------------------------- Utils ---------------------------------- */
const MONTHS_ABBR = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "Jun.", "Jul.", "Aug.", "Sep.", "Oct.", "Nov.", "Dec."];

function formatPayNowDate(iso: string) {
  const d = new Date(iso);
  const month = MONTHS_ABBR[d.getMonth()];
  const day = d.getDate();
  const year = d.getFullYear();
  return `${month} ${day}, ${year}`;
}

const peso = (n: number) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(n || 0);

const mapMethod = (m: string | null | undefined): PaymentMethod => (m === "GCash" ? "GCash" : "Cash");

const methodIcon: Record<PaymentMethod, keyof typeof Ionicons.glyphMap> = {
  Cash: "cash-outline",
  GCash: "wallet-outline",
};

const statusStyle: Record<
  TxItem["status"],
  { text: string; pillBg: string; pillText: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  pending: { text: "Pending", pillBg: "bg-yellow-100", pillText: "text-yellow-900", icon: "time-outline" },
  completed: { text: "Completed", pillBg: "bg-emerald-100", pillText: "text-emerald-900", icon: "checkmark-circle" },
  refunded: { text: "Refunded", pillBg: "bg-slate-200", pillText: "text-slate-900", icon: "refresh" },
  failed: { text: "Failed", pillBg: "bg-rose-100", pillText: "text-rose-900", icon: "close-circle" },
};

/* ---------------------- RN-safe upload helpers (Expo) ---------------------- */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  let bufferLength = base64.length * 0.75;
  const len = base64.length;
  if (base64[len - 1] === "=") bufferLength--;
  if (base64[len - 2] === "=") bufferLength--;
  const arraybuffer = new ArrayBuffer(bufferLength);
  const bytes = new Uint8Array(arraybuffer);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const enc1 = chars.indexOf(base64[i]);
    const enc2 = chars.indexOf(base64[i + 1]);
    const enc3 = chars.indexOf(base64[i + 2]);
    const enc4 = chars.indexOf(base64[i + 3]);
    const chr1 = (enc1 << 2) | (enc2 >> 4);
    const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
    const chr3 = ((enc3 & 3) << 6) | enc4;
    bytes[p++] = chr1;
    if (enc3 !== 64) bytes[p++] = chr2;
    if (enc4 !== 64) bytes[p++] = chr3;
  }
  return arraybuffer;
}

function guessExtAndMime(uri: string, fallbackType = "image/jpeg") {
  const ext = uri.split("?")[0].split(".").pop()?.toLowerCase();
  const type =
    ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "heic" || ext === "heif" ? "image/heic" : fallbackType;
  return { ext: ext || "jpg", type };
}

/* -------------------------------- Header UI -------------------------------- */
function Header({
  onBack,
  onOpenDrawer,
}: {
  onBack: () => void;
  onOpenDrawer: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top, backgroundColor: "#111827" }}>
      <View className="flex-row items-center justify-between px-4 pb-3 pt-3">
        {/* LEFT: Back */}
        <Pressable
          onPress={onBack}
          className="p-2 rounded-lg active:opacity-80"
          android_ripple={{ color: "rgba(255,255,255,0.18)", borderless: true }}
          hitSlop={10}
        >
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </Pressable>

        {/* CENTER: Title */}
        <Text className="text-[18px] font-extrabold text-white">Transactions</Text>

        {/* RIGHT: Burger */}
        <View className="flex-row items-center">
          <Pressable
            onPress={onOpenDrawer}
            className="p-2 rounded-lg active:opacity-80"
            android_ripple={{ color: "rgba(255,255,255,0.18)", borderless: true }}
            hitSlop={10}
          >
            <Ionicons name="menu" size={24} color="#fff" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/* ----------------------------------- App ---------------------------------- */
const PAGE_SIZE = 25;

export default function TransactionHistory() {
  const router = useRouter();

  // Drawer (burger) state
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Data
  const [items, setItems] = useState<TxItem[]>([]);
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  // Details + Proof viewer
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTx, setDetailTx] = useState<TxItem | null>(null);
  const [proofOpen, setProofOpen] = useState(false);

  // Rate Modal
  const [rateOpen, setRateOpen] = useState(false);
  const [rateTx, setRateTx] = useState<TxItem | null>(null);

  // Pay Now
  const [payOpen, setPayOpen] = useState(false);
  const [payTx, setPayTx] = useState<TxItem | null>(null);
  const [payMethod, setPayMethod] = useState<PaymentMethod>("GCash");
  const [proofUri, setProofUri] = useState<string | null>(null);
  const [paySubmitting, setPaySubmitting] = useState(false);

  const loadData = useCallback(async (reset = false) => {
    try {
      if (reset) setPage(1);
      setLoading(true);

      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user?.id) throw new Error("Not signed in");

      const { data: list } = await supabase
        .from("payment_transaction")
        .select("*")
        .eq("driver_user_id", auth.user.id)
        .order("created_at", { ascending: false })
        .range(0, PAGE_SIZE * (reset ? 1 : page) - 1)
        .returns<PaymentTx[]>();

      // Which are already rated
      const txIds = (list ?? []).map((t) => t.transaction_id);
      const { data: ratedRows } = await supabase
        .from("ratings")
        .select("transaction_id")
        .in("transaction_id", txIds)
        .eq("driver_user_id", auth.user.id);

      const ratedSet = new Set((ratedRows ?? []).map((r: any) => r.transaction_id));

      // Resolve shop/place names (best-effort)
      const receiverIds = Array.from(
        new Set((list ?? []).map((t) => (t.receiver_shop_id || t.shop_id)).filter(Boolean) as string[])
      );
      const placeByOwner = new Map<string, PlaceByOwnerRow>();
      if (receiverIds.length) {
        const { data: placesByOwner } = await supabase
          .from("places")
          .select("owner, name, place_id")
          .in("owner", receiverIds)
          .returns<PlaceByOwnerRow[]>();
        placesByOwner?.forEach((p) => p.owner && placeByOwner.set(p.owner, p));
      }

      const shopIds = Array.from(new Set((list ?? []).map((t) => t.shop_id)));
      const placeDirectById = new Map<string, PlaceRow>();
      const shopById = new Map<string, ShopRow>();
      const userById = new Map<string, UserRow>();

      if (shopIds.length) {
        const { data: placesDirect } = await supabase.from("places").select("place_id, name").returns<PlaceRow[]>();
        placesDirect?.forEach((p) => p.place_id && placeDirectById.set(p.place_id, p));

        const { data: shops } = await supabase
          .from("shop_details")
          .select("shop_id, place_id")
          .in("shop_id", shopIds)
          .returns<ShopRow[]>();
        shops?.forEach((s) => s.shop_id && shopById.set(s.shop_id, s));

        const { data: users } = await supabase
          .from("app_user")
          .select("user_id, full_name")
          .in("user_id", shopIds)
          .returns<UserRow[]>();
        users?.forEach((u) => userById.set(u.user_id, u));
      }

      const mapped: TxItem[] = (list ?? []).map((t) => {
        let title = "Mechanic/Shop";
        const ownerKey = t.receiver_shop_id ?? t.shop_id;
        const ownerPlace = ownerKey ? placeByOwner.get(ownerKey) : undefined;

        if (ownerPlace?.name?.trim()) {
          title = ownerPlace.name.trim();
        } else {
          const directPlace = placeDirectById.get(t.shop_id);
          if (directPlace?.name?.trim()) {
            title = directPlace.name.trim();
          } else {
            const srow = shopById.get(t.shop_id);
            const prow = srow?.place_id ? placeDirectById.get(srow.place_id!) : undefined;
            const urow = userById.get(t.shop_id);
            title = [urow?.full_name, prow?.name].filter(Boolean).join(" · ") || title;
          }
        }

        const isNoFeeCancel = t.cancel_option === "diagnose_only" || Number(t.total_amount) === 0;

        const status: TxItem["status"] = isNoFeeCancel
          ? "completed" // zero-fee cancels are considered completed in history
          : t.status === "paid"
          ? "completed"
          : t.status === "to_pay" || t.status === "pending"
          ? "pending"
          : t.status === "canceled"
          ? "refunded"
          : "failed";

        const canRate = status === "completed" && !ratedSet.has(t.transaction_id);

        const parts = [
          t.distance_fee > 0 ? `Distance ${peso(t.distance_fee)}` : null,
          t.labor_cost > 0 ? `Labor ${peso(t.labor_cost)}` : null,
          t.parts_cost > 0 ? `Parts ${peso(t.parts_cost)}` : null,
          Array.isArray(t.extra_items) && t.extra_items.length > 0 ? `Other ${peso(t.extra_total)}` : null,
        ].filter(Boolean) as string[];

        const desc = parts.length ? parts.join(" • ") : status === "pending" ? "Awaiting payment" : "—";

        return {
          id: t.transaction_id,
          title,
          desc,
          method: mapMethod(t.payment_method),
          amount: t.total_amount,
          status,
          dateISO: t.created_at,
          raw: t,
          canRate,
        };
      });

      setItems(mapped);
    } catch (e: any) {
      console.warn("loadData error:", e?.message);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    loadData(true);
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData(true);
    setRefreshing(false);
  }, [loadData]);

  const onEndReached = useCallback(async () => {
    if (items.length >= PAGE_SIZE * page) setPage((p) => p + 1);
  }, [items.length, page]);

  const openDetail = (tx: TxItem) => {
    setDetailTx(tx);
    setDetailOpen(true);
  };

  const Item = ({ tx }: { tx: TxItem }) => {
    const s = statusStyle[tx.status];
    const isNoFeeCancel = tx.raw.cancel_option === "diagnose_only" || Number(tx.raw.total_amount) === 0;
    const showPayNow = tx.status === "pending" && !tx.raw.proof_image_url && !isNoFeeCancel;

    return (
      <View className="px-4">
        <View className="mb-3 overflow-hidden rounded-2xl bg-white" style={cardShadow as any}>
          {/* Top row */}
          <Pressable onPress={() => openDetail(tx)} className="flex-row items-center p-4 pb-3 active:opacity-90">
            <View className="mr-3 rounded-full bg-blue-50 p-2">
              <Ionicons name={methodIcon[tx.method]} size={20} color={COLORS.primary} />
            </View>

            <View className="flex-1">
              <Text className="text-[15px] font-extrabold text-slate-900" numberOfLines={1}>
                {tx.title}
              </Text>
              <Text className="mt-0.5 text-[12px] text-slate-500" numberOfLines={1}>
                {tx.desc}
              </Text>
            </View>
          </Pressable>

          {/* Date + status pill */}
          <View className="px-4 py-3">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center">
                <Ionicons name="calendar-outline" size={14} color={COLORS.sub} />
                <Text className="ml-1.5 text-[12px] text-slate-600">{formatPayNowDate(tx.dateISO)}</Text>
              </View>

              <View className={`flex-row items-center rounded-full px-2.5 py-1 ${s.pillBg}`}>
                <Ionicons name={statusStyle[tx.status].icon} size={14} color="black" />
                <Text className={`ml-1 text-[12px] ${s.pillText}`}>{s.text}</Text>
              </View>
            </View>

            {showPayNow && (
              <Pressable
                onPress={() => {
                  setPayTx(tx);
                  setPayOpen(true);
                  setPayMethod("GCash");
                  setProofUri(null);
                }}
                className="mt-2 w-full rounded-xl bg-blue-600 py-3 active:opacity-90"
              >
                <Text className="text-center text-[14px] font-semibold text-white">PAY NOW</Text>
              </Pressable>
            )}

            {/* Rate CTA on paid & not yet rated */}
            {tx.status === "completed" && tx.canRate && (
              <Pressable
                onPress={() => {
                  setRateTx(tx);
                  setRateOpen(true);
                }}
                className="mt-2 w-full rounded-xl bg-blue-600 py-3 active:opacity-90"
              >
                <Text className="text-center text-[14px] font-semibold text-white">Rate this service</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    );
  };

  const Empty = () => (
    <View className="px-6 pt-16 items-center">
      <View className="h-14 w-14 items-center justify-center rounded-full bg-slate-100">
        <Ionicons name="document-text-outline" size={22} color="#64748B" />
      </View>
      <Text className="mt-3 text-[15px] font-semibold text-slate-800">No transactions</Text>
      <Text className="mt-1 text-[13px] text-slate-500">Your completed and pending payments will appear here.</Text>
    </View>
  );

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: COLORS.bg }}>
      <Header onBack={() => router.back()} onOpenDrawer={() => setDrawerOpen(true)} />

      {/* List */}
      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        renderItem={({ item }) => <Item tx={item} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.2}
        contentContainerStyle={{ paddingVertical: 8 }}
        ListEmptyComponent={loading ? undefined : Empty}
      />

      {/* Details sheet */}
      <Modal visible={detailOpen} transparent animationType="slide" onRequestClose={() => setDetailOpen(false)}>
        <View className="flex-1 justify-end bg-black/50">
          <View className="max-h-[88%] rounded-t-2xl bg-white">
            {/* Header */}
            <View className="flex-row items-center justify-between border-b border-slate-200 p-4">
              <Pressable onPress={() => setDetailOpen(false)} className="rounded-full p-1">
                <Ionicons name="chevron-down" size={22} color="#111827" />
              </Pressable>
              <Text className="text-[16px] font-bold text-slate-900">Transaction details</Text>
              <View style={{ width: 26 }} />
            </View>

            {detailTx && (
              <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }}>
                {/* Header row */}
                <View className="rounded-2xl border border-slate-200 bg-white p-4" style={cardShadow as any}>
                  <View className="flex-row items-center">
                    <View className="mr-3 rounded-full bg-blue-50 p-2">
                      <Ionicons name={methodIcon[detailTx.method]} size={20} color={COLORS.primary} />
                    </View>
                    <View className="flex-1">
                      <Text className="text-[16px] font-extrabold text-slate-900" numberOfLines={1}>
                        {detailTx.title}
                      </Text>
                      <Text className="mt-0.5 text-[12px] text-slate-500" numberOfLines={1}>
                        Emergency • {detailTx.raw.emergency_id.slice(0, 8)}… • {formatPayNowDate(detailTx.raw.created_at)}
                      </Text>
                    </View>
                    <Text className="ml-3 text-[14px] font-bold text-slate-900">{peso(detailTx.amount)}</Text>
                  </View>

                  {/* Divider */}
                  <View className="h-px bg-slate-200 my-4" />

                  {/* Breakdown */}
                  <View>
                    {detailTx.raw.distance_fee > 0 && <Row label="Distance fee" value={peso(detailTx.raw.distance_fee)} />}
                    {detailTx.raw.labor_cost > 0 && <Row label="Labor" value={peso(detailTx.raw.labor_cost)} />}
                    {detailTx.raw.parts_cost > 0 && <Row label="Parts" value={peso(detailTx.raw.parts_cost)} />}
                    {Array.isArray(detailTx.raw.extra_items) && detailTx.raw.extra_items.length > 0 && (
                      <Row label="Other charges" value={peso(detailTx.raw.extra_total)} />
                    )}
                  </View>

                  {/* Status pill + Rate */}
                  <View className="mt-4 flex-row items-center justify-between">
                    <View className={`flex-row items-center rounded-full px-2.5 py-1 ${statusStyle[detailTx.status].pillBg}`}>
                      <Ionicons name={statusStyle[detailTx.status].icon} size={14} color="black" />
                      <Text className={`ml-1 text-[12px] ${statusStyle[detailTx.status].pillText}`}>
                        {statusStyle[detailTx.status].text}
                      </Text>
                    </View>

                    {detailTx.status === "completed" && detailTx.canRate && (
                      <Pressable
                        onPress={() => {
                          setRateTx(detailTx);
                          setRateOpen(true);
                        }}
                        className="rounded-xl bg-blue-600 px-3 py-2 active:opacity-90"
                      >
                        <Text className="text-[12px] font-semibold text-white">Rate this service</Text>
                      </Pressable>
                    )}
                  </View>
                </View>

                {/* Proof section */}
                <View className="mt-3 rounded-2xl border border-slate-200 bg-white p-4" style={cardShadow as any}>
                  <View className="mb-2 flex-row items-center justify-between">
                    <Text className="text-[14px] font-semibold text-slate-900">Receipt / Proof of payment</Text>
                    <Pressable onPress={() => setProofOpen(true)}>
                      <Text className="text-[12px] font-semibold text-blue-600">Open</Text>
                    </Pressable>
                  </View>
                  {detailTx?.raw.proof_image_url ? (
                    <Image
                      source={{ uri: detailTx.raw.proof_image_url }}
                      resizeMode="cover"
                      style={{ width: "100%", height: 160, borderRadius: 12, backgroundColor: "#F1F5F9" }}
                    />
                  ) : (
                    <View className="items-center justify-center rounded-xl border border-dashed border-slate-300 p-6">
                      <Ionicons name="image-outline" size={24} color="#94A3B8" />
                      <Text className="mt-2 text-center text-[12px] text-slate-500">No proof uploaded.</Text>
                    </View>
                  )}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Proof full-screen viewer */}
      <Modal visible={proofOpen} transparent animationType="fade" onRequestClose={() => setProofOpen(false)}>
        <View className="flex-1 items-center justify-center bg-black/90">
          <Pressable onPress={() => setProofOpen(false)} className="absolute right-4 top-14 z-10 rounded-full p-2">
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </Pressable>
          <ScrollView maximumZoomScale={1} contentContainerStyle={{ alignItems: "center", padding: 12 }}>
            {detailTx?.raw.proof_image_url ? (
              <Image
                source={{ uri: detailTx.raw.proof_image_url }}
                resizeMode="contain"
                style={{ width: "100%", height: 520, borderRadius: 12, backgroundColor: "#0b0b0b" }}
              />
            ) : (
              <Text className="text-white">No proof uploaded.</Text>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Rate Service Modal */}
      <RateServiceModal
        visible={rateOpen}
        onClose={() => setRateOpen(false)}
        tx={rateTx}
        onSaved={(txId) => {
          setItems((prev) => prev.map((it) => (it.id === txId ? { ...it, canRate: false } : it)));
          setDetailTx((d) => (d && d.id === txId ? { ...d, canRate: false } : d));
        }}
      />

      {/* Pay Now Modal */}
      <PayNowModal
        visible={payOpen}
        onClose={() => setPayOpen(false)}
        tx={payTx}
        method={payMethod}
        setMethod={setPayMethod}
        proofUri={proofUri}
        setProofUri={setProofUri}
        submitting={paySubmitting}
        onSubmit={async () => {
          try {
            if (!payTx) return;
            if (!proofUri) {
              Alert.alert("Receipt required", "Please upload or take a photo of your payment receipt.");
              return;
            }

            setPaySubmitting(true);

            // Upload proof (Expo-safe)
            const { data: auth } = await supabase.auth.getUser();
            const me = auth?.user?.id!;
            const now = new Date().toISOString();
            const key = `${me}/${payTx.raw.transaction_id}/proof.jpg`;

            const b64 = await FileSystem.readAsStringAsync(proofUri, { encoding: FileSystem.EncodingType.Base64 });
            const arrayBuffer = base64ToArrayBuffer(b64.replace(/\r?\n/g, ""));
            const bucket = supabase.storage.from("payment_proofs");

            try {
              const { error } = await bucket.upload(key, arrayBuffer, { contentType: "image/jpeg", upsert: true });
              if (error) throw error;
            } catch {
              const { data: sign, error: signErr } = await bucket.createSignedUploadUrl(key);
              if (signErr) throw signErr;
              const { error: up2Err } = await bucket.uploadToSignedUrl(key, sign.token, arrayBuffer, {
                contentType: "image/jpeg",
                upsert: true,
              });
              if (up2Err) throw up2Err;
            }

            const { data: pub } = bucket.getPublicUrl(key);
            const proofUrl = pub.publicUrl;

            // Update tx → to_pay + proof
            const { error } = await supabase
              .from("payment_transaction")
              .update({ proof_image_url: proofUrl, payment_method: payMethod, status: "to_pay", updated_at: now })
              .eq("transaction_id", payTx.id);
            if (error) throw error;

            // Notify shop owner (type 'system' to satisfy check constraint)
            const { data: shopRow } = await supabase
              .from("shop_details")
              .select("user_id")
              .eq("shop_id", payTx.raw.shop_id)
              .maybeSingle();
            if (shopRow?.user_id) {
              await supabase.from("notifications").insert({
                from_user_id: me,
                to_user_id: shopRow.user_id,
                type: "system",
                title: "Payment proof uploaded",
                body: "The driver sent a receipt for verification.",
                data: { transaction_id: payTx.id, emergency_id: payTx.raw.emergency_id, event: "payment_proof_uploaded" },
              });
            }

            // Reflect immediately in list/details
            setItems((prev) =>
              prev.map((x) =>
                x.id === payTx.id
                  ? { ...x, raw: { ...x.raw, proof_image_url: proofUrl, updated_at: now, status: "to_pay" } as any, status: "pending" }
                  : x
              )
            );
            if (detailTx?.id === payTx.id) {
              setDetailTx((d) =>
                d ? { ...d, raw: { ...d.raw, proof_image_url: proofUrl, updated_at: now, status: "to_pay" } as any, status: "pending" } : d
              );
            }

            setPayOpen(false);
          } catch (e) {
            console.error(e);
            Alert.alert("Error", "Could not submit payment.");
          } finally {
            setPaySubmitting(false);
          }
        }}
      />

      {/* Side Drawer — same props as driverLandingpage.tsx */}
      <SideDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        logoSource={require("../../assets/images/logo2.png")}
        appName="RIDERESCUE"
        onLogout={() => console.log("logout")}
      />
    </SafeAreaView>
  );
}

/* ----------------------------- Small components ---------------------------- */
function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View className="flex-row items-baseline py-1.5">
      <Text className="w-44 pr-2 text-[13px] leading-5 text-slate-600">{label}:</Text>
      <Text className={`flex-1 text-[13px] leading-5 ${bold ? "font-semibold" : ""} text-slate-800`}>{value}</Text>
    </View>
  );
}

/* -------------------------- Rate Service Modal -------------------------- */
function RateServiceModal({
  visible,
  onClose,
  tx,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  tx: TxItem | null;
  onSaved: (txId: string) => void;
}) {
  const [stars, setStars] = useState<number>(0);
  const [comment, setComment] = useState<string>("");
  const [imgUri, setImgUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(false);

  useEffect(() => {
    (async () => {
      if (!visible || !tx) return;
      setLoadingExisting(true);
      const { data: auth } = await supabase.auth.getUser();
      const me = auth?.user?.id;
      const { data } = await supabase
        .from("ratings")
        .select("id, stars, comment, photo_url")
        .eq("driver_user_id", me as any)
        .eq("transaction_id", tx.id)
        .maybeSingle();
      if (data) {
        setStars(data.stars ?? 0);
        setComment(data.comment ?? "");
        setImgUri(data.photo_url ?? null);
      } else {
        setStars(0);
        setComment("");
        setImgUri(null);
      }
      setLoadingExisting(false);
    })();
  }, [visible, tx?.id]);

  const pickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (!res.canceled && res.assets?.length) setImgUri(res.assets[0].uri);
  };
  const takePhoto = async () => {
    const res = await ImagePicker.launchCameraAsync({ quality: 0.85 });
    if (!res.canceled && res.assets?.length) setImgUri(res.assets[0].uri);
  };

  // Expo-safe uploader to ratings_photos
  const uploadPhoto = async (localUri: string, userId: string, txId: string) => {
    const bucket = supabase.storage.from("ratings_photos");
    const { ext, type: contentType } = guessExtAndMime(localUri);
    const path = `${userId}/${txId}/rating-${Date.now()}.${ext}`;

    const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 });
    const arrayBuffer = base64ToArrayBuffer(base64.replace(/\r?\n/g, ""));

    // 1) Try direct upload
    try {
      const { error } = await bucket.upload(path, arrayBuffer, { upsert: true, contentType });
      if (error) throw error;
    } catch {
      // 2) Fallback: signed upload
      const { data: sign, error: signErr } = await bucket.createSignedUploadUrl(path);
      if (signErr) throw signErr;
      const { error: up2Err } = await bucket.uploadToSignedUrl(path, sign.token, arrayBuffer, { upsert: true, contentType });
      if (up2Err) throw up2Err;
    }

    const { data } = bucket.getPublicUrl(path);
    return data.publicUrl;
  };

  const submit = async () => {
    if (!tx) return;
    if (!stars) {
      Alert.alert("Pick a rating", "Please select 1 to 5 stars.");
      return;
    }
    setSubmitting(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const me = auth?.user?.id!;

      let photoUrl: string | null = imgUri;
      if (imgUri && imgUri.startsWith("file:")) {
        photoUrl = await uploadPhoto(imgUri, me, tx.id);
      }

      // Build payload once
      const payload = {
        transaction_id: tx.id,
        emergency_id: tx.raw.emergency_id,
        shop_id: tx.raw.shop_id,
        driver_user_id: me,
        stars,
        comment: comment?.trim() || null,
        photo_url: photoUrl ?? null,
      };

      // One-and-done upsert on (driver_user_id, transaction_id)
      const { error } = await supabase.from("ratings").upsert(payload, {
        onConflict: "driver_user_id,transaction_id",
      });
      if (error) throw error;

      onSaved(tx.id);
      onClose();
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Could not save rating. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!visible) return null as any;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-end bg-black/50">
        <View className="w-full rounded-t-2xl bg-white p-4">
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-[16px] font-semibold text-slate-900">Rate this service</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color="#111827" />
            </Pressable>
          </View>

          {loadingExisting ? (
            <View className="py-10 items-center">
              <Text>Loading…</Text>
            </View>
          ) : (
            <>
              {/* Stars */}
              <View className="mb-2 flex-row items-center gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Pressable key={n} onPress={() => setStars(n)} hitSlop={8}>
                    <Ionicons
                      name={n <= stars ? "star" : "star-outline"}
                      size={28}
                      color={n <= stars ? "#f59e0b" : "#94A3B8"}
                    />
                  </Pressable>
                ))}
                <Text className="ml-2 text-[12px] text-slate-600">{stars || 0}/5</Text>
              </View>

              {/* Comment */}
              <TextInput
                className="min-h-[96px] rounded-xl border border-slate-200 p-3"
                placeholder="Share your experience (optional)"
                multiline
                value={comment}
                onChangeText={setComment}
              />

              {/* Photo */}
              <View className="mt-3 flex-row items-center justify-between">
                <View className="flex-row gap-2">
                  <Pressable onPress={pickImage} className="rounded-xl bg-blue-600 px-3 py-2 active:opacity-90">
                    <Text className="text-[12px] font-semibold text-white">Upload</Text>
                  </Pressable>
                  <Pressable onPress={takePhoto} className="rounded-xl border border-slate-300 px-3 py-2 active:opacity-90">
                    <Text className="text-[12px] font-semibold text-slate-900">Take Photo</Text>
                  </Pressable>
                </View>
                {imgUri ? <Image source={{ uri: imgUri }} style={{ width: 56, height: 56, borderRadius: 8 }} /> : null}
              </View>

              {/* Submit */}
              <Pressable
                disabled={!stars || submitting}
                onPress={submit}
                className="mt-4 items-center justify-center rounded-xl py-3"
                style={{ backgroundColor: !stars || submitting ? "#9CA3AF" : "#059669", opacity: !stars || submitting ? 0.7 : 1 }}
              >
                <Text className="text-[14px] font-semibold text-white">{submitting ? "Saving…" : "Submit rating"}</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

/* ----------------------------- Pay Now Modal ----------------------------- */
function PayNowModal({
  visible,
  onClose,
  tx,
  method,
  setMethod,
  proofUri,
  setProofUri,
  submitting,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  tx: TxItem | null;
  method: PaymentMethod;
  setMethod: (m: PaymentMethod) => void;
  proofUri: string | null;
  setProofUri: (u: string | null) => void;
  submitting: boolean;
  onSubmit: () => void;
}) {
  if (!visible || !tx) return null as any;

  // Belt & suspenders: block modal entirely for zero-fee cancels
  const isNoFeeCancel = tx.raw.cancel_option === "diagnose_only" || Number(tx.raw.total_amount) === 0;
  if (isNoFeeCancel) return null as any;

  const pickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });
    if (!res.canceled && res.assets?.length) setProofUri(res.assets[0].uri);
  };
  const takePhoto = async () => {
    const res = await ImagePicker.launchCameraAsync({ quality: 0.9 });
    if (!res.canceled && res.assets?.length) setProofUri(res.assets[0].uri);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-end bg-black/50">
        <View className="w-full rounded-t-2xl bg-white p-4">
          {/* Header */}
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-[16px] font-semibold text-slate-900">Pay now</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color="#111827" />
            </Pressable>
          </View>

          {tx && (
            <View className="mb-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <Text className="text-[12px] text-slate-600">{tx.title}</Text>

              {/* FULL BREAKDOWN */}
              <View className="mt-2 rounded-xl border border-slate-200 bg-white p-3">
                {tx.raw.distance_fee > 0 && <Row label="Distance fee" value={peso(tx.raw.distance_fee)} />}
                {tx.raw.labor_cost > 0 && <Row label="Labor" value={peso(tx.raw.labor_cost)} />}
                {tx.raw.parts_cost > 0 && <Row label="Parts" value={peso(tx.raw.parts_cost)} />}
                {Array.isArray(tx.raw.extra_items) && tx.raw.extra_items.length > 0 && (
                  <Row label="Other charges" value={peso(tx.raw.extra_total)} />
                )}
                <View className="mt-2 h-px bg-slate-200" />
                <Row label="Total" value={peso(tx.raw.total_amount)} bold />
              </View>

              {/* Method */}
              <View className="mt-3">
                <Text className="mb-1 text-[12px] font-medium text-slate-700">Payment method</Text>
                <View className="flex-row gap-2">
                  {(["GCash", "Cash"] as PaymentMethod[]).map((m) => (
                    <Pressable
                      key={m}
                      onPress={() => setMethod(m)}
                      className={`rounded-xl border px-3 py-2 ${method === m ? "border-blue-600 bg-blue-50" : "border-slate-300"}`}
                    >
                      <Text className={`text-[12px] font-semibold ${method === m ? "text-blue-700" : "text-slate-800"}`}>{m}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Proof upload */}
              <View className="mt-3">
                <Text className="mb-1 text-[12px] font-medium text-slate-700">Receipt / Proof</Text>
                {proofUri ? (
                  <View className="flex-row items-center gap-3 rounded-xl border border-slate-300 p-3">
                    <Image source={{ uri: proofUri }} style={{ width: 56, height: 56, borderRadius: 8 }} />
                    <Pressable onPress={() => setProofUri(null)} className="rounded-xl border border-slate-300 px-3 py-2 active:opacity-90">
                      <Text className="text-[12px] text-slate-800">Remove</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View className="items-center">
                    <Ionicons name="image-outline" size={28} color="#94A3B8" />
                    <Text className="mt-2 text-center text-[12px] text-slate-500">
                      Upload a clear photo of your receipt or payment confirmation.
                    </Text>
                    <View className="mt-3 flex-row gap-2">
                      <Pressable onPress={pickImage} className="rounded-xl bg-blue-600 px-3 py-2 active:opacity-90">
                        <Text className="text-[12px] font-semibold text-white">Upload</Text>
                      </Pressable>
                      <Pressable onPress={takePhoto} className="rounded-xl border border-slate-300 px-3 py-2 active:opacity-90">
                        <Text className="text-[12px] font-semibold text-slate-900">Take Photo</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Submit */}
          <Pressable
            disabled={!proofUri || submitting}
            onPress={onSubmit}
            className="mt-4 items-center justify-center rounded-xl py-3"
            style={{ backgroundColor: !proofUri || submitting ? "#9CA3AF" : COLORS.primary, opacity: !proofUri || submitting ? 0.7 : 1 }}
          >
            <Text className="text-[14px] font-semibold text-white">{submitting ? "Submitting…" : "Confirm payment"}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
