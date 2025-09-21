// app/(driver)/mechanicLandingpage.tsx
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
import { supabase } from "../../utils/supabase";
import MapView, { Marker, Polyline } from "react-native-maps";

/* ------------------------------ Configurable rules ------------------------------ */
// Distance gate in **km** for the first RULE_MINUTES minutes.
// 👉 Change this to 1 to apply the 1 km rule.
const KM_GATE = 2;
// Time window in minutes before the post becomes visible to everyone.
const RULE_MINUTES = 10;

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
  id: string;
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

/* ------------------------------ Detail Bottom Sheet ------------------------------ */
function DetailSheet({
  visible,
  item,
  myCoords,
  onClose,
  onAccept,
  onMessage,
  onOpenViewer,
}: {
  visible: boolean;
  item: RequestItem | null;
  myCoords: { lat: number; lng: number } | null;
  onClose: () => void;
  onAccept: (it: RequestItem) => void;
  onMessage: (it: RequestItem) => void;
  onOpenViewer: (images: string[], startIndex: number) => void;
}) {
  const [imgW, setImgW] = useState(0);
  const [imgIndex, setImgIndex] = useState(0);
  const [showLocation, setShowLocation] = useState(false);
  const mapRef = useRef<MapView | null>(null);

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
            source={{ uri: item.avatar }}
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

          {/* Actions */}
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

            {/* INLINE MAP */}
            {showLocation ? (
              <View className="mt-3">
                {item.lat && item.lng ? (
                  <View className="rounded-2xl overflow-hidden border border-slate-200">
                    <MapView
                      ref={mapRef}
                      style={{ width: "100%", height: 220 }}
                      mapType="satellite"
                      initialRegion={{
                        latitude: item.lat,
                        longitude: item.lng,
                        latitudeDelta: 0.01,
                        longitudeDelta: 0.01,
                      }}
                    >
                      <Marker
                        coordinate={{ latitude: item.lat, longitude: item.lng }}
                        title="Emergency location"
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
                                latitude: myCoords.lat,
                                longitude: myCoords.lng,
                              },
                              { latitude: item.lat, longitude: item.lng },
                            ]}
                            strokeWidth={4}
                          />
                        </>
                      ) : null}
                    </MapView>

                    <View className="px-3 py-2 bg-white border-t border-slate-200">
                      <Text className="text-[13px] text-slate-700">
                        {typeof distanceNow === "number"
                          ? `${distanceNow.toFixed(2)} km away`
                          : "Distance unavailable"}
                      </Text>
                      {item.landmark ? (
                        <Text
                          className="text-[12px] text-slate-500"
                          numberOfLines={2}
                        >
                          {item.landmark}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ) : (
                  <View className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <Text className="text-[13px] text-slate-700">
                      Location not available for this request.
                    </Text>
                  </View>
                )}
              </View>
            ) : null}

            <Pressable
              onPress={() => onAccept(item)}
              className="rounded-2xl py-2.5 items-center"
              style={{ backgroundColor: COLORS.primary }}
            >
              <Text className="text-[14px] text-white font-semibold">
                Accept
              </Text>
            </Pressable>
          </View>
        </ScrollView>
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
    <Pressable
      onPress={() => onPressCard(item)}
      className="bg-white rounded-2xl p-4 mb-4 border border-slate-200"
      style={cardShadow as any}
    >
      <View className="flex-row items-center">
        <RNImage
          source={{ uri: item.avatar }}
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
        onPress={() => onAccept(item)}
        className="rounded-2xl py-2.5 items-center"
        style={{ backgroundColor: COLORS.primary }}
      >
        <Text className="text-[14px] text-white font-semibold">Accept</Text>
      </Pressable>
    </Pressable>
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
            You can’t proceed until distance is available.
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
            Tip: Make sure GPS is on and allow “While using the app”.
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
        label: "Inbox",
        href: "/shop/inbox",
        icon: "notifications-outline" as const,
      },
      {
        label: "Transaction History",
        href: "/shop/completedrequest",
        icon: "receipt-outline" as const,
      },
    ],
    []
  );

  const [loading, setLoading] = useState<{
    visible: boolean;
    message?: string;
  }>({ visible: false });
  const [confirmAccept, setConfirmAccept] = useState<RequestItem | null>(null);

  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);

  const messageDriver = (it: RequestItem) => {
    try {
      router.push({ pathname: "/shop/messages", params: { to: it.id } as any });
    } catch {
      router.push("/shop/messages");
    }
  };

  const openViewer = (images: string[], startIndex: number) => {
    setViewerImages(images);
    setViewerIndex(startIndex);
    setViewerOpen(true);
  };

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

        // Prefer the server-enforced RPC if present
        // NOTE: if your function params are "lat, lon" change keys to { lat: myCoords.lat, lon: myCoords.lng }
        const rpcArgs: any = { _lat: myCoords.lat, _lon: myCoords.lng };
        let ems: EmergencyRow[] | null = null;

        try {
          const { data, error } = await supabase.rpc(
            "visible_emergencies",
            rpcArgs
          );
          if (error) throw error;
          ems = (data || []) as EmergencyRow[];
        } catch (rpcErr) {
          // Fallback to raw table + client gating (UI-only)
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

          // Enrich in background (landmark + profile)
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
          // 1) Apply gate-aware patch
          applyRealtimePatch(payload);
          // 2) Quiet refetch to keep ordering/derived fields accurate
          fetchPending(false);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [applyRealtimePatch, fetchPending]);

  // Fallback polling (if realtime drops) and to capture items that aged past 10 minutes
  useEffect(() => {
    const id = setInterval(() => {
      if (myCoords) fetchPending(false);
    }, 15000);
    return () => clearInterval(id);
  }, [fetchPending, myCoords]);

  /* ----------------------------- ACCEPT ACTION ----------------------------- */
  const handleAccept = (it: RequestItem) => setConfirmAccept(it);

  const doAccept = async () => {
    if (!confirmAccept) return;
    const id = confirmAccept.id;
    setConfirmAccept(null);

    try {
      setLoading({ visible: true, message: "Accepting request…" });
      const { error } = await supabase
        .from("emergency")
        .update({
          emergency_status: "in_process",
          accepted_at: new Date().toISOString(),
        })
        .eq("emergency_id", id);
      if (error) throw error;

      // Optimistic removal (it will disappear because it’s no longer waiting)
      setRows((prev) => prev.filter((r) => r.id !== id));

      setLoading({ visible: false });
      if (selected?.id === id) setSheetOpen(false);
    } catch (e: any) {
      setLoading({ visible: false });
      Alert.alert("Failed to accept", e?.message ?? "Please try again.");
    }
  };

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

          <Pressable
            className="p-2 rounded-lg active:opacity-80"
            android_ripple={{
              color: "rgba(255,255,255,0.18)",
              borderless: true,
            }}
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
        onAccept={(it) => setConfirmAccept(it)}
        onMessage={messageDriver}
        onOpenViewer={openViewer}
      />

      <CenterConfirm
        visible={!!confirmAccept}
        title="Accept this request?"
        message="This will notify the driver and mark the job as Accepted."
        onCancel={() => setConfirmAccept(null)}
        onConfirm={doAccept}
        confirmLabel="Accept Request"
        cancelLabel="Cancel"
        confirmColor={COLORS.primary}
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
    </View>
  );
}
