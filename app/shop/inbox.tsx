// app/(driver)/inbox.tsx
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  Image,
  Platform,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

/* ------------------------------ Types & Mock ------------------------------ */
type Notification = {
  id: string;
  title: string;
  message: string;
  image?: string;
  read: boolean;
};

const MOCK: Notification[] = [
  {
    id: "1",
    title: "New Emergency Request",
    message: "A driver nearby has posted a new emergency request.",
    image: "https://via.placeholder.com/60",
    read: false,
  },
  {
    id: "2",
    title: "Booking Update",
    message: "Your recent request has been accepted by a mechanic.",
    image: "https://via.placeholder.com/60",
    read: false,
  },
  {
    id: "3",
    title: "System Message",
    message: "RideRescue has updated its terms of service.",
    read: true,
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

/* ------------------------------ Filter Menu (same pattern as requeststatus) ------------------------------ */
type FilterKey = "ALL" | "UNREAD" | "READ";

const FILTER_OPTIONS: { key: FilterKey; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "UNREAD", label: "Unread" },
  { key: "READ", label: "Read" },
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
      <Pressable
        className="flex-1"
        onPress={onClose}
        style={{ backgroundColor: "rgba(0,0,0,0.2)" }}
      >
        <View
          className="absolute right-3 top-14 w-44 rounded-2xl bg-white p-1"
          style={cardShadow as any}
        >
          {FILTER_OPTIONS.map((opt) => {
            const active = value === opt.key;
            return (
              <Pressable
                key={opt.key}
                onPress={() => {
                  onSelect(opt.key);
                  onClose();
                }}
                className={`px-3 py-2 rounded-2xl ${
                  active ? "bg-slate-100" : ""
                }`}
              >
                <Text
                  className={`text-[14px] ${
                    active
                      ? "text-[#2563EB] font-semibold"
                      : "text-slate-800"
                  }`}
                >
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

/* ------------------------------ Screen ------------------------------ */
export default function Inbox() {
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>(MOCK);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("ALL");

  const data = useMemo(() => {
    switch (filter) {
      case "UNREAD":
        return items.filter((n) => !n.read);
      case "READ":
        return items.filter((n) => n.read);
      default:
        return items;
    }
  }, [items, filter]);

  const toggleRead = (id: string) => {
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: !n.read } : n))
    );
  };

  const renderItem = ({ item }: { item: Notification }) => (
    <Pressable
      onPress={() => toggleRead(item.id)}
      className="flex-row items-center bg-white rounded-2xl px-4 py-3 mb-3"
      style={cardShadow as any}
      android_ripple={{ color: "rgba(0,0,0,0.04)" }}
    >
      {item.image ? (
        <Image
          source={{ uri: item.image }}
          className="w-12 h-12 rounded-full mr-4"
        />
      ) : (
        <View className="w-12 h-12 rounded-full mr-4 bg-slate-100 items-center justify-center">
          <Ionicons name="notifications-outline" size={18} color="#64748B" />
        </View>
      )}

      <View className="flex-1">
        <View className="flex-row items-center">
          <Text
            className={`flex-1 text-base ${
              item.read
                ? "font-semibold text-gray-800"
                : "font-extrabold text-gray-900"
            }`}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          {!item.read && (
            <View
              className="ml-2 h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: "#2563EB" }}
            />
          )}
        </View>

        <Text
          className={`text-sm mt-0.5 ${
            item.read ? "text-gray-600" : "text-gray-700"
          }`}
          numberOfLines={2}
        >
          {item.message}
        </Text>
      </View>
    </Pressable>
  );

  return (
    <SafeAreaView className="flex-1 bg-[#F4F6F8]">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3">
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={26} color="#0F172A" />
        </Pressable>

        <Text className="text-xl font-bold text-[#0F172A]">Inbox</Text>

        {/* Right menu (filter dropdown) - matches requeststatus.tsx */}
        <Pressable onPress={() => setFilterOpen(true)} hitSlop={8}>
          <Ionicons name="filter" size={22} color="#0F172A" />
        </Pressable>
      </View>

      {/* Notifications List */}
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, paddingTop: 8 }}
        ListEmptyComponent={
          <View className="px-6 pt-10">
            <Text className="text-center text-slate-500">
              No {filter === "ALL" ? "" : filter.toLowerCase()} messages.
            </Text>
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
    </SafeAreaView>
  );
}
