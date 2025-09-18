// app/(driver)/requeststatus.tsx — Transaction history (clean spacing, no plate #, completed footer chip + ongoing with payment receipt)
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  Image,
  FlatList,
  Pressable,
  Platform,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

/* ----------------------------- Types ----------------------------- */
type RequestStatus = "ACCEPTED" | "WAITING" | "COMPLETED" | "CANCELED" | "TO_PAY" | "PAID";
type PaymentMethod = "Cash" | "GCash" | "Card";

type RequestItem = {
  id: string;
  name: string;
  avatar: string;
  vehicleType: string;
  serviceProvided?: string;   // falls back to `info`
  mechanicAssigned?: string;
  assistanceTime?: string;    // falls back to `dateTime`
  info: string;
  landmark: string;
  location: string;
  imageUrl?: string;
  dateTime: string;
  status: RequestStatus;
  seen: boolean;
  sentWhen: string;
  amountDue?: number;         // treated as paid amount for display
  paymentMethod?: PaymentMethod;
};

/* ----------------------------- Mock Data ----------------------------- */
const INITIAL_DATA: RequestItem[] = [
  // ✅ Ongoing card (mechanic assigned)
  {
    id: "ongoing_1",
    name: "Tewe Vulcanizing Shop",
    avatar: "https://i.pravatar.cc/100?img=17",
    vehicleType: "Sedan",
    serviceProvided: "Tire vulcanizing",
    mechanicAssigned: "Jasper Teves",
    assistanceTime: "2025-05-31 01:22 PM",
    landmark: "Beside Barangay Hall",
    location: "(9.87910, 123.59670)",
    imageUrl: "https://via.placeholder.com/960",
    dateTime: "May 31, 2025 - 01:10 PM",
    status: "ACCEPTED", // in-progress
    seen: true,
    sentWhen: "Just now",
    info: "Rear tire puncture",
    amountDue: 450,
    paymentMethod: "Cash",
  },

  // Completed samples
  {
    id: "1",
    name: "Stayve Alreach Fedillaga",
    avatar:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=256&auto=format&fit=crop",
    vehicleType: "Sedan",
    serviceProvided: "Tire replacement",
    mechanicAssigned: "Mark Anthony Delos Reyes",
    assistanceTime: "2025-05-30 11:58 PM",
    landmark: "Near City Mall parking lot",
    location: "(14.5995° N, 120.9842° E)",
    imageUrl: "https://via.placeholder.com/1024",
    dateTime: "May 29, 2025 - 10:30 AM",
    status: "COMPLETED",
    seen: true,
    sentWhen: "Just now",
    info: "Flat tire",
    amountDue: 300,
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
    status: "COMPLETED",
    seen: false,
    sentWhen: "2h ago",
    amountDue: 350,
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
    status: "COMPLETED",
    seen: true,
    sentWhen: "Just now",
    amountDue: 850,
  },
];

/* ----------------------------- UI helpers ----------------------------- */
const cardShadow = Platform.select({
  ios: { shadowColor: "#0F172A", shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
  android: { elevation: 2 },
});

const peso = (n?: number) => (typeof n === "number" && n >= 0 ? `₱${n.toFixed(2)}` : undefined);

/** Label/value row with consistent spacing */
function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <View className="flex-row items-baseline py-1.5">
      <Text className="w-44 pr-2 text-[13px] leading-5 text-slate-600">{label}:</Text>
      <Text className="flex-1 text-[13px] leading-5 text-slate-800">{value}</Text>
    </View>
  );
}

/** Completed pill for footer */
function CompletedChip() {
  return (
    <View className="px-2.5 py-1 rounded-full bg-green-50 border border-green-200 flex-row items-center">
      <Ionicons name="checkmark-circle" size={12} color="#16A34A" />
      <Text className="ml-1 text-[11px] font-semibold text-green-700">Completed</Text>
    </View>
  );
}

/** In-progress pill for footer */
function InProgressChip() {
  return (
    <View className="px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 flex-row items-center">
      <Ionicons name="time" size={12} color="#D97706" />
      <Text className="ml-1 text-[11px] font-semibold text-amber-700">In progress</Text>
    </View>
  );
}

/* ----------------------------- Image Preview ----------------------------- */
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
            {uri ? <Image source={{ uri }} resizeMode="contain" className="w-full h-full" /> : null}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

/* ----------------------------- Receipt Modal ----------------------------- */
function ReceiptModal({
  visible,
  item,
  onClose,
  onConfirmPaid,
}: {
  visible: boolean;
  item: RequestItem | null;
  onClose: () => void;
  onConfirmPaid: (id: string) => void;
}) {
  if (!item) return null;
  const amount = peso(item.amountDue);
  const providerTitle = item.mechanicAssigned || item.name;
  const when = item.assistanceTime ?? item.dateTime;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View className="flex-1 items-center justify-center bg-black/45 px-4">
        <View className="w-full max-w-md rounded-2xl bg-white p-5" style={cardShadow as any}>
          {/* Header */}
          <View className="flex-row items-center justify-between">
            <Text className="text-[16px] font-extrabold text-slate-900">Payment Receipt</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={20} color="#111827" />
            </Pressable>
          </View>

          <View className="mt-3 h-[1px] bg-slate-200" />

          {/* Body */}
          <View className="mt-3">
            <Row label="Paid To" value={providerTitle} />
            <Row label="Service" value={item.serviceProvided ?? item.info} />
            <Row label="Vehicle" value={item.vehicleType} />
            <Row label="Amount" value={amount} />
            <Row label="Method" value={item.paymentMethod ?? "Cash"} />
            <Row label="Date & Time" value={when} />
            <Row label="Location" value={item.location} />
          </View>

          {/* Footer actions */}
          <View className="mt-4 flex-row items-center justify-end gap-2">
            <Pressable
              onPress={onClose}
              className="rounded-xl border border-slate-300 px-4 py-2 active:opacity-90"
            >
              <Text className="text-[13px] font-semibold text-slate-800">Close</Text>
            </Pressable>
            <Pressable
              onPress={() => onConfirmPaid(item.id)}
              className="rounded-xl bg-blue-600 px-4 py-2 active:opacity-90"
            >
              <Text className="text-[13px] font-semibold text-white">Mark as Paid</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/* ----------------------------- Screen ----------------------------- */
export default function TransactionHistory() {
  const router = useRouter();
  const [items, setItems] = useState<RequestItem[]>(INITIAL_DATA);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  // receipt modal state
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptItem, setReceiptItem] = useState<RequestItem | null>(null);

  const data = useMemo(() => items, [items]);

  const openReceipt = (item: RequestItem) => {
    setReceiptItem(item);
    setReceiptOpen(true);
  };

  const markAsPaid = (id: string) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, status: "PAID" } : it))
    );
    setReceiptOpen(false);
    setReceiptItem(null);
  };

  const renderItem = ({ item }: { item: RequestItem }) => {
    const providerTitle = item.mechanicAssigned || item.name; // show shop/mechanic if available
    const subtitle = (item.serviceProvided ?? item.info) + (item.vehicleType ? ` • ${item.vehicleType}` : "");
    const when = item.assistanceTime ?? item.dateTime;
    const amount = peso(item.amountDue);

    const isCompleted = item.status === "COMPLETED";
    const isInProgress = item.status === "ACCEPTED" || item.status === "WAITING";
    const isPaid = item.status === "PAID";

    return (
      <View className="bg-white rounded-3xl p-4 mb-4 border border-slate-200" style={cardShadow}>
        {/* Header */}
        <View className="flex-row items-center">
          <Image source={{ uri: item.avatar }} className="w-12 h-12 rounded-full mr-3" />
          <View className="flex-1">
            <Text className="text-[16px] font-extrabold text-slate-900" numberOfLines={1}>
              {providerTitle}
            </Text>
            <Text className="mt-0.5 text-[12px] text-slate-500" numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
          {amount ? <Text className="ml-3 text-[14px] font-bold text-slate-900">{amount}</Text> : null}
        </View>

        {/* Divider */}
        <View className="h-px bg-slate-200 my-4" />

        {/* Details */}
        <View className="space-y-1">
          <Row label="Service Provided" value={item.serviceProvided ?? item.info} />
          <Row label="Mechanic Assigned" value={item.mechanicAssigned} />
          <Row label="Assistance Time" value={when} />
          <Row label="Landmark/Remarks" value={item.landmark} />
          <Row label="Location" value={item.location} />

          {/* Attached Image */}
          {item.imageUrl ? (
            <View className="flex-row items-baseline py-1.5">
              <Text className="w-44 pr-2 text-[13px] leading-5 text-slate-600">Attached Image:</Text>
              <Pressable
                onPress={() => {
                  setPreviewUrl(item.imageUrl || null);
                  setPreviewOpen(true);
                }}
                className="flex-row items-center"
              >
                <Ionicons name="image-outline" size={14} color="#2563EB" />
                <Text className="ml-1 text-[13px] leading-5 text-blue-600 underline">Tap to view</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        {/* Footer: date left, status chip right */}
        <View className="h-px bg-slate-200 my-4" />
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center">
            <Ionicons name="calendar-outline" size={16} color="#334155" />
            <Text className="ml-2 text-[12px] text-slate-600">{when}</Text>
          </View>
          {isCompleted ? <CompletedChip /> : isInProgress ? <InProgressChip /> : isPaid ? (
            <View className="px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 flex-row items-center">
              <Ionicons name="card" size={12} color="#2563EB" />
              <Text className="ml-1 text-[11px] font-semibold text-blue-700">Paid</Text>
            </View>
          ) : null}
        </View>

        {/* ✅ For ongoing: show “Received Payment” button below the footer */}
        {isInProgress && (
          <Pressable
            onPress={() => openReceipt(item)}
            className="mt-3 w-full items-center justify-center rounded-xl bg-blue-600 py-3 active:opacity-90"
          >
            <Text className="text-[14px] font-semibold text-white">Received Payment</Text>
          </Pressable>
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
        <Text className="text-xl font-bold text-[#0F172A]">Transactions</Text>
        <View className="w-6 h-6 items-center justify-center">
          <Ionicons name="filter" size={22} color="#0F172A" />
        </View>
      </View>

      <FlatList
        data={data}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        ListEmptyComponent={
          <View className="px-6 pt-10">
            <Text className="text-center text-slate-500">No transactions yet.</Text>
          </View>
        }
      />

      {/* Image preview modal */}
      <ImagePreview
        visible={previewOpen}
        uri={previewUrl}
        onClose={() => {
          setPreviewOpen(false);
          setPreviewUrl(null);
        }}
      />

      {/* ✅ Receipt modal */}
      <ReceiptModal
        visible={receiptOpen}
        item={receiptItem}
        onClose={() => {
          setReceiptOpen(false);
          setReceiptItem(null);
        }}
        onConfirmPaid={markAsPaid}
      />
    </SafeAreaView>
  );
}
