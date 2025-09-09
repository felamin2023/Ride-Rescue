// app/(driver)/inbox.tsx
import React, { useState } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  Image,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

/* ------------------------------ Mock Data ------------------------------ */
type Notification = {
  id: string;
  title: string;
  message: string;
  image?: string;
};

const MOCK: Notification[] = [
  {
    id: "1",
    title: "New Emergency Request",
    message: "A driver nearby has posted a new emergency request.",
    image: "https://via.placeholder.com/60",
  },
  {
    id: "2",
    title: "Booking Update",
    message: "Your recent request has been accepted by a mechanic.",
    image: "https://via.placeholder.com/60",
  },
  {
    id: "3",
    title: "System Message",
    message: "RideRescue has updated its terms of service.",
  },
];

/* ------------------------------ Styles ------------------------------ */
const cardShadow = Platform.select({
  ios: {
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  android: { elevation: 2 },
});

/* ------------------------------ Screen ------------------------------ */
export default function Inbox() {
  const router = useRouter();
  const [notifications] = useState(MOCK);

  const renderItem = ({ item }: { item: Notification }) => (
    <View
      className="flex-row items-center bg-white rounded-2xl px-4 py-3 mb-3"
      style={cardShadow}
    >
      {item.image && (
        <Image
          source={{ uri: item.image }}
          className="w-12 h-12 rounded-full mr-4"
        />
      )}
      <View className="flex-1">
        <Text className="text-base font-semibold text-gray-900">
          {item.title}
        </Text>
        <Text className="text-sm text-gray-600 mt-0.5">{item.message}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-[#F4F6F8]">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3">
        <Pressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={26} color="#0F172A" />
        </Pressable>

        <Text className="text-xl font-bold text-[#0F172A]">Inbox</Text>

        {/* Spacer to balance the layout */}
        <View style={{ width: 26 }} />
      </View>

      {/* Notifications List */}
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16 }}
      />
    </SafeAreaView>
  );
}
