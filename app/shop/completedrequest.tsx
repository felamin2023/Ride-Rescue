// app/shop/completedrequest.tsx
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Image, FlatList, Pressable, Alert, Platform, Modal, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { supabase } from "../../utils/supabase";

/* ----------------------------- Types & helpers ---------------------------- */
type TxRow = {
  transaction_id: string;
  emergency_id: string;
  service_id: string;
  shop_id: string;
  driver_user_id: string | null;
  distance_fee: number;
  labor_cost: number;
  fuel_cost: number;
  parts_cost: number;
  extra_total: number;
  extra_items: any[] | null;
  total_amount: number;
  status: "to_pay" | "paid" | "canceled" | "pending";
  payment_method: string | null;
  cancel_option: string | null;
  created_at: string;
  updated_at: string | null;
  paid_at: string | null;
  proof_image_url: string | null;
};

type DriverRow = { user_id: string; full_name: string | null; photo_url: string | null };
type EmergencyRow = { 
  emergency_id: string; 
  latitude: number; 
  longitude: number; 
  created_at: string;
  service_type: 'vulcanize' | 'repair' | 'gas' | null;
  fuel_type: string | null;
  custom_fuel_type: string | null;
};

type TxRowWithMeta = TxRow & {
  driver_name: string;
  driver_avatar: string;
  created_when: string;
  service_type: 'vulcanize' | 'repair' | 'gas' | null;
  fuel_type: string | null;
  custom_fuel_type: string | null;
};

const AVATAR_PLACEHOLDER =
  "https://images.unsplash.com/photo-1527980965255-d3b416303d12?q=80&w=256&auto=format&fit=crop";

const cardShadow = Platform.select({
  ios: { shadowColor: "#0F172A", shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
  android: { elevation: 2 },
});

const peso = (n: number) => `\u20B1${(Number(n) || 0).toFixed(2)}`;

const MONTHS_ABBR = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "Jun.", "Jul.", "Aug.", "Sep.", "Oct.", "Nov.", "Dec."];
function formatPrettyDateTime(iso: string) {
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

// Helper to get display fuel type
const getFuelDisplay = (fuelType: string | null, customFuelType: string | null) => {
  if (customFuelType) return customFuelType;
  if (fuelType) return fuelType.charAt(0).toUpperCase() + fuelType.slice(1);
  return "Fuel";
};

/* --------------------------------- Screen --------------------------------- */
export default function CompletedRequest() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<TxRowWithMeta[]>([]);

  // Collapsed/expanded state for *paid* transactions
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Receipt modal
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptTx, setReceiptTx] = useState<TxRowWithMeta | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);

      // who am I -> which shop
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) throw new Error("Please sign in.");
      const uid = auth.user.id;

      const { data: srow, error: sErr } = await supabase
        .from("shop_details")
        .select("shop_id")
        .eq("user_id", uid)
        .single();
      if (sErr || !srow?.shop_id) throw new Error("Shop profile not found.");

      // transactions awaiting payment (to_pay/pending) or already paid
      const { data: txs, error: txErr } = await supabase
        .from("payment_transaction")
        .select(
          "transaction_id, emergency_id, service_id, shop_id, driver_user_id, distance_fee, labor_cost, fuel_cost, parts_cost, extra_total, extra_items, total_amount, status, payment_method, cancel_option, created_at, updated_at, paid_at, proof_image_url"
        )
        .eq("shop_id", srow.shop_id)
        .in("status", ["to_pay", "pending", "paid"])
        .order("created_at", { ascending: false })
        .returns<TxRow[]>();
      if (txErr) throw txErr;

      const list = txs ?? [];
      if (list.length === 0) {
        setItems([]);
        return;
      }

      // pull drivers
      const driverIds = Array.from(new Set(list.map((t) => t.driver_user_id).filter(Boolean) as string[]));
      const driverMap = new Map<string, DriverRow>();
      if (driverIds.length) {
        const { data: users } = await supabase
          .from("app_user")
          .select("user_id, full_name, photo_url")
          .in("user_id", driverIds)
          .returns<DriverRow[]>();
        users?.forEach((u) => driverMap.set(u.user_id, u));
      }

      // emergencies (for timestamp and service type)
      const emIds = Array.from(new Set(list.map((t) => t.emergency_id)));
      const emMap = new Map<string, EmergencyRow>();
      if (emIds.length) {
        const { data: ems } = await supabase
          .from("emergency")
          .select("emergency_id, latitude, longitude, created_at, service_type, fuel_type, custom_fuel_type")
          .in("emergency_id", emIds)
          .returns<EmergencyRow[]>();
        ems?.forEach((e) => emMap.set(e.emergency_id, e));
      }

      const enriched: TxRowWithMeta[] = list.map((t) => {
        const u = t.driver_user_id ? driverMap.get(t.driver_user_id) : undefined;
        const em = emMap.get(t.emergency_id);
        return {
          ...t,
          driver_name: u?.full_name || "Driver",
          driver_avatar: u?.photo_url || AVATAR_PLACEHOLDER,
          created_when: formatPrettyDateTime(em?.created_at || t.created_at), // fallback
          service_type: em?.service_type || null,
          fuel_type: em?.fuel_type || null,
          custom_fuel_type: em?.custom_fuel_type || null,
        };
      });

      setItems(enriched);
    } catch (e: any) {
      Alert.alert("Unable to load", e?.message ?? "Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, 15000);
    return () => clearInterval(id);
  }, [fetchAll]);

  const toggleExpand = (id: string) =>
    setExpanded((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));

  const markAsPaid = async (tx: TxRowWithMeta) => {
    try {
      if (!tx.proof_image_url) {
        Alert.alert("No proof yet", "A proof of payment is required before marking as received.");
        return;
      }
      setLoading(true);
      const now = new Date().toISOString();

      // 1) payment_transaction -> paid
      const { error: upErr } = await supabase
        .from("payment_transaction")
        .update({ status: "paid", paid_at: now })
        .eq("transaction_id", tx.transaction_id);
      if (upErr) throw upErr;

      // 2) emergency -> completed
      const { error: emErr } = await supabase
        .from("emergency")
        .update({ emergency_status: "completed", completed_at: now })
        .eq("emergency_id", tx.emergency_id);
      if (emErr) throw emErr;

      // Local UI: mark paid & collapse
      setItems((prev) =>
        prev.map((i) =>
          i.transaction_id === tx.transaction_id ? { ...i, status: "paid", paid_at: now } : i
        )
      );
      setExpanded((prev) => ({ ...prev, [tx.transaction_id]: false }));
      setReceiptOpen(false);
      setReceiptTx(null);
      Alert.alert("Payment Received", "Payment recorded and emergency completed.");
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const openReceipt = (tx: TxRowWithMeta) => {
    setReceiptTx(tx);
    setReceiptOpen(true);
  };

  const renderItem = ({ item }: { item: TxRowWithMeta }) => {
    const paid = item.status === "paid";
    const isExpanded = !!expanded[item.transaction_id];
    const inSummary = !isExpanded; 
    const isNoFeeCancel =
      item.cancel_option === "diagnose_only" || Number(item.total_amount) === 0;
    const isGasService = item.service_type === 'gas';

    // Totals breakdown - conditionally show Labor or Fuel based on service type
    const rows = [
      ["Distance fee", peso(item.distance_fee)],
      // Show either Labor or Fuel based on service type
      ...(isGasService && item.fuel_cost > 0 
        ? [[`Fuel ${item.fuel_type || item.custom_fuel_type ? `(${getFuelDisplay(item.fuel_type, item.custom_fuel_type)})` : ''}`, peso(item.fuel_cost)]] 
        : []),
      ...(!isGasService && item.labor_cost > 0 
        ? [["Labor", peso(item.labor_cost)]] 
        : []),
      ["Other services", peso(item.extra_total)],
      ["Total amount", peso(item.total_amount)],
    ] as const;

    const dateToShow = item.paid_at ? formatPrettyDateTime(item.paid_at) : formatPrettyDateTime(item.created_at);

    return (
      <View>
        {/* Card: tap to expand ONLY when already paid */}
        <Pressable
          onPress={() => toggleExpand(item.transaction_id)} // ← everyone can expand/collapse
          className="bg-white rounded-3xl p-4 mb-2 border border-slate-200"
          style={cardShadow as any}
        >

          {/* -------- Summary view for PAID (collapsed) -------- */}
          {inSummary ? (
            <View>
              <View className="flex-row items-center">
                <Image source={{ uri: item.driver_avatar }} className="w-12 h-12 rounded-full mr-3" />
                <View className="flex-1">
                  <Text className="text-[16px] font-extrabold text-slate-900" numberOfLines={1}>
                    {item.driver_name}
                  </Text>
                  <Text className="mt-0.5 text-[12px] text-slate-500" numberOfLines={1}>
                    {dateToShow}
                  </Text>
                  {isGasService && (item.fuel_type || item.custom_fuel_type) && (
                    <Text className="mt-0.5 text-[11px] text-slate-500">
                      {getFuelDisplay(item.fuel_type, item.custom_fuel_type)} Service
                    </Text>
                  )}
                </View>
                <Text className="ml-3 text-[14px] font-bold text-slate-900">{peso(item.total_amount)}</Text>
              </View>
              {/* hint */}
              <View className="mt-2">
                <Text className="text-[11px] text-slate-500 italic">Tap to view full details</Text>
              </View>
            </View>
          ) : (
            /* -------- Full details (for unpaid OR expanded paid) -------- */
            <View>
              {/* Header */}
              <View className="flex-row items-center">
                <Image source={{ uri: item.driver_avatar }} className="w-12 h-12 rounded-full mr-3" />
                <View className="flex-1">
                  <Text className="text-[16px] font-extrabold text-slate-900" numberOfLines={1}>
                    {item.driver_name}
                  </Text>
                  <Text className="mt-0.5 text-[12px] text-slate-500" numberOfLines={1}>
                    Emergency {"\u2022"} {item.emergency_id.slice(0, 8)} {"\u2026"} {"\u2022"} {formatPrettyDateTime(item.created_at)}
                  </Text>
                  {isGasService && (item.fuel_type || item.custom_fuel_type) && (
                    <Text className="mt-0.5 text-[12px] text-slate-500">
                      Fuel Type: {getFuelDisplay(item.fuel_type, item.custom_fuel_type)}
                    </Text>
                  )}
                </View>
                <Text className="ml-3 text-[14px] font-bold text-slate-900">{peso(item.total_amount)}</Text>
              </View>

              {/* Divider */}
              <View className="h-px bg-slate-200 my-4" />

              {/* Breakdown */}
              <View className="space-y-1">
                {rows.map(([label, value]) => (
                  <View key={label} className="flex-row items-baseline py-1.5">
                    <Text className="w-44 pr-2 text-[13px] leading-5 text-slate-600">{label}:</Text>
                    <Text className="flex-1 text-[13px] leading-5 text-slate-800">{value}</Text>
                  </View>
                ))}

                {/* Extra items list */}
                {(() => {
                  const extrasRaw = (item as any).extra_items;
                  const extras =
                    Array.isArray(extrasRaw)
                      ? extrasRaw
                      : typeof extrasRaw === "string"
                      ? (() => {
                          try {
                            return JSON.parse(extrasRaw);
                          } catch {
                            return [];
                          }
                        })()
                      : [];
                  return Array.isArray(extras) && extras.length > 0 ? (
                    <View className="mt-1">
                      <Text className="text-[13px] font-semibold text-slate-700">Other services/items</Text>
                      {extras.map((x: any, idx: number) => {
                        const name = String(x?.name ?? x?.title ?? `Item ${idx + 1}`);
                        const qty = Number(x?.qty ?? x?.quantity ?? 1) || 1;
                        const unit = Number(x?.fee ?? x?.price ?? x?.amount ?? x?.cost ?? 0) || 0;
                        const line = qty * unit;
                        return (
                          <View key={x?.id ?? idx} className="flex-row items-baseline py-1">
                            <Text className="flex-1 text-[12px] text-slate-700">{name}</Text>
                            <Text className="text-[12px] text-slate-500 mr-2">
                              {peso(unit)} {"\u00D7"} {qty}
                            </Text>
                            <Text className="text-[12px] font-semibold text-slate-800">
                              {peso(line)}    
                            </Text>
                          </View>
                        );
                      })}
                      <View className="flex-row items-baseline py-1 mt-1 border-t border-slate-200 pt-2">
                        <Text className="flex-1 text-[12px] font-semibold text-slate-700">Other services total</Text>
                        <Text className="text-[12px] font-semibold text-slate-800">
                          {peso(item.extra_total || 0)}
                        </Text>
                      </View>
                    </View>
                  ) : null;
                })()}
              </View>

              {/* Divider */}
              <View className="h-px bg-slate-200 my-4" />

              {/* Status + date */}
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <Ionicons name="calendar-outline" size={16} color="#334155" />
                  <Text className="ml-2 text-[12px] text-slate-600">{formatPrettyDateTime(item.created_at)}</Text>
                </View>

                {paid ? (
                  <View className="px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 flex-row items-center">
                    <Ionicons name="card" size={12} color="#2563EB" />
                    <Text className="ml-1 text-[11px] font-semibold text-blue-700">Paid</Text>
                  </View>
                ) :  isNoFeeCancel ? null : (
                  <View className="px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 flex-row items-center">
                    <Ionicons name="time" size={12} color="#D97706" />
                    <Text className="ml-1 text-[11px] font-semibold text-amber-700">
                      {item.proof_image_url ? "Receipt Submitted" : "Awaiting Payment"}
                    </Text>
                  </View>
                )}
              </View>

              {/* Proof button */}
              {!isNoFeeCancel && (
                <View className="mt-3 flex-row items-center justify-between">
                  <Text className="text-slate-500">Proof of payment</Text>
                  <Pressable onPress={() => openReceipt(item)}>
                    <Text className="text-indigo-600 font-medium">View Proof</Text>
                  </Pressable>
                </View>
              )}

              {/* Payment Received button (ONLY for unpaid and NOT a no-fee cancel) - MOVED INSIDE CARD */}
              {!paid && !isNoFeeCancel && (
                <Pressable
                  disabled={!item.proof_image_url || loading}
                  onPress={() => markAsPaid(item)}
                  className="mt-4 w-full items-center justify-center rounded-xl bg-blue-600 py-3 active:opacity-90"
                  style={{ opacity: !item.proof_image_url || loading ? 0.6 : 1 }}
                >
                  <Text className="text-[14px] font-semibold text-white">Payment Received</Text>
                </Pressable>
              )}

            </View>
          )}
        </Pressable>
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-[#F4F6F8]">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3">
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={26} color="#0F172A" />
        </Pressable>
        <Text className="text-xl font-bold text-[#0F172A]">Transactions</Text>
        <View className="w-6 h-6 items-center justify-center">
          <Ionicons name="filter" size={22} color="#ffff" />
        </View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(i) => i.transaction_id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        ListEmptyComponent={
          <View className="px-6 pt-10">
            <Text className="text-center text-slate-500">No transactions yet.</Text>
          </View>
        }
        refreshing={loading}
        onRefresh={fetchAll}
      />

      {/* Receipt modal (kept) */}
      <Modal visible={receiptOpen} animationType="fade" transparent onRequestClose={() => setReceiptOpen(false)}>
        <View className="flex-1 bg-black/85">
          <View className="flex-row items-center justify-between px-4 pt-10 pb-3">
            <Pressable onPress={() => setReceiptOpen(false)} hitSlop={10}>
              <Ionicons name="close" size={26} color="#fff" />
            </Pressable>
            <Text className="text-white font-semibold">
              {receiptTx?.driver_name} {"\u2022"} {receiptTx ? peso(receiptTx.total_amount) : ""}
            </Text>
            <View style={{ width: 26, height: 26 }} />
          </View>

          <ScrollView maximumZoomScale={3} minimumZoomScale={1} contentContainerStyle={{ alignItems: "center", padding: 12 }}>
            {receiptTx?.proof_image_url ? (
              <Image
                source={{ uri: receiptTx.proof_image_url }}
                resizeMode="contain"
                style={{ width: "100%", height: 520, borderRadius: 12, backgroundColor: "#0b0b0b" }}
              />
            ) : (
              <Text className="text-white">No proof uploaded.</Text>
            )}
          </ScrollView>

          {/* Bottom action bar in modal (optional/kept) */}
          <View className="px-4 pb-8">
           {receiptTx &&
            receiptTx.cancel_option !== "diagnose_only" &&
            Number(receiptTx.total_amount) > 0 && (
              <Pressable
                disabled={!receiptTx.proof_image_url || loading}
                onPress={() => markAsPaid(receiptTx)}
                className="mt-4 rounded-xl bg-blue-600 px-4 py-3 items-center"
              >
                <Text className="text-white font-semibold">Payment Received</Text>
              </Pressable>
          )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}