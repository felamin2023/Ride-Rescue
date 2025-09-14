// app/(driver)/requeststatus.tsx
import React, { useMemo, useState, useEffect } from "react";
import {
  View,
  Text,
  Image,
  FlatList,
  Pressable,
  Platform,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  ScrollView,
  Keyboard,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import LoadingScreen from "../../components/LoadingScreen";

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
  location: string; // "(lat, lng)"
  imageUrl?: string;
  dateTime: string; // "May 29, 2025 - 10:30 AM"
  status: RequestStatus;
  seen: boolean;
  sentWhen: string; // "Yesterday at 2:30pm"
  amountDue?: number; // for TO_PAY
};

/* ----------------------------- Mock Data ----------------------------- */
const INITIAL_DATA: RequestItem[] = [
  {
    id: "1",
    name: "Juan Dela Cruz",
    avatar:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=256&auto=format&fit=crop",
    vehicleType: "Sedan",
    info: "Flat tire",
    landmark: "Near City Mall",
    location: "(14.5995, 120.9842)",
    imageUrl: "https://via.placeholder.com/1024",
    dateTime: "May 29, 2025 - 10:30 AM",
    status: "ACCEPTED",
    seen: true,
    sentWhen: "Yesterday at 2:30pm",
  },
  {
    id: "2",
    name: "Maria Santos",
    avatar:
      "https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=256&auto=format&fit=crop",
    vehicleType: "SUV",
    info: "Engine won’t start",
    landmark: "Beside Central Bank",
    location: "(14.6100, 120.9820)",
    imageUrl: "https://via.placeholder.com/800",
    dateTime: "May 29, 2025 - 11:45 AM",
    status: "WAITING",
    seen: false,
    sentWhen: "2h ago",
  },
  {
    id: "3",
    name: "Carlos Reyes",
    avatar:
      "https://images.unsplash.com/photo-1547425260-76bcadfb4f2c?q=80&w=256&auto=format&fit=crop",
    vehicleType: "Motorcycle",
    info: "Dead battery jumpstart",
    landmark: "Near West Bridge",
    location: "(14.6030, 120.9900)",
    imageUrl: "https://via.placeholder.com/900",
    dateTime: "May 30, 2025 - 09:15 AM",
    status: "TO_PAY",
    seen: true,
    sentWhen: "Just now",
    amountDue: 850,
  },
];

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

// Colored tags (except TO_PAY which is minimal)
const STATUS_STYLES: Record<
  RequestStatus,
  { bg?: string; border?: string; text?: string }
> = {
  ACCEPTED: { bg: "bg-emerald-50", border: "border-emerald-300/70", text: "text-emerald-700" },
  WAITING: { bg: "bg-amber-50", border: "border-amber-300/70", text: "text-amber-700" },
  COMPLETED: { bg: "bg-blue-50", border: "border-blue-300/70", text: "text-blue-700" },
  CANCELED: { bg: "bg-rose-50", border: "border-rose-300/70", text: "text-rose-700" },
  TO_PAY: {}, // minimal (custom below)
  PAID: { bg: "bg-teal-50", border: "border-teal-300/70", text: "text-teal-700" },
};

// Payment method icons from assets (you provide these two)
const PAY_ICONS = {
  GCash: require("../../assets/images/gcash.png"),
  Maya: require("../../assets/images/maya.png"),
} as const;

/** Label/value row */
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
      <Text className={`flex-1 text-[13px] ${muted ? "text-slate-500" : "text-slate-800"}`}>
        {value}
      </Text>
    </View>
  );
}

/* ----------------------------- Centered Confirmation (for Cancel) ----------------------------- */
function CenterConfirm({
  visible,
  title,
  message,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  message?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.35)" }}>
        <View className="w-11/12 max-w-md rounded-2xl bg-white p-5" style={cardShadow}>
          <View className="items-center mb-2">
            <Ionicons name="alert-circle-outline" size={28} color="#ef4444" />
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
              <Text className="text-[14px] text-slate-900">Keep Request</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              className="flex-1 rounded-2xl py-2.5 items-center"
              style={{ backgroundColor: "#ef4444" }}
            >
              <Text className="text-[14px] text-white font-semibold">Cancel Request</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/* ----------------------------- Image Preview (full-screen) ----------------------------- */
function ImagePreview({
  visible,
  uri,
  onClose,
}: {
  visible: boolean;
  uri: string | null;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black/90">
        <SafeAreaView className="flex-1">
          <View className="flex-row justify-between items-center px-4 py-2">
            <Text className="text-white text-base font-medium">Attached Image</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={26} color="#fff" />
            </Pressable>
          </View>
          <View className="flex-1 items-center justify-center px-3">
            {uri ? (
              <Image
                source={{ uri }}
                resizeMode="contain"
                className="w-full h-full"
              />
            ) : null}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

/* ----------------------------- Payment Sheet (bottom) ----------------------------- */
type PaymentMethod = "GCash" | "Maya" | "Cash";
function randomRef(prefix: string) {
  const n = Math.floor(100000000 + Math.random() * 900000000); // 9 digits
  return `${prefix}-${n}`;
}

function PaymentSheet({
  visible,
  onClose,
  item,
  onPaidIntent,
}: {
  visible: boolean;
  onClose: () => void;
  item: RequestItem | null;
  onPaidIntent: (payload: { refNo: string; method: PaymentMethod; amount: number }) => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>("GCash");
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [amount, setAmount] = useState(item?.amountDue ? String(item.amountDue) : "");
  const [notes, setNotes] = useState("");
  const [canSubmit, setCanSubmit] = useState(false);
  const [kbOpen, setKbOpen] = useState(false);

  useEffect(() => {
    const s1 = Keyboard.addListener("keyboardDidShow", () => setKbOpen(true));
    const s2 = Keyboard.addListener("keyboardDidHide", () => setKbOpen(false));
    return () => {
      s1.remove();
      s2.remove();
    };
  }, []);

  useEffect(() => {
    const amt = Number(amount);
    const amtOk = !!amt && !Number.isNaN(amt) && amt > 0;
    if (method === "Cash") setCanSubmit(amtOk);
    else {
      const nameOk = name.trim().length >= 2;
      const numberOk = /^\d{10,13}$/.test(number.trim());
      setCanSubmit(amtOk && nameOk && numberOk);
    }
  }, [method, name, number, amount]);

  useEffect(() => {
    setMethod("GCash");
    setName("");
    setNumber("");
    setNotes("");
    setAmount(item?.amountDue ? String(item.amountDue) : "");
  }, [item, visible]);

  const refPrefix = method === "GCash" ? "GC" : method === "Maya" ? "MY" : "CS";

  const handlePayNow = () => {
    if (!canSubmit) return;
    const amt = Number(amount);
    const refNo = randomRef(refPrefix);
    onPaidIntent({ refNo, method, amount: amt });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        {/* Dim */}
        <Pressable onPress={onClose} className="flex-1 bg-black/30" />
        {/* Bottom sheet */}
        <View className={`w-full ${kbOpen ? "h-[75%]" : "h-[80%]"} bg-white rounded-t-3xl px-5 pt-3 pb-5`} style={cardShadow}>
          {/* Grabber */}
          <View className="items-center mb-3">
            <View className="h-1.5 w-10 bg-slate-200 rounded-full" />
          </View>

          {/* Header */}
          <View className="flex-row items-center justify-between mb-2">
            <View className="flex-row items-center">
              <Ionicons name="checkmark-done-outline" size={18} color="#0F172A" />
              <Text className="ml-2 text-lg font-semibold text-slate-900">Complete & Pay</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color="#0F172A" />
            </Pressable>
          </View>

          {/* Scrollable content */}
          <ScrollView contentContainerStyle={{ paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
            {/* Summary */}
            {item && (
              <View className="rounded-2xl border border-slate-200 p-3 mb-4">
                <View className="flex-row items-center">
                  <Image source={{ uri: item.avatar }} className="w-9 h-9 rounded-full" />
                  <View className="ml-3 flex-1">
                    <Text className="text-[14px] font-medium text-slate-900">{item.name}</Text>
                    <Text className="text-[12px] text-slate-500">
                      {item.info} • {item.vehicleType}
                    </Text>
                  </View>
                  {(item.amountDue ?? 0) > 0 && (
                    <Text className="text-[14px] font-semibold text-slate-900">
                      ₱{(item.amountDue ?? 0).toFixed(2)}
                    </Text>
                  )}
                </View>
              </View>
            )}

            {/* Method (GCash/Maya use images; Cash uses icon) */}
            <View className="rounded-2xl border border-slate-200 p-1 mb-4">
              {(
                [
                  { key: "GCash", hint: "Mobile e-wallet" },
                  { key: "Maya", hint: "Card/e-wallet" },
                  { key: "Cash", hint: "Pay directly" },
                ] as { key: PaymentMethod; hint: string }[]
              ).map((opt, idx) => {
                const active = method === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => setMethod(opt.key)}
                    className={`flex-row items-center px-3 py-3 rounded-2xl ${active ? "bg-slate-50" : ""} ${idx !== 2 ? "mb-1" : ""}`}
                  >
                    {opt.key === "Cash" ? (
                      <Ionicons name="cash-outline" size={22} color="#0F172A" style={{ marginRight: 10, width: 28 }} />
                    ) : (
                      <Image
                        source={PAY_ICONS[opt.key]}
                        className="w-7 h-7 mr-10"
                        resizeMode="contain"
                      />
                    )}
                    <View className="flex-1">
                      <Text className={`text-[14px] ${active ? "text-[#2563EB] font-semibold" : "text-slate-800"}`}>
                        {opt.key}
                      </Text>
                      <Text className="text-[12px] text-slate-500">{opt.hint}</Text>
                    </View>
                    {active ? (
                      <Ionicons name="radio-button-on" size={18} color="#2563EB" />
                    ) : (
                      <Ionicons name="radio-button-off" size={18} color="#94a3b8" />
                    )}
                  </Pressable>
                );
              })}
            </View>

            {/* Amount */}
            <View className="mb-3">
              <Text className="text-[13px] text-slate-600 mb-1">Amount (PHP)</Text>
              <View className="flex-row items-center rounded-2xl border border-slate-300 px-3">
                <Text className="text-[15px] text-slate-500 mr-2">₱</Text>
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="numeric"
                  placeholder="0.00"
                  className="flex-1 py-2.5 text-[15px]"
                />
              </View>
            </View>

            {/* Account fields for non-cash */}
            {method !== "Cash" && (
              <>
                <View className="mb-3">
                  <Text className="text-[13px] text-slate-600 mb-1">{method} Account Name</Text>
                  <View className="flex-row items-center rounded-2xl border border-slate-300 px-3">
                    <Ionicons name="person-outline" size={18} color="#94a3b8" />
                    <TextInput
                      value={name}
                      onChangeText={setName}
                      placeholder="e.g., Juan Dela Cruz"
                      className="flex-1 py-2.5 ml-2 text-[15px]"
                    />
                  </View>
                </View>

                <View className="mb-3">
                  <Text className="text-[13px] text-slate-600 mb-1">{method} Mobile/Account Number</Text>
                  <View className="flex-row items-center rounded-2xl border border-slate-300 px-3">
                    <Ionicons name="call-outline" size={18} color="#94a3b8" />
                    <TextInput
                      value={number}
                      onChangeText={setNumber}
                      keyboardType="phone-pad"
                      placeholder="09xxxxxxxxx"
                      className="flex-1 py-2.5 ml-2 text-[15px]"
                    />
                  </View>
                  <Text className="text-[11px] text-slate-500 mt-1">Enter 10–13 digits (no spaces/dashes).</Text>
                </View>
              </>
            )}

            {/* Notes */}
            <View className="mb-5">
              <Text className="text-[13px] text-slate-600 mb-1">Notes</Text>
              <View className="flex-row items-start rounded-2xl border border-slate-300 px-3">
                <Ionicons name="create-outline" size={18} color="#94a3b8" style={{ marginTop: 10 }} />
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Optional (e.g., change for 1000)"
                  className="flex-1 py-2.5 ml-2 text-[15px]"
                  multiline
                />
              </View>
            </View>
          </ScrollView>

          {/* Footer action */}
          <Pressable
            disabled={!canSubmit}
            onPress={handlePayNow}
            className={`rounded-2xl py-3 items-center ${canSubmit ? "bg-[#2563EB]" : "bg-slate-200"}`}
          >
            <Text className={`font-semibold ${canSubmit ? "text-white" : "text-slate-500"}`}>
              Pay Now
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ----------------------------- Filter Menu ----------------------------- */
type FilterKey = "ALL" | RequestStatus;

const FILTER_OPTIONS: { key: FilterKey; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "WAITING", label: "Waiting" },
  { key: "ACCEPTED", label: "Accepted" },
  { key: "TO_PAY", label: "To Pay" },
  { key: "COMPLETED", label: "Completed" },
  { key: "PAID", label: "Paid" },
  { key: "CANCELED", label: "Canceled" },
];

function FilterMenu({
  visible,
  onClose,
  value,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  value: FilterKey;
  onSelect: (v: FilterKey) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable className="flex-1" onPress={onClose} style={{ backgroundColor: "rgba(0,0,0,0.2)" }}>
        <View className="absolute right-3 top-14 w-44 rounded-2xl bg-white p-1" style={cardShadow}>
          {FILTER_OPTIONS.map((opt) => {
            const active = value === opt.key;
            return (
              <Pressable
                key={opt.key}
                onPress={() => {
                  onSelect(opt.key);
                  onClose();
                }}
                className={`px-3 py-2 rounded-2xl ${active ? "bg-slate-100" : ""}`}
              >
                <Text className={`text-[14px] ${active ? "text-[#2563EB] font-semibold" : "text-slate-800"}`}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Pressable>
    </Modal>
  );
}

/* ----------------------------- Screen ----------------------------- */
export default function RequestStatus() {
  const router = useRouter();
  const [items, setItems] = useState<RequestItem[]>(INITIAL_DATA);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("ALL");

  const [payingItem, setPayingItem] = useState<RequestItem | null>(null);
  const [paymentVisible, setPaymentVisible] = useState(false);

  // Cancel confirmation (centered)
  const [cancelTarget, setCancelTarget] = useState<RequestItem | null>(null);
  const [cancelVisible, setCancelVisible] = useState(false);

  // Final payment confirm (bottom) + loading
  const [finalConfirmVisible, setFinalConfirmVisible] = useState(false);
  const [pendingPayment, setPendingPayment] = useState<{
    refNo: string;
    method: PaymentMethod;
    amount: number;
  } | null>(null);
  const [loading, setLoading] = useState<{ visible: boolean; message?: string }>({ visible: false });

  // Image preview
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const filtered = useMemo(() => {
    if (filter === "ALL") return items;
    return items.filter((i) => i.status === filter);
  }, [items, filter]);

  const openCancelConfirm = (item: RequestItem) => {
    setCancelTarget(item);
    setCancelVisible(true);
  };

  const doCancel = () => {
    if (!cancelTarget) return;
    setItems((prev) => prev.map((x) => (x.id === cancelTarget.id ? { ...x, status: "CANCELED" } : x)));
    setCancelVisible(false);
    setCancelTarget(null);
  };

  const openPaySheet = (item: RequestItem) => {
    setPayingItem(item);
    setPaymentVisible(true);
  };

  // PaymentSheet triggers this (not immediate)
  const handlePaidIntent = (payload: { refNo: string; method: PaymentMethod; amount: number }) => {
    setPaymentVisible(false);
    setPendingPayment(payload);
    setFinalConfirmVisible(true);
  };

  // After user confirms payment
  const finalizePayment = async () => {
    if (!payingItem || !pendingPayment) return;
    setFinalConfirmVisible(false);
    setLoading({ visible: true, message: "Processing payment…" });

    await new Promise((r) => setTimeout(r, 1200)); // simulate

    setItems((prev) =>
      prev.map((x) =>
        x.id === payingItem.id ? { ...x, status: "PAID", amountDue: 0 } : x
      )
    );

    setLoading({ visible: false });
    setPayingItem(null);
    setPendingPayment(null);
  };

  const MinimalTag = ({ children, borderColor = "#e5e7eb" }: { children: React.ReactNode; borderColor?: string }) => (
    <View className="flex-row items-center px-2.5 py-1.5 rounded-full border" style={{ borderColor }}>
      {children}
    </View>
  );

  const renderStatusTag = (item: RequestItem) => {
    // Special minimal tag for "To be paid": red icon + red border, neutral text, no bg
    if (item.status === "TO_PAY") {
      return (
        <MinimalTag borderColor="#ef4444">
          <Ionicons name="alert-circle-outline" size={14} color="#ef4444" />
          <Text className="ml-1 text-[12px] text-slate-900">To be paid</Text>
        </MinimalTag>
      );
      // No background, no colored text (only the icon + border are red)
    }
    const s = STATUS_STYLES[item.status];
    return (
      <View className={`rounded-full px-3 py-1 border self-start ${s.bg ?? ""} ${s.border ?? ""}`}>
        <Text className={`text-[12px] font-medium ${s.text ?? "text-slate-800"}`}>{item.status}</Text>
      </View>
    );
  };

  const renderItem = ({ item }: { item: RequestItem }) => {
    const showPay =
      item.status === "TO_PAY" ||
      (item.status === "COMPLETED" && (item.amountDue ?? 0) > 0);

    // ✅ Only WAITING and ACCEPTED can cancel
    const canCancel = item.status === "WAITING" || item.status === "ACCEPTED";

    return (
      <View className="bg-white rounded-2xl p-4 mb-4 border border-slate-200 relative" style={cardShadow}>
        {/* Seen indicator (top-right) */}
        <View className="absolute right-3 top-3 flex-row items-center">
          <Ionicons name={item.seen ? "checkmark-done" : "time-outline"} size={14} color={item.seen ? "#16a34a" : "#94a3b8"} />
          <Text className={`ml-1 text-[12px] ${item.seen ? "text-emerald-600" : "text-slate-500"}`}>
            {item.seen ? "Seen" : "Pending"}
          </Text>
        </View>

        {/* HEADER */}
        <View className="flex-row items-center">
          <Image source={{ uri: item.avatar }} className="w-12 h-12 rounded-full" />
          <View className="ml-3 flex-1">
            <Text className="text-[16px] font-semibold text-slate-900" numberOfLines={1}>{item.name}</Text>
            <Text className="text-[12px] text-slate-500">Emergency Request • {item.vehicleType}</Text>
            <View className="flex-row items-center mt-1">
              <View className="w-2 h-2 rounded-full mr-1 bg-emerald-500" />
              <Text className="text-[12px] text-slate-600">{item.info}</Text>
            </View>
          </View>
        </View>

        {/* Divider */}
        <View className="h-px bg-slate-200 my-4" />

        {/* BODY */}
        <Row label="Landmark/Remarks" value={item.landmark} />
        <Row label="Location" value={item.location} />

        {item.imageUrl && (
          <Pressable
            onPress={() => {
              setPreviewUrl(item.imageUrl || null);
              setPreviewOpen(true);
            }}
          >
            <View className="flex-row items-baseline py-0.5">
              <Text className="w-40 pr-2 text-[13px] text-slate-600">Image Uploaded:</Text>
              <View className="flex-row items-center">
                <Ionicons name="image-outline" size={14} color="#2563EB" />
                <Text className="ml-1 text-[13px] text-blue-600 underline">Tap to View</Text>
              </View>
            </View>
          </Pressable>
        )}

        <Row label="Date & Time" value={item.dateTime} muted />

        {(item.amountDue ?? 0) > 0 && (
          <View className="mt-2">
            <Row label="Amount Due" value={`₱${(item.amountDue ?? 0).toFixed(2)}`} />
          </View>
        )}

        {/* Divider */}
        <View className="h-px bg-slate-200 my-4" />

        {/* FOOTER */}
        <View className="flex-row items-center justify-between">
          {renderStatusTag(item)}
          <Text className="text-[12px] text-slate-400">Sent {item.sentWhen}</Text>
        </View>

        {/* CTA row — show only when there's something to do */}
        {(canCancel || showPay) && (
          <View className="mt-4 flex-row gap-3">
            {canCancel && (
              <Pressable
                onPress={() => openCancelConfirm(item)}
                className="flex-1 rounded-2xl py-2.5 items-center"
                style={{ backgroundColor: "#FEE2E2" }} // soft red
              >
                <Text className="text-[14px] text-[#7F1D1D]">Cancel Request</Text>
              </Pressable>
            )}

            {showPay && (
              <Pressable
                onPress={() => openPaySheet(item)}
                className="flex-1 rounded-2xl py-2.5 items-center"
                style={{ backgroundColor: "#2563EB" }} // blue
              >
                <Text className="text-[14px] text-white font-semibold">Complete & Pay</Text>
              </Pressable>
            )}
          </View>
        )}
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

        <Text className="text-xl font-bold text-[#0F172A]">Request Status</Text>

        {/* Right menu (filter dropdown) */}
        <Pressable onPress={() => setFilterOpen(true)} hitSlop={8}>
          <Ionicons name="filter" size={22} color="#0F172A" />
        </Pressable>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        ListEmptyComponent={
          <View className="px-6 pt-10">
            <Text className="text-center text-slate-500">No requests found for this filter.</Text>
          </View>
        }
      />

      {/* Filter menu */}
      <FilterMenu
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        value={filter}
        onSelect={setFilter}
      />

      {/* Payment bottom sheet */}
      <PaymentSheet
        visible={paymentVisible}
        item={payingItem}
        onClose={() => {
          setPaymentVisible(false);
          setPayingItem(null);
        }}
        onPaidIntent={(payload) => {
          setPendingPayment(payload);
          setFinalConfirmVisible(true);
          setPaymentVisible(false);
        }}
      />

      {/* Centered cancel confirmation */}
      <CenterConfirm
        visible={cancelVisible}
        title="Cancel this request?"
        message="If you cancel now, the ongoing service will be stopped and this request will move to Canceled."
        onCancel={() => {
          setCancelVisible(false);
          setCancelTarget(null);
        }}
        onConfirm={doCancel}
      />

      {/* Final payment confirmation (bottom) */}
      <Modal visible={finalConfirmVisible} transparent animationType="fade" onRequestClose={() => setFinalConfirmVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
          <Pressable className="flex-1 bg-black/30" onPress={() => setFinalConfirmVisible(false)} />
          <View className="w-full bg-white rounded-t-3xl px-5 pt-3 pb-5" style={cardShadow}>
            <View className="items-center mb-3">
              <View className="h-1.5 w-10 bg-slate-200 rounded-full" />
            </View>
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-lg font-semibold text-slate-900">Confirm Payment</Text>
              <Pressable onPress={() => setFinalConfirmVisible(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color="#0F172A" />
              </Pressable>
            </View>

            {pendingPayment && (
              <View className="rounded-2xl border border-slate-200 p-3 mt-1 mb-4">
                <View className="flex-row items-center">
                  {pendingPayment.method === "Cash" ? (
                    <Ionicons name="cash-outline" size={22} color="#0F172A" style={{ marginRight: 10 }} />
                  ) : (
                    <Image
                      source={PAY_ICONS[pendingPayment.method]}
                      className="w-7 h-7 mr-3"
                      resizeMode="contain"
                    />
                  )}
                  <View className="flex-1">
                    <Text className="text-[13px] text-slate-600">Reference</Text>
                    <Text className="text-[14px] font-semibold text-slate-900">
                      {pendingPayment.refNo}
                    </Text>
                  </View>
                  <Text className="text-[14px] font-semibold text-slate-900">
                    ₱{pendingPayment.amount.toFixed(2)}
                  </Text>
                </View>
              </View>
            )}

            <View className="mt-4 flex-row gap-10">
              <Pressable
                onPress={() => setFinalConfirmVisible(false)}
                className="flex-1 rounded-2xl border border-slate-300 py-2.5 items-center"
              >
                <Text className="text-[14px] text-slate-900">Review</Text>
              </Pressable>
              <Pressable
                onPress={finalizePayment}
                className="flex-1 rounded-2xl py-2.5 items-center"
                style={{ backgroundColor: "#2563EB" }}
              >
                <Text className="text-[14px] text-white font-semibold">Confirm & Pay</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Image preview modal */}
      <ImagePreview
        visible={previewOpen}
        uri={previewUrl}
        onClose={() => {
          setPreviewOpen(false);
          setPreviewUrl(null);
        }}
      />

      {/* Loading overlay while paying */}
      <LoadingScreen visible={loading.visible} message={loading.message} variant="spinner" />
    </SafeAreaView>
  );
}
