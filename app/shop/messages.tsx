// app/(driver)/message.tsx

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  Image,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { supabase } from "../../utils/supabase";
import { useConversations } from "../../hooks/useConversations";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import { ConversationWithDetails } from "../../types/chat";
import { formatMessageTime } from "../../utils/chatHelpers";
import LoadingScreen from "../../components/LoadingScreen";

export default function ConversationListScreen() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const { conversations, loading, error, refetch } = useConversations(userId);
  const { isOnline } = useOnlineStatus(userId);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadUser();
  }, []);

  async function loadUser() {
    const { data } = await supabase.auth.getUser();
    setUserId(data.user?.id || null);
  }

  async function handleRefresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  function handleConversationPress(conv: ConversationWithDetails) {
    router.push(`/driver/chat/${conv.id}`);
  }

  function getOtherUser(conv: ConversationWithDetails) {
    return conv.customer_id === userId ? conv.driver : conv.customer;
  }

  function getUnreadCount(conv: ConversationWithDetails) {
    return conv.customer_id === userId
      ? conv.customer_unread_count
      : conv.driver_unread_count;
  }

  function getDisplayName(user: any) {
    // Prioritize place_name over full_name
    return user?.place_name || user?.full_name || "Unknown User";
  }

  if (loading && !refreshing) {
    return <LoadingScreen visible={true} />;
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Top bar - matches shop request page exactly */}
      <View className="relative flex-row items-center px-4 py-3">
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={26} color="#0F172A" />
        </Pressable>
        
        {/* Centered title with absolute positioning */}
        <View className="absolute inset-0 items-center justify-center pointer-events-none">
          <Text className="text-xl font-bold text-[#0F172A]">
            Messages
          </Text>
        </View>
      </View>

      {/* Divider under the header title */}
      <View className="h-px bg-slate-200" />

      {/* Error State */}
      {error && (
        <View className="flex-1 items-center justify-center px-5">
          <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
          <Text className="mt-3 text-[15px] font-semibold text-slate-900">
            Unable to Load
          </Text>
          <Text className="mt-1 text-[13px] text-slate-500 text-center">
            {error}
          </Text>
          <Pressable
            onPress={refetch}
            className="mt-4 rounded-lg bg-blue-600 px-5 py-2.5"
          >
            <Text className="text-[14px] font-semibold text-white">Retry</Text>
          </Pressable>
        </View>
      )}

      {/* Empty State */}
      {!error && conversations.length === 0 && (
        <View className="flex-1 items-center justify-center px-10">
          <Ionicons name="chatbubbles-outline" size={64} color="#CBD5E1" />
          <Text className="mt-4 text-[17px] font-semibold text-slate-900">
            No Conversations Yet
          </Text>
          <Text className="mt-2 text-[14px] text-slate-500 text-center leading-5">
            When a mechanic accepts your emergency request, a chat will appear here.
          </Text>
        </View>
      )}

      {/* Conversation List */}
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const otherUser = getOtherUser(item);
          const unread = getUnreadCount(item);
          const lastMsg = item.last_message;
          const userIsOnline = otherUser ? isOnline(otherUser.user_id) : false;

          return (
            <Pressable
              className="flex-row items-center px-5 py-4 active:opacity-70"
              onPress={() => handleConversationPress(item)}
            >
              {/* Avatar with online/offline status indicator */}
              <View className="relative">
                {otherUser?.photo_url ? (
                  <Image
                    source={{ uri: otherUser.photo_url }}
                    className="h-12 w-12 rounded-full"
                  />
                ) : (
                  <View className="h-12 w-12 rounded-full bg-slate-200 items-center justify-center">
                    <Ionicons name="person" size={24} color="#94A3B8" />
                  </View>
                )}
                
                {/* 🔵 UPDATED: Online/Offline indicator - positioned at bottom-right edge, halfway overlapping */}
                <View 
                  style={{
                    position: 'absolute',
                    right: -2,
                    bottom: -2,
                  }}
                  className={`h-3.5 w-3.5 rounded-full border-2 border-white ${
                    userIsOnline ? "bg-green-500" : "bg-slate-400"
                  }`}
                />
              </View>

              {/* Content */}
              <View className="flex-1 ml-3">
                <View className="flex-row items-center justify-between">
                  <Text
                    className="text-[15px] font-semibold text-slate-900 flex-1"
                    numberOfLines={1}
                  >
                    {getDisplayName(otherUser)}
                  </Text>
                  
                  {/* Timestamp */}
                  <Text className="ml-2 text-[12px] text-slate-400">
                    {lastMsg ? formatMessageTime(lastMsg.created_at) : ""}
                  </Text>
                </View>

                {/* Last message preview + unread badge */}
                <View className="flex-row items-center mt-0.5">
                  <Text
                    className="text-[13px] text-slate-500 flex-1"
                    numberOfLines={1}
                  >
                    {lastMsg
                      ? lastMsg.type === "image"
                        ? " Sent a Photo"
                        : lastMsg.type === "location"
                        ? "Shared their Location"
                        : lastMsg.content
                      : "No messages yet"}
                  </Text>

                  {/* Unread count badge */}
                  {unread > 0 && (
                    <View className="ml-2 rounded-full bg-blue-600 px-2 py-0.5 min-w-[20px] items-center justify-center">
                      <Text className="text-[11px] font-bold text-white">
                        {unread > 99 ? "99+" : unread}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </Pressable>
          );
        }}
        ItemSeparatorComponent={() => <View className="h-px bg-slate-100 mx-5" />}
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      />
    </SafeAreaView>
  );
}
