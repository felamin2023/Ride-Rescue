// app/(driver)/requeststatus.tsx
import React from "react";
import {
  View,
  Text,
  Image,
  FlatList,
  Pressable,
  Platform,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

/* ----------------------------- Types ----------------------------- */
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
  status: "ACCEPTED" | "WAITING" | "COMPLETED" | "CANCELED";
  seen: boolean;
  sentWhen: string; // "Yesterday at 2:30pm"
};

/* ----------------------------- Mock Data ----------------------------- */
const DATA: RequestItem[] = [
  {
    id: "1",
    name: "Juan Dela Cruz",
    avatar:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=256&auto=format&fit=crop",
    vehicleType: "Sedan",
    info: "Flat tire",
    landmark: "Near City Mall",
    location: "(14.5995, 120.9842)",
    imageUrl: "https://via.placeholder.com/300",
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
    imageUrl: "https://via.placeholder.com/300",
    dateTime: "May 29, 2025 - 11:45 AM",
    status: "WAITING",
    seen: false,
    sentWhen: "2h ago",
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

const STATUS_STYLES: Record<
  RequestItem["status"],
  { bg: string; border: string; text: string }
> = {
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
};

/* Label/value row for clean alignment */
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
      <Text
        className={`flex-1 text-[13px] ${
          muted ? "text-slate-500" : "text-slate-800"
        }`}
      >
        {value}
      </Text>
    </View>
  );
}

/* ----------------------------- Screen ----------------------------- */
export default function RequestStatus() {
  const router = useRouter();

  const renderItem = ({ item }: { item: RequestItem }) => {
    const s = STATUS_STYLES[item.status];
    return (
      <View
        className="bg-white rounded-2xl p-4 mb-4 border border-slate-200"
        style={cardShadow}
      >
        {/* HEADER — avatar + name */}
        <View className="flex-row items-center">
          <Image
            source={{ uri: item.avatar }}
            className="w-12 h-12 rounded-full"
          />
          <View className="ml-3 flex-1">
            <Text className="text-[16px] font-semibold text-slate-900">
              {item.name}
            </Text>
            <Text className="text-[12px] text-slate-500">
              Emergency Request • {item.vehicleType}
            </Text>
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
          <Pressable onPress={() => Linking.openURL(item.imageUrl)}>
            <View className="flex-row items-baseline py-0.5">
              <Text className="w-40 pr-2 text-[13px] text-slate-600">
                Image Uploaded:
              </Text>
              <Text className="flex-1 text-[13px] text-blue-600 underline">
                Tap to View
              </Text>
            </View>
          </Pressable>
        )}
        <Row label="Date & Time" value={item.dateTime} muted />

        {/* Divider */}
        <View className="h-px bg-slate-200 my-4" />

        {/* FOOTER */}
        <View className="flex-row items-center justify-between">
          <View
            className={`rounded-full px-3 py-1 border self-start ${s.bg} ${s.border}`}
          >
            <Text className={`text-[12px] font-medium ${s.text}`}>
              {item.status}
            </Text>
          </View>

          <View className="flex-row items-center">
            <Text className="text-[12px] text-slate-400 mr-2">
              Sent {item.sentWhen}
            </Text>
            <Ionicons
              name={item.seen ? "checkmark-done" : "time-outline"}
              size={14}
              color={item.seen ? "#16a34a" : "#94a3b8"}
            />
            <Text
              className={`ml-1 text-[12px] ${
                item.seen ? "text-emerald-600" : "text-slate-500"
              }`}
            >
              {item.seen ? "Seen" : "Pending"}
            </Text>
          </View>
        </View>

        {/* CTA — updated color to #2563EB */}
        <Pressable className="mt-4 rounded-xl bg-[#2563EB] py-3 items-center">
          <Text className="text-white font-semibold">CANCEL REQUEST</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-[#F4F6F8]">
      {/* Header (same as inbox.tsx) */}
      <View className="flex-row items-center justify-between px-4 py-3">
        <Pressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={26} color="#0F172A" />
        </Pressable>

        <Text className="text-xl font-bold text-[#0F172A]">
          Request Status
        </Text>

        <View style={{ width: 26 }} />
      </View>

      <FlatList
        data={DATA}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
      />
    </SafeAreaView>
  );
}
