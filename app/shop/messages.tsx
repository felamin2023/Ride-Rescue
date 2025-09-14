// app/(driver)/message.tsx
import React from "react";
import { View, Text, FlatList, Image, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

type Chat = {
  id: string;
  name: string;
  time: string;
  snippet: string;
  avatar: string;
  verified?: boolean;
  unread?: boolean;
};

const CHATS: Chat[] = [
  {
    id: "1",
    name: "Marvin McKinney",
    time: "5 min ago",
    snippet: "Hey!! r u here..?",
    avatar: "https://i.pravatar.cc/100?img=15",
    verified: true,
    unread: true,
  },
  {
    id: "2",
    name: "Robert Fox",
    time: "32 min ago",
    snippet: "Good morning bro..!",
    avatar: "https://i.pravatar.cc/100?img=12",
  },
  {
    id: "3",
    name: "Eleanor Pena",
    time: "Yesterday",
    snippet: "Haha I agree with you..",
    avatar: "https://i.pravatar.cc/100?img=25",
  },
];

export default function MessageList() {
  const router = useRouter();

  const renderItem = ({ item }: { item: Chat }) => (
    <Pressable
      className="flex-row items-center px-5 py-4 active:opacity-70"
      onPress={() =>
        router.push({
          pathname: "/driver/chat/[threadId]",
          params: { threadId: item.id, name: item.name, avatar: item.avatar },
        })
      }
    >
      <View className="relative">
        <Image source={{ uri: item.avatar }} className="h-12 w-12 rounded-full" />
        {item.unread ? (
          <View className="absolute -right-0 -top-0 h-3 w-3 rounded-full bg-blue-500" />
        ) : null}
      </View>

      <View className="flex-1 ml-3">
        <View className="flex-row items-center">
          <Text className="text-[15px] font-semibold text-slate-900" numberOfLines={1}>
            {item.name}
          </Text>
          {item.verified ? (
            <Ionicons name="checkmark-circle" size={16} color="#2563EB" style={{ marginLeft: 6 }} />
          ) : null}
          <Text className="ml-auto text-[12px] text-slate-400">{item.time}</Text>
        </View>
        <Text className="mt-0.5 text-[13px] text-slate-500" numberOfLines={1}>
          {item.snippet}
        </Text>
      </View>
    </Pressable>
  );

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Header — back button left, title centered */}
      <View className="relative h-14 flex-row items-center border-b border-slate-100 bg-white">
        <Pressable onPress={() => router.back()} hitSlop={12} className="absolute left-4">
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </Pressable>
        <View className="absolute inset-0 items-center justify-center">
          <Text className="text-lg font-semibold text-slate-900">Messages</Text>
        </View>
      </View>

      {/* Chat List */}
      <FlatList
        data={CHATS}
        keyExtractor={(it) => it.id}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View className="h-px bg-slate-100 mx-5" />}
        contentContainerStyle={{ paddingBottom: 24 }}
      />
    </SafeAreaView>
  );
}
