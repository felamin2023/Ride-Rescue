// app/(driver)/requeststatus.tsx — Transaction history (clean spacing, no plate #, completed footer chip)
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
};

/* ----------------------------- Mock Data ----------------------------- */
const INITIAL_DATA: RequestItem[] = [
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

/* ----------------------------- Screen ----------------------------- */
export default function TransactionHistory() {
  const router = useRouter();
  const [items] = useState<RequestItem[]>(INITIAL_DATA);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const data = useMemo(() => items, [items]);

  const renderItem = ({ item }: { item: RequestItem }) => {
    const providerTitle = item.mechanicAssigned || item.name; // show shop/mechanic if available
    const subtitle = (item.serviceProvided ?? item.info) + (item.vehicleType ? ` • ${item.vehicleType}` : "");
    const when = item.assistanceTime ?? item.dateTime;
    const amount = peso(item.amountDue);

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

        {/* Footer: date left, Completed chip right */}
        <View className="h-px bg-slate-200 my-4" />
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center">
            <Ionicons name="calendar-outline" size={16} color="#334155" />
            <Text className="ml-2 text-[12px] text-slate-600">{when}</Text>
          </View>
          <CompletedChip />
        </View>
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
        <Text className="text-xl font-bold text-[#0F172A]">Transaction history</Text>
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
    </SafeAreaView>
  );
}
