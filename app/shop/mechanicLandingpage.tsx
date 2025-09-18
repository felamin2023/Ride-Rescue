// app/(driver)/mechanicLandingpage.tsx
import React, { useMemo, useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  Image as RNImage,
  Image,
  FlatList,
  Linking,
  Modal,
  Platform,
  StatusBar,
  ScrollView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  useWindowDimensions,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import SideDrawer from "../../components/SideDrawer";
import LoadingScreen from "../../components/LoadingScreen";

/* ------------------------------ Design tokens ------------------------------ */
const COLORS = {
  bg: "#F4F6F8",
  surface: "#FFFFFF",
  border: "#E5E7EB",
  text: "#0F172A",
  sub: "#475569",
  muted: "#94A3B8",
  primary: "#2563EB", // Accept / Open Location
  danger: "#DC2626",
  success: "#16A34A",
  brand: "#0F2547",
};

/** Match requeststatus.tsx soft shadow */
const cardShadow = Platform.select({
  ios: {
    shadowColor: "#0F172A",
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  android: { elevation: 2 },
});

/* ---------------------------------- Types ---------------------------------- */
type RequestItem = {
  id: string;
  name: string;
  vehicle: string;
  plate: string;
  service: string;
  time: string;
  landmark?: string;
  lat?: number;
  lng?: number;
  status: "pending" | "accepted" | "completed" | "canceled";
  avatar?: string;
  distanceKm?: number;
  /** legacy single image (kept for compatibility) */
  imageUrl?: string;
  /** NEW: multiple images */
  images?: string[];
  brief?: string; // brief message about breakdown/cause
  phone?: string; // optional if you later want SMS
};

/* --------------------------------- Mock data -------------------------------- */
const INITIAL: RequestItem[] = [
  {
    id: "rq1",
    name: "Stayve Alreach Fedillaga",
    vehicle: "Sedan",
    plate: "ABC 1234",
    service: "Tire replacement",
    time: "2025-05-30 11:58 PM",
    landmark: "Near City Mall parking lot",
    lat: 10.3119,
    lng: 123.918,
    status: "completed",
    avatar: "https://i.pravatar.cc/100?img=12",
    distanceKm: 1.2,
    images: [
      "https://images.unsplash.com/photo-1605719124118-9c541ef3a5d3?w=1200&auto=format&q=60",
      "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1200&auto=format&q=60",
    ],
    brief: "Rear-right tire punctured—small nail stuck, car is on the shoulder.",
    phone: "+639171234567",
  },
  {
    id: "rq2",
    name: "Michael Saragena",
    vehicle: "Pickup Truck",
    plate: "DEF 5678",
    service: "Battery jump start",
    time: "2025-05-29 03:20 PM",
    landmark: "San Miguel St.",
    lat: 9.8818,
    lng: 123.6012,
    status: "accepted",
    avatar: "https://i.pravatar.cc/100?img=31",
    distanceKm: 0.7,
    images: [
      "https://images.unsplash.com/photo-1587314168485-3236d6710814?w=1200&auto=format&q=60",
    ],
    brief: "Left the lights on. Engine won’t crank.",
    phone: "+639221112223",
  },
  {
    id: "rq3",
    name: "Sarah Lopez",
    vehicle: "Motorcycle",
    plate: "GHI 9012",
    service: "Vulcanizing",
    time: "2025-05-28 09:05 AM",
    landmark: "Poblacion South",
    lat: 9.8755,
    lng: 123.5988,
    status: "pending",
    avatar: "https://i.pravatar.cc/100?img=27",
    distanceKm: 2.4,
    // no images on purpose -> will show "No image attached"
    brief: "Rear tire slowly losing air. No spare.",
    phone: "+639561234987",
  },
];

/* ------------------------------- Small UI bits ------------------------------ */
function StatusPill({ status }: { status: RequestItem["status"] }) {
  const map: Record<RequestItem["status"], { bg: string; text: string; label: string }> = {
    pending: { bg: "#FEF3C7", text: "#92400E", label: "Pending" },
    accepted: { bg: "#DBEAFE", text: "#1E40AF", label: "Accepted" },
    completed: { bg: "#DCFCE7", text: "#065F46", label: "Completed" },
    canceled: { bg: "#FEE2E2", text: "#991B1B", label: "Canceled" },
  };
  const s = map[status];
  return (
    <View style={{ backgroundColor: s.bg }} className="rounded-full px-2 py-[2px]">
      <Text style={{ color: s.text }} className="text-[11px] font-semibold">
        {s.label}
      </Text>
    </View>
  );
}

function Meta({ icon, children }: { icon: any; children: React.ReactNode }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <Ionicons name={icon} size={14} color={COLORS.sub} />
      <Text className="text-[12px] text-slate-600">{children}</Text>
    </View>
  );
}

/* ------------------------------ Fullscreen Viewer ------------------------------ */
function ImageViewerModal({
  visible,
  images,
  startIndex = 0,
  onClose,
}: {
  visible: boolean;
  images: string[];
  startIndex?: number;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(startIndex);

  useEffect(() => {
    if (visible) {
      setIndex(startIndex);
      setTimeout(() => {
        scrollRef.current?.scrollTo({ x: startIndex * width, animated: false });
      }, 0);
    }
  }, [visible, startIndex, width]);

  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    setIndex(Math.min(Math.max(i, 0), images.length - 1));
  };

  if (!visible) return null;

  return (
    <Modal visible transparent statusBarTranslucent animationType="fade">
      <View className="flex-1" style={{ backgroundColor: "rgba(0,0,0,0.96)" }}>
        <SafeAreaView>
          <View className="flex-row items-center justify-between px-4 py-2">
            <View
              className="rounded-full px-3 py-1"
              style={{ backgroundColor: "rgba(0,0,0,0.45)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" }}
            >
              <Text className="text-white text-[13px] font-semibold">
                {images.length ? `${index + 1}/${images.length}` : "0/0"}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={26} color="#fff" />
            </Pressable>
          </View>
        </SafeAreaView>

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onEnd}
        >
          {images.map((uri, i) => (
            <Pressable key={i} onPress={onClose} style={{ width, height, alignItems: "center", justifyContent: "center" }}>
              <Image source={{ uri }} resizeMode="contain" style={{ width, height: height * 0.9 }} />
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

/* ----------------------- Centered Confirmation (shared) ---------------------- */
function CenterConfirm({
  visible,
  title,
  message,
  onCancel,
  onConfirm,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmColor = "#2563EB",
}: {
  visible: boolean;
  title: string;
  message?: string;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmColor?: string;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.35)" }}>
        <View className="w-11/12 max-w-md rounded-2xl bg-white p-5" style={cardShadow as any}>
          <View className="items-center mb-2">
            <Ionicons name="alert-circle-outline" size={28} color={confirmColor} />
          </View>
          <Text className="text-lg font-semibold text-slate-900 text-center">{title}</Text>
          {message ? <Text className="mt-2 text-[14px] text-slate-600 text-center">{message}</Text> : null}

          <View className="mt-5 flex-row gap-10">
            <Pressable onPress={onCancel} className="flex-1 rounded-2xl border border-slate-300 py-2.5 items-center">
              <Text className="text-[14px] text-slate-900">{cancelLabel}</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              className="flex-1 rounded-2xl py-2.5 items-center"
              style={{ backgroundColor: confirmColor }}
            >
              <Text className="text-[14px] text-white font-semibold">{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/* ------------------------------ Detail Bottom Sheet ------------------------------ */
function DetailSheet({
  visible,
  item,
  onClose,
  onAccept,
  onMessage,        // ← updated
  onOpenLocation,
  onViewReceipt,
  onOpenViewer,
}: {
  visible: boolean;
  item: RequestItem | null;
  onClose: () => void;
  onAccept: (it: RequestItem) => void;
  onMessage: (it: RequestItem) => void;    // ← updated
  onOpenLocation: (it: RequestItem) => void;
  onViewReceipt: (it: RequestItem) => void;
  onOpenViewer: (images: string[], startIndex: number) => void;
}) {
  const [imgW, setImgW] = useState(0);
  const [imgIndex, setImgIndex] = useState(0);

  if (!item) return null;

  const images = (item.images && item.images.length > 0) ? item.images : item.imageUrl ? [item.imageUrl] : [];

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!imgW) return;
    const i = Math.round(e.nativeEvent.contentOffset.x / imgW);
    setImgIndex(Math.min(Math.max(i, 0), Math.max(images.length - 1, 0)));
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/30" onPress={onClose} />
      <View className="w-full bg-white rounded-t-3xl px-5 pt-3 pb-5" style={cardShadow as any}>
        <View className="items-center mb-3">
          <View className="h-1.5 w-10 bg-slate-200 rounded-full" />
        </View>

        {/* Header row */}
        <View className="flex-row items-center">
          <RNImage source={{ uri: item.avatar }} className="w-12 h-12 rounded-xl" />
          <View className="ml-3 flex-1">
            <Text className="text-[16px] font-semibold text-slate-900" numberOfLines={1}>
              {item.name}
            </Text>
            <View className="mt-1 flex-row items-center gap-2">
              <Meta icon="car-outline">{item.vehicle} • {item.plate}</Meta>
              <StatusPill status={item.status} />
            </View>
          </View>
          <Pressable onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={22} color="#0F172A" />
          </Pressable>
        </View>

        {/* Media */}
        <View className="mt-4">
          {images.length > 0 ? (
            <View onLayout={(e) => setImgW(e.nativeEvent.layout.width)} className="w-full">
              <View className="relative">
                <View
                  style={{ position: "absolute", top: 8, left: 8, zIndex: 10, backgroundColor: "rgba(0,0,0,0.6)" }}
                  className="rounded-full px-2 py-0.5"
                >
                  <Text className="text-white text-[12px] font-semibold">
                    {imgIndex + 1}/{images.length}
                  </Text>
                </View>

                <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onScrollEnd}>
                  {images.map((uri, i) => (
                    <Pressable key={i} onPress={() => onOpenViewer(images, i)} style={{ width: imgW }}>
                      <Image source={{ uri }} resizeMode="cover" className="w-full h-44 rounded-2xl" />
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </View>
          ) : (
            <View className="mt-0 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 items-center">
              <Ionicons name="image-outline" size={18} color="#64748B" />
              <Text className="mt-1 text-[12px] text-slate-600">No image attached</Text>
            </View>
          )}

          {item.brief ? (
            <View className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <Text className="text-[13px] text-slate-700">
                <Text className="font-medium text-slate-900">Driver note: </Text>
                {item.brief}
              </Text>
            </View>
          ) : null}

          <View className="mt-3 gap-2">
            {item.landmark ? <Meta icon="location-outline">{item.landmark}</Meta> : null}
            <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
              <Meta icon="time-outline">{item.time}</Meta>
              {typeof item.distanceKm === "number" && <Meta icon="navigate-outline">{item.distanceKm.toFixed(1)} km away</Meta>}
              {item.lat && item.lng ? <Meta icon="pin-outline">({item.lat.toFixed(5)}, {item.lng.toFixed(5)})</Meta> : null}
            </View>
          </View>
        </View>

        {/* Actions — aligned neatly in two rows */}
        <View className="mt-5 gap-3">
          {/* Row 1: Message (neutral outline + icon) + Open Location (blue solid) */}
          <View className="flex-row gap-3">
            <Pressable
              onPress={() => onMessage(item)}
              className="flex-1 rounded-2xl py-2.5 items-center border border-slate-300"
            >
              <View className="flex-row items-center gap-1.5">
                <Ionicons name="chatbubbles-outline" size={16} color="#0F172A" />
                <Text className="text-[14px] font-semibold text-slate-900">Message</Text>
              </View>
            </Pressable>

            <Pressable
              onPress={() => onOpenLocation(item)}
              className="flex-1 rounded-2xl py-2.5 items-center"
              style={{ backgroundColor: COLORS.primary }}
            >
              <Text className="text-[14px] font-semibold text-white">Open Location</Text>
            </Pressable>
          </View>

          {/* Row 2: Primary + optional View Receipt */}

        </View>
      </View>
    </Modal>
  );
}

/* ---------------------------------- Card ----------------------------------- */
function RequestCard({
  item,
  onPressCard,
  onAccept,
}: {
  item: RequestItem;
  onPressCard: (it: RequestItem) => void;
  onAccept: (it: RequestItem) => void;
}) {
  return (
    <Pressable onPress={() => onPressCard(item)} className="bg-white rounded-2xl p-4 mb-4 border border-slate-200" style={cardShadow as any}>
      <View className="flex-row items-center">
        <RNImage source={{ uri: item.avatar }} className="w-12 h-12 rounded-xl" />
        <View className="ml-3 flex-1">
          <Text className="text-[16px] font-semibold text-slate-900" numberOfLines={1}>{item.name}</Text>
          <View className="mt-1 flex-row items-center gap-2">
            <Meta icon="car-outline">{item.vehicle} • {item.plate}</Meta>
            <StatusPill status={item.status} />
          </View>
        </View>
      </View>

      <View className="h-px bg-slate-200 my-4" />

      <View className="gap-1">
        <Meta icon="construct-outline">{item.service}</Meta>
        {item.landmark ? <Meta icon="location-outline">{item.landmark}</Meta> : null}
        <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
          <Meta icon="time-outline">{item.time}</Meta>
          {typeof item.distanceKm === "number" && <Meta icon="navigate-outline">{item.distanceKm.toFixed(1)} km</Meta>}
        </View>
      </View>

      <View className="h-px bg-slate-200 my-4" />

      {/* Decline removed — Accept is full width for tidy alignment */}
      <Pressable onPress={() => onAccept(item)} className="rounded-2xl py-2.5 items-center" style={{ backgroundColor: COLORS.primary }}>
        <Text className="text-[14px] text-white font-semibold">Accept</Text>
      </Pressable>
    </Pressable>
  );
}

/* --------------------------------- Screen ---------------------------------- */
export default function RequestScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<RequestItem[]>(INITIAL);
  const [selected, setSelected] = useState<RequestItem | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const MECH_ITEMS = useMemo(
    () => [
      { label: "Profile",  href: "/shop/mechanicprofile",  icon: "person-circle-outline" as keyof typeof Ionicons.glyphMap },
      { label: "Messages", href: "/shop/messages",         icon: "chatbubbles-outline"   as keyof typeof Ionicons.glyphMap },
      { label: "Inbox",    href: "/shop/inbox",            icon: "notifications-outline"  as keyof typeof Ionicons.glyphMap },
      { label: "Transaction History", href: "/shop/completedrequest", icon: "receipt-outline" as keyof typeof Ionicons.glyphMap },
    ],
    []
  );

  // Loading overlay
  const [loading, setLoading] = useState<{ visible: boolean; message?: string }>({ visible: false });

  // Accept confirmation
  const [confirmAccept, setConfirmAccept] = useState<RequestItem | null>(null);

  // Fullscreen image viewer
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);

  const openMaps = (it: RequestItem) => {
    if (it.lat && it.lng) {
      const url = `https://www.google.com/maps/search/?api=1&query=${it.lat},${it.lng}`;
      Linking.openURL(url).catch(() => {});
    } else if (it.landmark) {
      const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(it.landmark)}`;
      Linking.openURL(url).catch(() => {});
    }
  };

  // New: message action routes to in-app chat for now
  const messageDriver = (it: RequestItem) => {
    // optional: pass params to pre-open a thread
    try {
      router.push({ pathname: "/shop/messages", params: { to: it.id } as any });
    } catch {
      router.push("/shop/messages");
    }
  };

  const setStatus = (id: string, status: RequestItem["status"]) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));

  const handleAccept = (it: RequestItem) => setConfirmAccept(it);

  const doAccept = async () => {
    if (!confirmAccept) return;
    const id = confirmAccept.id;
    setConfirmAccept(null);
    setLoading({ visible: true, message: "Accepting request…" });
    await new Promise((r) => setTimeout(r, 900));
    setStatus(id, "accepted");
    setLoading({ visible: false });
    if (selected?.id === id) setSheetOpen(false);
  };

  const openViewer = (images: string[], startIndex: number) => {
    setViewerImages(images);
    setViewerIndex(startIndex);
    setViewerOpen(true);
  };

  const viewReceipt = (_it: RequestItem) => {
    // Route can be replaced by a dedicated receipt screen later
    router.push("/shop/completedrequest");
  };

  return (
    <View className="flex-1" style={{ backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.brand} />

      <SideDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        items={MECH_ITEMS}
        logoSource={require("../../assets/images/logo2.png")}
        appName="RIDERESCUE"
        onLogout={() => {
          setDrawerOpen(false);
          // await supabase.auth.signOut();
          router.replace("/(auth)/login");
        }}
      />

      <SafeAreaView edges={["top"]} style={{ backgroundColor: COLORS.brand }}>
        <View className="flex-row items-center justify-between px-6 py-3">
          <View className="flex-row items-center gap-3">
            <Image source={require("../../assets/images/logo2.png")} className="w-12 h-12" resizeMode="contain" />
            <Text className="text-white text-[20px] font-semibold">RideRescue</Text>
          </View>

          <Pressable
            className="p-2 rounded-lg active:opacity-80"
            android_ripple={{ color: "rgba(255,255,255,0.18)", borderless: true }}
            onPress={() => setDrawerOpen(true)}
          >
            <Ionicons name="menu" size={24} color="#fff" />
          </Pressable>
        </View>
      </SafeAreaView>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        renderItem={({ item }) => (
          <RequestCard
            item={item}
            onPressCard={(it) => {
              setSelected(it);
              setSheetOpen(true);
            }}
            onAccept={handleAccept}
          />
        )}
        ListEmptyComponent={
          <View className="px-6 pt-10">
            <Text className="text-center text-slate-500">No requests found.</Text>
          </View>
        }
      />

      <DetailSheet
        visible={sheetOpen}
        item={selected}
        onClose={() => setSheetOpen(false)}
        onAccept={(it) => setConfirmAccept(it)}
        onMessage={messageDriver}          // ← updated
        onOpenLocation={openMaps}
        onViewReceipt={viewReceipt}
        onOpenViewer={openViewer}
      />

      <CenterConfirm
        visible={!!confirmAccept}
        title="Accept this request?"
        message="This will notify the driver and mark the job as Accepted."
        onCancel={() => setConfirmAccept(null)}
        onConfirm={doAccept}
        confirmLabel="Accept Request"
        cancelLabel="Keep Pending"
        confirmColor={COLORS.primary}
      />

      <LoadingScreen visible={loading.visible} message={loading.message} variant="spinner" />

      <ImageViewerModal visible={viewerOpen} images={viewerImages} startIndex={viewerIndex} onClose={() => setViewerOpen(false)} />
    </View>
  );
}
