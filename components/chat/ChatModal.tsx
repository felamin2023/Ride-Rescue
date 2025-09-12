// components/chat/ChatModal.tsx
import React, { useMemo, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  FlatList,
  Image,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as Location from "expo-location";

/* ------------------------------ Types ------------------------------ */
type MsgKind = "text" | "image" | "file" | "location";
type Msg = {
  id: string;
  kind: MsgKind;
  mine: boolean;
  text?: string;
  imageUri?: string;
  fileName?: string;
  fileMime?: string | null;
  fileUri?: string;
  lat?: number;
  lng?: number;
  time?: string;
  status?: "sent" | "read";
};

type ChatThreadProps = {
  title: string;
  subtitle?: string;
  avatar?: string;
  onClose?: () => void;
  initialMessages?: Msg[];
};

/* ------------------------------ Helpers ------------------------------ */
const uid = () =>
  (globalThis as any)?.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
const nowTime = () =>
  new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const openUrl = (url?: string) => url && Linking.openURL(url).catch(() => {});
const C = { mineBg: "#EAF2FF", theirsBg: "#FFFFFF", border: "#E5E7EB", primary: "#2563EB" };

/* ====================================================================
   Reusable Chat Thread
==================================================================== */
export function ChatThread({
  title,
  subtitle = "Online",
  avatar,
  onClose,
  initialMessages,
}: ChatThreadProps) {
  const [messages, setMessages] = useState<Msg[]>(
    initialMessages ??
      [
        {
          id: "m1",
          kind: "image",
          mine: false,
          imageUri:
            "https://images.unsplash.com/photo-1521791136064-7986c2920216?q=80&w=1200&auto=format&fit=crop",
          time: "15:41",
        },
        {
          id: "m2",
          kind: "text",
          mine: false,
          text: "https://dribbble.com/shots/17742523-ui-kit-designjam",
          time: "15:42",
        },
        { id: "m3", kind: "text", mine: false, text: "See you at office tomorrow!", time: "15:42" },
        { id: "divider_today", kind: "text", mine: false, text: "__DAY__" },
        {
          id: "m4",
          kind: "text",
          mine: false,
          text: "Hello! Have you seen my backpack anywhere in office?",
          time: "15:42",
        },
        {
          id: "m5",
          kind: "text",
          mine: true,
          text: "Hi, yes—David found it. Ask the concierge 👀",
          time: "15:42",
          status: "read",
        },
      ]
  );

  const [input, setInput] = useState("");
  const [inputHeight, setInputHeight] = useState(44); // smooth auto-grow
  const [focused, setFocused] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<Msg>>(null);

  const data = useMemo(() => messages, [messages]);
  const scrollToEnd = () =>
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));

  /* -------------------------- Send primitives -------------------------- */
  const pushMessage = (m: Omit<Msg, "id" | "time">) => {
    const next: Msg = { id: uid(), time: nowTime(), ...m };
    setMessages((prev) => [...prev, next]);
    scrollToEnd();
  };

  const sendText = () => {
    const t = input.trim();
    if (!t) return;
    setInput("");
    setInputHeight(44);
    pushMessage({ kind: "text", mine: true, text: t, status: "sent" });
  };

  const sendImageFromCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") return;
    const res = await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: true });
    if (!res.canceled) {
      const uri = res.assets?.[0]?.uri;
      if (uri) pushMessage({ kind: "image", mine: true, imageUri: uri, status: "sent" });
    }
  };

  const sendImageFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return;
    const res = await ImagePicker.launchImageLibraryAsync({
      quality: 0.9,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    if (!res.canceled) {
      const uri = res.assets?.[0]?.uri;
      if (uri) pushMessage({ kind: "image", mine: true, imageUri: uri, status: "sent" });
    }
  };

  const sendDocument = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "image/*",
      ],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (res.canceled) return;
    const f = res.assets?.[0];
    if (f)
      pushMessage({
        kind: "file",
        mine: true,
        fileName: f.name ?? "document",
        fileMime: f.mimeType ?? null,
        fileUri: f.uri,
        status: "sent",
      });
  };

  const sendLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return;
    setSending(true);
    try {
      const pos = await Location.getCurrentPositionAsync({});
      pushMessage({
        kind: "location",
        mine: true,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        status: "sent",
      });
    } finally {
      setSending(false);
    }
  };

  /* -------------------------- Render helpers -------------------------- */
  const DayDivider = ({ label }: { label: string }) => (
    <View className="my-3 items-center">
      <View className="rounded-full bg-[#F1F5F9] px-3 py-1">
        <Text className="text-[11px] text-[#64748B]">{label}</Text>
      </View>
    </View>
  );

  const LocationBubble = ({ m }: { m: Msg }) => {
    const url =
      typeof m.lat === "number" && typeof m.lng === "number"
        ? `https://www.google.com/maps/search/?api=1&query=${m.lat},${m.lng}`
        : undefined;
    return (
      <Pressable
        onPress={() => openUrl(url)}
        className="max-w-[78%] rounded-2xl border px-3 py-2"
        style={{ backgroundColor: m.mine ? C.mineBg : C.theirsBg, borderColor: C.border }}
      >
        <View className="flex-row items-center">
          <Ionicons name="navigate-outline" size={16} color="#0F172A" />
          <Text className="ml-1 font-semibold text-[#0F172A]">Share location</Text>
        </View>
        {typeof m.lat === "number" && typeof m.lng === "number" ? (
          <Text className="mt-1 text-[12px] text-[#64748B]">
            {m.lat.toFixed(5)}, {m.lng.toFixed(5)}
          </Text>
        ) : null}
      </Pressable>
    );
  };

  const FileBubble = ({ m }: { m: Msg }) => (
    <Pressable
      onPress={() => openUrl(m.fileUri)}
      className="max-w-[78%] rounded-2xl border bg-white px-3 py-2"
      style={{ borderColor: C.border }}
    >
      <View className="flex-row items-center">
        <Ionicons name="document-attach-outline" size={16} color="#0F172A" />
        <Text className="ml-2 text-[13px] font-medium text-[#0F172A]" numberOfLines={1}>
          {m.fileName ?? "File"}
        </Text>
      </View>
      <Text className="mt-0.5 text-[11px] text-[#64748B]">{m.fileMime ?? "document"}</Text>
    </Pressable>
  );

  const ImageBubble = ({ uri }: { uri?: string }) => (
    <View
      className="overflow-hidden rounded-2xl border"
      style={{ borderColor: C.border, width: 240, height: 140, backgroundColor: "#F1F5F9" }}
    >
      {uri ? <Image source={{ uri }} style={{ width: "100%", height: "100%" }} /> : null}
    </View>
  );

  const TextBubble = ({ m }: { m: Msg }) => {
    const isLink = !!m.text && /^https?:\/\//i.test(m.text);
    return (
      <Pressable
        onPress={() => (isLink ? openUrl(m.text) : undefined)}
        className="max-w-[78%] rounded-2xl border px-3 py-2"
        style={{ backgroundColor: m.mine ? C.mineBg : C.theirsBg, borderColor: C.border }}
      >
        <Text className="text-[14px] leading-[20px] text-[#0F172A]">{m.text}</Text>
      </Pressable>
    );
  };

  const One = ({ m }: { m: Msg }) => {
    if (m.text === "__DAY__") return <DayDivider label="Today" />;
    const align = m.mine ? "items-end" : "items-start";
    return (
      <View className={`px-3 py-1 ${align}`}>
        <View className="flex-row items-end">
          {!m.mine ? (
            <View className="mr-2 h-7 w-7 overflow-hidden rounded-full bg-slate-200">
              <Image
                source={{
                  uri:
                    avatar ||
                    "https://images.unsplash.com/photo-1502685104226-ee32379fefbe?q=80&w=200&auto=format&fit=crop",
                }}
                style={{ width: "100%", height: "100%" }}
              />
            </View>
          ) : null}

          <View>
            {m.kind === "image" ? (
              <ImageBubble uri={m.imageUri} />
            ) : m.kind === "file" ? (
              <FileBubble m={m} />
            ) : m.kind === "location" ? (
              <LocationBubble m={m} />
            ) : (
              <TextBubble m={m} />
            )}

            <View className={`mt-1 ${m.mine ? "items-end" : "items-start"}`}>
              <View className="flex-row items-center">
                <Text className="text-[11px] text-[#94A3B8]">{m.time}</Text>
                {m.mine ? (
                  <>
                    <Text className="mx-1 text-[#E5E7EB]">•</Text>
                    <Ionicons
                      name={m.status === "read" ? "checkmark-done" : "checkmark"}
                      size={14}
                      color={m.status === "read" ? C.primary : "#94A3B8"}
                    />
                  </>
                ) : null}
              </View>
            </View>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View className="flex-1 bg-[#F4F6F8]">
      {/* Header */}
      <SafeAreaView edges={["top"]} className="bg-white">
        <View className="flex-row items-center border-b border-[#E5E7EB] px-3 py-2">
          <Pressable
            onPress={onClose}
            hitSlop={10}
            className="h-9 w-9 items-center justify-center rounded-full active:opacity-80"
          >
            <Ionicons name="arrow-back" size={22} color="#0F172A" />
          </Pressable>

          <View className="ml-2 flex-row items-center">
            <View className="mr-2 h-9 w-9 overflow-hidden rounded-full bg-slate-200">
              <Image
                source={{
                  uri:
                    avatar ||
                    "https://images.unsplash.com/photo-1502685104226-ee32379fefbe?q=80&w=200&auto=format&fit=crop",
                }}
                style={{ width: "100%", height: "100%" }}
              />
            </View>
            <View>
              <Text className="text-[15px] font-semibold text-[#0F172A]">{title}</Text>
              <Text className="text-[11px] text-[#10B981]">{subtitle}</Text>
            </View>
          </View>

          {/* Right side intentionally empty */}
          <View className="flex-1" />
        </View>
      </SafeAreaView>

      {/* Messages */}
      <FlatList
        ref={listRef}
        data={data}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => <One m={item} />}
        contentContainerStyle={{ paddingVertical: 8 }}
        onContentSizeChange={scrollToEnd}
      />

      {/* Composer */}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View className="border-t border-[#E5E7EB] bg-white px-3 py-2">
          {/* Center everything vertically for perfect alignment */}
          <View className="flex-row items-center">
            {/* Attach */}
            <Pressable
              onPress={() => setPickerOpen((s) => !s)}
              hitSlop={8}
              className="h-11 w-11 items-center justify-center rounded-full active:opacity-80"
            >
              <Ionicons name="attach-outline" size={22} color="#0F172A" />
            </Pressable>

            {/* Location */}
            <Pressable
              onPress={sendLocation}
              hitSlop={8}
              className="ml-1 h-11 w-11 items-center justify-center rounded-full active:opacity-80"
            >
              <Ionicons name="navigate-outline" size={22} color="#0F172A" />
            </Pressable>

            {/* Input (auto-grow, smooth focus/blur) */}
            <View
              className={`mx-2 flex-1 rounded-2xl border px-3 ${
                focused ? "border-[#2563EB] bg-white" : "border-[#E5E7EB] bg-[#F9FAFB]"
              }`}
            >
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder="message..."
                placeholderTextColor="#9CA3AF"
                className="text-[14px] text-[#0F172A]"
                multiline
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onContentSizeChange={(e) => {
                  const h = e.nativeEvent.contentSize.height;
                  // Clamp height between 44 and 120 for smoothness
                  setInputHeight(Math.max(44, Math.min(120, Math.round(h + 8))));
                }}
                style={{
                  height: inputHeight,
                  paddingVertical: 10,
                  textAlignVertical: "center",
                }}
              />
            </View>

            {/* Send (blue when enabled) */}
            <Pressable
              onPress={sendText}
              disabled={!input.trim() || sending}
              className="h-11 items-center justify-center rounded-xl px-2 active:opacity-80"
            >
              <Text
                className="text-[15px] font-semibold"
                style={{
                  color: input.trim() ? "#2563EB" : "#BFD3FE",
                }}
              >
                Send
              </Text>
            </Pressable>
          </View>

          {/* Picker Row */}
          {pickerOpen && (
            <View className="mt-2 flex-row gap-2">
              <ActionPill
                icon="camera-outline"
                label="Camera"
                onPress={() => {
                  setPickerOpen(false);
                  sendImageFromCamera();
                }}
              />
              <ActionPill
                icon="image-outline"
                label="Gallery"
                onPress={() => {
                  setPickerOpen(false);
                  sendImageFromGallery();
                }}
              />
              <ActionPill
                icon="document-outline"
                label="File"
                onPress={() => {
                  setPickerOpen(false);
                  sendDocument();
                }}
              />
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

/* -------------------------- Helper pill -------------------------- */
function ActionPill({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center rounded-full border border-[#E5E7EB] bg-white px-3 py-1.5 active:opacity-80"
    >
      <Ionicons name={icon} size={16} color="#0F172A" />
      <Text className="ml-1 text-[12px] text-[#0F172A]">{label}</Text>
    </Pressable>
  );
}

/* ====================================================================
   Full-screen Modal Wrapper (optional)
==================================================================== */
export default function ChatModal(props: ChatThreadProps & { visible: boolean }) {
  const { visible, ...rest } = props;
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <ChatThread {...rest} />
    </Modal>
  );
}
