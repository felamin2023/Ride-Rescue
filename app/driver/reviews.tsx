// app/(driver)/reviews.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  Platform,
  Modal,
  TextInput,
  Image,
  KeyboardAvoidingView,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import LoadingScreen from "../../components/LoadingScreen";

/* ------------------------------ Design tokens ------------------------------ */
const COLORS = {
  bg: "#F4F6F8",
  surface: "#FFFFFF",
  border: "#E5E7EB",
  text: "#0F172A",
  sub: "#475569",
  muted: "#94A3B8",
  primary: "#2563EB",
  primaryDark: "#1D4ED8",
  success: "#16A34A",
  danger: "#DC2626",
};

const cardShadow = Platform.select({
  ios: {
    shadowColor: "#0F172A",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  android: { elevation: 2 },
});

/* --------------------------------- Types ---------------------------------- */
type PaymentMethod = "Cash" | "GCash" | "Card";

type CompletedJob = {
  id: string;
  type: "mechanic" | "shop";
  name: string;
  location: string;
  service: string;
  amountPaid?: number;
  paymentMethod?: PaymentMethod;
  requestedAt: string;
  completedAt: string;
  canRate?: boolean;
  avatarUrl?: string; // optional remote URL
};

/* ------------------------------ Helpers ----------------------------------- */
const formatCurrency = (amt?: number) => {
  if (typeof amt !== "number" || Number.isNaN(amt)) return "—";
  const parts = amt.toFixed(2).split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `₱${parts.join(".")}`;
};

const methodIcon: Record<PaymentMethod, keyof typeof Ionicons.glyphMap> = {
  Cash: "cash-outline",
  GCash: "wallet-outline",
  Card: "card-outline",
};

/* --------------------------- ONLINE AVATAR PICKER -------------------------- */
const FALLBACKS = {
  generic:
    "https://images.unsplash.com/photo-1518442045246-1c953a37cb0f?w=160&h=160&fit=crop&auto=format&q=60",
  vulcanize:
    "https://images.unsplash.com/photo-1605719124118-9c541ef3a5d3?w=160&h=160&fit=crop&auto=format&q=60",
  repair:
    "https://images.unsplash.com/photo-1524666041070-9d87656c25bb?w=160&h=160&fit=crop&auto=format&q=60",
  battery:
    "https://images.unsplash.com/photo-1615271790416-5f1ac2f9cecf?w=160&h=160&fit=crop&auto=format&q=60",
  mechanic:
    "https://images.unsplash.com/photo-1517048676732-d65bc937f952?w=160&h=160&fit=crop&auto=format&q=60",
};

function chooseAvatarUrl(item: CompletedJob) {
  if (item.avatarUrl && /^https?:\/\//i.test(item.avatarUrl)) return item.avatarUrl;
  const text = `${item.name} ${item.service}`.toLowerCase();
  if (/(vulcaniz|tire|wheel)/.test(text)) return FALLBACKS.vulcanize;
  if (/(battery|jumpstart)/.test(text)) return FALLBACKS.battery;
  if (/(repair|garage|shop|service)/.test(text)) return FALLBACKS.repair;
  return item.type === "mechanic" ? FALLBACKS.mechanic : FALLBACKS.generic;
}

/* ----------------------------- Avatar (shared) ----------------------------- */
/** Matches the look/behavior in repairshop.tsx:
 *  - circular, ring, shadow
 *  - graceful fallback to initials if image fails
 *  - supports remote URLs and default generic image
 */
function Avatar({
  name,
  uri,
  size = 56,
  ringColor = "#E5EDFF", // soft blue ring like in your cards
}: {
  name: string;
  uri?: string;
  size?: number;
  ringColor?: string;
}) {
  const [err, setErr] = useState(false);
  const initials = (name || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  const borderRadius = size / 2;

  if (err || !uri) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#E2E8F0",
          borderWidth: 2,
          borderColor: ringColor,
        }}
        className="overflow-hidden"
      >
        <Text className="text-[16px] font-semibold text-slate-700">{initials || "?"}</Text>
      </View>
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius,
        borderWidth: 2,
        borderColor: ringColor,
        overflow: "hidden",
      }}
    >
      <Image
        source={{ uri }}
        onError={() => setErr(true)}
        resizeMode="cover"
        style={{ width: size, height: size }}
      />
    </View>
  );
}

/* ------------------------------ Mocked items ------------------------------- */
const COMPLETED: CompletedJob[] = [
  {
    id: "cmp_001",
    type: "shop",
    name: "Tewe Vulcanizing Shop",
    location: "Natalio B. Bacalso S National Hwy, Argao, Cebu",
    service: "Tire vulcanizing & wheel balancing",
    amountPaid: 450,
    paymentMethod: "GCash",
    requestedAt: "2025-09-06 10:15 AM",
    completedAt: "2025-09-06 10:47 AM",
    canRate: true,
    // avatarUrl: "https://your-cdn.example/tewe.png",
  },
  {
    id: "cmp_002",
    type: "mechanic",
    name: "Esther Howard",
    location: "Barangay Tulic, Argao, Cebu",
    service: "Battery jumpstart & diagnostics",
    amountPaid: 350,
    paymentMethod: "Cash",
    requestedAt: "2025-09-05 2:08 PM",
    completedAt: "2025-09-05 2:55 PM",
    canRate: true,
  },
];

/* =============================== Success Modal ============================== */
function SuccessModal({
  visible,
  onClose,
  title = "Review submitted",
  subtitle = "Thank you for sharing your experience!",
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
      >
        <View
          className="w-80 items-center rounded-2xl bg-white px-6 py-7"
          style={cardShadow as any}
        >
          <View className="h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: "#DCFCE7" }}>
            <Ionicons name="checkmark" size={32} color={COLORS.success} />
          </View>
          <Text className="mt-4 text-[17px] font-semibold text-slate-900">{title}</Text>
          <Text className="mt-1 text-center text-[13px] text-slate-600">{subtitle}</Text>

          <Pressable
            onPress={onClose}
            className="mt-5 w-full items-center justify-center rounded-xl bg-blue-700 py-3 active:opacity-90"
          >
            <Text className="text-[14px] font-semibold text-white">Done</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/* =================================== Page ================================== */
export default function Reviews() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const SHEET_MAX_HEIGHT = Math.floor(winH * 0.9);

  const [modalVisible, setModalVisible] = useState(false);
  const [activeItem, setActiveItem] = useState<CompletedJob | null>(null);
  const [rating, setRating] = useState<number>(0);
  const [message, setMessage] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [loadingVisible, setLoadingVisible] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState<string | undefined>(undefined);
  const [successVisible, setSuccessVisible] = useState(false);

  const isPositive = rating >= 4;
  const prevIsPositiveRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (prevIsPositiveRef.current === null) {
      prevIsPositiveRef.current = isPositive;
      return;
    }
    if (prevIsPositiveRef.current !== isPositive) {
      setSelectedTags([]);
      prevIsPositiveRef.current = isPositive;
    }
  }, [isPositive]);

  const resetForm = () => {
    setRating(0);
    setMessage("");
    setSelectedTags([]);
    setPhotos([]);
    prevIsPositiveRef.current = null;
  };

  const openRateModal = (item: CompletedJob) => {
    setActiveItem(item);
    resetForm();
    setModalVisible(true);
  };

  /* ------------------------- Image + permissions -------------------------- */
  const requestMediaLibrary = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    return status === "granted";
  };

  const requestCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    return status === "granted";
  };

  const MAX_PHOTOS = 6;

  const appendUris = (uris: string[]) => {
    if (!uris.length) return;
    setPhotos((prev) => {
      const next = [...prev, ...uris];
      return next.slice(0, MAX_PHOTOS);
    });
  };

  const pickFromGallery = async () => {
    const ok = await requestMediaLibrary();
    if (!ok) return;

    const res = await ImagePicker.launchImageLibraryAsync({
      quality: 0.8,
      allowsEditing: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      exif: false,
      // @ts-ignore iOS multi-select hint
      allowsMultipleSelection: true,
      // @ts-ignore iOS selection hint
      selectionLimit: MAX_PHOTOS,
    });

    if (!res.canceled) {
      // @ts-ignore
      const uris = (res.assets || []).map((a: any) => a?.uri).filter(Boolean);
      appendUris(uris as string[]);
    }
  };

  const takePhoto = async () => {
    const ok = await requestCamera();
    if (!ok) return;

    const res = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      allowsEditing: true,
    });

    if (!res.canceled) {
      const uri = res.assets?.[0]?.uri;
      if (uri) appendUris([uri]);
    }
  };

  const removePhoto = (uri: string) => {
    setPhotos((prev) => prev.filter((p) => p !== uri));
  };

  /* ------------------------------- Submit --------------------------------- */
  const fakeDelay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const onSubmit = async () => {
    if (!activeItem) return;
    if (rating === 0) {
      setLoadingVisible(true);
      setLoadingMsg("Please select a star rating…");
      await fakeDelay(800);
      setLoadingVisible(false);
      return;
    }

    setLoadingMsg("Submitting your review…");
    setLoadingVisible(true);

    // TODO: Upload photos to Supabase and insert review
    await fakeDelay(900);

    setLoadingVisible(false);
    setModalVisible(false);
    setSuccessVisible(true);
  };

  /* ----------------------------- Render card ------------------------------ */
  const renderItem = ({ item }: { item: CompletedJob }) => {
    const avatarUri = chooseAvatarUrl(item);
    return (
      <View className="mx-4 mb-4 rounded-2xl bg-white p-4" style={cardShadow as any}>
        {/* Title row with repairshop-style avatar */}
        <View className="flex-row items-center">
          <View className="mr-3" style={cardShadow as any}>
            <Avatar name={item.name} uri={avatarUri} size={56} />
          </View>
          <Text className="flex-1 text-[16px] font-semibold text-slate-900">{item.name}</Text>
        </View>

        {/* Location */}
        <View className="mt-3 flex-row">
          <Ionicons name="location-outline" size={16} color={COLORS.sub} />
          <Text className="ml-2 flex-1 text-[13px] text-slate-600">{item.location}</Text>
        </View>

        {/* Service */}
        <View className="mt-2 flex-row items-center">
          <Ionicons name="pricetag-outline" size={16} color={COLORS.sub} />
          <Text className="ml-2 text-[13px] text-slate-700">
            <Text className="font-medium text-slate-900">Service: </Text>
            {item.service}
          </Text>
        </View>

        {/* Paid */}
        <View className="mt-1.5 flex-row items-center">
          <Ionicons
            name={item.paymentMethod ? methodIcon[item.paymentMethod] : "cash-outline"}
            size={16}
            color={COLORS.muted}
          />
          <Text className="ml-2 text-[12px] text-slate-600">
            Paid {formatCurrency(item.amountPaid)}
            {item.paymentMethod ? ` • ${item.paymentMethod}` : ""}
          </Text>
        </View>

        {/* Dates */}
        <View className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
          <View className="mb-1.5 flex-row items-center">
            <Ionicons name="time-outline" size={16} color={COLORS.sub} />
            <Text className="ml-2 text-[13px] text-slate-500">
              <Text className="font-medium text-slate-700">Requested:</Text> {item.requestedAt}
            </Text>
          </View>
          <View className="flex-row items-center">
            <Ionicons name="checkmark-done-outline" size={16} color={COLORS.success} />
            <Text className="ml-2 text-[13px] text-slate-500">
              <Text className="font-medium text-slate-700">Completed:</Text> {item.completedAt}
            </Text>
          </View>
        </View>

        {/* CTA */}
        {item.canRate && (
          <Pressable
            onPress={() => openRateModal(item)}
            className="mt-4 flex-row items-center justify-center rounded-xl bg-blue-600 py-3 active:opacity-90"
          >
            <Ionicons name="star" size={18} color="white" />
            <Text className="ml-2 text-[14px] font-semibold text-white">Rate this service</Text>
          </Pressable>
        )}
      </View>
    );
  };

  /* ------------------------------ Modal UI -------------------------------- */
  const StarRow = () => (
    <View className="mt-2 flex-row">
      {[1, 2, 3, 4, 5].map((i) => (
        <Pressable key={i} onPress={() => setRating(i)} className="mr-1.5">
          <Ionicons name={i <= rating ? "star" : "star-outline"} size={28} color={COLORS.primary} />
        </Pressable>
      ))}
    </View>
  );

  const LIKE_SERVICE_TAGS = [
    "Fast response",
    "Professional mechanic",
    "Accurate diagnosis",
    "Quality repair",
    "Fair pricing",
    "Transparent quote",
    "Good communication",
    "Friendly service",
    "Clean workmanship",
    "Had parts available",
    "Towing handled well",
    "Clear post-repair tips",
  ];

  const DISLIKE_SERVICE_TAGS = [
    "Slow response",
    "Rude staff",
    "Misdiagnosis",
    "Issue came back",
    "Overpriced",
    "Hidden charges",
    "Poor communication",
    "Messy work",
    "No parts available",
    "Late arrival",
    "Long waiting time",
    "Unclear explanation",
  ];

  const TagChips = () => {
    const tags = isPositive ? LIKE_SERVICE_TAGS : DISLIKE_SERVICE_TAGS;
    return (
      <View className="mt-2 flex-row flex-wrap gap-2">
        {tags.map((t) => {
          const active = selectedTags.includes(t);
          const activeBg = isPositive ? "bg-green-50" : "bg-red-50";
          const activeBorder = isPositive ? "border-green-300" : "border-red-300";
          const activeText = isPositive ? "text-green-700" : "text-red-700";
          return (
            <Pressable
              key={t}
              onPress={() =>
                setSelectedTags((prev) =>
                  prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
                )
              }
              className={`rounded-xl border px-3 py-1 ${
                active ? `${activeBg} ${activeBorder}` : "bg-white border-slate-300"
              }`}
            >
              <Text className={`text-[12px] ${active ? activeText : "text-slate-600"}`}>{t}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  };

  const PhotosGrid = () => {
    if (!photos.length) return null;
    return (
      <View className="mt-3">
        <View className="flex-row flex-wrap">
          {photos.map((uri) => (
            <View key={uri} className="mr-2 mb-2">
              <View className="relative">
                <Image source={{ uri }} className="h-16 w-16 rounded-lg" />
                <Pressable
                  onPress={() => removePhoto(uri)}
                  className="absolute -right-2 -top-2 h-6 w-6 items-center justify-center rounded-full bg-black/70"
                  hitSlop={6}
                >
                  <Ionicons name="close" size={14} color="#fff" />
                </Pressable>
              </View>
            </View>
          ))}
        </View>
        <Text className="mt-1 text-[11px] text-slate-500">
          {photos.length}/{MAX_PHOTOS} photos
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Header — back left, centered title */}
      <View className="relative h-14 flex-row items-center border-b border-slate-100 bg-white">
        <Pressable onPress={() => router.back()} hitSlop={12} className="absolute left-4">
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </Pressable>
        <View className="absolute inset-0 items-center justify-center">
          <Text className="text-lg font-semibold text-slate-900">Reviews</Text>
        </View>
      </View>

      <FlatList
        data={COMPLETED}
        keyExtractor={(it) => it.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingVertical: 12 }}
        ListEmptyComponent={
          <View className="px-6 pt-10">
            <Text className="text-center text-slate-500">No completed services yet.</Text>
          </View>
        }
      />

      {/* Rating Modal */}
      <Modal
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
        transparent
        animationType="slide"
        statusBarTranslucent
      >
        <View className="flex-1 items-center justify-end bg-black/40">
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ width: "100%" }}
          >
            <View
              style={{
                maxHeight: SHEET_MAX_HEIGHT,
                backgroundColor: "white",
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
                paddingBottom: Math.max(insets.bottom, 12),
              }}
            >
              {/* Sticky header */}
              <View className="px-5 pt-4">
                <View className="flex-row items-center justify-between">
                  <Pressable
                    onPress={() => setModalVisible(false)}
                    className="h-8 w-8 items-center justify-center rounded-full"
                    hitSlop={10}
                  >
                    <Ionicons name="close" size={20} color="#111827" />
                  </Pressable>
                  <Pressable className="h-8 w-8 items-center justify-center rounded-full" hitSlop={10}>
                    <Ionicons name="help-circle-outline" size={20} color="#64748B" />
                  </Pressable>
                </View>

                <Text className="mt-1 text-[17px] font-semibold text-slate-900">
                  How was the service
                </Text>
                <Text className="mt-1 text-[12px] text-slate-500">
                  {rating >= 4
                    ? "Lovely! What went well?"
                    : rating >= 1
                    ? "Sorry to hear that. What didn’t go well?"
                    : "Select a star rating to continue."}
                </Text>
              </View>

              {/* Scrollable body */}
              <ScrollView
                style={{ paddingHorizontal: 20, marginTop: 8 }}
                contentContainerStyle={{ paddingBottom: 20 }}
                keyboardShouldPersistTaps="handled"
              >
                <StarRow />

                <Text className="mt-2 text-[12px] text-slate-600">
                  {rating >= 4
                    ? "Will 100% try again!"
                    : rating >= 1
                    ? "We’ll use this to improve the service."
                    : " "}
                </Text>

                <Text className="mt-5 text-[13px] font-semibold text-slate-900">
                  {isPositive ? "What did you like about the service?" : "What didn’t you like?"}
                </Text>
                <TagChips />

                {/* Text review */}
                <View className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <TextInput
                    placeholder={isPositive ? "Share more details…" : "Tell us what went wrong…"}
                    placeholderTextColor="#94A3B8"
                    value={message}
                    onChangeText={setMessage}
                    multiline
                    className="min-h-[80px] text-[13px] text-slate-800"
                  />
                </View>

                {/* Photos */}
                <View className="mt-4 rounded-2xl border border-slate-200 p-3">
                  <Text className="mb-2 text-[13px] font-medium text-slate-900">
                    Add photos (optional)
                  </Text>

                  <PhotosGrid />

                  <View className="mt-2 flex-row gap-2">
                    <Pressable
                      onPress={photos.length >= MAX_PHOTOS ? undefined : pickFromGallery}
                      className={`flex-1 items-center justify-center rounded-xl border border-slate-300 py-2 ${
                        photos.length >= MAX_PHOTOS ? "opacity-50" : "active:opacity-90"
                      }`}
                    >
                      <Ionicons name="image-outline" size={18} color="#111827" />
                      <Text className="mt-1 text-[12px] text-slate-700">
                        {photos.length >= MAX_PHOTOS ? "Max reached" : "Choose photos"}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={photos.length >= MAX_PHOTOS ? undefined : takePhoto}
                      className={`flex-1 items-center justify-center rounded-xl border border-slate-300 py-2 ${
                        photos.length >= MAX_PHOTOS ? "opacity-50" : "active:opacity-90"
                      }`}
                    >
                      <Ionicons name="camera-outline" size={18} color="#111827" />
                      <Text className="mt-1 text-[12px] text-slate-700">
                        {photos.length >= MAX_PHOTOS ? "Max reached" : "Take picture"}
                      </Text>
                    </Pressable>
                  </View>
                </View>

                {/* Thank you & submit */}
                <View className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4" style={cardShadow as any}>
                  <Text className="text-[15px] font-semibold text-slate-900">Thank you!</Text>
                  <Text className="mt-1 text-[12px] text-slate-600">
                    {isPositive
                      ? "Your praise helps others choose great providers."
                      : "Your feedback helps us fix issues quickly."}
                  </Text>

                  <Pressable
                    onPress={onSubmit}
                    className="mt-3 items-center justify-center rounded-xl bg-blue-700 py-3 active:opacity-90"
                  >
                    <Text className="text-[14px] font-semibold text-white">Submit review</Text>
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Loading overlay — spinner */}
      <LoadingScreen visible={loadingVisible} message={loadingMsg} variant="spinner" />

      {/* Pretty success popup */}
      <SuccessModal
        visible={successVisible}
        onClose={() => setSuccessVisible(false)}
        title="Review submitted"
        subtitle="Thank you for sharing your experience!"
      />
    </SafeAreaView>
  );
}
