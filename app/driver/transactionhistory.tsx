// app/(driver)/transactionhistory.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  Platform,
  RefreshControl,
  Animated,
  Easing,
  Modal,
  ScrollView,
  Image,
  Alert,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { supabase } from "../../utils/supabase";

/* ------------------------------ Design tokens ------------------------------ */
const COLORS = {
  bg: "#F7F8FA",
  surface: "#FFFFFF",
  border: "#E5E7EB",
  text: "#0F172A",
  sub: "#475569",
  muted: "#94A3B8",
  primary: "#2563EB",
  success: "#16A34A",
  danger: "#DC2626",
  warning: "#D97706",
};

const STORAGE_BUCKET = "payment_proofs"; // ensure this bucket exists in Supabase

const cardShadow = Platform.select({
  ios: {
    shadowColor: "#0F172A",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  android: { elevation: 2 },
});

/* ---------------------------------- Types --------------------------------- */
type PaymentMethod = "Cash" | "GCash" | "Card" | "Unknown";
type SortKey = "date" | "amount";
type SortDir = "desc" | "asc";
type RangeKey = "All" | "7d" | "30d" | "ThisMonth";

type PaymentTx = {
  transaction_id: string;
  emergency_id: string;
  service_id: string;
  shop_id: string;
  driver_user_id: string | null;
  distance_fee: number;
  labor_cost: number;
  parts_cost: number;
  extra_total: number;
  extra_items: any[] | null;
  total_amount: number;
  status: "to_pay" | "paid" | "canceled" | "pending";
  payment_method: string | null;
  created_at: string;
  updated_at: string | null;
  paid_at: string | null;
  proof_image_url?: string | null;

  // ✅ NEW
  receiver_shop_id: string | null;
};

// ✅ NEW (for places.owner lookup)
type PlaceByOwnerRow = { owner: string | null; name?: string | null; place_id?: string | null };

type ShopRow = {
  shop_id: string;
  shop_name?: string | null;
  business_name?: string | null;
  name?: string | null;
  place_id?: string | null;
};

type AppUserRow = { user_id: string; full_name?: string | null };
type PlaceRow = { place_id: string; name?: string | null };

type TxItem = {
  id: string; // transaction_id
  title: string; // final display name (ideally from places.name)
  desc: string;
  method: PaymentMethod;
  amount: number;
  status: "pending" | "completed" | "refunded" | "failed";
  dateISO: string;
  raw: PaymentTx;
};

/* --------------------------------- Utils ---------------------------------- */
const MONTHS_ABBR = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "Jun.", "Jul.", "Aug.", "Sep.", "Oct.", "Nov.", "Dec."];

function formatPayNowDate(iso: string) {
  const d = new Date(iso);
  const month = MONTHS_ABBR[d.getMonth()];
  const day = d.getDate();
  const year = d.getFullYear();
  let h = d.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const hh = String(h).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${month} ${day}, ${year} | ${hh}:${mm} ${ampm}`;
}

const peso = (amt: number) => `₱${(Number(amt) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

const withinDays = (dateISO: string, days: number) => {
  const now = new Date();
  const d = new Date(dateISO);
  const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
  return diff <= days;
};
const isSameMonth = (dateISO: string, ref: Date) => {
  const d = new Date(dateISO);
  return d.getMonth() === ref.getMonth() && d.getFullYear() === ref.getFullYear();
};

const methodIcon: Record<PaymentMethod, keyof typeof Ionicons.glyphMap> = {
  Cash: "cash-outline",
  GCash: "wallet-outline",
  Card: "card-outline",
  Unknown: "help-circle-outline",
};

const statusStyle: Record<
  TxItem["status"],
  { text: string; pillBg: string; pillText: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  pending: { text: "Awaiting Payment", pillBg: "bg-amber-50", pillText: "text-amber-700", icon: "time" },
  completed: { text: "Paid", pillBg: "bg-green-50", pillText: "text-green-700", icon: "checkmark-circle" },
  refunded: { text: "Canceled", pillBg: "bg-slate-100", pillText: "text-slate-700", icon: "refresh" },
  failed: { text: "Failed", pillBg: "bg-red-50", pillText: "text-red-700", icon: "close-circle" },
};

function pickShopName(s?: ShopRow | null, u?: AppUserRow | null, p?: PlaceRow | null) {
  // Priority: shop_details.shop_name → business_name → places.name → app_user.full_name → shop_details.name → fallback
  return (
    s?.shop_name?.trim() ||
    s?.business_name?.trim() ||
    p?.name?.trim() ||
    u?.full_name?.trim() ||
    s?.name?.trim() ||
    "Mechanic/Shop"
  );
}

/* ================== SAME UPLOAD STYLE AS emergencyrequest.tsx ================= */
// base64 -> ArrayBuffer
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
    ext === "png"
      ? "image/png"
      : ext === "webp"
      ? "image/webp"
      : ext === "heic" || ext === "heif"
      ? "image/heic"
      : fallbackType;
  return { ext: ext || "jpg", type };
}

async function uploadReceiptToBucket(userId: string, txId: string, localUri: string) {
  const bucket = supabase.storage.from(STORAGE_BUCKET);

  // read local file → base64 → ArrayBuffer
  let arrayBuffer: ArrayBuffer;
  let { type: contentType, ext } = guessExtAndMime(localUri);
  try {
    const base64 = await FileSystem.readAsStringAsync(localUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    arrayBuffer = base64ToArrayBuffer(base64.replace(/\r?\n/g, ""));
  } catch (readErr) {
    console.warn("read->base64->arrayBuffer failed", { localUri, readErr });
    throw readErr;
  }

  const path = `${userId}/${txId}/receipt-${Date.now()}.${ext}`;

  // Attempt direct upload (ArrayBuffer)
  let uploadedOk = false;
  let lastErr: any = null;

  try {
    const { error } = await bucket.upload(path, arrayBuffer, {
      upsert: true,
      contentType,
    });
    if (error) throw error;
    uploadedOk = true;
  } catch (err: any) {
    lastErr = err;
    console.warn("direct upload failed, will try signed upload", err?.message || err);
  }

  // Fallback: signed upload
  if (!uploadedOk) {
    try {
      const { data: sign, error: signErr } = await bucket.createSignedUploadUrl(path);
      if (signErr) throw signErr;

      const { error: up2Err } = await bucket.uploadToSignedUrl(path, sign.token, arrayBuffer, {
        upsert: true,
        contentType,
      });
      if (up2Err) throw up2Err;

      uploadedOk = true;
    } catch (err2) {
      console.error("signed upload also failed", err2);
      throw lastErr || err2;
    }
  }

  const { data } = bucket.getPublicUrl(path);
  return data.publicUrl as string;
}

/* ===================== Loading overlay ===================== */
function LoadingOverlay({ visible, message }: { visible: boolean; message?: string }) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true })
    );
    loop.start();
    return () => {
      loop.stop();
      spin.setValue(0);
    };
  }, [visible]);

  if (!visible) return null;
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <View className="absolute inset-0 items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.45)" }}>
      <View className="w-80 items-center rounded-2xl bg-white px-6 py-7" style={cardShadow as any}>
        <Animated.View
          style={{
            transform: [{ rotate }],
            width: 64,
            height: 64,
            borderRadius: 32,
            borderWidth: 4,
            borderColor: "#E5E7EB",
            borderTopColor: COLORS.primary,
            marginBottom: 12,
          }}
        />
        <Text className="text-[15px] font-semibold text-slate-900">{message || "Loading…"}</Text>
        <Text className="mt-1 text-center text-[12px] text-slate-600">Please wait a moment.</Text>
      </View>
    </View>
  );
}

/* --------------------------- Filters modal (kept) -------------------------- */
type Option<T> = { value: T; label: string };
function FiltersModal({
  visible,
  onClose,
  method,
  setMethod,
  range,
  setRange,
  sortKey,
  setSortKey,
  sortDir,
  setSortDir,
}: {
  visible: boolean;
  onClose: () => void;
  method: PaymentMethod | "All";
  setMethod: (v: PaymentMethod | "All") => void;
  range: RangeKey;
  setRange: (v: RangeKey) => void;
  sortKey: SortKey;
  setSortKey: (v: SortKey) => void;
  sortDir: SortDir;
  setSortDir: (v: SortDir) => void;
}) {
  const methodOptions: Option<PaymentMethod | "All">[] = [
    { value: "All", label: "All" },
    { value: "Cash", label: "Cash" },
    { value: "GCash", label: "G-Cash" },
    { value: "Card", label: "Card" },
  ];
  const rangeOptions: Option<RangeKey>[] = [
    { value: "All", label: "All time" },
    { value: "7d", label: "Last 7 days" },
    { value: "30d", label: "Last 30 days" },
    { value: "ThisMonth", label: "This month" },
  ];
  const sortOptions: Option<SortKey>[] = [
    { value: "date", label: "Date" },
    { value: "amount", label: "Amount" },
  ];

  if (!visible) return null;

  const OptionRow = <T,>({
    options,
    value,
    onChange,
  }: {
    options: Option<T>[];
    value: T;
    onChange: (v: T) => void;
  }) => (
    <View>
      {options.map((opt, idx) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={`${idx}`}
            onPress={() => onChange(opt.value)}
            className={`mb-2 flex-row items-center justify-between rounded-xl border px-3 py-2 ${
              active ? "border-blue-600 bg-blue-50" : "border-slate-300 bg-white"
            }`}
          >
            <Text className={`text-[13px] ${active ? "text-blue-700" : "text-slate-800"}`}>{opt.label}</Text>
            <Ionicons name={active ? "radio-button-on" : "radio-button-off"} size={18} color={active ? "#2563EB" : "#94A3B8"} />
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <Modal transparent animationType="fade" statusBarTranslucent>
      <View className="flex-1 items-center justify-center bg-black/40">
        <View className="w-[88%] max-w-[420px] rounded-2xl bg-white p-5" style={cardShadow as any}>
          <View className="flex-row items-center justify-between">
            <Text className="text-[16px] font-semibold text-slate-900">Filters</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color="#111827" />
            </Pressable>
          </View>

          <ScrollView className="mt-3" contentContainerStyle={{ paddingBottom: 8 }}>
            <Text className="mb-2 text-[12px] font-medium text-slate-500">Payment method</Text>
            <OptionRow options={methodOptions} value={method} onChange={setMethod} />

            <Text className="mt-3 mb-2 text-[12px] font-medium text-slate-500">Date range</Text>
            <OptionRow options={rangeOptions} value={range} onChange={setRange} />

            <Text className="mt-3 mb-2 text-[12px] font-medium text-slate-500">Sort by</Text>
            <OptionRow options={sortOptions} value={sortKey} onChange={setSortKey} />

            <View className="mt-2 flex-row items-center justify-between rounded-xl border border-slate-300 bg-white px-3 py-2">
              <Text className="text-[13px] text-slate-800">Direction</Text>
              <Pressable
                onPress={() => setSortDir(sortDir === "desc" ? "asc" : "desc")}
                className="flex-row items-center rounded-lg bg-slate-100 px-3 py-1.5 active:opacity-90"
              >
                <Ionicons name={sortDir === "desc" ? "arrow-down" : "arrow-up"} size={16} color="#111827" />
                <Text className="ml-1 text-[12px] text-slate-800">{sortDir === "desc" ? "Desc" : "Asc"}</Text>
              </Pressable>
            </View>
          </ScrollView>

          <Pressable onPress={onClose} className="mt-3 items-center justify-center rounded-xl bg-blue-600 py-3 active:opacity-90">
            <Text className="text-[14px] font-semibold text-white">Apply</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/* ================================== Screen ================================= */
export default function TransactionHistory() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Filters
  const [methodFilter, setMethodFilter] = useState<PaymentMethod | "All">("All");
  const [range, setRange] = useState<RangeKey>("All");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Menus
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);

  // Data
  const [items, setItems] = useState<TxItem[]>([]);
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState<string | undefined>(undefined);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTx, setDetailTx] = useState<TxItem | null>(null);

  // Pay Now
  const [payOpen, setPayOpen] = useState(false);
  const [payTx, setPayTx] = useState<TxItem | null>(null);
  const [payMethod, setPayMethod] = useState<PaymentMethod>("GCash");
  const [proofUri, setProofUri] = useState<string | null>(null);
  const [paySubmitting, setPaySubmitting] = useState(false);

  const PAGE_SIZE = 20;

  const mapMethod = (s?: string | null): PaymentMethod => {
    if (!s) return "Unknown";
    const v = s.toLowerCase();
    if (v.includes("gcash")) return "GCash";
    if (v.includes("card")) return "Card";
    if (v.includes("cash")) return "Cash";
    return "Unknown";
  };

const loadData = useCallback(async (reset = false) => {
  try {
    if (reset) {
      setLoading(true);
      setLoadingMsg("Loading transactions…");
    }

    // who am I
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) throw new Error("Please sign in.");

    // my transactions (TYPED)
    const { data: txs, error: txErr } = await supabase
    .from("payment_transaction")
    .select(
      [
        "transaction_id",
        "emergency_id",
        "service_id",
        "shop_id",
        "receiver_shop_id",     // ✅ add this
        "driver_user_id",
        "distance_fee",
        "labor_cost",
        "parts_cost",
        "extra_total",
        "extra_items",
        "total_amount",
        "status",
        "payment_method",
        "created_at",
        "updated_at",
        "paid_at",
        "proof_image_url",
      ].join(",")
    )
    .eq("driver_user_id", auth.user.id)
    .order("created_at", { ascending: false })
    .returns<PaymentTx[]>();

    if (txErr) throw txErr;

    const list: PaymentTx[] = txs ?? [];

    // ✅ owner-based name resolution
    const receiverIds = Array.from(
      new Set(list.map(t => (t.receiver_shop_id || t.shop_id)).filter(Boolean) as string[])
    );

    const placeByOwner = new Map<string, PlaceByOwnerRow>();
    if (receiverIds.length) {
      const { data: placesByOwner } = await supabase
        .from("places")
        .select("owner, name, place_id")
        .in("owner", receiverIds)
        .returns<PlaceByOwnerRow[]>();
      placesByOwner?.forEach(p => {
        if (p.owner) placeByOwner.set(p.owner, p);
      });
    }


    /* ---------- Resolve shop display names with PLACES priority ---------- */
    const shopIds = Array.from(new Set(list.map((t) => t.shop_id)));

    const placeDirectById = new Map<string, PlaceRow>(); // when shop_id === places.place_id
    const shopById = new Map<string, ShopRow>();         // shop_details by shop_id
    const placeByShopPlaceId = new Map<string, PlaceRow>();
    const userById = new Map<string, AppUserRow>();      // optional fallback

    if (shopIds.length) {
      // A) Try direct places lookup using shop_id as place_id (TYPED)
      const { data: directPlaces } = await supabase
        .from("places")
        .select("place_id, name")
        .in("place_id", shopIds)
        .returns<PlaceRow[]>();
      directPlaces?.forEach((p) => placeDirectById.set(p.place_id, p));

      // B) shop_details (discover place_id) (TYPED)
      const { data: shops } = await supabase
        .from("shop_details")
        .select("shop_id, shop_name, business_name, name, place_id")
        .in("shop_id", shopIds)
        .returns<ShopRow[]>();
      shops?.forEach((s) => shopById.set(s.shop_id, s));

      // C) places from the discovered place_ids (TYPED)
      const placeIds = Array.from(new Set((shops ?? []).map((s) => s.place_id).filter(Boolean) as string[]));
      if (placeIds.length) {
        const { data: placeRows } = await supabase
          .from("places")
          .select("place_id, name")
          .in("place_id", placeIds)
          .returns<PlaceRow[]>();
        placeRows?.forEach((p) => placeByShopPlaceId.set(p.place_id, p));
      }

      // D) optional: app_user as a last resort (TYPED)
      const { data: users } = await supabase
        .from("app_user")
        .select("user_id, full_name")
        .in("user_id", shopIds)
        .returns<AppUserRow[]>();
      users?.forEach((u) => userById.set(u.user_id, u));
    }

const mapped: TxItem[] = list.map((t) => {
  // ✅ 1st choice: places.name where places.owner == receiver_shop_id (or shop_id)
  let title = "Mechanic/Shop";
  const ownerKey = t.receiver_shop_id ?? t.shop_id;
  const ownerPlace = ownerKey ? placeByOwner.get(ownerKey) : undefined;

  if (ownerPlace?.name?.trim()) {
    title = ownerPlace.name.trim();
  } else {
    // (optional) your existing fallbacks:
    // - direct places by place_id if shop_id is a place_id
    // - shop_details → place_id → places
    const directPlace = placeDirectById?.get?.(t.shop_id);
    if (directPlace?.name?.trim()) {
      title = directPlace.name.trim();
    } else {
      const srow = shopById?.get?.(t.shop_id);
      const prow = srow?.place_id ? placeByShopPlaceId?.get?.(srow.place_id) : undefined;
      const urow = userById?.get?.(t.shop_id);
      title = pickShopName(srow, urow, prow);
    }
  }

  const status: TxItem["status"] =
    t.status === "paid" ? "completed" :
    t.status === "to_pay" ? "pending" :
    t.status === "canceled" ? "refunded" : "failed";

  const parts = [
    t.distance_fee > 0 ? `Distance ${peso(t.distance_fee)}` : null,
    t.labor_cost > 0 ? `Labor ${peso(t.labor_cost)}` : null,
    t.parts_cost > 0 ? `Parts ${peso(t.parts_cost)}` : null,
    Array.isArray(t.extra_items) && t.extra_items.length > 0 ? `Other ${peso(t.extra_total)}` : null,
  ].filter(Boolean);

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
  };
});


    setItems(mapped);
  } catch (e: any) {
    console.warn("loadData error:", e?.message);
  } finally {
    setLoading(false);
    setLoadingMsg(undefined);
  }
}, []);


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

  /* ----------------------------- Filter & Sort ----------------------------- */
  const filtered = useMemo(() => {
    const now = new Date();
    return items.filter((t) => {
      if (methodFilter !== "All" && t.method !== methodFilter) return false;
      if (range === "7d" && !withinDays(t.dateISO, 7)) return false;
      if (range === "30d" && !withinDays(t.dateISO, 30)) return false;
      if (range === "ThisMonth" && !isSameMonth(t.dateISO, now)) return false;
      return true;
    });
  }, [items, methodFilter, range]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "date") cmp = new Date(a.dateISO).getTime() - new Date(b.dateISO).getTime();
      else cmp = a.amount - b.amount;
      return sortDir === "asc" ? cmp : -cmp;
    });
    // pending first (to_pay)
    arr.sort((a, b) => {
      const prio = (x: TxItem["status"]) => (x === "pending" ? 0 : x === "completed" ? 1 : 2);
      return prio(a.status) - prio(b.status);
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const totals = useMemo(() => {
    const amt = filtered.reduce((sum, t) => (t.status === "completed" ? sum + t.amount : sum), 0);
    return { count: filtered.length, amount: amt };
  }, [filtered]);

  /* --------------------------- Detail (breakdown) -------------------------- */
  const openDetail = (tx: TxItem) => {
    setDetailTx(tx);
    setDetailOpen(true);
  };

  const ExtraItemsList = ({ items }: { items: any[] | null }) => {
    if (!Array.isArray(items) || items.length === 0) return null;
    const arr = Array.isArray(items) ? items : [];
    return (
      <View className="mt-1">
        <Text className="text-[13px] font-semibold text-slate-700">Other services/items</Text>
        {arr.map((x: any, idx: number) => {
          const name = String(x?.name ?? x?.title ?? `Item ${idx + 1}`);
          const qty = Number(x?.qty ?? x?.quantity ?? 1) || 1;
          const unit = Number(x?.fee ?? x?.price ?? x?.amount ?? x?.cost ?? 0) || 0;
          const line = qty * unit;
          return (
            <View key={x?.id ?? idx} className="flex-row items-baseline py-1">
              <Text className="flex-1 text-[12px] text-slate-700">{name}</Text>
              <Text className="mr-2 text-[12px] text-slate-500">
                ₱{unit.toFixed(2)} × {qty}
              </Text>
              <Text className="text-[12px] font-semibold text-slate-800">₱{line.toFixed(2)}</Text>
            </View>
          );
        })}
      </View>
    );
  };

  /* --------------------------------- Item ---------------------------------- */
  const Item = ({ tx }: { tx: TxItem }) => {
    const s = statusStyle[tx.status];
    const isDim = tx.status !== "pending" && tx.status !== "completed";
    // only show Pay Now if still pending AND no proof uploaded yet
  const showPayNow = tx.status === "pending" && !tx.raw.proof_image_url;

    return (
      <View className="px-4">
        <View className="mb-3 overflow-hidden rounded-2xl bg-white" style={cardShadow as any}>
          {/* Top row */}
          <Pressable onPress={() => openDetail(tx)} className="flex-row items-center p-4 pb-3 active:opacity-90">
            <View className="mr-3 rounded-full bg-blue-50 p-2">
              <Ionicons name={methodIcon[tx.method]} size={20} color={COLORS.primary} />
            </View>

            <View className="flex-1">
              <Text className={`text-[15px] font-semibold ${isDim ? "text-slate-500" : "text-slate-900"}`} numberOfLines={1}>
                {tx.title}
              </Text>
              <Text className={`mt-0.5 text-[12px] ${isDim ? "text-slate-400" : "text-slate-600"}`} numberOfLines={1}>
                {tx.desc}
              </Text>
            </View>

            <Text className={`ml-2 text-[16px] font-bold ${isDim ? "text-slate-500" : "text-slate-900"}`} numberOfLines={1}>
              {peso(tx.amount)}
            </Text>
          </Pressable>

          {/* Divider */}
          <View className="mx-4 h-[1px] bg-slate-100" />

          {/* Bottom meta + full-width Pay Now below */}
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
      <Text className="mt-1 text-center text-[12px] text-slate-500">When a shop sends an invoice, it will appear here.</Text>
    </View>
  );

  /* --------------------------------- Render -------------------------------- */
  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: COLORS.bg, paddingBottom: Math.max(insets.bottom, 0) }}>
      {/* Header */}
      <View className="relative h-14 flex-row items-center border-b border-slate-200 bg-white">
        <Pressable onPress={() => router.back()} hitSlop={12} className="absolute left-4">
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </Pressable>
        <View className="absolute inset-0 items-center justify-center">
          <Text className="text-lg font-semibold text-slate-900">Transaction history</Text>
        </View>

        {/* Quick filter */}
        <Pressable onPress={() => setQuickOpen(true)} hitSlop={12} className="absolute right-4">
          <Ionicons name="filter" size={22} color="#111827" />
        </Pressable>
      </View>

      {/* Totals card */}
      <View className="px-4 pt-3 pb-2 bg-white">
        <View className="mb-0.5 flex-row items-center justify-between rounded-2xl bg-slate-50 p-3" style={cardShadow as any}>
          <View>
            <Text className="text-[12px] text-slate-600">Transactions</Text>
            <Text className="text-[16px] font-semibold text-slate-900">{filtered.length}</Text>
          </View>
          <View className="items-end">
            <Text className="text-[12px] text-slate-600">Total paid</Text>
            <Text className="text-[16px] font-semibold text-slate-900">
              {peso(filtered.reduce((sum, t) => (t.status === "completed" ? sum + t.amount : sum), 0))}
            </Text>
          </View>
        </View>
      </View>

      {/* List */}
      <FlatList
        data={sorted.slice(0, PAGE_SIZE * page)}
        keyExtractor={(it) => it.id}
        renderItem={({ item }) => <Item tx={item} />}
        ListEmptyComponent={<Empty />}
        contentContainerStyle={{ paddingBottom: 16 }}
        onEndReachedThreshold={0.2}
        onEndReached={onEndReached}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />

      {/* Loading overlay */}
      <LoadingOverlay visible={loading} message={loadingMsg} />

      {/* Quick method dropdown */}
      <QuickFilterMenu
        visible={quickOpen}
        onClose={() => setQuickOpen(false)}
        value={methodFilter}
        onSelect={setMethodFilter}
        onMore={() => setFiltersOpen(true)}
      />

      {/* Full filters modal */}
      <FiltersModal
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        method={methodFilter}
        setMethod={setMethodFilter}
        range={range}
        setRange={setRange}
        sortKey={sortKey}
        setSortKey={setSortKey}
        sortDir={sortDir}
        setSortDir={setSortDir}
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

          // who am I
          const { data: auth } = await supabase.auth.getUser();
          const userId = auth?.user?.id;
          if (!userId) throw new Error("Please sign in.");

          // 1) Upload proof
          const proofUrl = await uploadReceiptToBucket(userId, payTx.id, proofUri);

          // 2) Update the transaction to carry the proof + method.
          //    IMPORTANT: do NOT mark as 'paid' here.
          const now = new Date().toISOString();
          const { error: txErr } = await supabase
            .from("payment_transaction")
            .update({
              payment_method: payMethod,
              proof_image_url: proofUrl,
              updated_at: now,
              // keep or set as 'to_pay' while waiting for shop to confirm
              status: "to_pay",
            })
            .eq("transaction_id", payTx.id);
          if (txErr) throw txErr;

          // 3) (removed) do NOT complete the emergency here — shop will confirm and complete if needed

          // 4) Local UI update
          setItems((prev) =>
            prev.map((i) =>
              i.id === payTx.id
                ? {
                    ...i,
                    method: payMethod,
                    // keep the card in "pending" (our UI maps 'to_pay' -> pending)
                    status: "pending",
                    raw: {
                      ...i.raw,
                      status: "to_pay",
                      payment_method: payMethod,
                      proof_image_url: proofUrl,
                      updated_at: now,
                    },
                  }
                : i
            )
          );

          setPayOpen(false);
          setPayTx(null);
          setProofUri(null);
          Alert.alert("Payment submitted", "Thanks! Waiting for the shop to confirm receipt.");
        } catch (e: any) {
          Alert.alert("Submission failed", e?.message ?? "Please try again.");
        } finally {
          setPaySubmitting(false);
        }
      }}

      />
    </SafeAreaView>
  );
}

/* ---------------------------- Small subcomponents --------------------------- */
function QuickFilterMenu({
  visible,
  onClose,
  value,
  onSelect,
  onMore,
}: {
  visible: boolean;
  onClose: () => void;
  value: PaymentMethod | "All";
  onSelect: (v: PaymentMethod | "All") => void;
  onMore: () => void;
}) {
  const methodOptions: (PaymentMethod | "All")[] = ["All", "Cash", "GCash", "Card", "Unknown"];
  if (!visible) return null;
  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable className="flex-1" onPress={onClose} style={{ backgroundColor: "rgba(0,0,0,0.2)" }}>
        <View className="absolute right-3 top-14 w-48 rounded-2xl bg-white p-1" style={cardShadow as any}>
          {methodOptions.map((opt) => {
            const active = value === opt;
            return (
              <Pressable
                key={opt}
                onPress={() => {
                  onSelect(opt);
                  onClose();
                }}
                className={`rounded-2xl px-3 py-2 ${active ? "bg-slate-100" : ""}`}
              >
                <Text className={`text-[14px] ${active ? "text-[#2563EB] font-semibold" : "text-slate-800"}`}>
                  {opt === "All" ? "All methods" : opt}
                </Text>
              </Pressable>
            );
          })}
          <View className="my-1 h-px bg-slate-200" />
          <Pressable onPress={() => { onClose(); onMore(); }} className="rounded-2xl px-3 py-2">
            <Text className="text-[14px] text-slate-800">More filters…</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

function Row({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <View className="flex-row items-center justify-between py-1">
      <Text className={`text-slate-600 ${big ? "text-[14px] font-semibold" : "text-[12px]"}`}>{label}</Text>
      <Text className={`${big ? "text-[16px] font-bold" : "text-[12px]"} text-slate-900`}>{value}</Text>
    </View>
  );
}

/* ------------------------------- PayNowModal ------------------------------- */
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
  onSubmit: () => Promise<void>;
}) {
  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "We need access to your photos to upload a receipt.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsEditing: false,
    });
    if (!res.canceled && res.assets?.[0]?.uri) {
      setProofUri(res.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "We need camera access to take a receipt photo.");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      quality: 0.9,
      allowsEditing: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    if (!res.canceled && res.assets?.[0]?.uri) {
      setProofUri(res.assets[0].uri);
    }
  };

  if (!visible) return null;

  // ---- Breakdown helpers (show EVERYTHING the driver will pay) ----
  const raw = tx?.raw;
  const extras = (raw?.extra_items ?? []) as any[];
  const extrasTotal = Number(raw?.extra_total || 0) || 0;

  const distance = Number(raw?.distance_fee || 0) || 0;
  const labor = Number(raw?.labor_cost || 0) || 0;
  const parts = Number(raw?.parts_cost || 0) || 0;
  const subtotal = distance + labor + parts + extrasTotal;
  const grand = Number(tx?.amount || 0) || subtotal;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/30" onPress={onClose} />
      <View className="w-full rounded-t-3xl bg-white px-5 pt-3 pb-5" style={[{ maxHeight: "88%" }, cardShadow as any]}>
        <View className="items-center mb-3">
          <View className="h-1.5 w-10 bg-slate-200 rounded-full" />
        </View>

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
              {distance > 0 && <Row label="Distance fee" value={peso(distance)} />}
              {labor > 0 && <Row label="Labor cost" value={peso(labor)} />}
              {parts > 0 && <Row label="Parts cost" value={peso(parts)} />}

              {Array.isArray(extras) && extras.length > 0 && (
                <View className="mt-1">
                  <Text className="text-[12px] font-medium text-slate-700">Other services/items</Text>
                  {extras.map((x: any, idx: number) => {
                    const name = String(x?.name ?? x?.title ?? `Item ${idx + 1}`);
                    const qty = Number(x?.qty ?? x?.quantity ?? 1) || 1;
                    const unit = Number(x?.fee ?? x?.price ?? x?.amount ?? x?.cost ?? 0) || 0;
                    const line = qty * unit;
                    return (
                      <View key={x?.id ?? idx} className="flex-row items-baseline py-1">
                        <Text className="flex-1 text-[12px] text-slate-700">{name}</Text>
                        <Text className="mr-2 text-[12px] text-slate-500">
                          ₱{unit.toFixed(2)} × {qty}
                        </Text>
                        <Text className="text-[12px] font-semibold text-slate-800">₱{line.toFixed(2)}</Text>
                      </View>
                    );
                  })}
                  <View className="mt-1">
                    <Row label="Other services total" value={peso(extrasTotal)} />
                  </View>
                </View>
              )}

              <View className="my-2 h-px bg-slate-200" />
              <Row label="Subtotal" value={peso(subtotal)} big />
              <View className="mt-1 rounded-lg bg-slate-50 px-3 py-2">
                <View className="flex-row items-center justify-between">
                  <Text className="text-[14px] font-semibold text-slate-900">Amount to pay</Text>
                  <Text className="text-[16px] font-extrabold text-slate-900">{peso(grand)}</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Payment Method */}
        <Text className="mb-2 text-[12px] font-medium text-slate-500">Payment method</Text>
        <View className="mb-3 flex-row gap-2">
          {(["GCash", "Cash"] as PaymentMethod[]).map((m) => {
            const active = method === m;
            return (
              <Pressable
                key={m}
                onPress={() => setMethod(m)}
                className={`flex-row items-center rounded-xl border px-3 py-2 ${
                  active ? "border-blue-600 bg-blue-50" : "border-slate-300 bg-white"
                }`}
              >
                <Ionicons name={m === "GCash" ? "wallet-outline" : "cash-outline"} size={18} color={active ? "#2563EB" : "#64748B"} />
                <Text className={`ml-2 text-[13px] ${active ? "text-blue-700 font-semibold" : "text-slate-800"}`}>{m}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Proof of payment */}
        <Text className="mb-2 text-[12px] font-medium text-slate-500">Proof of payment (required)</Text>
        <View className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-3">
          {proofUri ? (
            <View>
              <Image source={{ uri: proofUri }} className="h-40 w-full rounded-xl" resizeMode="cover" />
              <View className="mt-2 flex-row justify-end gap-2">
                <Pressable onPress={() => setProofUri(null)} className="rounded-xl border border-slate-300 px-3 py-1.5">
                  <Text className="text-[12px] text-slate-800">Remove</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View className="items-center">
              <Ionicons name="image-outline" size={28} color="#94A3B8" />
              <Text className="mt-2 text-center text-[12px] text-slate-500">Upload a clear photo of your receipt or payment confirmation.</Text>
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

        {/* Submit */}
        <Pressable
          disabled={!proofUri || submitting}
          onPress={onSubmit}
          className="mt-4 items-center justify-center rounded-xl py-3"
          style={{ backgroundColor: !proofUri || submitting ? "#cbd5e1" : COLORS.primary, opacity: !proofUri || submitting ? 0.7 : 1 }}
        >
          <Text className="text-[14px] font-semibold text-white">{submitting ? "Submitting…" : "Confirm payment"}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}
