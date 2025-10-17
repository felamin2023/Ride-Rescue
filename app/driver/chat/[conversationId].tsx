// app/(driver)/chat/[conversationId].tsx

import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  Image,
  Platform,
  ActivityIndicator,
  Alert,
  Modal,
  TouchableWithoutFeedback,
  StatusBar,
  Dimensions,
  Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "../../../utils/supabase";
import { useMessages } from "../../../hooks/useMessages";
import { useTypingIndicator } from "../../../hooks/useTypingIndicator";
import { useOnlineStatus } from "../../../hooks/useOnlineStatus";
import { Message, ConversationWithDetails } from "../../../types/chat";
import {
  pickAndCompressImage,
  uploadChatImage,
  formatMessageTime,
} from "../../../utils/chatHelpers";
import LoadingScreen from "../../../components/LoadingScreen";

// ============================================================================
// CONSTANTS & STYLES
// ============================================================================

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

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
  success: "#10B981",
  gray: "#94A3B8",
} as const;

const CARD_SHADOW = Platform.select({
  ios: {
    shadowColor: "#0F172A",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  android: { elevation: 1 },
});

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface ChatHeaderProps {
  onBack: () => void;
  displayName: string;
  photoUrl?: string | null;
  isOnline: boolean;
  insets: any;
}

function ChatHeader({ onBack, displayName, photoUrl, isOnline, insets }: ChatHeaderProps) {
  return (
    <View
      style={{
        paddingTop: insets.top,
        backgroundColor: COLORS.surface,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
      }}
    >
      <View className="flex-row items-center px-4 h-16">
        <Pressable onPress={onBack} hitSlop={12} className="mr-3">
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </Pressable>

        <View className="flex-row items-center flex-1">
          <View className="mr-3 relative">
            {photoUrl ? (
              <Image source={{ uri: photoUrl }} className="h-10 w-10 rounded-full" />
            ) : (
              <View className="h-10 w-10 rounded-full bg-slate-200 items-center justify-center">
                <Ionicons name="person" size={20} color={COLORS.muted} />
              </View>
            )}

            <View
              style={{
                position: "absolute",
                bottom: 0,
                right: 0,
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: isOnline ? COLORS.success : COLORS.gray,
                borderWidth: 2,
                borderColor: COLORS.surface,
              }}
            />
          </View>

          <View className="flex-1">
            <Text
              className="text-base font-semibold text-slate-900"
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {displayName}
            </Text>
            <Text className={`text-xs ${isOnline ? "text-green-600" : "text-slate-500"}`}>
              {isOnline ? "Online" : "Offline"}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

interface ImageViewerModalProps {
  visible: boolean;
  imageUrl: string;
  onClose: () => void;
}

function ImageViewerModal({ visible, imageUrl, onClose }: ImageViewerModalProps) {
  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "#FFFFFF",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Pressable
          onPress={onClose}
          hitSlop={12}
          style={{
            position: "absolute",
            top: Platform.OS === "ios" ? 60 : 30,
            left: 12,
            zIndex: 10,
            padding: 8,
          }}
        >
          <Ionicons name="close" size={32} color="#0066FF" />
        </Pressable>

        <View
          style={{
            borderWidth: 0.5,
            borderColor: "#E5E7EB",
            borderRadius: 4,
            padding: 4,
            backgroundColor: "#FFFFFF",
          }}
        >
          <Image
            source={{ uri: imageUrl }}
            style={{
              width: SCREEN_WIDTH - 40,
              height: SCREEN_HEIGHT * 0.7,
            }}
            resizeMode="contain"
          />
        </View>
      </View>
    </Modal>
  );
}

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  showTimestamp: boolean;
  onToggleTimestamp: () => void;
  onLocationPress: (msg: Message) => void;
  onImagePress: (imageUrl: string) => void;
  onImageLoad?: () => void;
}

const MessageBubble = React.memo(function MessageBubble({
  message,
  isOwn,
  showTimestamp,
  onToggleTimestamp,
  onLocationPress,
  onImagePress,
  onImageLoad,
}: MessageBubbleProps) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: isOwn ? "flex-end" : "flex-start",
        marginVertical: 4,
        paddingHorizontal: 16,
      }}
    >
      <View style={{ maxWidth: "75%", alignItems: isOwn ? "flex-end" : "flex-start" }}>
        {message.type === "image" && message.metadata.image_url ? (
          <Pressable onPress={() => onImagePress(message.metadata.image_url!)}>
            <Image
              source={{ uri: message.metadata.image_url }}
              style={{
                width: 200,
                height: 200,
                borderRadius: 12,
              }}
              resizeMode="cover"
              onLoad={onImageLoad}
            />
            {showTimestamp && (
              <Text
                style={{
                  fontSize: 11,
                  color: COLORS.muted,
                  marginTop: 4,
                  paddingHorizontal: 4,
                }}
              >
                {formatMessageTime(message.created_at)}
              </Text>
            )}
          </Pressable>
        ) : (
          <Pressable onPress={onToggleTimestamp}>
            <View
              style={{
                backgroundColor: isOwn ? COLORS.primary : COLORS.surface,
                borderRadius: 16,
                padding: 12,
                ...CARD_SHADOW,
              }}
            >
              {message.type === "location" &&
                message.metadata.latitude &&
                message.metadata.longitude && (
                  <Pressable onPress={() => onLocationPress(message)}>
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

              {message.type === "text" && (
                <Text
                  style={{
                    fontSize: 15,
                    color: isOwn ? "#FFFFFF" : COLORS.text,
                    lineHeight: 20,
                  }}
                >
                  {message.content}
                </Text>
              )}
            </View>

            {showTimestamp && (
              <Text
                style={{
                  fontSize: 11,
                  color: COLORS.muted,
                  marginTop: 4,
                  paddingHorizontal: 4,
                }}
              >
                {formatMessageTime(message.created_at)}
              </Text>
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
});

interface ImageMenuModalProps {
  visible: boolean;
  onClose: () => void;
  onGallery: () => void;
  onCamera: () => void;
  insets: any;
}

function ImageMenuModal({
  visible,
  onClose,
  onGallery,
  onCamera,
  insets,
}: ImageMenuModalProps) {
  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={{ flex: 1, backgroundColor: "rgba(0, 0, 0, 0.3)" }}>
          <View
            onStartShouldSetResponder={() => true}
            style={{
              position: "absolute",
              bottom: Platform.OS === "ios" ? 90 + insets.bottom : 70,
              left: 12,
              width: 160,
              backgroundColor: COLORS.surface,
              borderRadius: 12,
              ...Platform.select({
                ios: {
                  shadowColor: "#000",
                  shadowOpacity: 0.15,
                  shadowRadius: 10,
                  shadowOffset: { width: 0, height: 4 },
                },
                android: { elevation: 8 },
              }),
            }}
          >
            <Pressable
              onPress={onGallery}
              style={{
                flexDirection: "row",
                alignItems: "center",
                padding: 12,
                borderBottomWidth: 1,
                borderBottomColor: COLORS.border,
              }}
            >
              <Ionicons
                name="images"
                size={18}
                color={COLORS.primary}
                style={{ marginRight: 10 }}
              />
              <Text style={{ fontSize: 14, color: COLORS.text }}>Gallery</Text>
            </Pressable>

            <Pressable
              onPress={onCamera}
              style={{
                flexDirection: "row",
                alignItems: "center",
                padding: 12,
              }}
            >
              <Ionicons
                name="camera"
                size={18}
                color={COLORS.primary}
                style={{ marginRight: 10 }}
              />
              <Text style={{ fontSize: 14, color: COLORS.text }}>Take Photo</Text>
            </Pressable>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();

  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const imageLoadCountRef = useRef(0);

  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [conversation, setConversation] = useState<ConversationWithDetails | null>(null);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [expandedMessageId, setExpandedMessageId] = useState<string | null>(null);
  const [showImageMenu, setShowImageMenu] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [shouldScrollOnNextRender, setShouldScrollOnNextRender] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const { messages, loading, loadingMore, hasMore, sendMessage, loadMoreMessages } =
    useMessages(conversationId, userId);
  const { typingUsers, broadcastTyping } = useTypingIndicator(conversationId, userId, userName);
  const { isOnline } = useOnlineStatus(userId);

  const reversedMessages = [...messages].reverse();

  useEffect(() => {
    loadUser();
    loadConversation();
  }, [conversationId]);

  // Keyboard listeners
  useEffect(() => {
    const keyboardWillShow = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKeyboardHeight(e.endCoordinates.height);
      }
    );

    const keyboardWillHide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardHeight(0);
      }
    );

    return () => {
      keyboardWillShow.remove();
      keyboardWillHide.remove();
    };
  }, []);

  // Define scrollToBottom first
  const scrollToBottom = useCallback((delay: number = 100) => {
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
    scrollTimeoutRef.current = setTimeout(() => {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    }, delay);
  }, []);

  // Scroll to bottom when messages change and flag is set
  useEffect(() => {
    if (shouldScrollOnNextRender && reversedMessages.length > 0) {
      scrollToBottom(150);
      setShouldScrollOnNextRender(false);
    }
  }, [reversedMessages.length, shouldScrollOnNextRender, scrollToBottom]);

  // Auto-scroll when keyboard opens
  useEffect(() => {
    if (keyboardHeight > 0) {
      scrollToBottom(100);
    }
  }, [keyboardHeight, scrollToBottom]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  async function loadUser() {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;

    setUserId(data.user.id);

    const { data: profile } = await supabase
      .from("app_user")
      .select("full_name")
      .eq("user_id", data.user.id)
      .single();

    setUserName(profile?.full_name || null);
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

      const userIds = [data.customer_id, data.driver_id].filter(Boolean);
      const { data: shopData } = await supabase
        .from("shop_details")
        .select("user_id, place_id")
        .in("user_id", userIds);

      const placeIds = Array.from(
        new Set(shopData?.map((s) => s.place_id).filter(Boolean) || [])
      );

      const { data: placesData } = await supabase
        .from("places")
        .select("place_id, name")
        .in("place_id", placeIds);

      const userToPlaceMap = new Map<string, string>();
      shopData?.forEach((shop) => {
        if (shop.place_id) {
          const place = placesData?.find((p) => p.place_id === shop.place_id);
          if (place?.name) userToPlaceMap.set(shop.user_id, place.name);
        }
      });

      setConversation({
        ...data,
        customer: data.customer
          ? { ...data.customer, place_name: userToPlaceMap.get(data.customer.user_id) || null }
          : null,
        driver: data.driver
          ? { ...data.driver, place_name: userToPlaceMap.get(data.driver.user_id) || null }
          : null,
      } as ConversationWithDetails);
    } catch (err) {
      console.error("[loadConversation]", err);
    }
  }

  const handleSend = useCallback(async () => {
    if (!inputText.trim() || sending) return;

    const messageText = inputText.trim();
    
    try {
      setSending(true);
      setInputText("");
      
      // Clear typing indicator
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      await sendMessage(messageText, "text");
      
      // Immediate scroll for text messages
      scrollToBottom(50);
    } catch (err) {
      Alert.alert("Send Failed", "Could not send message. Please try again.");
      setInputText(messageText);
    } finally {
      setSending(false);
    }
  }, [inputText, sending, sendMessage, scrollToBottom]);

  const handleImageFromGallery = useCallback(async () => {
    setShowImageMenu(false);
    
    // Dismiss keyboard and wait for animation
    Keyboard.dismiss();
    await new Promise(resolve => setTimeout(resolve, 300));

    const uri = await pickAndCompressImage();
    if (!uri || !conversation) {
      // Restore focus if cancelled
      setTimeout(() => inputRef.current?.focus(), 100);
      return;
    }

    try {
      setSending(true);
      const uploadFolder = conversation.emergency_id || `non-emergency-${conversation.id}`;
      const imageUrl = await uploadChatImage(uri, uploadFolder);

      
      if (imageUrl) {
        await sendMessage(imageUrl, "image", { image_url: imageUrl });
        
        // Set flag to scroll after image renders
        setShouldScrollOnNextRender(true);
        imageLoadCountRef.current = 0;
      }
    } catch (err) {
      Alert.alert("Send Failed", "Could not send image.");
    } finally {
      setSending(false);
      // Restore focus to input
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [conversation, sendMessage]);

  const handleTakePicture = useCallback(async () => {
    setShowImageMenu(false);
    
    // Dismiss keyboard and wait for animation
    Keyboard.dismiss();
    await new Promise(resolve => setTimeout(resolve, 0));

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Required", "Camera permission is required to take a photo.");
      setTimeout(() => inputRef.current?.focus(), 100);
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
      aspect: [4, 3],
    });

    if (result.canceled || !result.assets || !conversation) {
      // Restore focus if cancelled
      setTimeout(() => inputRef.current?.focus(), 100);
      return;
    }

    try {
      setSending(true);
      const uploadFolder = conversation.emergency_id || `non-emergency-${conversation.id}`;
      const imageUrl = await uploadChatImage(result.assets[0].uri, uploadFolder);      
      if (imageUrl) {
        await sendMessage(imageUrl, "image", { image_url: imageUrl });
        
        // Set flag to scroll after image renders
        setShouldScrollOnNextRender(true);
        imageLoadCountRef.current = 0;
      }
    } catch (err) {
      Alert.alert("Send Failed", "Could not send image.");
    } finally {
      setSending(false);
      // Restore focus to input
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [conversation, sendMessage]);

  const handleLocationPress = useCallback(
    (msg: Message) => {
      if (msg.type !== "location" || !msg.metadata.latitude || !msg.metadata.longitude) return;
      router.push({
        pathname: "/driver/map",
        params: {
          latitude: msg.metadata.latitude,
          longitude: msg.metadata.longitude,
        },
      });
    },
    [router]
  );

  const handleImagePress = useCallback((imageUrl: string) => {
    setFullscreenImage(imageUrl);
  }, []);

  // Debounced typing indicator
  const handleTextChange = useCallback(
    (text: string) => {
      setInputText(text);
      
      // Clear existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      // Debounce typing broadcast to 500ms
      typingTimeoutRef.current = setTimeout(() => {
        broadcastTyping();
      }, 500);
    },
    [broadcastTyping]
  );

  // Callback when image finishes loading
  const handleImageLoad = useCallback(() => {
    imageLoadCountRef.current += 1;
    
    // Scroll after first image loads
    if (imageLoadCountRef.current === 1) {
      scrollToBottom(200);
    }
  }, [scrollToBottom]);

  const renderMessage = useCallback(
    ({ item }: { item: Message }) => {
      const isOwn = item.sender_id === userId;
      const showTimestamp = expandedMessageId === item.id;

      return (
        <MessageBubble
          message={item}
          isOwn={isOwn}
          showTimestamp={showTimestamp}
          onToggleTimestamp={() =>
            setExpandedMessageId((prev) => (prev === item.id ? null : item.id))
          }
          onLocationPress={handleLocationPress}
          onImagePress={handleImagePress}
          onImageLoad={handleImageLoad}
        />
      );
    },
    [userId, expandedMessageId, handleLocationPress, handleImagePress, handleImageLoad]
  );

  if (loading) return <LoadingScreen visible />;

  const otherUser = conversation
    ? conversation.customer_id === userId
      ? conversation.driver
      : conversation.customer
    : null;

  const displayName = otherUser?.place_name || otherUser?.full_name || "Unknown";
  const otherUserOnline = otherUser ? isOnline(otherUser.user_id) : false;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.surface }}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />

      <ChatHeader
        onBack={() => router.back()}
        displayName={displayName}
        photoUrl={otherUser?.photo_url}
        isOnline={otherUserOnline}
        insets={insets}
      />

      {/* Main content */}
      <View style={{ flex: 1 }}>
        <FlatList
          ref={flatListRef}
          data={reversedMessages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={{ 
            paddingVertical: 12,
          }}
          style={{ 
            backgroundColor: COLORS.bg,
            flex: 1,
          }}
          inverted
          maintainVisibleContentPosition={{
            minIndexForVisible: 0,
            autoscrollToTopThreshold: 10,
          }}
          onEndReached={() => hasMore && !loadingMore && loadMoreMessages()}
          onEndReachedThreshold={0.3}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews={Platform.OS === "android"}
          maxToRenderPerBatch={10}
          windowSize={10}
          ListHeaderComponent={
            <View style={{ height: keyboardHeight > 0 ? keyboardHeight + 90 : 90 }} />
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={{ padding: 12, alignItems: "center" }}>
                <ActivityIndicator size="small" color={COLORS.primary} />
              </View>
            ) : null
          }
        />

        {typingUsers.length > 0 && (
          <View style={{ 
            position: 'absolute',
            bottom: 80,
            left: 0,
            right: 0,
            paddingHorizontal: 16, 
            paddingVertical: 8, 
            backgroundColor: COLORS.bg 
          }}>
            <Text style={{ fontSize: 13, color: COLORS.sub, fontStyle: "italic" }}>
              {typingUsers[0].full_name} is typing...
            </Text>
          </View>
        )}

        {/* Input bar - positioned absolutely, moves with keyboard */}
        <View
          style={{
            position: 'absolute',
            bottom: keyboardHeight,
            left: 0,
            right: 0,
            backgroundColor: COLORS.surface,
            borderTopWidth: 1,
            borderTopColor: COLORS.border,
            paddingHorizontal: 12,
            paddingTop: 8,
            paddingBottom: Math.max(insets.bottom, 8),
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <Pressable
              onPress={() => setShowImageMenu(!showImageMenu)}
              disabled={sending}
              style={{ padding: 8, marginRight: 4 }}
            >
              <Ionicons 
                name="image-outline" 
                size={24} 
                color={sending ? COLORS.muted : COLORS.primary} 
              />
            </Pressable>

            <TextInput
              ref={inputRef}
              value={inputText}
              onChangeText={handleTextChange}
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
                maxHeight: 100,
              }}
              multiline
              maxLength={5000}
              editable={!sending}
              blurOnSubmit={false}
              returnKeyType="default"
            />

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
                <Ionicons name="send" size={20} color={inputText.trim() ? "#FFF" : COLORS.muted} />
              )}
            </Pressable>
          </View>
        </View>
      </View>

      <ImageMenuModal
        visible={showImageMenu}
        onClose={() => setShowImageMenu(false)}
        onGallery={handleImageFromGallery}
        onCamera={handleTakePicture}
        insets={insets}
      />

      <ImageViewerModal
        visible={!!fullscreenImage}
        imageUrl={fullscreenImage || ""}
        onClose={() => setFullscreenImage(null)}
      />
    </View>
  );
}