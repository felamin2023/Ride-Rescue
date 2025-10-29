import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  TextInput,
  Image,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";

/* --------------------------------- Types ---------------------------------- */
type CompletedJob = {
  id: string;
  type: "mechanic" | "shop";
  name: string;
  location: string;
  service: string;
  amountPaid?: number;
  paymentMethod?: "Cash" | "GCash" | "Card";
  requestedAt: string;
  completedAt: string;
  canRate?: boolean;
  avatarUrl?: string;
};

interface RatingBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: {
    rating: number;
    message: string;
    selectedTags: string[];
    photos: string[];
  }) => void;
  item: CompletedJob | null;
}

/* ------------------------------ Constants --------------------------------- */
const MAX_PHOTOS = 6;

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

/* ============================== Component ================================= */
export default function RatingBottomSheet({
  visible,
  onClose,
  onSubmit,
  item,
}: RatingBottomSheetProps) {
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const SHEET_MAX_HEIGHT = Math.floor(winH * 0.9);

  const [rating, setRating] = useState<number>(0);
  const [message, setMessage] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);

  const isPositive = rating >= 4;
  const prevIsPositiveRef = useRef<boolean | null>(null);

  // Reset tags when switching between positive/negative
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

  // Reset form when modal closes
  useEffect(() => {
    if (!visible) {
      setRating(0);
      setMessage("");
      setSelectedTags([]);
      setPhotos([]);
      prevIsPositiveRef.current = null;
    }
  }, [visible]);

  /* ------------------------- Image permissions -------------------------- */
  const requestMediaLibrary = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    return status === "granted";
  };

  const requestCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    return status === "granted";
  };

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

  const handleSubmit = () => {
    if (rating === 0) {
      // You could show an error here or pass it to parent
      return;
    }
    onSubmit({ rating, message, selectedTags, photos });
  };

  /* ------------------------------ Sub-components --------------------------- */
  const StarRow = () => (
    <View className="mt-2 flex-row">
      {[1, 2, 3, 4, 5].map((i) => (
        <Pressable key={i} onPress={() => setRating(i)} className="mr-1.5">
          <Ionicons
            name={i <= rating ? "star" : "star-outline"}
            size={28}
            color="#2563EB"
          />
        </Pressable>
      ))}
    </View>
  );

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
              <Text className={`text-[12px] ${active ? activeText : "text-slate-600"}`}>
                {t}
              </Text>
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

  if (!item) return null;

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
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
                  onPress={onClose}
                  className="h-8 w-8 items-center justify-center rounded-full"
                  hitSlop={10}
                >
                  <Ionicons name="close" size={20} color="#111827" />
                </Pressable>
                <Pressable
                  className="h-8 w-8 items-center justify-center rounded-full"
                  hitSlop={10}
                >
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
                  ? "Sorry to hear that. What didn't go well?"
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
                  ? "We'll use this to improve the service."
                  : " "}
              </Text>

              <Text className="mt-5 text-[13px] font-semibold text-slate-900">
                {isPositive ? "What did you like about the service?" : "What didn't you like?"}
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
              <View className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <Text className="text-[15px] font-semibold text-slate-900">Thank you!</Text>
                <Text className="mt-1 text-[12px] text-slate-600">
                  {isPositive
                    ? "Your praise helps others choose great providers."
                    : "Your feedback helps us fix issues quickly."}
                </Text>

                <Pressable
                  onPress={handleSubmit}
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
  );
}
