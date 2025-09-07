// app/(driver)/request.tsx
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  Image as RNImage,
  FlatList,
  Linking,
  Modal,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

/* ------------------------------ Design tokens ------------------------------ */
const COLORS = {
  bg: "#F4F6F8",
  surface: "#FFFFFF",
  border: "#E5E7EB",
  text: "#0F172A",
  sub: "#475569",
  muted: "#94A3B8",
  primary: "#2563EB",       // professional blue (View Details)
  danger: "#DC2626",        // professional red (Decline)
  success: "#16A34A",       // professional green (Accept)
};

const shadow = Platform.select({
  ios: {
    shadowColor: "#0F172A",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
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
  },
];

/* ------------------------------- Small UI bits ------------------------------ */
function StatusPill({ status }: { status: RequestItem["status"] }) {
  const map: Record<RequestItem["status"], { bg: string; text: string; label: string }> = {
    pending:   { bg: "#FEF3C7", text: "#92400E", label: "Pending" },
    accepted:  { bg: "#DBEAFE", text: "#1E40AF", label: "Accepted" },
    completed: { bg: "#DCFCE7", text: "#065F46", label: "Completed" },
    canceled:  { bg: "#FEE2E2", text: "#991B1B", label: "Canceled" },
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

function SolidButton({
  label,
  color,
  onPress,
  icon,
}: {
  label: string;
  color: string;
  onPress: () => void;
  icon?: any;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-1 h-11 rounded-full items-center justify-center"
      style={[{ backgroundColor: color }, shadow]}
    >
      <View className="flex-row items-center">
        {icon ? <Ionicons name={icon} size={16} color="#fff" style={{ marginRight: 6 }} /> : null}
        <Text className="text-white text-[13px] font-semibold">{label}</Text>
      </View>
    </Pressable>
  );
}

/* ------------------------------- Details Modal ------------------------------ */
function DetailsModal({
  visible,
  item,
  onClose,
  onOpenMaps,
}: {
  visible: boolean;
  item: RequestItem | null;
  onClose: () => void;
  onOpenMaps: (it: RequestItem) => void;
}) {
  if (!item) return null;
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable
        className="flex-1"
        style={{ backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 16 }}
        onPress={onClose}
      >
        <Pressable>
          <View
            className="rounded-2xl bg-white p-4"
            style={[{ borderWidth: 1, borderColor: COLORS.border }, shadow]}
          >
            {/* Header */}
            <View className="flex-row items-center gap-3">
              <View
                className="overflow-hidden rounded-xl"
                style={{ width: 56, height: 56, backgroundColor: "#F1F5F9" }}
              >
                {item.avatar ? (
                  <RNImage source={{ uri: item.avatar }} style={{ width: "100%", height: "100%" }} />
                ) : (
                  <View className="h-full w-full items-center justify-center">
                    <Ionicons name="person-outline" size={22} color="#475569" />
                  </View>
                )}
              </View>
              <View className="flex-1">
                <Text className="text-[18px] font-extrabold text-slate-900" numberOfLines={2}>
                  {item.name}
                </Text>
                <View className="mt-1 flex-row items-center gap-2">
                  <StatusPill status={item.status} />
                  {typeof item.distanceKm === "number" && (
                    <>
                      <Text className="text-slate-300">•</Text>
                      <Text className="text-[12px] text-slate-500">
                        {item.distanceKm.toFixed(1)} km away
                      </Text>
                    </>
                  )}
                </View>
              </View>
            </View>

            <View className="mt-3 h-[1px] bg-slate-200" />

            {/* Body */}
            <View className="mt-3 gap-2">
              <Meta icon="car-outline">
                {item.vehicle} — {item.plate}
              </Meta>
              <Meta icon="construct-outline">{item.service}</Meta>
              {item.landmark ? <Meta icon="location-outline">{item.landmark}</Meta> : null}
              {item.lat && item.lng ? (
                <Meta icon="pin-outline">
                  ({item.lat.toFixed(5)}, {item.lng.toFixed(5)})
                </Meta>
              ) : null}
              <Meta icon="time-outline">{item.time}</Meta>
            </View>

            {/* Keep Open in Maps in the modal only */}
            <View className="mt-4">
              <SolidButton
                label="Open in Google Maps"
                color={COLORS.primary}
                icon="navigate-outline"
                onPress={() => onOpenMaps(item)}
              />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ---------------------------------- Card ----------------------------------- */
function RequestCard({
  item,
  onView,
  onAccept,
  onDecline,
}: {
  item: RequestItem;
  onView: (it: RequestItem) => void;
  onAccept: (it: RequestItem) => void;
  onDecline: (it: RequestItem) => void;
}) {
  return (
    <View
      className="mx-4 my-2 rounded-2xl bg-white p-4"
      style={[{ borderColor: COLORS.border, borderWidth: 1 }, shadow]}
    >
      <View className="flex-row items-start gap-3">
        {/* Avatar */}
        <View
          className="overflow-hidden rounded-xl"
          style={{ width: 64, height: 64, backgroundColor: "#F1F5F9" }}
        >
          {item.avatar ? (
            <RNImage source={{ uri: item.avatar }} style={{ width: "100%", height: "100%" }} />
          ) : (
            <View className="h-full w-full items-center justify-center">
              <Ionicons name="person-outline" size={22} color="#475569" />
            </View>
          )}
        </View>

        {/* Content */}
        <View className="flex-1">
          <View className="flex-row items-center justify-between">
            <Text className="text-[16px] font-extrabold text-slate-900 flex-1" numberOfLines={2}>
              {item.name}
            </Text>
            <StatusPill status={item.status} />
          </View>

          <View className="mt-1 flex-row flex-wrap items-center gap-x-3 gap-y-1">
            <Meta icon="car-outline">
              {item.vehicle} • {item.plate}
            </Meta>
            <Meta icon="construct-outline">{item.service}</Meta>
          </View>

          <View className="mt-1 flex-row flex-wrap items-center gap-x-3 gap-y-1">
            <Meta icon="time-outline">{item.time}</Meta>
            {typeof item.distanceKm === "number" && (
              <Meta icon="navigate-outline">{item.distanceKm.toFixed(1)} km</Meta>
            )}
          </View>

          {item.landmark ? (
            <Text className="mt-2 text-[13px] text-slate-700" numberOfLines={2}>
              {item.landmark}
            </Text>
          ) : null}

          {/* Actions: Decline (red), Accept (green), View Details (blue on the right) */}
          <View className="mt-3 flex-row items-center gap-3">
            <SolidButton
              label="Decline"
              color={COLORS.danger}
              icon="close-outline"
              onPress={() => onDecline(item)}
            />
            <SolidButton
              label="Accept"
              color={COLORS.success}
              icon="checkmark-outline"
              onPress={() => onAccept(item)}
            />
            {/* Replaced Open Location: View Details inherits the blue bg and right position */}
            <SolidButton
              label="View Details"
              color={COLORS.primary}
              icon="information-circle-outline"
              onPress={() => onView(item)}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

/* --------------------------------- Screen ---------------------------------- */
export default function RequestScreen() {
  const [rows, setRows] = useState<RequestItem[]>(INITIAL);
  const [selected, setSelected] = useState<RequestItem | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const data = useMemo(() => rows, [rows]);

  const openMaps = (it: RequestItem) => {
    if (it.lat && it.lng) {
      const url = `https://www.google.com/maps/search/?api=1&query=${it.lat},${it.lng}`;
      Linking.openURL(url).catch(() => {});
    } else if (it.landmark) {
      const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        it.landmark
      )}`;
      Linking.openURL(url).catch(() => {});
    }
  };

  const setStatus = (id: string, status: RequestItem["status"]) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));

  const handleAccept = (it: RequestItem) => setStatus(it.id, "accepted");
  const handleDecline = (it: RequestItem) => setStatus(it.id, "canceled");

  const viewDetails = (it: RequestItem) => {
    setSelected(it);
    setDetailsOpen(true);
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: COLORS.bg }}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-6 py-3 bg-white">
        <Text className="text-[20px] font-extrabold text-[#1F2A44]">Request</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* List */}
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingVertical: 10, paddingBottom: 24 }}
        renderItem={({ item }) => (
          <RequestCard
            item={item}
            onView={viewDetails}
            onAccept={handleAccept}
            onDecline={handleDecline}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 2 }} />}
        ListEmptyComponent={
          <View className="mt-16 items-center">
            <Ionicons name="document-outline" size={28} color={COLORS.muted} />
            <Text className="mt-2 text-slate-500">No requests found.</Text>
          </View>
        }
      />

      {/* Details modal (with Open in Maps inside) */}
      <DetailsModal
        visible={detailsOpen}
        item={selected}
        onClose={() => setDetailsOpen(false)}
        onOpenMaps={openMaps}
      />
    </SafeAreaView>
  );
}
