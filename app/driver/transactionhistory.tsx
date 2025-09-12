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
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

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
type PaymentMethod = "Cash" | "GCash" | "Card";
type TxStatus = "completed" | "refunded" | "pending" | "failed";
type SortKey = "date" | "amount";
type SortDir = "desc" | "asc";
type RangeKey = "All" | "7d" | "30d" | "ThisMonth";

type Tx = {
  id: string;
  title: string; // mechanic/shop name
  desc: string; // service description
  method: PaymentMethod;
  amount: number;
  status: TxStatus;
  dateISO: string; // e.g., "2025-09-06T10:47:00+08:00"
};

/* ------------------------------ Mock Data --------------------------------- */
const MOCK_TX: Tx[] = [
  {
    id: "tx_1009",
    title: "Tewe Vulcanizing Shop",
    desc: "Tire vulcanizing & wheel balancing",
    method: "GCash",
    amount: 450,
    status: "completed",
    dateISO: "2025-09-06T10:47:00+08:00",
  },
  {
    id: "tx_1008",
    title: "Esther Howard",
    desc: "Battery jumpstart & diagnostics",
    method: "Cash",
    amount: 350,
    status: "completed",
    dateISO: "2025-09-05T14:55:00+08:00",
  },
  {
    id: "tx_1007",
    title: "RoadHero Mobile",
    desc: "ECU scan",
    method: "Card",
    amount: 600,
    status: "completed",
    dateISO: "2025-08-29T09:30:00+08:00",
  },
  {
    id: "tx_1006",
    title: "QuickTow Cebu",
    desc: "Short-distance towing",
    method: "GCash",
    amount: 1200,
    status: "refunded",
    dateISO: "2025-08-27T19:12:00+08:00",
  },
  {
    id: "tx_1005",
    title: "J&R AutoCare",
    desc: "Flat tire onsite patch",
    method: "Cash",
    amount: 300,
    status: "completed",
    dateISO: "2025-08-21T11:04:00+08:00",
  },
];

/* --------------------------------- Utils ---------------------------------- */
const peso = (amt: number) =>
  `₱${amt.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

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
};

const statusStyle: Record<
  TxStatus,
  { text: string; pillBg: string; pillText: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  completed: {
    text: "Completed",
    pillBg: "bg-green-50",
    pillText: "text-green-700",
    icon: "checkmark-circle",
  },
  refunded: {
    text: "Refunded",
    pillBg: "bg-slate-100",
    pillText: "text-slate-700",
    icon: "refresh",
  },
  pending: {
    text: "Pending",
    pillBg: "bg-amber-50",
    pillText: "text-amber-700",
    icon: "time",
  },
  failed: {
    text: "Failed",
    pillBg: "bg-red-50",
    pillText: "text-red-700",
    icon: "close-circle",
  },
};

/* ===================== RequestStatus-style loading overlay ===================== */
function LoadingOverlay({ visible, message }: { visible: boolean; message?: string }) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => {
      loop.stop();
      spin.setValue(0);
    };
  }, [visible]);

  if (!visible) return null;

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <View
      className="absolute inset-0 items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
    >
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
        <Text className="text-[15px] font-semibold text-slate-900">
          {message || "Loading transactions…"}
        </Text>
        <Text className="mt-1 text-center text-[12px] text-slate-600">
          Fetching your latest payments and services.
        </Text>
      </View>
    </View>
  );
}

/* ----------------------------- Generic types ------------------------------ */
type Option<T> = { value: T; label: string; hint?: string };

/* --------------------------- Combined Filters Modal ------------------------ */
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
    { value: "GCash", label: "GCash" },
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
            <Text className={`text-[13px] ${active ? "text-blue-700" : "text-slate-800"}`}>
              {opt.label}
            </Text>
            <Ionicons
              name={active ? "radio-button-on" : "radio-button-off"}
              size={18}
              color={active ? "#2563EB" : "#94A3B8"}
            />
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
            {/* Method */}
            <Text className="mb-2 text-[12px] font-medium text-slate-500">Payment method</Text>
            <OptionRow options={methodOptions} value={method} onChange={setMethod} />

            {/* Range */}
            <Text className="mt-3 mb-2 text-[12px] font-medium text-slate-500">Date range</Text>
            <OptionRow options={rangeOptions} value={range} onChange={setRange} />

            {/* Sort */}
            <Text className="mt-3 mb-2 text-[12px] font-medium text-slate-500">Sort by</Text>
            <OptionRow options={sortOptions} value={sortKey} onChange={setSortKey} />

            {/* Sort direction toggle */}
            <View className="mt-2 flex-row items-center justify-between rounded-xl border border-slate-300 bg-white px-3 py-2">
              <Text className="text-[13px] text-slate-800">Direction</Text>
              <Pressable
                onPress={() => setSortDir(sortDir === "desc" ? "asc" : "desc")}
                className="flex-row items-center rounded-lg bg-slate-100 px-3 py-1.5 active:opacity-90"
              >
                <Ionicons
                  name={sortDir === "desc" ? "arrow-down" : "arrow-up"}
                  size={16}
                  color="#111827"
                />
                <Text className="ml-1 text-[12px] text-slate-800">
                  {sortDir === "desc" ? "Desc" : "Asc"}
                </Text>
              </Pressable>
            </View>
          </ScrollView>

          <Pressable
            onPress={onClose}
            className="mt-3 items-center justify-center rounded-xl bg-blue-600 py-3 active:opacity-90"
          >
            <Text className="text-[14px] font-semibold text-white">Apply</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/* ----------------------------- Quick Filter Menu ----------------------------- */
/** Matches the anchored dropdown pattern used in requeststatus.tsx */
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
  onMore: () => void; // open full FiltersModal
}) {
  const methodOptions: (PaymentMethod | "All")[] = ["All", "Cash", "GCash", "Card"];

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
                className={`px-3 py-2 rounded-2xl ${active ? "bg-slate-100" : ""}`}
              >
                <Text className={`text-[14px] ${active ? "text-[#2563EB] font-semibold" : "text-slate-800"}`}>
                  {opt === "All" ? "All methods" : opt}
                </Text>
              </Pressable>
            );
          })}
          {/* Divider */}
          <View className="my-1 h-px bg-slate-200" />
          <Pressable
            onPress={() => {
              onClose();
              onMore();
            }}
            className="px-3 py-2 rounded-2xl"
          >
            <Text className="text-[14px] text-slate-800">More filters…</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

/* ================================== Screen ================================= */
export default function TransactionHistory() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Unified filters state
  const [methodFilter, setMethodFilter] = useState<PaymentMethod | "All">("All");
  const [range, setRange] = useState<RangeKey>("All");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Menus
  const [filtersOpen, setFiltersOpen] = useState(false); // full modal
  const [quickOpen, setQuickOpen] = useState(false); // anchored dropdown like requeststatus.tsx

  // Data state
  const [items, setItems] = useState<Tx[]>([]);
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState<string | undefined>(undefined);
  const PAGE_SIZE = 12;

  // Simulated fetch (replace with Supabase)
  const loadData = useCallback(async (reset = false) => {
    if (reset) {
      setLoading(true);
      setLoadingMsg("Loading transactions…");
    }
    await new Promise((r) => setTimeout(r, 420));
    const sorted = [...MOCK_TX].sort(
      (a, b) => new Date(b.dateISO).getTime() - new Date(a.dateISO).getTime()
    );
    setItems(sorted);
    setLoading(false);
    setLoadingMsg(undefined);
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
    if (items.length >= PAGE_SIZE * page) {
      setPage((p) => p + 1);
      // hook real pagination here
    }
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
      if (sortKey === "date") {
        cmp = new Date(a.dateISO).getTime() - new Date(b.dateISO).getTime();
      } else {
        cmp = a.amount - b.amount;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const totals = useMemo(() => {
    const amt = filtered.reduce((sum, t) => (t.status === "completed" ? sum + t.amount : sum), 0);
    return { count: filtered.length, amount: amt };
  }, [filtered]);

  /* --------------------------------- Item ---------------------------------- */
  const Item = ({ tx }: { tx: Tx }) => {
    const s = statusStyle[tx.status];
    const isDim = tx.status === "refunded" || tx.status === "failed";
    return (
      <View className="px-4">
        <View className="mb-3 overflow-hidden rounded-2xl bg-white" style={cardShadow as any}>
          {/* Top row */}
          <View className="flex-row items-center p-4 pb-3">
            <View className="mr-3 rounded-full bg-blue-50 p-2">
              <Ionicons name={methodIcon[tx.method]} size={20} color={COLORS.primary} />
            </View>

            <View className="flex-1">
              <Text
                className={`text-[15px] font-semibold ${isDim ? "text-slate-500" : "text-slate-900"}`}
                numberOfLines={1}
              >
                {tx.title}
              </Text>
              <Text className={`mt-0.5 text-[12px] ${isDim ? "text-slate-400" : "text-slate-600"}`} numberOfLines={1}>
                {tx.desc}
              </Text>
            </View>

            <Text
              className={`ml-2 text-[16px] font-bold ${isDim ? "text-slate-500" : "text-slate-900"}`}
              numberOfLines={1}
            >
              {peso(tx.amount)}
            </Text>
          </View>

          {/* Divider */}
          <View className="mx-4 h-[1px] bg-slate-100" />

          {/* Bottom meta */}
          <View className="flex-row items-center justify-between px-4 py-3">
            <View className="flex-row items-center">
              <Ionicons name="calendar-outline" size={14} color={COLORS.sub} />
              <Text className="ml-1.5 text-[12px] text-slate-600">
                {new Date(tx.dateISO).toLocaleString()}
              </Text>
            </View>

            <View className={`flex-row items-center rounded-full px-2.5 py-1 ${s.pillBg}`}>
              <Ionicons name={s.icon} size={14} color="black" />
              <Text className={`ml-1 text-[12px] ${s.pillText}`}>{s.text}</Text>
            </View>
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
      <Text className="mt-1 text-center text-[12px] text-slate-500">
        Try adjusting the filters to see more results.
      </Text>
    </View>
  );

  /* --------------------------------- Render -------------------------------- */
  return (
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: COLORS.bg, paddingBottom: Math.max(insets.bottom, 0) }}
    >
      {/* Header */}
      <View className="relative h-14 flex-row items-center border-b border-slate-200 bg-white">
        <Pressable onPress={() => router.back()} hitSlop={12} className="absolute left-4">
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </Pressable>
        <View className="absolute inset-0 items-center justify-center">
          <Text className="text-lg font-semibold text-slate-900">Transaction history</Text>
        </View>

        {/* Right: filter icon (opens anchored dropdown like requeststatus.tsx) */}
        <Pressable onPress={() => setQuickOpen(true)} hitSlop={12} className="absolute right-4">
          <Ionicons name="filter" size={22} color="#111827" />
        </Pressable>
      </View>

      {/* Totals card (kept) */}
      <View className="px-4 pt-3 pb-2 bg-white">
        <View
          className="mb-0.5 flex-row items-center justify-between rounded-2xl bg-slate-50 p-3"
          style={cardShadow as any}
        >
          <View>
            <Text className="text-[12px] text-slate-600">Transactions</Text>
            <Text className="text-[16px] font-semibold text-slate-900">{totals.count}</Text>
          </View>
          <View className="items-end">
            <Text className="text-[12px] text-slate-600">Total spent (completed)</Text>
            <Text className="text-[16px] font-semibold text-slate-900">{peso(totals.amount)}</Text>
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

      {/* Quick method dropdown (like requeststatus.tsx) */}
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
    </SafeAreaView>
  );
}
