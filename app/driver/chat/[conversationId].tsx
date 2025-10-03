// app/(driver)/chat/[conversationId].tsx

import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  Image,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { supabase } from "../../../utils/supabase";
import { useMessages } from "../../../hooks/useMessages";
import { useTypingIndicator } from "../../../hooks/useTypingIndicator";
import { useOnlineStatus } from "../../../hooks/useOnlineStatus";
import { Message, ConversationWithDetails } from "../../../types/chat";
import {
  pickAndCompressImage,
  uploadChatImage,
  getCurrentLocation,
  formatMessageTime,
} from "../../../utils/chatHelpers";
import LoadingScreen from "../../../components/LoadingScreen";

const COLORS = {
  bg: "#F4F6F8",
  surface: "#FFFFFF",
  border: "#E5E7EB",
  text: "#0F172A",
  sub: "#475569",
  muted: "#94A3B8",
  primary: "#2563EB",
  primaryLight: "#DBEAFE",
  brand: "#0F2547",
};

const cardShadow = Platform.select({
  ios: {
    shadowColor: "#0F172A",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  android: { elevation: 1 },
});

export default function ChatScreen() {
  const router = useRouter();
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [conversation, setConversation] = useState<ConversationWithDetails | null>(null);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const { messages, loading, loadingMore, hasMore, error, sendMessage, loadMoreMessages } =
    useMessages(conversationId, userId);
  const { typingUsers, broadcastTyping } = useTypingIndicator(
    conversationId,
    userId,
    userName
  );
  const { isOnline } = useOnlineStatus(userId);

  useEffect(() => {
    loadUser();
    loadConversation();
  }, [conversationId]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages]);

  async function loadUser() {
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      setUserId(data.user.id);
      const { data: profile } = await supabase
        .from("app_user")
        .select("full_name")
        .eq("user_id", data.user.id)
        .single();
      setUserName(profile?.full_name || null);
    }
  }

  async function loadConversation() {
    try {
      const { data, error } = await supabase
        .from("conversations")
        .select(
          `
          *,
          emergency:emergency_id (vehicle_type, emergency_status, latitude, longitude),
          customer:customer_id (user_id, full_name, photo_url),
          driver:driver_id (user_id, full_name, photo_url)
        `
        )
        .eq("id", conversationId)
        .single();

      if (error) throw error;

      // Get both user IDs
      const userIds = [data.customer_id, data.driver_id].filter(Boolean);

      // Fetch shop_details to get place_id for these users
      const { data: shopData } = await supabase
        .from("shop_details")
        .select("user_id, place_id")
        .in("user_id", userIds);

      // Get place_ids from shop_details
      const placeIds = Array.from(
        new Set(shopData?.map((s) => s.place_id).filter(Boolean) || [])
      );

      // Fetch place names
      const { data: placesData } = await supabase
        .from("places")
        .select("place_id, name")
        .in("place_id", placeIds);

      // Create mapping: user_id → place_name
      const userToPlaceMap = new Map<string, string>();
      shopData?.forEach((shop) => {
        if (shop.place_id) {
          const place = placesData?.find((p) => p.place_id === shop.place_id);
          if (place?.name) {
            userToPlaceMap.set(shop.user_id, place.name);
          }
        }
      });

      // Enrich conversation with place names
      const enrichedData = {
        ...data,
        customer: data.customer
          ? {
              ...data.customer,
              place_name: userToPlaceMap.get(data.customer.user_id) || null,
            }
          : null,
        driver: data.driver
          ? {
              ...data.driver,
              place_name: userToPlaceMap.get(data.driver.user_id) || null,
            }
          : null,
      };

      setConversation(enrichedData as ConversationWithDetails);
    } catch (err) {
      console.error("[loadConversation] Error:", err);
    }
  }

  function getOtherUser() {
    if (!conversation || !userId) return null;
    return conversation.customer_id === userId ? conversation.driver : conversation.customer;
  }

  async function handleSend() {
    if (!inputText.trim() || sending) return;

    try {
      setSending(true);
      await sendMessage(inputText, "text");
      setInputText("");
    } catch (err) {
      Alert.alert("Send Failed", "Could not send message. Please try again.");
    } finally {
      setSending(false);
    }
  }

  async function handleImagePick() {
    const uri = await pickAndCompressImage();
    if (!uri || !conversation) return;

    try {
      setSending(true);
      const imageUrl = await uploadChatImage(uri, conversation.emergency_id);
      if (imageUrl) {
        await sendMessage(imageUrl, "image", { image_url: imageUrl });
      }
    } catch (err) {
      Alert.alert("Send Failed", "Could not send image.");
    } finally {
      setSending(false);
    }
  }

  async function handleLocationShare() {
    const location = await getCurrentLocation();
    if (!location) return;

    try {
      setSending(true);
      const content = `${location.latitude},${location.longitude}`;
      await sendMessage(content, "location", {
        latitude: location.latitude,
        longitude: location.longitude,
      });
    } catch (err) {
      Alert.alert("Send Failed", "Could not send location.");
    } finally {
      setSending(false);
    }
  }

  function handleLocationPress(msg: Message) {
    if (msg.type !== "location" || !msg.metadata.latitude || !msg.metadata.longitude) return;
    router.push({
      pathname: "/driver/map",
      params: {
        latitude: msg.metadata.latitude,
        longitude: msg.metadata.longitude,
      },
    });
  }

  function renderMessage({ item }: { item: Message }) {
    const isOwn = item.sender_id === userId;

    return (
      <View
        style={{
          flexDirection: "row",
          justifyContent: isOwn ? "flex-end" : "flex-start",
          marginVertical: 4,
          paddingHorizontal: 16,
        }}
      >
        <View
          style={{
            maxWidth: "75%",
            backgroundColor: isOwn ? COLORS.primary : COLORS.surface,
            borderRadius: 16,
            padding: 12,
            ...cardShadow,
          }}
        >
          {/* Image Message */}
          {item.type === "image" && item.metadata.image_url && (
            <Image
              source={{ uri: item.metadata.image_url }}
              style={{ width: 200, height: 200, borderRadius: 8 }}
              resizeMode="cover"
            />
          )}

          {/* Location Message */}
          {item.type === "location" && item.metadata.latitude && item.metadata.longitude && (
            <Pressable onPress={() => handleLocationPress(item)}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  padding: 8,
                  backgroundColor: isOwn ? COLORS.primaryLight : COLORS.border,
                  borderRadius: 8,
                }}
              >
                <Ionicons
                  name="location"
                  size={24}
                  color={isOwn ? COLORS.primary : COLORS.brand}
                />
                <View style={{ marginLeft: 8 }}>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: isOwn ? COLORS.brand : COLORS.text,
                    }}
                  >
                    Location Shared
                  </Text>
                  <Text style={{ fontSize: 12, color: COLORS.sub, marginTop: 2 }}>
                    Tap to view on map
                  </Text>
                </View>
              </View>
            </Pressable>
          )}

          {/* Text Message */}
          {item.type === "text" && (
            <Text
              style={{
                fontSize: 15,
                color: isOwn ? "#FFFFFF" : COLORS.text,
                lineHeight: 20,
              }}
            >
              {item.content}
            </Text>
          )}

          {/* Timestamp */}
          <Text
            style={{
              fontSize: 11,
              color: isOwn ? "#E0E7FF" : COLORS.muted,
              marginTop: 4,
              alignSelf: "flex-end",
            }}
          >
            {formatMessageTime(item.created_at)}
          </Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return <LoadingScreen visible={true} />;
  }

  const otherUser = getOtherUser();
  const displayName = otherUser?.place_name || otherUser?.full_name || "Unknown";

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        {/* Header — left-aligned username and online status with text truncation */}
        <View className="relative h-16 flex-row items-center bg-white">
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            className="absolute left-4 z-10"
          >
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </Pressable>

          {/* LEFT-ALIGNED user info with avatar and online status */}
          <View className="flex-row items-center ml-14 flex-1 pr-4">
            {/* Avatar */}
            <View className="mr-3">
              {otherUser?.photo_url ? (
                <Image
                  source={{ uri: otherUser.photo_url }}
                  className="h-10 w-10 rounded-full"
                />
              ) : (
                <View className="h-10 w-10 rounded-full bg-slate-200 items-center justify-center">
                  <Ionicons name="person" size={20} color="#94A3B8" />
                </View>
              )}
            </View>

            {/* Name + Online/Offline status text */}
            <View className="flex-1">
              <Text 
                className="text-base font-semibold text-slate-900"
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {displayName}
              </Text>
              
              {/* Online/Offline status with dot */}
              <View className="flex-row items-center mt-0.5">
                <View
                  className={`h-2 w-2 rounded-full mr-1.5 ${
                    otherUser && isOnline(otherUser.user_id)
                      ? "bg-green-500"
                      : "bg-slate-400"
                  }`}
                />
                <Text
                  className={`text-xs ${
                    otherUser && isOnline(otherUser.user_id)
                      ? "text-green-600"
                      : "text-slate-500"
                  }`}
                >
                  {otherUser && isOnline(otherUser.user_id) ? "Online" : "Offline"}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Divider below header */}
        <View className="h-px bg-slate-100" />

        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={{ paddingVertical: 12 }}
          style={{ backgroundColor: COLORS.bg }}
          onEndReached={() => {
            if (hasMore && !loadingMore) {
              loadMoreMessages();
            }
          }}
          onEndReachedThreshold={0.3}
          ListHeaderComponent={
            loadingMore ? (
              <View style={{ padding: 12, alignItems: "center" }}>
                <ActivityIndicator size="small" color={COLORS.primary} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={{ padding: 40, alignItems: "center" }}>
              <Ionicons name="chatbubbles-outline" size={48} color={COLORS.muted} />
              <Text style={{ marginTop: 12, fontSize: 14, color: COLORS.sub }}>
                No messages yet. Start the conversation!
              </Text>
            </View>
          }
        />

        {/* Typing Indicator */}
        {typingUsers.length > 0 && (
          <View style={{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: COLORS.bg }}>
            <Text style={{ fontSize: 13, color: COLORS.sub, fontStyle: "italic" }}>
              {typingUsers[0].full_name} is typing...
            </Text>
          </View>
        )}

        {/* Input Bar */}
        <View
          style={{
            backgroundColor: COLORS.surface,
            borderTopWidth: 1,
            borderTopColor: COLORS.border,
            paddingHorizontal: 12,
            paddingVertical: 8,
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          {/* Image Button */}
          <Pressable
            onPress={handleImagePick}
            disabled={sending}
            style={{ padding: 8, marginRight: 4 }}
          >
            <Ionicons name="image-outline" size={24} color={COLORS.primary} />
          </Pressable>

          {/* Location Button */}
          {/* <Pressable
            onPress={handleLocationShare}
            disabled={sending}
            style={{ padding: 8, marginRight: 4 }}
          >
            <Ionicons name="location-outline" size={24} color={COLORS.primary} />
          </Pressable> */}

          {/* Text Input */}
          <TextInput
            value={inputText}
            onChangeText={(text) => {
              setInputText(text);
              broadcastTyping();
            }}
            placeholder="Type a message..."
            placeholderTextColor={COLORS.muted}
            style={{
              flex: 1,
              backgroundColor: COLORS.bg,
              borderRadius: 20,
              paddingHorizontal: 16,
              paddingVertical: 10,
              fontSize: 15,
              color: COLORS.text,
              marginHorizontal: 8,
            }}
            multiline
            maxLength={5000}
            editable={!sending}
          />

          {/* Send Button */}
          <Pressable
            onPress={handleSend}
            disabled={!inputText.trim() || sending}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: inputText.trim() && !sending ? COLORS.primary : COLORS.border,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Ionicons
                name="send"
                size={20}
                color={inputText.trim() ? "#FFF" : COLORS.muted}
              />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
