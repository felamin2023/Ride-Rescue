// app/driver/transactionhistory.tsx
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  RefreshControl,
  Modal,
  ScrollView,
  Image,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { supabase } from "../../utils/supabase";
import SideDrawer from "../../components/SideDrawer";

/* ------------------------------ Design tokens ------------------------------ */
const COLORS = {
  bg: "#F4F6F8",
  surface: "#FFFFFF",
  border: "#E5E7EB",
  text: "#0F172A",
  sub: "#475569",
  primary: "#111827",
  success: "#059669",
  danger: "#DC2626",
};

/* --------------------------------- Types ---------------------------------- */
type PaymentMethod = "Cash" | "GCash";

type ExtraItem = {
  name: string;
  fee: number;
};

type PaymentTx = {
  transaction_id: string;
  emergency_id: string;
  service_id: string;
  shop_id: string;
  driver_user_id: string | null;
  offer_id: string | null;
  rate_per_km: number;
  distance_km: number;
  distance_fee: number;
  labor_cost: number;
  fuel_cost: number;
  parts_cost: number;
  total_amount: number;
  status: "pending" | "to_pay" | "paid" | "canceled";
  cancel_option: string | null;
  cancel_reason: string | null;
  canceled_at: string | null;
  created_at: string;
  updated_at: string | null;
  extra_items: ExtraItem[];
  extra_total: number;
  payment_method: string | null;
  paid_at: string | null;
  sender_user_id: string | null;
  receiver_shop_id: string | null;
  proof_image_url: string | null;
};

type EmergencyRow = {
  emergency_id: string;
  service_type: 'vulcanize' | 'repair' | 'gas' | null;
  fuel_type: string | null;
  custom_fuel_type: string | null;
};

type PlaceByOwnerRow = { owner: string | null; name: string | null; place_id: string | null };
type PlaceRow = { place_id: string; name: string | null };
type ShopRow = { shop_id: string; place_id: string | null };
type UserRow = { user_id: string; full_name: string | null };

type TxItem = {
  id: string; // transaction_id
  title: string; // shop display name
  desc: string;
  method: PaymentMethod;
  amount: number;
  status: "pending" | "completed" | "refunded" | "failed";
  dateISO: string;
  raw: PaymentTx;
  canRate?: boolean;
  serviceType?: 'vulcanize' | 'repair' | 'gas' | null;
  fuelType?: string | null;
  customFuelType?: string | null;
};

/* --------------------------------- Utils ---------------------------------- */
const MONTHS_ABBR = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "Jun.", "Jul.", "Aug.", "Sep.", "Oct.", "Nov.", "Dec."];

function formatPayNowDate(iso: string) {
  const d = new Date(iso);
  const month = MONTHS_ABBR[d.getMonth()];
  const day = d.getDate();
  const year = d.getFullYear();
  return `${month} ${day}, ${year}`;
}

function timeAgo(iso: string) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  const units: [number, string][] = [
    [60, "s"],
    [60, "m"],
    [24, "h"],
    [7, "d"],
    [4.345, "w"],
    [12, "mo"],
    [Number.MAX_SAFE_INTEGER, "y"],
  ];
  let val = s;
  let unit = "s";
  for (const [step, label] of units) {
    if (val < step) { unit = label; break; }
    val = Math.floor(val / step);
    unit = label;
  }
  return `${val}${unit} ago`;
}

const peso = (n: number) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(n || 0);

const mapMethod = (m: string | null | undefined): PaymentMethod => (m === "GCash" ? "GCash" : "Cash");

const methodIcon: Record<PaymentMethod, keyof typeof Ionicons.glyphMap> = {
  Cash: "cash-outline",
  GCash: "wallet-outline",
};

const statusStyle: Record<
  TxItem["status"],
  { text: string; pillBg: string; pillText: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  pending: { text: "Pending", pillBg: "bg-yellow-100", pillText: "text-yellow-900", icon: "time-outline" },
  completed: { text: "Completed", pillBg: "bg-emerald-100", pillText: "text-emerald-900", icon: "checkmark-circle" },
  refunded: { text: "Refunded", pillBg: "bg-slate-200", pillText: "text-slate-900", icon: "refresh" },
  failed: { text: "Failed", pillBg: "bg-rose-100", pillText: "text-rose-900", icon: "close-circle" },
};

// Helper to get display fuel type
const getFuelDisplay = (fuelType: string | null, customFuelType: string | null) => {
  if (customFuelType) return customFuelType;
  if (fuelType) return fuelType.charAt(0).toUpperCase() + fuelType.slice(1);
  return "Fuel";
};

// Helper to format extra items for display
const formatExtraItems = (extraItems: ExtraItem[]): string => {
  if (!extraItems || !Array.isArray(extraItems) || extraItems.length === 0) return "";
  
  return extraItems.map(item => {
    const name = item.name || "Additional service";
    return `${name} ${peso(item.fee || 0)}`;
  }).join(" • ");
};

/* ---------------------- RN-safe upload helpers (Expo) ---------------------- */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  let bufferLength = base64.length * 0.75;
  const len = base64.length;
  if (base64[len - 1] === "=") bufferLength--;
  if (base64[len - 2] === "=") bufferLength--;
  const arraybuffer = new ArrayBuffer(bufferLength);
  const bytes = new Uint8Array(arraybuffer);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const enc1 = chars.indexOf(base64[i]);
    const enc2 = chars.indexOf(base64[i + 1]);
    const enc3 = chars.indexOf(base64[i + 2]);
    const enc4 = chars.indexOf(base64[i + 3]);
    const chr1 = (enc1 << 2) | (enc2 >> 4);
    const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
    const chr3 = ((enc3 & 3) << 6) | enc4;
    bytes[p++] = chr1;
    if (enc3 !== 64) bytes[p++] = chr2;
    if (enc4 !== 64) bytes[p++] = chr3;
  }
  return arraybuffer;
}

function guessExtAndMime(uri: string, fallbackType = "image/jpeg") {
  const ext = uri.split("?")[0].split(".").pop()?.toLowerCase();
  const type =
    ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "heic" || ext === "heif" ? "image/heic" : fallbackType;
  return { ext: ext || "jpg", type };
}

/* -------------------------------- Header UI -------------------------------- */
function Header({
  onBack,
  onOpenDrawer,
}: {
  onBack: () => void;
  onOpenDrawer: () => void;
}) {
  return (
    <SafeAreaView edges={["top"]} className="bg-white border-b border-slate-200">
      <View className="flex-row items-center justify-between px-4 py-3">
        {/* LEFT: Back */}
        <Pressable 
          onPress={onBack} 
          hitSlop={8}
          className="p-2 rounded-lg active:opacity-80"
        >
          <Ionicons name="arrow-back" size={24} color="#0F172A" />
        </Pressable>

        {/* CENTER: Title */}
        <Text className="text-xl font-bold text-[#0F172A]">Transactions</Text>

        {/* RIGHT: Burger */}
        <Pressable
          onPress={onOpenDrawer}
          hitSlop={8}
          className="p-2 rounded-lg active:opacity-80"
        >
          {/* <Ionicons name="menu" size={24} color="#0F172A" /> */}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

/* ----------------------------- RatingBottomSheet ----------------------------- */
const MAX_PHOTOS = 4;

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
  serviceType?: 'vulcanize' | 'repair' | 'gas' | null;
  fuelType?: string | null;
  customFuelType?: string | null;
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

function RatingBottomSheet({
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
  const prevIsPositiveRef = React.useRef<boolean | null>(null);

  // Reset tags when switching between positive/negative
  React.useEffect(() => {
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
  React.useEffect(() => {
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
      Alert.alert("Rating Required", "Please select a star rating to continue.");
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

/* ----------------------------------- App ---------------------------------- */
const PAGE_SIZE = 25;

export default function TransactionHistory() {
  const router = useRouter();

  // Drawer (burger) state
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Data
  const [items, setItems] = useState<TxItem[]>([]);
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  // Details + Proof viewer
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTx, setDetailTx] = useState<TxItem | null>(null);
  const [proofOpen, setProofOpen] = useState(false);

  // Rate Modal
  const [rateOpen, setRateOpen] = useState(false);
  const [rateTx, setRateTx] = useState<TxItem | null>(null);

  // Pay Now
  const [payOpen, setPayOpen] = useState(false);
  const [payTx, setPayTx] = useState<TxItem | null>(null);
  const [payMethod, setPayMethod] = useState<PaymentMethod>("GCash");
  const [proofUri, setProofUri] = useState<string | null>(null);
  const [paySubmitting, setPaySubmitting] = useState(false);

  const loadData = useCallback(async (reset = false) => {
    try {
      if (reset) setPage(1);
      setLoading(true);

      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user?.id) throw new Error("Not signed in");

      const { data: list } = await supabase
        .from("payment_transaction")
        .select("*")
        .eq("driver_user_id", auth.user.id)
        .order("created_at", { ascending: false })
        .range(0, PAGE_SIZE * (reset ? 1 : page) - 1)
        .returns<PaymentTx[]>();

      // Fetch emergency data for service type and fuel type
      const emergencyIds = Array.from(new Set((list ?? []).map(t => t.emergency_id)));
      const emergencyMap = new Map<string, EmergencyRow>();
      
      if (emergencyIds.length > 0) {
        const { data: emergencies } = await supabase
          .from("emergency")
          .select("emergency_id, service_type, fuel_type, custom_fuel_type")
          .in("emergency_id", emergencyIds)
          .returns<EmergencyRow[]>();
        
        emergencies?.forEach(em => {
          emergencyMap.set(em.emergency_id, em);
        });
      }

      // Which are already rated
      const txIds = (list ?? []).map((t) => t.transaction_id);
      const { data: ratedRows } = await supabase
        .from("ratings")
        .select("transaction_id")
        .in("transaction_id", txIds)
        .eq("driver_user_id", auth.user.id);

      const ratedSet = new Set((ratedRows ?? []).map((r: any) => r.transaction_id));

      // Resolve shop/place names (best-effort)
      const receiverIds = Array.from(
        new Set((list ?? []).map((t) => (t.receiver_shop_id || t.shop_id)).filter(Boolean) as string[])
      );
      const placeByOwner = new Map<string, PlaceByOwnerRow>();
      if (receiverIds.length) {
        const { data: placesByOwner } = await supabase
          .from("places")
          .select("owner, name, place_id")
          .in("owner", receiverIds)
          .returns<PlaceByOwnerRow[]>();
        placesByOwner?.forEach((p) => p.owner && placeByOwner.set(p.owner, p));
      }

      const shopIds = Array.from(new Set((list ?? []).map((t) => t.shop_id)));
      const placeDirectById = new Map<string, PlaceRow>();
      const shopById = new Map<string, ShopRow>();
      const userById = new Map<string, UserRow>();

      if (shopIds.length) {
        const { data: placesDirect } = await supabase.from("places").select("place_id, name").returns<PlaceRow[]>();
        placesDirect?.forEach((p) => p.place_id && placeDirectById.set(p.place_id, p));

        const { data: shops } = await supabase
          .from("shop_details")
          .select("shop_id, place_id")
          .in("shop_id", shopIds)
          .returns<ShopRow[]>();
        shops?.forEach((s) => s.shop_id && shopById.set(s.shop_id, s));

        const { data: users } = await supabase
          .from("app_user")
          .select("user_id, full_name")
          .in("user_id", shopIds)
          .returns<UserRow[]>();
        users?.forEach((u) => userById.set(u.user_id, u));
      }

      const mapped: TxItem[] = (list ?? []).map((t) => {
        let title = "Mechanic/Shop";
        const ownerKey = t.receiver_shop_id ?? t.shop_id;
        const ownerPlace = ownerKey ? placeByOwner.get(ownerKey) : undefined;

        if (ownerPlace?.name?.trim()) {
          title = ownerPlace.name.trim();
        } else {
          const directPlace = placeDirectById.get(t.shop_id);
          if (directPlace?.name?.trim()) {
            title = directPlace.name.trim();
          } else {
            const srow = shopById.get(t.shop_id);
            const prow = srow?.place_id ? placeDirectById.get(srow.place_id!) : undefined;
            const urow = userById.get(t.shop_id);
            title = [urow?.full_name, prow?.name].filter(Boolean).join(" · ") || title;
          }
        }

        const isNoFeeCancel = t.cancel_option === "diagnose_only" || Number(t.total_amount) === 0;

        const status: TxItem["status"] = isNoFeeCancel
          ? "completed" // zero-fee cancels are considered completed in history
          : t.status === "paid"
          ? "completed"
          : t.status === "to_pay" || t.status === "pending"
          ? "pending"
          : t.status === "canceled"
          ? "refunded"
          : "failed";

        const canRate = status === "completed" && !ratedSet.has(t.transaction_id);

        // Get emergency data for this transaction
        const emergency = emergencyMap.get(t.emergency_id);
        const isGasService = emergency?.service_type === 'gas';
        const serviceType = emergency?.service_type;
        const fuelType = emergency?.fuel_type;
        const customFuelType = emergency?.custom_fuel_type;

        // Build description - for gas services, don't include extra items in the card description
        const parts = [
          t.distance_fee > 0 ? `Distance ${peso(t.distance_fee)}` : null,
          // Show either Labor or Fuel based on service type
          isGasService && t.fuel_cost > 0 ? `Fuel ${peso(t.fuel_cost)}` : null,
          !isGasService && t.labor_cost > 0 ? `Labor ${peso(t.labor_cost)}` : null,
          t.parts_cost > 0 ? `Parts ${peso(t.parts_cost)}` : null,
        ].filter(Boolean) as string[];

        // Only include extra items in description for non-gas services
        const extraItemsDesc = !isGasService ? formatExtraItems(t.extra_items) : "";
        const desc = [...parts, extraItemsDesc].filter(Boolean).join(" • ") || 
                    (status === "pending" ? "Awaiting payment" : "—");

        return {
          id: t.transaction_id,
          title,
          desc,
          method: mapMethod(t.payment_method),
          amount: t.total_amount,
          status,
          dateISO: t.created_at,
          raw: t,
          canRate,
          serviceType,
          fuelType,
          customFuelType,
        };
      });

      setItems(mapped);
    } catch (e: any) {
      console.warn("loadData error:", e?.message);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    loadData(true);
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData(true);
    setRefreshing(false);
  }, [loadData]);

  const onEndReached = useCallback(async () => {
    if (items.length >= PAGE_SIZE * page) setPage((p) => p + 1);
  }, [items.length, page]);

  const openDetail = (tx: TxItem) => {
    setDetailTx(tx);
    setDetailOpen(true);
  };

  // Handle rating submission
  const handleRatingSubmit = async (data: {
    rating: number;
    message: string;
    selectedTags: string[];
    photos: string[];
  }) => {
    if (!rateTx) return;

    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not authenticated");

      // Upload photos if any
      let photoUrls: string[] = [];
      if (data.photos.length > 0) {
        for (const photoUri of data.photos) {
          const photoUrl = await uploadRatingPhoto(photoUri, auth.user.id, rateTx.id);
          photoUrls.push(photoUrl);
        }
      }

      // Insert rating with tags
      const { error } = await supabase.from("ratings").insert({
        transaction_id: rateTx.id,
        emergency_id: rateTx.raw.emergency_id,
        shop_id: rateTx.raw.shop_id,
        driver_user_id: auth.user.id,
        stars: data.rating,
        comment: data.message,
        photo_url: photoUrls.length > 0 ? photoUrls[0] : null, // Store first photo in existing column
        photo_urls: photoUrls, // Store all photos in new array column
        tags: data.selectedTags, // Store selected tags in new array column
      });

      if (error) throw error;

      // Update local state
      setItems((prev) => prev.map((it) => (it.id === rateTx.id ? { ...it, canRate: false } : it)));
      setDetailTx((d) => (d && d.id === rateTx.id ? { ...d, canRate: false } : d));
      setRateOpen(false);
      
      Alert.alert("Success", "Thank you for your feedback!");
    } catch (error) {
      console.error("Error submitting rating:", error);
      Alert.alert("Error", "Failed to submit rating. Please try again.");
    }
  };

  // Helper function to upload rating photos
  const uploadRatingPhoto = async (uri: string, userId: string, transactionId: string): Promise<string> => {
    const now = new Date().toISOString();
    const key = `ratings/${userId}/${transactionId}/${now}.jpg`;

    const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const arrayBuffer = base64ToArrayBuffer(b64.replace(/\r?\n/g, ""));
    const bucket = supabase.storage.from("rating_photos");

    try {
      const { error } = await bucket.upload(key, arrayBuffer, { contentType: "image/jpeg", upsert: true });
      if (error) throw error;
    } catch {
      const { data: sign, error: signErr } = await bucket.createSignedUploadUrl(key);
      if (signErr) throw signErr;
      const { error: up2Err } = await bucket.uploadToSignedUrl(key, sign.token, arrayBuffer, {
        contentType: "image/jpeg",
        upsert: true,
      });
      if (up2Err) throw up2Err;
    }

    const { data: pub } = bucket.getPublicUrl(key);
    return pub.publicUrl;
  };

  // Map TxItem to CompletedJob for rating
  const mapTxToCompletedJob = (tx: TxItem): CompletedJob => ({
    id: tx.id,
    type: "shop",
    name: tx.title,
    location: "",
    service: tx.desc,
    amountPaid: tx.amount,
    paymentMethod: tx.method,
    requestedAt: tx.dateISO,
    completedAt: tx.raw.paid_at || tx.raw.updated_at || tx.dateISO,
    canRate: tx.canRate,
    serviceType: tx.serviceType,
    fuelType: tx.fuelType,
    customFuelType: tx.customFuelType,
  });

  const Item = ({ tx }: { tx: TxItem }) => {
    const s = statusStyle[tx.status];
    const isNoFeeCancel = tx.raw.cancel_option === "diagnose_only" || Number(tx.raw.total_amount) === 0;
    const showPayNow = tx.status === "pending" && !tx.raw.proof_image_url && !isNoFeeCancel;
    const isGasService = tx.serviceType === 'gas';

    return (
      <Pressable
        onPress={() => openDetail(tx)}
        className={`mx-4 mb-3 rounded-2xl border p-4 bg-white border-slate-200`}
        style={{
          shadowColor: "#000",
          shadowOpacity: 0.06,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
          elevation: 2,
        }}
      >
        <View className="flex-row items-start">
          <View 
            className="mr-3 rounded-full p-2" 
            style={{ 
              backgroundColor: "rgba(37, 99, 235, 0.1)"
            }}
          >
            <Ionicons 
              name={methodIcon[tx.method]} 
              size={20} 
              color="#2563EB" 
            />
          </View>
          <View className="flex-1">
            <Text className="text-[14px] font-semibold text-slate-900" numberOfLines={1}>
              {tx.title}
            </Text>
            <Text className="mt-1 text-[13px] text-slate-600">{tx.desc}</Text>
            {isGasService && (tx.fuelType || tx.customFuelType) && (
              <Text className="mt-1 text-[12px] text-slate-500">
                Fuel: {getFuelDisplay(tx.fuelType ?? null, tx.customFuelType ?? null)}
              </Text>
            )}
            <View className="mt-2 flex-row items-center justify-between">
              <Text className="text-[11px] text-slate-500">{timeAgo(tx.dateISO)}</Text>
              <View className={`flex-row items-center rounded-full px-2.5 py-1 ${s.pillBg}`}>
                <Ionicons name={statusStyle[tx.status].icon} size={12} color="currentColor" />
                <Text className={`ml-1 text-[10px] ${s.pillText}`}>{s.text}</Text>
              </View>
            </View>

            {showPayNow && (
              <Pressable
                onPress={() => {
                  setPayTx(tx);
                  setPayOpen(true);
                  setPayMethod("GCash");
                  setProofUri(null);
                }}
                className="mt-3 w-full rounded-xl bg-blue-600 py-3 active:opacity-90"
              >
                <Text className="text-center text-[14px] font-semibold text-white">PAY NOW</Text>
              </Pressable>
            )}

            {/* Rate CTA on paid & not yet rated */}
            {tx.status === "completed" && tx.canRate && (
              <Pressable
                onPress={() => {
                  setRateTx(tx);
                  setRateOpen(true);
                }}
                className="mt-2 w-full rounded-xl bg-blue-600 py-3 active:opacity-90"
              >
                <Text className="text-center text-[14px] font-semibold text-white">Rate this service</Text>
              </Pressable>
            )}
          </View>
        </View>
      </Pressable>
    );
  };

  const Empty = () => (
    <View className="items-center pt-16">
      <View className="h-14 w-14 items-center justify-center rounded-full bg-slate-100">
        <Ionicons name="document-text-outline" size={22} color="#64748B" />
      </View>
      <Text className="mt-3 text-[15px] font-semibold text-slate-800">No transactions</Text>
      <Text className="mt-1 text-[13px] text-slate-500">Your completed and pending payments will appear here.</Text>
    </View>
  );

  return (
    <View className="flex-1 bg-[#F4F6F8]">
      <Header onBack={() => router.back()} onOpenDrawer={() => setDrawerOpen(true)} />

      {/* List */}
      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        renderItem={({ item }) => <Item tx={item} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.2}
        contentContainerStyle={{ paddingVertical: 8 }}
        ListEmptyComponent={loading ? undefined : Empty}
      />

      {/* Details sheet */}
      <Modal visible={detailOpen} transparent animationType="slide" onRequestClose={() => setDetailOpen(false)}>
        <View className="flex-1 justify-end bg-black/50">
          <View className="max-h-[88%] rounded-t-2xl bg-white">
            {/* Header */}
            <View className="flex-row items-center justify-between border-b border-slate-200 p-4">
              <Pressable onPress={() => setDetailOpen(false)} className="rounded-full p-1">
                <Ionicons name="chevron-down" size={22} color="#111827" />
              </Pressable>
              <Text className="text-[16px] font-bold text-slate-900">Transaction details</Text>
              <View style={{ width: 26 }} />
            </View>

            {detailTx && (
              <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }}>
                {/* Header row */}
                <View className="rounded-2xl border border-slate-200 bg-white p-4" style={{
                  shadowColor: "#000",
                  shadowOpacity: 0.06,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 2 },
                  elevation: 2,
                } as any}>
                  <View className="flex-row items-center">
                    <View className="mr-3 rounded-full bg-blue-50 p-2">
                      <Ionicons name={methodIcon[detailTx.method]} size={20} color={COLORS.primary} />
                    </View>
                    <View className="flex-1">
                      <Text className="text-[16px] font-extrabold text-slate-900" numberOfLines={1}>
                        {detailTx.title}
                      </Text>
                      <Text className="mt-0.5 text-[12px] text-slate-500" numberOfLines={1}>
                        Emergency • {detailTx.raw.emergency_id.slice(0, 8)}… • {formatPayNowDate(detailTx.raw.created_at)}
                      </Text>
                      {detailTx.serviceType === 'gas' && (detailTx.fuelType || detailTx.customFuelType) && (
                        <Text className="mt-0.5 text-[12px] text-slate-500">
                          Fuel Type: {getFuelDisplay(detailTx.fuelType ?? null, detailTx.customFuelType ?? null)}
                        </Text>
                      )}
                    </View>
                    <Text className="ml-3 text-[14px] font-bold text-slate-900">{peso(detailTx.amount)}</Text>
                  </View>

                  {/* Divider */}
                  <View className="h-px bg-slate-200 my-4" />

                  {/* Breakdown */}
                  <View>
                    {detailTx.raw.distance_fee > 0 && <Row label="Distance fee" value={peso(detailTx.raw.distance_fee)} />}
                    {/* Show either Labor or Fuel based on service type */}
                    {detailTx.serviceType === 'gas' && detailTx.raw.fuel_cost > 0 && (
                      <Row 
                        label={`Fuel ${detailTx.fuelType || detailTx.customFuelType ? `(${getFuelDisplay(detailTx.fuelType ?? null, detailTx.customFuelType ?? null)})` : ''}`} 
                        value={peso(detailTx.raw.fuel_cost)} 
                      />
                    )}
                    {detailTx.serviceType !== 'gas' && detailTx.raw.labor_cost > 0 && (
                      <Row label="Labor" value={peso(detailTx.raw.labor_cost)} />
                    )}
                    {detailTx.raw.parts_cost > 0 && <Row label="Parts" value={peso(detailTx.raw.parts_cost)} />}
                    
                    {/* Extra Items Breakdown - Show for all service types in details view */}
                    {Array.isArray(detailTx.raw.extra_items) && detailTx.raw.extra_items.length > 0 && (
                      <>
                        {detailTx.raw.extra_items.map((item, index) => (
                          <Row 
                            key={index} 
                            label={item.name || "Additional service"} 
                            value={peso(item.fee || 0)} 
                          />
                        ))}
                        <Row label="Additional services total" value={peso(detailTx.raw.extra_total)} bold />
                      </>
                    )}
                  </View>

                  {/* Status pill + Rate */}
                  <View className="mt-4 flex-row items-center justify-between">
                    <View className={`flex-row items-center rounded-full px-2.5 py-1 ${statusStyle[detailTx.status].pillBg}`}>
                      <Ionicons name={statusStyle[detailTx.status].icon} size={14} color="currentColor" />
                      <Text className={`ml-1 text-[12px] ${statusStyle[detailTx.status].pillText}`}>
                        {statusStyle[detailTx.status].text}
                      </Text>
                    </View>

                    {detailTx.status === "completed" && detailTx.canRate && (
                      <Pressable
                        onPress={() => {
                          setRateTx(detailTx);
                          setRateOpen(true);
                        }}
                        className="rounded-xl bg-blue-600 px-3 py-2 active:opacity-90"
                      >
                        <Text className="text-[12px] font-semibold text-white">Rate this service</Text>
                      </Pressable>
                    )}
                  </View>
                </View>

                {/* Proof section */}
                <View className="mt-3 rounded-2xl border border-slate-200 bg-white p-4" style={{
                  shadowColor: "#000",
                  shadowOpacity: 0.06,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 2 },
                  elevation: 2,
                } as any}>
                  <View className="mb-2 flex-row items-center justify-between">
                    <Text className="text-[14px] font-semibold text-slate-900">Receipt / Proof of payment</Text>
                    <Pressable onPress={() => setProofOpen(true)}>
                      <Text className="text-[12px] font-semibold text-blue-600">Open</Text>
                    </Pressable>
                  </View>
                  {detailTx?.raw.proof_image_url ? (
                    <Image
                      source={{ uri: detailTx.raw.proof_image_url }}
                      resizeMode="cover"
                      style={{ width: "100%", height: 160, borderRadius: 12, backgroundColor: "#F1F5F9" }}
                    />
                  ) : (
                    <View className="items-center justify-center rounded-xl border border-dashed border-slate-300 p-6">
                      <Ionicons name="image-outline" size={24} color="#94A3B8" />
                      <Text className="mt-2 text-center text-[12px] text-slate-500">No proof uploaded.</Text>
                    </View>
                  )}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Proof full-screen viewer */}
      <Modal visible={proofOpen} transparent animationType="fade" onRequestClose={() => setProofOpen(false)}>
        <View className="flex-1 items-center justify-center bg-black/90">
          <Pressable onPress={() => setProofOpen(false)} className="absolute right-4 top-14 z-10 rounded-full p-2">
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </Pressable>
          <ScrollView maximumZoomScale={1} contentContainerStyle={{ alignItems: "center", padding: 12 }}>
            {detailTx?.raw.proof_image_url ? (
              <Image
                source={{ uri: detailTx.raw.proof_image_url }}
                resizeMode="contain"
                style={{ width: "100%", height: 520, borderRadius: 12, backgroundColor: "#0b0b0b" }}
              />
            ) : (
              <Text className="text-white">No proof uploaded.</Text>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* New RatingBottomSheet */}
      <RatingBottomSheet
        visible={rateOpen}
        onClose={() => setRateOpen(false)}
        onSubmit={handleRatingSubmit}
        item={rateTx ? mapTxToCompletedJob(rateTx) : null}
      />

      {/* Pay Now Modal */}
      <PayNowModal
        visible={payOpen}
        onClose={() => setPayOpen(false)}
        tx={payTx}
        method={payMethod}
        setMethod={setPayMethod}
        proofUri={proofUri}
        setProofUri={setProofUri}
        submitting={paySubmitting}
        onSubmit={async () => {
          try {
            if (!payTx) return;
            if (!proofUri) {
              Alert.alert("Receipt required", "Please upload or take a photo of your payment receipt.");
              return;
            }

            setPaySubmitting(true);

            // Upload proof (Expo-safe)
            const { data: auth } = await supabase.auth.getUser();
            const me = auth?.user?.id!;
            const now = new Date().toISOString();
            const key = `${me}/${payTx.raw.transaction_id}/proof.jpg`;

            const b64 = await FileSystem.readAsStringAsync(proofUri, { encoding: FileSystem.EncodingType.Base64 });
            const arrayBuffer = base64ToArrayBuffer(b64.replace(/\r?\n/g, ""));
            const bucket = supabase.storage.from("payment_proofs");

            try {
              const { error } = await bucket.upload(key, arrayBuffer, { contentType: "image/jpeg", upsert: true });
              if (error) throw error;
            } catch {
              const { data: sign, error: signErr } = await bucket.createSignedUploadUrl(key);
              if (signErr) throw signErr;
              const { error: up2Err } = await bucket.uploadToSignedUrl(key, sign.token, arrayBuffer, {
                contentType: "image/jpeg",
                upsert: true,
              });
              if (up2Err) throw up2Err;
            }

            const { data: pub } = bucket.getPublicUrl(key);
            const proofUrl = pub.publicUrl;

            // Update tx → to_pay + proof
            const { error } = await supabase
              .from("payment_transaction")
              .update({ proof_image_url: proofUrl, payment_method: payMethod, status: "to_pay", updated_at: now })
              .eq("transaction_id", payTx.id);
            if (error) throw error;

            // Notify shop owner (type 'system' to satisfy check constraint)
            const { data: shopRow } = await supabase
              .from("shop_details")
              .select("user_id")
              .eq("shop_id", payTx.raw.shop_id)
              .maybeSingle();
            if (shopRow?.user_id) {
              await supabase.from("notifications").insert({
                from_user_id: me,
                to_user_id: shopRow.user_id,
                type: "system",
                title: "Payment proof uploaded",
                body: "The driver sent a receipt for verification.",
                data: { transaction_id: payTx.id, emergency_id: payTx.raw.emergency_id, event: "payment_proof_uploaded" },
              });
            }

            // Reflect immediately in list/details
            setItems((prev) =>
              prev.map((x) =>
                x.id === payTx.id
                  ? { ...x, raw: { ...x.raw, proof_image_url: proofUrl, updated_at: now, status: "to_pay" } as any, status: "pending" }
                  : x
              )
            );
            if (detailTx?.id === payTx.id) {
              setDetailTx((d) =>
                d ? { ...d, raw: { ...d.raw, proof_image_url: proofUrl, updated_at: now, status: "to_pay" } as any, status: "pending" } : d
              );
            }

            setPayOpen(false);
          } catch (e) {
            console.error(e);
            Alert.alert("Error", "Could not submit payment.");
          } finally {
            setPaySubmitting(false);
          }
        }}
      />

      {/* Side Drawer — same props as driverLandingpage.tsx */}
      <SideDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        logoSource={require("../../assets/images/logo2.png")}
        appName="RIDERESCUE"
        onLogout={() => console.log("logout")}
      />
    </View>
  );
}

/* ----------------------------- Small components ---------------------------- */
function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View className="flex-row items-baseline py-1.5">
      <Text className="w-44 pr-2 text-[13px] leading-5 text-slate-600">{label}:</Text>
      <Text className={`flex-1 text-[13px] leading-5 ${bold ? "font-semibold" : ""} text-slate-800`}>{value}</Text>
    </View>
  );
}

/* ----------------------------- Pay Now Modal ----------------------------- */
function PayNowModal({
  visible,
  onClose,
  tx,
  method,
  setMethod,
  proofUri,
  setProofUri,
  submitting,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  tx: TxItem | null;
  method: PaymentMethod;
  setMethod: (m: PaymentMethod) => void;
  proofUri: string | null;
  setProofUri: (u: string | null) => void;
  submitting: boolean;
  onSubmit: () => void;
}) {
  if (!visible || !tx) return null as any;

  // Belt & suspenders: block modal entirely for zero-fee cancels
  const isNoFeeCancel = tx.raw.cancel_option === "diagnose_only" || Number(tx.raw.total_amount) === 0;
  if (isNoFeeCancel) return null as any;

  const isGasService = tx.serviceType === 'gas';

  const pickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });
    if (!res.canceled && res.assets?.length) setProofUri(res.assets[0].uri);
  };
  const takePhoto = async () => {
    const res = await ImagePicker.launchCameraAsync({ quality: 0.9 });
    if (!res.canceled && res.assets?.length) setProofUri(res.assets[0].uri);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-end bg-black/50">
        <View className="w-full rounded-t-2xl bg-white p-4">
          {/* Header */}
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-[16px] font-semibold text-slate-900">Pay now</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color="#111827" />
            </Pressable>
          </View>

          {tx && (
            <View className="mb-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <Text className="text-[12px] text-slate-600">{tx.title}</Text>
              {isGasService && (tx.fuelType || tx.customFuelType) && (
                <Text className="text-[11px] text-slate-500 mt-0.5">
                  Fuel Type: {getFuelDisplay(tx.fuelType ?? null, tx.customFuelType ?? null)}
                </Text>
              )}

              {/* FULL BREAKDOWN */}
              <View className="mt-2 rounded-xl border border-slate-200 bg-white p-3">
                {tx.raw.distance_fee > 0 && <Row label="Distance fee" value={peso(tx.raw.distance_fee)} />}
                {/* Show either Labor or Fuel based on service type */}
                {isGasService && tx.raw.fuel_cost > 0 && (
                  <Row 
                    label={`Fuel ${tx.fuelType || tx.customFuelType ? `(${getFuelDisplay(tx.fuelType ?? null, tx.customFuelType ?? null)})` : ''}`} 
                    value={peso(tx.raw.fuel_cost)} 
                  />
                )}
                {!isGasService && tx.raw.labor_cost > 0 && (
                  <Row label="Labor" value={peso(tx.raw.labor_cost)} />
                )}
                {tx.raw.parts_cost > 0 && <Row label="Parts" value={peso(tx.raw.parts_cost)} />}
                
                {/* Extra Items Breakdown - Show for all service types in pay modal */}
                {Array.isArray(tx.raw.extra_items) && tx.raw.extra_items.length > 0 && (
                  <>
                    {tx.raw.extra_items.map((item, index) => (
                      <Row 
                        key={index} 
                        label={item.name || "Additional service"} 
                        value={peso(item.fee || 0)} 
                      />
                    ))}
                    <Row label="Additional services total" value={peso(tx.raw.extra_total)} bold />
                  </>
                )}
                
                <View className="mt-2 h-px bg-slate-200" />
                <Row label="Total" value={peso(tx.raw.total_amount)} bold />
              </View>

              {/* Method */}
              <View className="mt-3">
                <Text className="mb-1 text-[12px] font-medium text-slate-700">Payment method</Text>
                <View className="flex-row gap-2">
                  {(["GCash", "Cash"] as PaymentMethod[]).map((m) => (
                    <Pressable
                      key={m}
                      onPress={() => setMethod(m)}
                      className={`rounded-xl border px-3 py-2 ${method === m ? "border-blue-600 bg-blue-50" : "border-slate-300"}`}
                    >
                      <Text className={`text-[12px] font-semibold ${method === m ? "text-blue-700" : "text-slate-800"}`}>{m}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Proof upload */}
              <View className="mt-3">
                <Text className="mb-1 text-[12px] font-medium text-slate-700">Receipt / Proof</Text>
                {proofUri ? (
                  <View className="flex-row items-center gap-3 rounded-xl border border-slate-300 p-3">
                    <Image source={{ uri: proofUri }} style={{ width: 56, height: 56, borderRadius: 8 }} />
                    <Pressable onPress={() => setProofUri(null)} className="rounded-xl border border-slate-300 px-3 py-2 active:opacity-90">
                      <Text className="text-[12px] text-slate-800">Remove</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View className="items-center">
                    <Ionicons name="image-outline" size={28} color="#94A3B8" />
                    <Text className="mt-2 text-center text-[12px] text-slate-500">
                      Upload a clear photo of your receipt or payment confirmation.
                    </Text>
                    <View className="mt-3 flex-row gap-2">
                      <Pressable onPress={pickImage} className="rounded-xl bg-blue-600 px-3 py-2 active:opacity-90">
                        <Text className="text-[12px] font-semibold text-white">Upload</Text>
                      </Pressable>
                      <Pressable onPress={takePhoto} className="rounded-xl border border-slate-300 px-3 py-2 active:opacity-90">
                        <Text className="text-[12px] font-semibold text-slate-900">Take Photo</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Submit */}
          <Pressable
            disabled={!proofUri || submitting}
            onPress={onSubmit}
            className="mt-4 items-center justify-center rounded-xl py-3"
            style={{ backgroundColor: !proofUri || submitting ? "#9CA3AF" : "#2563EB", opacity: !proofUri || submitting ? 0.7 : 1 }}
          >
            <Text className="text-[14px] font-semibold text-white">{submitting ? "Submitting…" : "Confirm payment"}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}