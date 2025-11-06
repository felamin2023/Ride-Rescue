// app/shop/mechanicLandingpage.native.tsx
import React, {
  useMemo,
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react";
import {
  View,
  Text,
  Pressable,
  Image as RNImage,
  Image,
  FlatList,
  Modal,
  Platform,
  StatusBar,
  ScrollView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  useWindowDimensions,
  Alert,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import SideDrawer from "../../components/SideDrawer";
import LoadingScreen from "../../components/LoadingScreen";
import { useUnreadMessageCount } from "../../hooks/useUnreadMessageCount"; 
import { useUnreadNotificationCount } from "../../hooks/useUnreadNotificationCount"; 
import { supabase } from "../../utils/supabase";

// ✅ use the cross-platform wrapper instead of react-native-maps
import MapView, {
  Marker,
  Polyline,
  type MapViewHandle,
} from "../../components/CrossPlatformMap";

// Import the OfferModal
import OfferModal, { EmergencyDetails, OfferData } from "../../components/OfferModal";

/* ------------------------------ Configurable rules ------------------------------ */
/** Show to 0–0.8 km for the first RULE_MINUTES; after that show to all. */
const KM_GATE = 0.8; // km (800 m)
const RULE_MINUTES = 2; // minutes (set 10 in production)

/* ------------------------------ Design tokens ------------------------------ */
const COLORS = {
  bg: "#F4F6F8",
  surface: "#FFFFFF",
  border: "#E5E7EB",
  text: "#0F172A",
  sub: "#475569",
  muted: "#94A3B8",
  primary: "#2563EB",
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
  id: string; // emergency_id
  name: string;
  vehicle: string;
  service: string;
  time: string;
  landmark?: string;
  lat?: number;
  lng?: number;
  status: "pending" | "accepted" | "completed" | "canceled";
  avatar?: string;
  distanceKm?: number;
  imageUrl?: string;
  images?: string[];
  brief?: string;
  phone?: string;
};

type EmergencyRow = {
  emergency_id: string;
  user_id: string;
  vehicle_type: string;
  breakdown_cause: string | null;
  attachments: string[] | null;
  emergency_status: "waiting" | "in_process" | "completed" | "canceled";
  latitude: number;
  longitude: number;
  created_at: string;
  accepted_at: string | null;
  completed_at: string | null;
  canceled_at: string | null;
};

type AppUserRow = { full_name: string | null; photo_url: string | null };

type MyReqStatus = "pending" | "canceled" | "rejected" | "accepted";

/* ----------------------------- Helpers ----------------------------- */
const AVATAR_PLACEHOLDER =
  "https://images.unsplash.com/photo-1527980965255-d3b416303d12?q=80&w=256&auto=format&fit=crop";

const statusMapToCard: Record<
  EmergencyRow["emergency_status"],
  RequestItem["status"]
> = {
  waiting: "pending",
  in_process: "accepted",
  completed: "completed",
  canceled: "canceled",
};

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} • ${time}`;
}

// Reverse geocode for nicer landmark text
async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const res = await Location.reverseGeocodeAsync({
      latitude: lat,
      longitude: lon,
    });
    if (res.length > 0) {
      const p = res[0];
      const parts = [
        p.name,
        p.street,
        p.subregion || p.city,
        p.region,
        p.country,
      ].filter(Boolean);
      return parts.join(", ");
    }
  } catch {}
  return `(${lat.toFixed(5)}, ${lon.toFixed(5)})`;
}

function mapEmergencyToItem(
  r: EmergencyRow,
  profile?: AppUserRow | null
): RequestItem {
  const lat = Number((r.latitude as any)?.toFixed?.(5) ?? r.latitude);
  const lng = Number((r.longitude as any)?.toFixed?.(5) ?? r.longitude);

  return {
    id: r.emergency_id,
    name: profile?.full_name || "Customer",
    avatar: profile?.photo_url || AVATAR_PLACEHOLDER,
    vehicle: r.vehicle_type || "—",
    service: r.breakdown_cause || "—",
    brief: r.breakdown_cause || undefined,
    time: fmtDateTime(r.created_at),
    lat,
    lng,
    status: statusMapToCard[r.emergency_status],
    images: (r.attachments || []).filter(Boolean),
  };
}










// distance helper (km)
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Gate logic: only show if (age > RULE_MINUTES) OR (distance <= KM_GATE)
function isVisibleByGate(
  row: EmergencyRow,
  my: { lat: number; lng: number } | null
) {
  const ageMin = (Date.now() - new Date(row.created_at).getTime()) / 60000;
  if (ageMin > RULE_MINUTES) return true;
  if (!my) return false;
  const dist = haversineKm(my.lat, my.lng, row.latitude, row.longitude);
  return dist <= KM_GATE;
}

/* ----------------------------- DEBUG PRINTER ----------------------------- */
const DEBUG_PRINTS = true;
function printDebug(
  tag: string,
  postLat?: number,
  postLng?: number,
  my?: { lat: number; lng: number } | null,
  distanceMeters?: number,
  createdAt?: string
) {
  if (!DEBUG_PRINTS) return;
  const pLat = typeof postLat === "number" ? postLat.toFixed(6) : "n/a";
  const pLng = typeof postLng === "number" ? postLng.toFixed(6) : "n/a";
  const me = my ? `${my.lat.toFixed(6)}, ${my.lng.toFixed(6)}` : "unknown";
  const dist =
    typeof distanceMeters === "number" ? Math.round(distanceMeters) : "n/a";
  const created = createdAt ?? "n/a";
  console.log(
    `[RIDERESCUE] ${tag} | post=(${pLat}, ${pLng}) | me=(${me}) | distance_m=${dist} | created_at=${created}`
  );
}

/* ------------------------------- Small UI bits ------------------------------ */
function StatusPill({ status }: { status: RequestItem["status"] }) {
  const map: Record<
    RequestItem["status"],
    { bg: string; text: string; label: string }
  > = {
    pending: { bg: "#FEF3C7", text: "#92400E", label: "Pending" },
    accepted: { bg: "#DBEAFE", text: "#1E40AF", label: "Accepted" },
    completed: { bg: "#DCFCE7", text: "#065F46", label: "Completed" },
    canceled: { bg: "#FEE2E2", text: "#991B1B", label: "Canceled" },
  };
  const s = map[status];
  return (
    <View
      style={{ backgroundColor: s.bg }}
      className="rounded-full px-2 py-[2px]"
    >
      <Text className="text-[11px] font-semibold" style={{ color: s.text }}>
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

/* ----------------------- Top Toast (3 seconds) ----------------------- */
function TopToast({ show, message }: { show: boolean; message: string }) {
  if (!show) return null;
  return (
    <View
      style={{
        position: "absolute",
        left: 12,
        right: 12,
        top: 12,
        zIndex: 1000,
      }}
    >
      <View
        className="rounded-2xl px-4 py-3"
        style={{ backgroundColor: "rgba(15,37,71,0.95)" }}
      >
        <Text className="text-white text-[13px] font-semibold">{message}</Text>
      </View>
    </View>
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
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: "rgba(0,0,0,0.35)" }}
      >
        <View
          className="w-11/12 max-w-md rounded-2xl bg-white p-5"
          style={cardShadow as any}
        >
          <View className="items-center mb-2">
            <Ionicons
              name="alert-circle-outline"
              size={28}
              color={confirmColor}
            />
          </View>
          <Text className="text-lg font-semibold text-slate-900 text-center">
            {title}
          </Text>
          {message ? (
            <Text className="mt-2 text-[14px] text-slate-600 text-center">
              {message}
            </Text>
          ) : null}

          <View className="mt-5 flex-row gap-10">
            <Pressable
              onPress={onCancel}
              className="flex-1 rounded-2xl border border-slate-300 py-2.5 items-center"
            >
              <Text className="text-[14px] text-slate-900">{cancelLabel}</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              className="flex-1 rounded-2xl py-2.5 items-center"
              style={{ backgroundColor: confirmColor }}
            >
              <Text className="text-[14px] text-white font-semibold">
                {confirmLabel}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
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
              style={{
                backgroundColor: "rgba(0,0,0,0.45)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.2)",
              }}
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
            <Pressable
              key={i}
              onPress={onClose}
              style={{
                width,
                height,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Image
                source={{ uri }}
                resizeMode="contain"
                style={{ width, height: height * 0.9 }}
              />
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

/* ---------------------------------- Card ----------------------------------- */
function RequestCard({
  item,
  myStatus,
  onPressCard,
  onAcceptOrCancel,
}: {
  item: RequestItem;
  myStatus?: MyReqStatus;
  onPressCard: (it: RequestItem) => void;
  onAcceptOrCancel: (it: RequestItem) => void; // decides based on myStatus
}) {
  const isPendingMine = myStatus === "pending";
  const isDisabled = myStatus === "accepted"; // optional: disable if already chosen
  const label = isPendingMine ? "Cancel" : "Accept";
  const bg = isPendingMine ? COLORS.danger : COLORS.primary;

  return (
    <Pressable
      onPress={() => onPressCard(item)}
      className="bg-white rounded-2xl p-4 mb-4 border border-slate-200"
      style={cardShadow as any}
    >
      <View className="flex-row items-center">
        <RNImage
          source={{ uri: item.avatar || AVATAR_PLACEHOLDER }}
          className="w-12 h-12 rounded-xl"
        />
        <View className="ml-3 flex-1">
          <Text
            className="text-[16px] font-semibold text-slate-900"
            numberOfLines={1}
          >
            {item.name}
          </Text>
          <View className="mt-1 flex-row items-center gap-2">
            <Meta icon="car-outline">{item.vehicle}</Meta>
            <StatusPill status={item.status} />
          </View>
        </View>
      </View>

      <View className="h-px bg-slate-200 my-4" />

      <View className="gap-1">
        <Meta icon="construct-outline">{item.service}</Meta>
        {item.landmark ? (
          <Meta icon="location-outline">{item.landmark}</Meta>
        ) : null}
        <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
          <Meta icon="time-outline">{item.time}</Meta>
          {typeof item.distanceKm === "number" && (
            <Meta icon="navigate-outline">{item.distanceKm.toFixed(1)} km</Meta>
          )}
        </View>
      </View>

      <View className="h-px bg-slate-200 my-4" />

      <Pressable
        disabled={isDisabled}
        onPress={() => onAcceptOrCancel(item)}
        className="rounded-2xl py-2.5 items-center"
        style={{
          backgroundColor: isDisabled ? "#cbd5e1" : bg,
          opacity: isDisabled ? 0.7 : 1,
        }}
      >
        <Text className="text-[14px] text-white font-semibold">{label}</Text>
      </Pressable>
    </Pressable>
  );
}

/* ------------------------------ Detail Bottom Sheet ------------------------------ */
function DetailSheet({
  visible,
  item,
  myCoords,
  onClose,
  onAcceptOrCancel,
  myStatus,
  onMessage,
  onOpenViewer,
}: {
  visible: boolean;
  item: RequestItem | null;
  myCoords: { lat: number; lng: number } | null;
  onClose: () => void;
  onAcceptOrCancel: (it: RequestItem) => void;
  myStatus?: MyReqStatus;
  onMessage: (it: RequestItem) => void;
  onOpenViewer: (images: string[], startIndex: number) => void;
}) {
  const [imgW, setImgW] = useState(0);
  const [imgIndex, setImgIndex] = useState(0);
  const [showLocation, setShowLocation] = useState(false);
  const mapRef = useRef<MapViewHandle | null>(null);

  useEffect(() => {
    if (!visible) setShowLocation(false);
  }, [visible, item?.id]);

  useEffect(() => {
    if (!showLocation || !item?.lat || !item?.lng) return;
    const points = [
      ...(myCoords
        ? [{ latitude: myCoords.lat, longitude: myCoords.lng }]
        : []),
      { latitude: item.lat, longitude: item.lng },
    ];
    if (points.length) {
      setTimeout(() => {
        mapRef.current?.fitToCoordinates(points, {
          edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
          animated: true,
        });
      }, 150);
    }
  }, [showLocation, item?.lat, item?.lng, myCoords]);

  if (!item) return null;

  const images =
    item.images && item.images.length > 0
      ? item.images
      : item.imageUrl
      ? [item.imageUrl]
      : [];

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!imgW) return;
    const i = Math.round(e.nativeEvent.contentOffset.x / imgW);
    setImgIndex(Math.min(Math.max(i, 0), Math.max(images.length - 1, 0)));
  };

  const distanceNow =
    typeof item.distanceKm === "number"
      ? item.distanceKm
      : myCoords && item.lat && item.lng
      ? haversineKm(myCoords.lat, myCoords.lng, item.lat, item.lng)
      : undefined;

  const isPendingMine = myStatus === "pending";
  const isDisabled = myStatus === "accepted";
  const label = isPendingMine ? "Cancel" : "Accept";
  const bg = isPendingMine ? COLORS.danger : COLORS.primary;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable className="flex-1 bg-black/30" onPress={onClose} />
      <View
        className="w-full bg-white rounded-t-3xl px-5 pt-3 pb-5"
        style={[{ maxHeight: "88%" }, cardShadow as any]}
      >
        <View className="items-center mb-3">
          <View className="h-1.5 w-10 bg-slate-200 rounded-full" />
        </View>

        {/* Header row */}
        <View className="flex-row items-center">
          <RNImage
            source={{ uri: item.avatar || AVATAR_PLACEHOLDER }}
            className="w-12 h-12 rounded-xl"
          />
          <View className="ml-3 flex-1">
            <Text
              className="text-[16px] font-semibold text-slate-900"
              numberOfLines={1}
            >
              {item.name}
            </Text>
            <View className="mt-1 flex-row items-center gap-2">
              <Meta icon="car-outline">{item.vehicle}</Meta>
              <StatusPill status={item.status} />
            </View>
          </View>
          <Pressable onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={22} color="#0F172A" />
          </Pressable>
        </View>

        <ScrollView className="mt-4" showsVerticalScrollIndicator={false}>
          {/* Media */}
          {images.length > 0 ? (
            <View onLayout={(e) => setImgW(e.nativeEvent.layout.width)}>
              <View className="relative">
                <View
                  style={{
                    position: "absolute",
                    top: 8,
                    left: 8,
                    zIndex: 10,
                    backgroundColor: "rgba(0,0,0,0.6)",
                  }}
                  className="rounded-full px-2 py-0.5"
                >
                  <Text className="text-white text-[12px] font-semibold">
                    {imgIndex + 1}/{images.length}
                  </Text>
                </View>

                <ScrollView
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  onMomentumScrollEnd={onScrollEnd}
                >
                  {images.map((uri, i) => (
                    <Pressable
                      key={i}
                      onPress={() => onOpenViewer(images, i)}
                      style={{ width: imgW }}
                    >
                      <Image
                        source={{ uri }}
                        resizeMode="cover"
                        className="w-full h-44 rounded-2xl"
                      />
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </View>
          ) : (
            <View className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 items-center">
              <Ionicons name="image-outline" size={18} color="#64748B" />
              <Text className="mt-1 text-[12px] text-slate-600">
                No image attached
              </Text>
            </View>
          )}

          {item.brief ? (
            <View className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <Text className="text-[13px] text-slate-700">
                <Text className="font-medium text-slate-900">
                  Driver note:{" "}
                </Text>
                {item.brief}
              </Text>
            </View>
          ) : null}

          <View className="mt-3 gap-2">
            {item.landmark ? (
              <Meta icon="location-outline">{item.landmark}</Meta>
            ) : null}
            <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
              <Meta icon="time-outline">{item.time}</Meta>
              {typeof distanceNow === "number" && (
                <Meta icon="navigate-outline">
                  {distanceNow.toFixed(1)} km away
                </Meta>
              )}
              {item.lat && item.lng ? (
                <Meta icon="pin-outline">
                  ({item.lat.toFixed(5)}, {item.lng.toFixed(5)})
                </Meta>
              ) : null}
            </View>
          </View>

          {/* Toggle map */}
          <View className="mt-5 gap-3">
            <View className="flex-row gap-3">
              <Pressable
                onPress={() => onMessage(item)}
                className="flex-1 rounded-2xl py-2.5 items-center border border-slate-300"
              >
                <View className="flex-row items-center gap-1.5">
                  <Ionicons
                    name="chatbubbles-outline"
                    size={16}
                    color="#0F172A"
                  />
                  <Text className="text-[14px] font-semibold text-slate-900">
                    Message
                  </Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => setShowLocation((v) => !v)}
                className="flex-1 rounded-2xl py-2.5 items-center"
                style={{ backgroundColor: COLORS.primary }}
              >
                <Text className="text-[14px] font-semibold text-white">
                  {showLocation ? "Hide Location" : "Open Location"}
                </Text>
              </Pressable>
            </View>

            {showLocation ? (
              <Modal visible animationType="slide">
                <SafeAreaView className="flex-1 bg-black">
                  <View className="flex-1">
                    <MapView
                      ref={mapRef}
                      style={{ flex: 1 }}
                      mapType="satellite"
                      initialRegion={{
                      latitude: item.lat ?? 0,
                      longitude: item.lng ?? 0,
                      latitudeDelta: 0.01,
                      longitudeDelta: 0.01,
                    }}
                    >
                      <Marker
                        coordinate={{
                          latitude: item.lat ?? 0,
                          longitude: item.lng ?? 0,
                        }}
                      />

                      {myCoords ? (
                        <>
                          <Marker
                            coordinate={{
                              latitude: myCoords.lat,
                              longitude: myCoords.lng,
                            }}
                            title="You"
                            pinColor="#2563EB"
                          />
                          <Polyline
                            coordinates={[
                              {
                                latitude: myCoords?.lat ?? 0,
                                longitude: myCoords?.lng ?? 0,
                              },
                              {
                                latitude: item.lat ?? 0,
                                longitude: item.lng ?? 0,
                              },
                            ]}

                            strokeWidth={4}
                            strokeColor="#2563EB"
                          />
                        </>
                      ) : null}
                    </MapView>

                    <Pressable
                      onPress={() => setShowLocation(false)}
                      className="absolute top-4 right-4 bg-white/90 rounded-full px-3 py-1.5"
                    >
                      <Text className="text-[14px] font-semibold text-slate-900">
                        Close
                      </Text>
                    </Pressable>
                  </View>
                </SafeAreaView>
              </Modal>
            ) : null}


            <Pressable
              disabled={isDisabled}
              onPress={() => onAcceptOrCancel(item)}
              className="rounded-2xl py-2.5 items-center"
              style={{
                backgroundColor: isDisabled ? "#cbd5e1" : bg,
                opacity: isDisabled ? 0.7 : 1,
              }}
            >
              <Text className="text-[14px] text-white font-semibold">
                {label}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

/* -------------------------- Location Gate Overlay -------------------------- */
function LocationGate({
  open,
  denied,
  onRetry,
  onOpenSettings,
  busy,
}: {
  open: boolean;
  denied: boolean;
  onRetry: () => void;
  onOpenSettings: () => void;
  busy: boolean;
}) {
  if (!open) return null;
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
      >
        <View className="w-11/12 max-w-md rounded-3xl bg-white p-6">
          <View className="items-center mb-3">
            <Ionicons name="navigate-outline" size={32} color={COLORS.brand} />
          </View>
          <Text className="text-xl font-semibold text-slate-900 text-center">
            Enable Location to Continue
          </Text>
          <Text className="mt-2 text-[14px] text-slate-600 text-center">
            We use your location to compute the{" "}
            <Text className="font-semibold">km distance</Text> to emergencies.
            You can't proceed until distance is available.
          </Text>

          <View className="mt-5 gap-3">
            <Pressable
              disabled={busy}
              onPress={onRetry}
              className="rounded-2xl py-3 items-center"
              style={{
                backgroundColor: COLORS.primary,
                opacity: busy ? 0.6 : 1,
              }}
            >
              <Text className="text-[14px] text-white font-semibold">
                {busy ? "Checking…" : "Enable / Check Location"}
              </Text>
            </Pressable>

            {denied ? (
              <Pressable
                onPress={onOpenSettings}
                className="rounded-2xl py-3 items-center border border-slate-300"
              >
                <Text className="text-[14px] text-slate-900">
                  Open App Settings
                </Text>
              </Pressable>
            ) : null}
          </View>

          <Text className="mt-3 text-[12px] text-slate-500 text-center">
            Tip: Make sure GPS is on and allow "While using the app".
          </Text>
        </View>
      </View>
    </Modal>
  );
}

/* --------------------------------- Screen ---------------------------------- */
export default function RequestScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<RequestItem[]>([]);
  const [selected, setSelected] = useState<RequestItem | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const unreadMessageCount = useUnreadMessageCount();
  const unreadNotificationCount = useUnreadNotificationCount();
  

  // mechanic's current coords (used for distance)
  const [myCoords, setMyCoords] = useState<{ lat: number; lng: number } | null>(
    null
  );

  // Gating states
  const [locPerm, setLocPerm] = useState<"unknown" | "granted" | "denied">(
    "unknown"
  );
  const [requestingLoc, setRequestingLoc] = useState(false);
  const [distanceReady, setDistanceReady] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const MECH_ITEMS = useMemo(
    () => [
      {
        label: "Profile",
        href: "/shop/mechanicprofile",
        icon: "person-circle-outline" as const,
      },
      {
        label: "Messages",
        href: "/shop/messages",
        icon: "chatbubbles-outline" as const,
      },
      {
      label: "Accepted Requests",
      href: "/shop/mechanicAcceptedrequests", // ← the page we built
      icon: "document-text-outline" as const, // you can use "time-outline" or "clipboard-outline" if you prefer
    },
      {
        label: "Transactions",
        href: "/shop/completedrequest",
        icon: "receipt-outline" as const,
      },
      {
        label: "Ratings & Reviews",
        href: "/shop/ratings",
        icon: "star-outline" as const, // Ionicons
      },
    ],
    []
  );

  const [loading, setLoading] = useState<{
    visible: boolean;
    message?: string;
  }>({ visible: false });

  // Offer modal state
  const [offerModalVisible, setOfferModalVisible] = useState(false);
  const [selectedEmergencyForOffer, setSelectedEmergencyForOffer] = useState<RequestItem | null>(null);

  // Confirm flows
  const [confirmAccept, setConfirmAccept] = useState<RequestItem | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<RequestItem | null>(null);

  // Toast
  const [toast, setToast] = useState<{ show: boolean; msg: string }>({
    show: false,
    msg: "",
  });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ show: true, msg });
    toastTimer.current = setTimeout(
      () => setToast({ show: false, msg: "" }),
      3000
    );
  };
  useEffect(() => {
    return () => {
      if (toastTimer.current) {
        clearTimeout(toastTimer.current);
        toastTimer.current = null; // optional: avoid double-clears
      }
    };
  }, []);

  // ---- shop identity & my requests on visible emergencies ----
  const [shopId, setShopId] = useState<string | null>(null);
  /** Map: emergency_id -> { service_id, status } for THIS shop */
  const [myReq, setMyReq] = useState<
    Record<string, { service_id: string; status: MyReqStatus }>
  >({});

  const myStatusFor = (emergencyId: string) => myReq[emergencyId]?.status;
  const hasMyPending = (emergencyId: string) =>
    myReq[emergencyId]?.status === "pending";

  const messageDriver = async (it: RequestItem) => {
  try {
    setLoading({ visible: true, message: "Opening chat..." });

    // Get current user ID (mechanic/shop)
    const { data: auth } = await supabase.auth.getUser();
    const currentUserId = auth?.user?.id;

    if (!currentUserId) {
      Alert.alert("Error", "Please sign in to start a conversation.");
      setLoading({ visible: false });
      return;
    }

    // We need to get the driver's user_id for this emergency
    const { data: emergencyData, error: emergencyError } = await supabase
      .from("emergency")
      .select("user_id")
      .eq("emergency_id", it.id)
      .single();

    if (emergencyError || !emergencyData?.user_id) {
      Alert.alert("Error", "Driver information is not available.");
      setLoading({ visible: false });
      return;
    }

    const driverUserId = emergencyData.user_id;

    console.log("Looking for ANY conversation between:", {
      customer_id: driverUserId,
      driver_id: currentUserId,
      emergency_id: it.id
    });

    // Check for ANY existing conversation (emergency OR non-emergency) between these users
    const { data: existingConvs, error: convError } = await supabase
      .from("conversations")
      .select(`
        id,
        emergency_id,
        shop_place_id
      `)
      .or(`and(customer_id.eq.${driverUserId},driver_id.eq.${currentUserId}),and(customer_id.eq.${currentUserId},driver_id.eq.${driverUserId})`)
      .order("updated_at", { ascending: false });

    if (convError) {
      console.error("Error checking conversations:", convError);
    }

    let conversationId;

    // Use the most recent existing conversation if found (regardless of emergency status)
    if (existingConvs && existingConvs.length > 0) {
      conversationId = existingConvs[0].id;
      console.log("Found existing conversation:", conversationId, 
        existingConvs[0].emergency_id ? "(emergency)" : "(non-emergency)");
      
      // Update the conversation timestamp to mark it as active
      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId);
    } else {
      console.log("No existing conversation found, creating new emergency one");
      // Create new emergency conversation
      const { data: newConv, error } = await supabase
        .from("conversations")
        .insert({
          emergency_id: it.id,
          customer_id: driverUserId, // driver is the customer in emergency context
          driver_id: currentUserId, // shop is the driver in emergency context
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating conversation:", error);
        
        // If there's a unique constraint violation, try to find the existing conversation again
        if (error.code === '23505') { // unique violation
          const { data: retryConvs } = await supabase
            .from("conversations")
            .select("id")
            .or(`and(customer_id.eq.${driverUserId},driver_id.eq.${currentUserId}),and(customer_id.eq.${currentUserId},driver_id.eq.${driverUserId})`)
            .order("updated_at", { ascending: false })
            .limit(1);
            
          if (retryConvs && retryConvs.length > 0) {
            conversationId = retryConvs[0].id;
            console.log("Found conversation after retry:", conversationId);
          } else {
            throw new Error("Conversation creation failed and no existing conversation found");
          }
        } else {
          throw error;
        }
      } else {
        conversationId = newConv.id;
        console.log("Created new emergency conversation:", conversationId);
      }
    }

    if (!conversationId) {
      throw new Error("No conversation ID available");
    }

    // Navigate to the chat screen
    router.push(`/driver/chat/${conversationId}`);
  } catch (error) {
    console.error("Error in messageDriver:", error);
    Alert.alert("Error", "Could not start conversation. Please try again.");
  } finally {
    setLoading({ visible: false });
  }
};

  const openViewer = (images: string[], startIndex: number) => {
    setViewerImages(images);
    setViewerIndex(startIndex);
    setViewerOpen(true);
  };

  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);

  // ---- LOCATION SETUP & GATE ----
  const checkAndGetLocation = useCallback(async () => {
    setRequestingLoc(true);
    try {
      const current = await Location.getForegroundPermissionsAsync();
      let status = current.status;
      if (status !== "granted") {
        const req = await Location.requestForegroundPermissionsAsync();
        status = req.status;
      }
      setLocPerm(status === "granted" ? "granted" : "denied");

      if (status === "granted") {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setMyCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      }
    } catch {
      // ignore; gate will remain open
    } finally {
      setRequestingLoc(false);
    }
  }, []);

  useEffect(() => {
    checkAndGetLocation();
  }, [checkAndGetLocation]);

  /* ------------------------ MAIN FETCH (PENDING ONLY) ------------------------ */
  const fetchPending = useCallback(
    async (withSpinner: boolean) => {
      if (!myCoords) return;
      try {
        if (withSpinner)
          setLoading({ visible: true, message: "Loading requests…" });

        // Prefer RPC if you created one; otherwise query table
        let ems: EmergencyRow[] | null = null;
        try {
          const { data, error } = await supabase.rpc("visible_emergencies", {
            lat: myCoords.lat,
            lon: myCoords.lng,
          });
          if (error) throw error;
          ems = ((data || []) as EmergencyRow[]).filter((r) =>
            isVisibleByGate(r, myCoords)
          );
        } catch {
          const { data, error } = await supabase
            .from("emergency")
            .select("*")
            .eq("emergency_status", "waiting")
            .order("created_at", { ascending: false });
          if (error) throw error;
          ems = (data as EmergencyRow[]).filter((r) =>
            isVisibleByGate(r, myCoords)
          );
        }

        const mapped = await Promise.all(
          (ems || []).map(async (r) => {
            // profile
            let profile: AppUserRow | null = null;
            try {
              const { data: prow } = await supabase
                .from("app_user")
                .select("full_name, photo_url")
                .eq("user_id", r.user_id)
                .single<AppUserRow>();
              profile = prow ?? null;
            } catch {}

            const item = mapEmergencyToItem(r, profile);
            // landmark
            item.landmark = await reverseGeocode(r.latitude, r.longitude);
            // distance
            item.distanceKm = haversineKm(
              myCoords.lat,
              myCoords.lng,
              r.latitude,
              r.longitude
            );

            // 🔎 debug
            const distM =
              typeof item.distanceKm === "number"
                ? item.distanceKm * 1000
                : undefined;
            printDebug(
              `[fetch] ${r.emergency_id}`,
              r.latitude,
              r.longitude,
              myCoords,
              distM,
              r.created_at
            );

            return item;
          })
        );

        setRows(mapped);
      } catch (e: any) {
        Alert.alert("Unable to load", e?.message ?? "Please try again.");
      } finally {
        if (withSpinner) setLoading({ visible: false });
      }
    },
    [myCoords]
  );

  // Initial load (also rerun when myCoords becomes available)
  useEffect(() => {
    if (myCoords) fetchPending(true);
  }, [fetchPending, myCoords]);

  // Track whether distances are ready for all visible rows
  useEffect(() => {
    if (!myCoords) {
      setDistanceReady(false);
      return;
    }
    const ready =
      rows.length === 0 || rows.every((r) => typeof r.distanceKm === "number");
    setDistanceReady(ready);
  }, [rows, myCoords]);

  /* ---------------- get current user's shop_id ---------------- */
  useEffect(() => {
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth?.user?.id;
        if (!uid) return;
        const { data, error } = await supabase
          .from("shop_details")
          .select("shop_id")
          .eq("user_id", uid)
          .single();
        if (!error && data?.shop_id) setShopId(data.shop_id);
      } catch {}
    })();
  }, []);

  /* ---- fetch THIS shop's requests for visible emergencies ---- */
  useEffect(() => {
    (async () => {
      if (!shopId || rows.length === 0) return;
      const ids = rows.map((r) => r.id);
      const { data, error } = await supabase
        .from("service_requests")
        .select("service_id, emergency_id, status")
        .in("emergency_id", ids)
        .eq("shop_id", shopId);

      if (!error && data) {
        const next: Record<
          string,
          { service_id: string; status: MyReqStatus }
        > = {};
        for (const r of data as any[]) {
          next[r.emergency_id] = {
            service_id: r.service_id,
            status: r.status as MyReqStatus,
          };
        }
        setMyReq((prev) => ({ ...prev, ...next }));
      }
    })();
  }, [shopId, rows]);

  /* ------------------------ REALTIME PATCH + REFRESH ------------------------ */
  const applyRealtimePatch = useCallback(
    (payload: any) => {
      const type = payload?.eventType as
        | "INSERT"
        | "UPDATE"
        | "DELETE"
        | undefined;
      const row: EmergencyRow | undefined = (
        type === "DELETE" ? payload?.old : payload?.new
      ) as EmergencyRow | undefined;
      if (!type || !row) return;

      setRows((prev) => {
        const next = [...prev];
        const idx = next.findIndex((x) => x.id === row.emergency_id);

        // We ONLY show waiting. If new status is not waiting -> remove if present.
        if (type !== "DELETE" && row.emergency_status !== "waiting") {
          if (idx >= 0) next.splice(idx, 1);
          return next;
        }

        if (type === "DELETE") {
          if (idx >= 0) next.splice(idx, 1);
          return next;
        }

        // Gate: only allow items visible by rule to enter/update the list.
        const visibleNow = isVisibleByGate(row, myCoords);

        // If it's not visible *yet*, ensure it's removed from the list (prevents flicker)
        if (!visibleNow) {
          if (idx >= 0) next.splice(idx, 1);
          return next;
        }

        // From here, row is waiting AND visible under gate.
        const base: Partial<RequestItem> = {
          service: row.breakdown_cause || "—",
          vehicle: row.vehicle_type || "—",
          status: "pending",
          time: fmtDateTime(row.created_at),
          images: (row.attachments || []).filter(Boolean),
          lat: row.latitude,
          lng: row.longitude,
        };

        if (idx >= 0) {
          next[idx] = { ...next[idx], ...base };
          if (myCoords) {
            next[idx].distanceKm = haversineKm(
              myCoords.lat,
              myCoords.lng,
              row.latitude,
              row.longitude
            );
            // 🔎 debug
            const distM =
              typeof next[idx].distanceKm === "number"
                ? next[idx].distanceKm * 1000
                : undefined;
            printDebug(
              `[realtime:UPDATE] ${row.emergency_id}`,
              row.latitude,
              row.longitude,
              myCoords,
              distM,
              row.created_at
            );
          }
        } else {
          const lite: RequestItem = {
            id: row.emergency_id,
            name: "Customer",
            avatar: AVATAR_PLACEHOLDER,
            vehicle: row.vehicle_type || "—",
            service: row.breakdown_cause || "—",
            brief: row.breakdown_cause || undefined,
            time: fmtDateTime(row.created_at),
            lat: row.latitude,
            lng: row.longitude,
            status: "pending",
            images: (row.attachments || []).filter(Boolean),
            distanceKm: myCoords
              ? haversineKm(
                  myCoords.lat,
                  myCoords.lng,
                  row.latitude,
                  row.longitude
                )
              : undefined,
          };
          next.unshift(lite);

          // 🔎 debug
          const distM =
            typeof lite.distanceKm === "number"
              ? lite.distanceKm * 1000
              : undefined;
          printDebug(
            `[realtime:INSERT] ${row.emergency_id}`,
            row.latitude,
            row.longitude,
            myCoords,
            distM,
            row.created_at
          );

          // Enrich profile + landmark later
          (async () => {
            const landmark = await reverseGeocode(row.latitude, row.longitude);
            let name = "Customer";
            let avatar = AVATAR_PLACEHOLDER;
            try {
              const { data: prow } = await supabase
                .from("app_user")
                .select("full_name, photo_url")
                .eq("user_id", row.user_id)
                .single<AppUserRow>();
              if (prow) {
                name = prow.full_name || name;
                avatar = prow.photo_url || avatar;
              }
            } catch {}
            setRows((curr) =>
              curr.map((it) =>
                it.id === row.emergency_id
                  ? { ...it, landmark, name, avatar }
                  : it
              )
            );
          })();
        }

        return next;
      });
    },
    [myCoords]
  );

  useEffect(() => {
    const channel = supabase
      .channel("emergency-realtime-pending")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "emergency" },
        (payload) => {
          applyRealtimePatch(payload);
          fetchPending(false);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [applyRealtimePatch, fetchPending]);

  // Fallback polling (if realtime drops) and to capture items that aged past RULE_MINUTES
  useEffect(() => {
    const id = setInterval(() => {
      if (myCoords) fetchPending(false);
    }, 15000);
    return () => clearInterval(id);
  }, [fetchPending, myCoords]);

  /* ----------------------------- OFFER MODAL HANDLERS ----------------------------- */
  const handleAcceptOrCancel = (it: RequestItem) => {
    // If already sent by THIS shop for this emergency -> cancel flow
    if (hasMyPending(it.id)) {
      setConfirmCancel(it);
    } else {
      // Show offer modal instead of directly accepting
      setSelectedEmergencyForOffer(it);
      setOfferModalVisible(true);
    }
  };

  // constants for fee rule
const RATE_PER_KM = 15;          // PHP per km
const MINIMUM_DISTANCE_KM = 1.0; // bill minimum 1km

// FILE: app/shop/mechanicLandingpage.tsx
// REPLACE your entire handleOfferSubmit function with this

const handleOfferSubmit = async (offerData: OfferData) => {
  if (!selectedEmergencyForOffer || !shopId) return;

  try {
    setLoading({ visible: true, message: "Sending offer…" });

    const emergencyId = selectedEmergencyForOffer.id;
    const lat = myCoords?.lat ?? 0;
    const lng = myCoords?.lng ?? 0;

    // ════════════════════════════════════════════════════════════════
    // STEP 1: Get authenticated user (mechanic/shop owner)
    // ════════════════════════════════════════════════════════════════
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      throw new Error("You must be logged in to send offers");
    }

    console.log("🔵 [OFFER] Mechanic user ID:", user.id);

    // ════════════════════════════════════════════════════════════════
    // STEP 2: Get shop/mechanic name for notification (with fallbacks)
    // ════════════════════════════════════════════════════════════════
    let shopName = "A Mechanic";

    const { data: shopData, error: shopError } = await supabase
      .from("shop_details")
      .select(`
        shop_id,
        place_id,
        user_id,
        places (
          name
        )
      `)
      .eq("shop_id", shopId)
      .single();

    if (shopError) {
      console.error("🔴 [SHOP ERROR] Failed to fetch shop details:", shopError);
    }

    // Debug logging to see what we're getting
    console.log("🔵 [DEBUG] Shop data response:", {
      shop_id: shopData?.shop_id,
      place_id: shopData?.place_id,
      user_id: shopData?.user_id,
      places: shopData?.places,
      places_is_array: Array.isArray(shopData?.places),
    });

    // Try multiple ways to get the shop name
    if (shopData?.places) {
      // Handle both array and object responses from Supabase
      if (Array.isArray(shopData.places) && shopData.places.length > 0 && shopData.places[0]?.name) {
        shopName = shopData.places[0].name;
        console.log("🔵 [OFFER] Using shop name from places (array):", shopName);
      } else if (typeof shopData.places === 'object' && !Array.isArray(shopData.places) && 'name' in shopData.places) {
        shopName = (shopData.places as { name: string }).name;
        console.log("🔵 [OFFER] Using shop name from places (object):", shopName);
      }
    }

    // If no shop name from places, fallback to mechanic's name
    if (shopName === "A Mechanic" && shopData?.user_id) {
      console.log("🔵 [OFFER] No place name found, fetching mechanic name from app_user");
      
      const { data: userProfile, error: userError } = await supabase
        .from("app_user")
        .select("full_name")
        .eq("user_id", shopData.user_id)
        .single();

      if (userError) {
        console.error("🔴 [USER ERROR] Failed to fetch mechanic name:", userError);
      } else if (userProfile?.full_name) {
        shopName = userProfile.full_name;
        console.log("🔵 [OFFER] Using mechanic name from app_user:", shopName);
      }
    }

    console.log("🔵 [OFFER] ✅ Final shop name that will be used:", shopName);

    // ════════════════════════════════════════════════════════════════
    // STEP 3: Get driver's user_id from the emergency
    // ════════════════════════════════════════════════════════════════
    const { data: emergencyData, error: emergencyError } = await supabase
      .from("emergency")
      .select("user_id")
      .eq("emergency_id", emergencyId)
      .single();

    if (emergencyError || !emergencyData?.user_id) {
      throw new Error("Failed to find driver for this emergency");
    }

    const driverUserId = emergencyData.user_id;
    console.log("🔵 [OFFER] Driver user ID:", driverUserId);

    // ════════════════════════════════════════════════════════════════
    // STEP 4: Ensure service_requests row exists (or revive canceled)
    // ════════════════════════════════════════════════════════════════
    let serviceId: string | null = null;
    const { data: existing } = await supabase
      .from("service_requests")
      .select("service_id, status")
      .eq("emergency_id", emergencyId)
      .eq("shop_id", shopId)
      .maybeSingle();

    if (existing) {
      serviceId = existing.service_id;
      if (existing.status === "canceled") {
        const { error: upErr } = await supabase
          .from("service_requests")
          .update({
            status: "pending",
            requested_at: new Date().toISOString(),
          })
          .eq("service_id", existing.service_id);
        if (upErr) throw upErr;
      }
    } else {
      const { data: ins, error: insErr } = await supabase
        .from("service_requests")
        .insert({
          emergency_id: emergencyId,
          shop_id: shopId,
          latitude: lat,
          longitude: lng,
          status: "pending",
          requested_at: new Date().toISOString(),
        })
        .select("service_id")
        .single();
      if (insErr) throw insErr;
      serviceId = ins.service_id;
    }

    // ════════════════════════════════════════════════════════════════
    // STEP 5: Compute distance + price with fallback (min 1.0 km)
    // ════════════════════════════════════════════════════════════════
    const dKm =
      selectedEmergencyForOffer.distanceKm ??
      (myCoords &&
      typeof selectedEmergencyForOffer.lat === "number" &&
      typeof selectedEmergencyForOffer.lng === "number"
        ? haversineKm(
            myCoords.lat,
            myCoords.lng,
            selectedEmergencyForOffer.lat,
            selectedEmergencyForOffer.lng
          )
        : MINIMUM_DISTANCE_KM);

    const billableKm = Math.max(dKm ?? 0, MINIMUM_DISTANCE_KM);
    const distanceFee = billableKm * RATE_PER_KM;
    const total = distanceFee + offerData.laborCost;

    console.log("🔵 [OFFER] Offer details:", {
      distanceKm: billableKm,
      distanceFee,
      laborCost: offerData.laborCost,
      total,
    });

    // ════════════════════════════════════════════════════════════════
    // STEP 6: Insert offer into shop_offers
    // ════════════════════════════════════════════════════════════════
    const { error: offerErr } = await supabase.from("shop_offers").insert({
      emergency_id: emergencyId,
      service_id: serviceId,
      shop_id: shopId,
      distance_km: Number(billableKm.toFixed(2)),
      rate_per_km: RATE_PER_KM,
      distance_fee: Number(distanceFee.toFixed(2)),
      labor_cost: Number(offerData.laborCost.toFixed(2)),
      total_amount: Number(total.toFixed(2)),
      note: offerData.note || null,
    });

    if (offerErr) {
      console.error("🔴 [OFFER ERROR] Failed to insert offer:", offerErr);
      throw offerErr;
    }

    console.log("✅ [OFFER] Offer inserted successfully");

    // ════════════════════════════════════════════════════════════════
    // STEP 7: Send notification to driver
    // ════════════════════════════════════════════════════════════════
    console.log("🔵 [NOTIFICATION] Sending offer notification to driver:", driverUserId);
    console.log("🔵 [NOTIFICATION] Using shop name:", shopName);

    const { data: notifData, error: notifError } = await supabase
      .from("notifications")
      .insert({
        from_user_id: user.id,
        to_user_id: driverUserId,
        type: "new_offer_received",
        title: "New Service Quote",
        body: `${shopName} has sent you a service quote for ₱${total.toFixed(2)}`,
        data: {
          emergency_id: emergencyId,
          service_id: serviceId,
          shop_id: shopId,
          shop_name: shopName,
          total_amount: total,
          distance_km: billableKm,
          labor_cost: offerData.laborCost,
          note: offerData.note || null,
          event: "mechanic_sent_offer",
        },
      })
      .select();

    if (notifError) {
      console.error("🔴 [NOTIFICATION ERROR] Failed to send notification:", {
        error: notifError,
        code: notifError.code,
        message: notifError.message,
        details: notifError.details,
        hint: notifError.hint,
      });

      if (notifError.code === "42501") {
        console.error("🔴 [RLS ERROR] Notification blocked by RLS policy");
        console.error("🔴 [RLS ERROR] Check that auth.uid() =", user.id);
      } else if (notifError.code === "23514") {
        console.error("🔴 [CHECK CONSTRAINT ERROR] Notification type not allowed");
        console.error("🔴 [CHECK CONSTRAINT ERROR] Make sure 'new_offer_received' is in the CHECK constraint");
      }

      console.warn("⚠️ [WARNING] Offer sent but driver notification failed");
    } else if (!notifData || notifData.length === 0) {
      console.error("🔴 [NOTIFICATION ERROR] No data returned (possible RLS block)");
      console.warn("⚠️ [WARNING] Offer sent but driver notification may not have been delivered");
    } else {
      console.log("✅ [NOTIFICATION SUCCESS] Driver notified:", notifData[0]);
      console.log("✅ [NOTIFICATION SUCCESS] Shop name in notification:", notifData[0].data?.shop_name);
    }

    // ════════════════════════════════════════════════════════════════
    // STEP 8: Update local state
    // ════════════════════════════════════════════════════════════════
    setMyReq((m) => ({
      ...m,
      [emergencyId]: { service_id: serviceId!, status: "pending" },
    }));

    setLoading({ visible: false });
    showToast("Offer sent successfully!");
    setOfferModalVisible(false);
    setSelectedEmergencyForOffer(null);

    console.log("✅ [OFFER] Complete offer submission process finished");
  } catch (e: any) {
    console.error("🔴 [OFFER ERROR] Offer submission failed:", {
      error: e,
      message: e?.message,
      stack: e?.stack,
    });
    setLoading({ visible: false });
    Alert.alert("Failed to send offer", e?.message ?? "Please try again.");
  }
};


  const doCancelRequest = async () => {
    if (!confirmCancel || !shopId) return;
    const emergencyId = confirmCancel.id;
    const my = myReq[emergencyId];
    setConfirmCancel(null);

    if (!my?.service_id) {
      showToast("No request to cancel");
      return;
    }
    try {
      setLoading({ visible: true, message: "Canceling…" });
      const { error } = await supabase
        .from("service_requests")
        .update({
          status: "canceled",
          rejected_at: new Date().toISOString(), // using rejected_at for canceled timestamp
        })
        .eq("service_id", my.service_id);
      if (error) throw error;

      // reflect locally
      setMyReq((m) => ({
        ...m,
        [emergencyId]: { service_id: my.service_id, status: "canceled" },
      }));
      setLoading({ visible: false });
      showToast("Request canceled");
    } catch (e: any) {
      setLoading({ visible: false });
      Alert.alert("Failed to cancel", e?.message ?? "Please try again.");
    }
  };

  // Convert RequestItem to EmergencyDetails for OfferModal
  const getEmergencyDetails = (item: RequestItem): EmergencyDetails => ({
    emergencyId: item.id,
    customerName: item.name,
    vehicleType: item.vehicle,
    breakdownCause: item.service,
    location: item.landmark || "Location not specified",
    dateTime: item.time,
    distanceKm: item.distanceKm,
  });

  // Gate open until: permission granted + coords acquired + distances computed
  const gateOpen = locPerm !== "granted" || !myCoords || !distanceReady;

  return (
    <View className="flex-1" style={{ backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.brand} />

      <SideDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        items={MECH_ITEMS}
        logoSource={require("../../assets/images/logo2.png")}
        appName="RIDERESCUE"
        unreadMessageCount={unreadMessageCount}
        onLogout={() => {
          setDrawerOpen(false);
          router.replace("/(auth)/login");
        }}
      />

      <SafeAreaView edges={["top"]} style={{ backgroundColor: COLORS.brand }}>
        <View className="flex-row items-center justify-between px-6 py-3">
          <View className="flex-row items-center gap-3">
            <Image
              source={require("../../assets/images/logo2.png")}
              className="w-12 h-12"
              resizeMode="contain"
            />
            <Text className="text-white text-[20px] font-semibold">
              RideRescue
            </Text>
          </View>

          
  <View className="flex-row items-center">
    {/* Notifications with Number Badge */}
<Pressable
  onPress={() => router.push("/shop/inbox")}
  className="p-2 rounded-lg mr-1 active:opacity-80 relative"
  android_ripple={{ color: "rgba(255,255,255,0.18)", borderless: true }}
  hitSlop={10}
>
  <Ionicons name="notifications-outline" size={26} color="#fff" />
  {unreadNotificationCount > 0 && (
    <View
      className="absolute rounded-full bg-red-500 items-center justify-center"
      style={{
        minWidth: 18,
        height: 18,
        top: 4,
        right: 4,
        borderWidth: 2,
        borderColor: COLORS.brand,
        paddingHorizontal: 4,
      }}
    >
      <Text
        style={{
          color: '#FFFFFF',
          fontSize: 10,
          fontWeight: '700',
        }}
      >
        {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
      </Text>
    </View>
  )}
</Pressable>


{/* Burger / Drawer with Badge */}
<Pressable
  className="p-2 rounded-lg active:opacity-80 relative"
  android_ripple={{ color: "rgba(255,255,255,0.18)", borderless: true }}
  onPress={() => setDrawerOpen(true)}
  hitSlop={10}
>
  <Ionicons name="menu" size={24} color="#fff" />
  {unreadMessageCount > 0 && (
    <View
      className="absolute rounded-full bg-red-500"
      style={{
        width: 10,
        height: 10,
        top: 2,      // ✅ Changed from 4 to 2
        right: 2,    // ✅ Changed from 4 to 2
        borderWidth: 2,
        borderColor: COLORS.brand,
      }}
    />
  )}
</Pressable>
  </View>

        </View>
      </SafeAreaView>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        renderItem={({ item }) => (
          <RequestCard
            item={item}
            myStatus={myStatusFor(item.id)}
            onPressCard={(it) => {
              setSelected(it);
              setSheetOpen(true);
            }}
            onAcceptOrCancel={handleAcceptOrCancel}
          />
        )}
        ListEmptyComponent={
          <View className="px-6 pt-10">
            <Text className="text-center text-slate-500">
              No pending requests.
            </Text>
          </View>
        }
      />

      <DetailSheet
        visible={sheetOpen}
        item={selected}
        myCoords={myCoords}
        onClose={() => setSheetOpen(false)}
        onAcceptOrCancel={handleAcceptOrCancel}
        myStatus={selected ? myStatusFor(selected.id) : undefined}
        onMessage={messageDriver}
        onOpenViewer={openViewer}
      />

      {/* Offer Modal */}
      <OfferModal
        visible={offerModalVisible}
        emergency={selectedEmergencyForOffer ? getEmergencyDetails(selectedEmergencyForOffer) : null}
        distanceKm={selectedEmergencyForOffer?.distanceKm}
        onClose={() => {
          setOfferModalVisible(false);
          setSelectedEmergencyForOffer(null);
        }}
        onSubmit={handleOfferSubmit}
        isSubmitting={loading.visible && loading.message === "Sending offer…"}
      />

      {/* Cancel confirm */}
      <CenterConfirm
        visible={!!confirmCancel}
        title="Cancel your request?"
        message="This will withdraw your request for this post."
        onCancel={() => setConfirmCancel(null)}
        onConfirm={doCancelRequest}
        confirmLabel="Yes, Cancel"
        cancelLabel="Back"
        confirmColor={COLORS.danger}
      />

      <LoadingScreen
        visible={loading.visible}
        message={loading.message}
        variant="spinner"
      />

      {/* 🚫 Hard gate until distance is ready */}
      <LocationGate
        open={gateOpen}
        denied={locPerm === "denied"}
        busy={requestingLoc}
        onRetry={checkAndGetLocation}
        onOpenSettings={() => Linking.openSettings()}
      />

      <ImageViewerModal
        visible={viewerOpen}
        images={viewerImages}
        startIndex={viewerIndex}
        onClose={() => setViewerOpen(false)}
      />

      {/* Top toast */}
      <TopToast show={toast.show} message={toast.msg} />
    </View>
  );
}
