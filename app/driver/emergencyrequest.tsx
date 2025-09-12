// app/(driver)/emergencyrequest.tsx
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Image,
  Modal,
  Platform,
  Alert,
  KeyboardAvoidingView,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
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

type VehicleType = "car" | "motorcycle" | "van" | "truck";
type IconLib = "ion" | "mci";
const MAX_PHOTOS = 4;

/* ------------------------------- Small UI --------------------------------- */
function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text className="mb-1 ml-1 text-[12px] font-medium text-slate-800">{children}</Text>;
}

function VehicleChip({
  label,
  iconName,
  lib = "ion",
  selected,
  onPress,
}: {
  label: string;
  iconName: string;
  lib?: IconLib;
  selected: boolean;
  onPress: () => void;
}) {
  const Icon = lib === "mci" ? MaterialCommunityIcons : (Ionicons as any);
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 flex-row items-center justify-center gap-2 rounded-xl border px-3 py-3 mx-1 ${
        selected ? "bg-[#EEF2FF] border-[#C7D2FE]" : "bg-white border-slate-300"
      }`}
      style={cardShadow as any}
      android_ripple={{ color: "rgba(0,0,0,0.05)" }}
    >
      <Icon name={iconName as any} size={18} color={selected ? COLORS.primary : COLORS.text} />
      <Text className={`text-[13px] ${selected ? "text-[#1E3A8A]" : "text-slate-800"} font-medium`}>
        {label}
      </Text>
    </Pressable>
  );
}

/* ------------------------------ Popups (like Reviews) ------------------------------ */
function SuccessModal({
  visible,
  onClose,
  title = "Emergency posted",
  subtitle = "We’ve alerted nearby responders.",
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.45)" }}>
        <View className="w-80 items-center rounded-2xl bg-white px-6 py-7" style={cardShadow as any}>
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

function ErrorModal({
  visible,
  onRetry,
  onDismiss,
  title = "Can’t pinpoint your location",
  message = "Please enable GPS/Location and try again.",
}: {
  visible: boolean;
  onRetry: () => void;
  onDismiss?: () => void;
  title?: string;
  message?: string;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.45)" }}>
        <View className="w-80 items-center rounded-2xl bg-white px-6 py-7" style={cardShadow as any}>
          <View className="h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: "#FEE2E2" }}>
            <Ionicons name="alert-circle" size={32} color={COLORS.danger} />
          </View>
          <Text className="mt-4 text-[17px] font-semibold text-slate-900">{title}</Text>
          <Text className="mt-1 text-center text-[13px] text-slate-600">{message}</Text>

          <View className="mt-5 w-full flex-row gap-2">
            <Pressable
              onPress={onDismiss || (() => {})}
              className="flex-1 items-center justify-center rounded-xl border border-slate-300 py-3 active:opacity-90"
            >
              <Text className="text-[14px] font-semibold text-slate-800">Close</Text>
            </Pressable>
            <Pressable
              onPress={onRetry}
              className="flex-1 items-center justify-center rounded-xl bg-blue-700 py-3 active:opacity-90"
            >
              <Text className="text-[14px] font-semibold text-white">Try again</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ConfirmModal({
  visible,
  vehicle,
  desc,
  address,
  coords,
  photosCount,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  vehicle: string | null;
  desc: string;
  address?: string | null;
  coords?: { lat: number; lon: number } | null;
  photosCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.45)" }}>
        <View className="w-80 rounded-2xl bg-white px-6 py-7" style={cardShadow as any}>
          <View className="items-center">
            <View className="h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: "#DBEAFE" }}>
              <Ionicons name="information-circle" size={32} color={COLORS.primary} />
            </View>
          </View>

          <Text className="mt-4 text-center text-[17px] font-semibold text-slate-900">Post this emergency?</Text>
          <Text className="mt-1 text-center text-[12px] text-slate-600">
            We’ll notify responders within range.
          </Text>

          <View className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <Text className="text-[12px] text-slate-700">
              <Text className="font-semibold">Vehicle:</Text> {vehicle || "—"}
            </Text>
            <Text className="mt-1 text-[12px] text-slate-700">
              <Text className="font-semibold">Issue:</Text> {desc || "—"}
            </Text>
            <Text className="mt-1 text-[12px] text-slate-700">
              <Text className="font-semibold">Location:</Text>{" "}
              {(address ? address + " • " : "") + (coords ? `${coords.lat.toFixed(5)}, ${coords.lon.toFixed(5)}` : "—")}
            </Text>
            <Text className="mt-1 text-[12px] text-slate-700">
              <Text className="font-semibold">Photos:</Text> {photosCount}
            </Text>
          </View>

          <View className="mt-5 flex-row gap-2">
            <Pressable
              onPress={onCancel}
              className="flex-1 items-center justify-center rounded-xl border border-slate-300 py-3 active:opacity-90"
            >
              <Text className="text-[14px] font-semibold text-slate-800">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              className="flex-1 items-center justify-center rounded-xl bg-blue-700 py-3 active:opacity-90"
            >
              <Text className="text-[14px] font-semibold text-white">Post now</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/* --------------------------------- Screen --------------------------------- */
export default function EmergencyRequest() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [vehicle, setVehicle] = useState<VehicleType | null>(null);
  const [desc, setDesc] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);

  // Posting flow
  const [loading, setLoading] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);

  // Location (auto-detected)
  const [locLoading, setLocLoading] = useState(true);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [locErrorVisible, setLocErrorVisible] = useState(false);

  // Require coords for submit
  const canSubmit = !!vehicle && desc.trim().length >= 8 && !!coords;

  /* ------------------------------ Image pickers ----------------------------- */
  const requestMedia = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    return status === "granted";
  };
  const requestCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    return status === "granted";
  };

  const addUris = (uris: string[]) => {
    if (!uris.length) return;
    setPhotos((prev) => {
      const next = [...prev];
      for (const u of uris) {
        if (next.length >= MAX_PHOTOS) break;
        if (!next.includes(u)) next.push(u);
      }
      return next;
    });
  };

  const pickFromGallery = async () => {
    try {
      const ok = await requestMedia();
      if (!ok) {
        Alert.alert("Permission needed", "Gallery access was denied.");
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        // FIX: MediaTypeOptions (not MediaType)
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        selectionLimit: Math.max(1, MAX_PHOTOS - photos.length),
        quality: 0.9,
        allowsEditing: false,
      });

      if (!res.canceled) {
        const uris = (res.assets || []).map((a) => a.uri).filter(Boolean) as string[];
        addUris(uris);
      }
    } catch (e) {
      console.warn("pickFromGallery error:", e);
      Alert.alert("Choose photos failed", "Please try again or pick one photo at a time.");
    }
  };

  const takePhoto = async () => {
    const ok = await requestCamera();
    if (!ok) {
      Alert.alert("Permission needed", "Camera access was denied.");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      quality: 0.9,
      allowsEditing: true,
    });
    if (!res.canceled && res.assets?.[0]?.uri) addUris([res.assets[0].uri]);
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  /* ------------------------------ Current location -------------------------- */
  const detectLocation = async () => {
    try {
      setLocLoading(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setCoords(null);
        setAddress(null);
        setLocErrorVisible(true);
        setLocLoading(false);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      setCoords({ lat, lon });

      try {
        const parts = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
        if (parts && parts[0]) {
          const p = parts[0];
          const line = [p.name, p.street, p.subregion || p.city, p.region].filter(Boolean).join(", ");
          setAddress(line || null);
        } else {
          setAddress(null);
        }
      } catch {
        setAddress(null);
      }
    } catch (err) {
      console.warn("detectLocation error:", err);
      setCoords(null);
      setAddress(null);
      setLocErrorVisible(true);
    } finally {
      setLocLoading(false);
    }
  };

  // Auto-run on mount so location is captured immediately
  useEffect(() => {
    detectLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* -------------------------------- Submit --------------------------------- */
  const onSubmit = () => {
    if (!canSubmit) return;
    // Open confirmation first (same design family as Reviews)
    setConfirmVisible(true);
  };

  const actuallyPost = async () => {
    setConfirmVisible(false);
    setLoading(true);

    // TODO: Upload photos to Supabase and insert row in `emergency`
    await new Promise((r) => setTimeout(r, 900));

    setLoading(false);
    setSuccessVisible(true);
  };

  /* ------------------------------- Components ------------------------------- */
  const PhotosGrid = () => {
    if (!photos.length) return null;
    return (
      <View className="mt-3">
        <View className="flex-row flex-wrap -mx-1">
          {photos.map((uri, i) => (
            <View key={uri} className="w-1/2 p-1">
              <Pressable
                onPress={() => {
                  setPreviewIndex(i);
                  setPreviewOpen(true);
                }}
                className="relative"
              >
                <Image source={{ uri }} className="h-32 w-full rounded-xl" />
                <Pressable
                  onPress={() => removePhoto(i)}
                  className="absolute right-2 top-2 h-7 w-7 items-center justify-center rounded-full bg-black/60"
                  hitSlop={8}
                >
                  <Ionicons name="trash-outline" size={16} color="#fff" />
                </Pressable>
              </Pressable>
            </View>
          ))}
        </View>
        <Text className="mt-1 text-[11px] text-slate-600">
          {photos.length}/{MAX_PHOTOS} photos
        </Text>
      </View>
    );
  };

  /* --------------------------------- Render -------------------------------- */
  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Page header (back + title) */}
      <View className="relative h-14 flex-row items-center border-b border-slate-100 bg-white">
        <Pressable onPress={() => router.back()} hitSlop={12} className="absolute left-4">
          <Ionicons name="arrow-back" size={24} color="#0F172A" />
        </Pressable>
        <View className="absolute inset-0 items-center justify-center">
          <Text className="text-[16px] font-medium text-slate-900">Post Emergency</Text>
        </View>
      </View>

      {/* MAIN CONTENT — card-style body */}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <ScrollView
          className="flex-1 bg-white"
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Outer card */}
          <View className="mx-4 mt-4 rounded-2xl bg-white" style={cardShadow as any}>
            {/* Header text */}
            <View className="px-5 pt-4">
              <Text className="text-[16px] font-medium text-slate-900">What’s the situation?</Text>
              <Text className="mt-1 text-[12px] text-slate-600">We’ll notify nearby responders once you submit.</Text>
            </View>

            {/* Body sections */}
            <View className="px-5 pb-5 pt-2">
              {/* Vehicle type */}
              <View className="mt-3 rounded-2xl border border-slate-200 bg-white p-4" style={cardShadow as any}>
                <FieldLabel>Vehicle type</FieldLabel>
                <View className="mt-1" />
                <View className="flex-row mb-2">
                  <VehicleChip
                    label="Car"
                    iconName="car-outline"
                    lib="ion"
                    selected={vehicle === "car"}
                    onPress={() => setVehicle("car")}
                  />
                  <VehicleChip
                    label="Motorcycle"
                    iconName="motorbike"
                    lib="mci"
                    selected={vehicle === "motorcycle"}
                    onPress={() => setVehicle("motorcycle")}
                  />
                </View>
                <View className="flex-row">
                  <VehicleChip
                    label="Van"
                    iconName="van-utility"
                    lib="mci"
                    selected={vehicle === "van"}
                    onPress={() => setVehicle("van")}
                  />
                  <VehicleChip
                    label="Truck"
                    iconName="truck-outline"
                    lib="mci"
                    selected={vehicle === "truck"}
                    onPress={() => setVehicle("truck")}
                  />
                </View>
              </View>

              {/* Description */}
              <View className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <FieldLabel>Brief description (probable cause of breakdown)</FieldLabel>
                <View className="rounded-xl border border-slate-300 bg-white">
                  <TextInput
                    value={desc}
                    onChangeText={setDesc}
                    placeholder="e.g., Flat rear tire, losing air fast near Argao bridge…"
                    placeholderTextColor="#6B7280"
                    multiline
                    className="min-h-[90px] p-3 text-[14px] text-slate-900"
                  />
                </View>
                <Text className="mt-1 text-[11px] text-slate-600">Be specific so responders can prepare.</Text>
              </View>

              {/* Current location (read-only, auto) */}
              <View className="mt-3 rounded-2xl border border-slate-200 bg-white p-4" style={cardShadow as any}>
                <FieldLabel>Your location</FieldLabel>

                {locLoading && !coords ? (
                  <View className="mt-1 flex-row items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <ActivityIndicator size="small" />
                    <Text className="text-[12px] text-slate-700">Detecting your location…</Text>
                  </View>
                ) : null}

                {!locLoading && coords ? (
                  <View className="mt-1 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <Text className="text-[12px] text-slate-700">
                      {address ? address + " • " : ""}
                      {coords.lat.toFixed(5)}, {coords.lon.toFixed(5)}
                    </Text>
                    <Text className="mt-1 text-[11px] text-slate-500">Location is captured automatically.</Text>
                  </View>
                ) : null}

                {!locLoading && !coords ? (
                  <View className="mt-1 rounded-xl border border-amber-300 bg-amber-50 p-3">
                    <Text className="text-[12px] text-amber-800">
                      We couldn’t get your location. Tap “Try again”.
                    </Text>
                    <Pressable
                      onPress={() => setLocErrorVisible(true)}
                      className="mt-2 self-start rounded-lg border border-amber-300 px-3 py-1"
                    >
                      <Text className="text-[12px] text-amber-800">Open help</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>

              {/* Photos */}
              <View className="mt-3 rounded-2xl border border-slate-200 p-3">
                <Text className="mb-2 text-[13px] font-medium text-slate-900">
                  Add photos (optional) — {photos.length}/{MAX_PHOTOS}
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

              {/* Submit */}
              <View className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4" style={cardShadow as any}>
                <Text className="text-[15px] font-medium text-slate-900">Ready to post?</Text>
                <Text className="mt-1 text-[12px] text-slate-600">We’ll ping responders near your location.</Text>

                {!coords && (
                  <Text className="mt-2 text-[11px] text-red-600">
                    Location required. Please enable GPS and try again.
                  </Text>
                )}

                <Pressable
                  onPress={onSubmit}
                  disabled={!canSubmit}
                  className={`mt-3 items-center justify-center rounded-xl py-3 ${
                    canSubmit ? "bg-blue-700" : "bg-blue-300"
                  }`}
                  android_ripple={{ color: "rgba(255,255,255,0.15)" }}
                >
                  <Text className="text-[14px] font-medium text-white">Post Emergency</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Fullscreen preview (tap a grid image) */}
      <Modal
        visible={previewOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewOpen(false)}
        statusBarTranslucent
      >
        <Pressable className="flex-1 items-center justify-center bg-black/80 p-4" onPress={() => setPreviewOpen(false)}>
          {photos[previewIndex] ? (
            <Image source={{ uri: photos[previewIndex] }} style={{ width: "100%", height: "80%" }} resizeMode="contain" />
          ) : null}
        </Pressable>
      </Modal>

      {/* Loading overlay — spinner */}
      <LoadingScreen visible={loading} message="Posting your emergency…" variant="spinner" />

      {/* Modals (Reviews-style) */}
      <ConfirmModal
        visible={confirmVisible}
        vehicle={vehicle}
        desc={desc}
        address={address}
        coords={coords}
        photosCount={photos.length}
        onCancel={() => setConfirmVisible(false)}
        onConfirm={actuallyPost}
      />

      <ErrorModal
        visible={locErrorVisible}
        onRetry={() => {
          setLocErrorVisible(false);
          detectLocation();
        }}
        onDismiss={() => setLocErrorVisible(false)}
        title="Can’t pinpoint your location"
        message="Please enable GPS/Location and try again."
      />

      <SuccessModal
        visible={successVisible}
        onClose={() => {
          setSuccessVisible(false);
          router.back();
        }}
        title="Emergency posted"
        subtitle="We’ve alerted nearby responders."
      />
    </SafeAreaView>
  );
}
