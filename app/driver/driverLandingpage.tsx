// app/(driver)/driverLandingpage.tsx
import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  Animated,
  Easing,
  Platform,
  StatusBar,
  Modal,
  ScrollView,
  Linking,
  Alert,
} from "react-native";
import { Link, useRouter } from "expo-router";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import SideDrawer from "../../components/SideDrawer";
import { useUnreadMessageCount } from "../../hooks/useUnreadMessageCount";
import { useUnreadNotificationCount } from "../../hooks/useUnreadNotificationCount"; 
import { supabase } from "../../utils/supabase";

/* ------------------------------ Design tokens ------------------------------ */
const COLORS = {
  bg: "#F4F6F8",
  surface: "#FFFFFF",
  border: "#E5E7EB",
  text: "#0F172A",
  sub: "#475569",
  muted: "#94A3B8",
  primary: "#2563EB",
  danger: "#E53935",
  brand: "#0F2547",
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

/* ================================ Screen ================================== */
export default function DriverHome() {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [otherVisible, setOtherVisible] = useState(false);
  const [pendingVisible, setPendingVisible] = useState(false);
  const [checkingSOS, setCheckingSOS] = useState(false);
  const insets = useSafeAreaInsets();
  const unreadMessageCount = useUnreadMessageCount();
  const unreadNotificationCount = useUnreadNotificationCount();

  /* ---------------------- LOCATION STATE ---------------------- */
  const [locationText, setLocationText] = useState<string>("Fetching location...");
  const [myCoords, setMyCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locPerm, setLocPerm] = useState<"granted" | "denied" | "unknown">("unknown");
  const [requestingLoc, setRequestingLoc] = useState(false);
  const [locationExpanded, setLocationExpanded] = useState(false);

  /* ----------------------------- SOS animation ---------------------------- */
  const pulse = useRef(new Animated.Value(0)).current;
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const ring3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    ).start();

    const makeRipple = (v: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, {
            toValue: 1,
            duration: 1800,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(v, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      );

    const a1 = makeRipple(ring1, 0);
    const a2 = makeRipple(ring2, 400);
    const a3 = makeRipple(ring3, 800);
    a1.start();
    a2.start();
    a3.start();
    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, [pulse, ring1, ring2, ring3]);

  const scale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.06],
  });
  const ringStyle = (v: Animated.Value) => ({
    transform: [
      { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.9] }) },
    ],
    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.28, 0] }),
  });

  /* ---------------------- LOCATION SETUP ---------------------- */
  // Reverse geocode: converts coordinates to human-readable address
  const reverseGeocode = useCallback(async (lat: number, lon: number): Promise<string> => {
    try {
      const res = await Location.reverseGeocodeAsync({
        latitude: lat,
        longitude: lon,
      });
      if (res.length > 0) {
        const p = res[0];
        const parts = [p.name, p.street, p.subregion || p.city, p.region, p.country].filter(Boolean);
        return parts.join(", ");
      }
    } catch {
      // Ignore error
    }
    return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  }, []);

  // Check and get location on mount
  const checkAndGetLocation = useCallback(async () => {
    setRequestingLoc(true);
    try {
      // Check current permission status
      const current = await Location.getForegroundPermissionsAsync();
      let status = current.status;

      // Request if not granted
      if (status !== "granted") {
        const req = await Location.requestForegroundPermissionsAsync();
        status = req.status;
      }

      setLocPerm(status === "granted" ? "granted" : "denied");

      if (status === "granted") {
        // Get current position
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        setMyCoords({ lat, lng });

        // Get human-readable address
        const address = await reverseGeocode(lat, lng);
        setLocationText(address);
      } else {
        setLocationText("Location permission denied");
      }
    } catch (err) {
      console.error("[Location] Error:", err);
      setLocationText("Unable to get location");
    } finally {
      setRequestingLoc(false);
    }
  }, [reverseGeocode]);

  // Run on mount
  useEffect(() => {
    checkAndGetLocation();
  }, [checkAndGetLocation]);

  /* ------------------------- SOS Press: pending check ------------------------- */
  const handleSOSPress = async () => {
    if (checkingSOS) return;
    setCheckingSOS(true);
    try {
      const { data: userResp } = await supabase.auth.getUser();
      const userId = userResp?.user?.id;

      if (!userId) {
        router.push("/login");
        return;
      }

      // Look for any latest 'waiting' or 'in_process' emergency for this user
      const { data, error } = await supabase
        .from("emergency")
        .select("emergency_id")
        .eq("user_id", userId)
        .in("emergency_status", ["waiting", "in_process"])
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) {
        // If there's an error, fall back to normal navigation
        router.push("/driver/emergencyrequest");
        return;
      }

      const hasPending = !!data && data.length > 0;
      if (hasPending) {
        setPendingVisible(true);
      } else {
        router.push("/driver/emergencyrequest");
      }
    } finally {
      setCheckingSOS(false);
    }
  };

  return (
    <View className="flex-1" style={{ backgroundColor: COLORS.bg }}>
      {/* Keep status bar on brand color */}
      <StatusBar barStyle="light-content" backgroundColor={COLORS.brand} />

      {/* Drawer (overlay) */}
      <SideDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        logoSource={require("../../assets/images/logo2.png")}
        appName="RIDERESCUE"
        unreadMessageCount={unreadMessageCount}
        onLogout={() => console.log("logout")}
      />

      {/* Header wrapped in TOP-only SafeAreaView (no manual spacer) */}
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

          {/* RIGHT: Notifications + Burger */}
          <View className="flex-row items-center">
            {/* Notifications with Number Badge */}
<Pressable
  onPress={() => router.push("/driver/inbox")}
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

      {/* ===== Scrollable content ===== */}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Location Card with Expandable Dropdown */}
        <View className="px-6">
          <View
            className="rounded-2xl bg-white border border-slate-200 mt-3 overflow-hidden"
            style={cardShadow as any}
          >
            {/* Main Card - Clickable to expand */}
            <Pressable
              onPress={() => setLocationExpanded(!locationExpanded)}
              className="flex-row items-center px-4 py-3 active:opacity-90"
            >
              <View className="h-9 w-9 items-center justify-center rounded-full bg-[#F1F5F9] mr-3">
                <Ionicons
                  name="navigate-outline"
                  size={18}
                  color={COLORS.brand}
                />
              </View>
              <View className="flex-1">
                <Text className="text-[12px] text-slate-500">
                  Current location
                </Text>
                <Text
                  className="text-[13px] font-semibold text-slate-900"
                  numberOfLines={1}
                >
                  {requestingLoc ? "Fetching..." : locationText}
                </Text>
              </View>
              
              {/* Chevron indicator
              <Ionicons
                name={locationExpanded ? "chevron-up" : "chevron-down"}
                size={18}
                color={COLORS.muted}
                style={{ marginRight: 8 }}
              /> */}
              
              {/* Refresh icon if permission granted */}
              {locPerm === "granted" && (
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation(); // Prevent card toggle
                    checkAndGetLocation();
                  }}
                  hitSlop={8}
                  disabled={requestingLoc}
                  className="ml-2"
                >
                  <Ionicons
                    name="refresh-outline"
                    size={18}
                    color={COLORS.brand}
                  />
                </Pressable>
              )}
            </Pressable>

            {/* Expandable Section - Shows full address */}
            {locationExpanded && (
              <View className="px-4 pb-4 pt-2 border-t border-slate-100">
                <View className="flex-row items-start">
                  <Ionicons
                    name="location-outline"
                    size={16}
                    color={COLORS.brand}
                    style={{ marginTop: 2, marginRight: 8 }}
                  />
                  <View className="flex-1">
                    <Text className="text-[11px] text-slate-500 mb-1">
                      Full Address:
                    </Text>
                    <Text className="text-[13px] text-slate-900 leading-5">
                      {locationText}
                    </Text>
                    
                    {/* Show coordinates if available */}
                    {myCoords && (
                      <Text className="text-[11px] text-slate-400 mt-2">
                        Coordinates: {myCoords.lat.toFixed(6)}, {myCoords.lng.toFixed(6)}
                      </Text>
                    )}
                  </View>
                </View>
              </View>
            )}
          </View>

          {/* Show settings button if permission denied */}
          {locPerm === "denied" && (
            <Pressable
              onPress={() => Linking.openSettings()}
              className="mt-2 flex-row items-center justify-center py-2 rounded-xl bg-blue-50"
            >
              <Ionicons name="settings-outline" size={14} color={COLORS.primary} />
              <Text className="ml-1.5 text-[12px] font-medium text-blue-600">
                Open Settings to Enable Location
              </Text>
            </Pressable>
          )}
        </View>

        {/* Emergency card + SOS */}
        <View className="px-6 mt-5">
          <View
            className="rounded-2xl bg-white p-5 border border-slate-200"
            style={cardShadow as any}
          >
            <View className="flex-row items-center">
              <View className="flex-1 pr-3">
                <Text className="text-[20px] font-extrabold text-slate-900">
                  Are you in an{"\n"}emergency?
                </Text>
                <Text className="mt-2 text-[12px] text-slate-600">
                  Press the SOS button. Your live location will be shared with
                  nearby services.
                </Text>
              </View>

              <View className="items-center justify-center">
                <View className="w-36 h-36 items-center justify-center">
                  <Animated.View
                    style={[
                      {
                        position: "absolute",
                        width: 144,
                        height: 144,
                        borderRadius: 999,
                        backgroundColor: COLORS.danger,
                      },
                      ringStyle(ring1),
                    ]}
                  />
                  <Animated.View
                    style={[
                      {
                        position: "absolute",
                        width: 144,
                        height: 144,
                        borderRadius: 999,
                        backgroundColor: COLORS.danger,
                      },
                      ringStyle(ring2),
                    ]}
                  />
                  <Animated.View
                    style={[
                      {
                        position: "absolute",
                        width: 144,
                        height: 144,
                        borderRadius: 999,
                        backgroundColor: COLORS.danger,
                      },
                      ringStyle(ring3),
                    ]}
                  />

                  <Pressable
                    disabled={checkingSOS}
                    onPress={handleSOSPress}
                    android_ripple={{ color: "rgba(0,0,0,0.08)" }}
                    className="items-center justify-center rounded-full"
                    style={{
                      width: 108,
                      height: 108,
                      backgroundColor: COLORS.danger,
                      opacity: checkingSOS ? 0.8 : 1,
                    }}
                  >
                    <Animated.View style={{ transform: [{ scale }] }}>
                      <Text className="text-white text-[22px] font-extrabold tracking-wide text-center">
                        {checkingSOS ? "..." : "SOS"}
                      </Text>
                    </Animated.View>
                  </Pressable>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Services surface (like the first design) */}
        <View className="px-6">
          <Text className="mt-6 text-[15px] font-semibold text-[#182231]">
            Nearby Services:
          </Text>

          <View
            className="mt-4 rounded-2xl bg-white p-5 border border-slate-200"
            style={cardShadow as any}
          >
            <View className="flex-row flex-wrap -mx-2">
              <TileWrap>
                <Tile
                  iconSrc={require("../../assets/images/vulcanizing.png")}
                  labelTop="Vulcanizing"
                  labelBottom="Shops"
                  href="/driver/vulcanize"
                />
              </TileWrap>

              <TileWrap>
                <Tile
                  iconSrc={require("../../assets/images/repair_shop.png")}
                  labelTop="Repair"
                  labelBottom="Shop"
                  href="/driver/repairshop"
                />
              </TileWrap>

              <TileWrap>
                <Tile
                  iconSrc={require("../../assets/images/gas_station.png")}
                  labelTop="Gas"
                  labelBottom="Station"
                  href="/driver/gasstation"
                />
              </TileWrap>

              {/* Opens popup */}
              <TileWrap>
                <Tile
                  iconSrc={require("../../assets/images/others.png")}
                  labelTop="Other"
                  labelBottom="Services"
                  onPress={() => setOtherVisible(true)}
                />
              </TileWrap>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Modals */}
      <OtherServicesModal
        visible={otherVisible}
        onClose={() => setOtherVisible(false)}
      />

      <PendingEmergencyModal
        visible={pendingVisible}
        onClose={() => setPendingVisible(false)}
        onCheckStatus={() => {
          setPendingVisible(false);
          router.push("/driver/requeststatus");
        }}
      />
    </View>
  );
}

/* -------------------- Grid Wrapper -------------------- */
function TileWrap({ children }: { children: React.ReactNode }) {
  return <View className="w-1/2 px-2 mb-4">{children}</View>;
}

/* -------------------- Tile Component -------------------- */
function Tile({
  iconSrc,
  labelTop,
  labelBottom,
  href,
  onPress,
}: {
  iconSrc: any;
  labelTop: string;
  labelBottom: string;
  href?: string;
  onPress?: () => void;
}) {
  const content = (
    <Pressable
      className="
        overflow-hidden
        h-44
        items-center justify-start
        rounded-2xl border border-slate-200 bg-white
        active:opacity-85 pt-4 pb-3
      "
      android_ripple={{ color: "rgba(0,0,0,0.04)" }}
      onPress={onPress}
      style={cardShadow as any}
    >
      <View className="w-[72px] h-[72px] rounded-full bg-slate-100 items-center justify-center mb-3">
        <Image source={iconSrc} resizeMode="contain" className="w-8 h-8" />
      </View>

      <Text
        numberOfLines={2}
        className="w-full px-4 text-center text-[12px] leading-[16px] text-[#111827]"
      >
        {labelTop}
        {"\n"}
        {labelBottom}
      </Text>
    </Pressable>
  );

  if (href && !onPress) {
    return (
      <Link href={href} asChild>
        {content}
      </Link>
    );
  }
  return content;
}

/* -------------------- Other Services Modal -------------------- */
function OtherServicesModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const items: Array<{
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    href: string;
  }> = [
    { icon: "medkit-outline", label: "Hospital", href: "/driver/hospital" },
    { icon: "shield-outline", label: "Police Station", href: "/driver/police" },
    {
      icon: "flame-outline",
      label: "Fire Station",
      href: "/driver/firestation",
    },
    { icon: "megaphone-outline", label: "MDRRMO", href: "/driver/mdrrmo" },
  ];

  const Item = ({
    icon,
    label,
    href,
  }: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    href: string;
  }) => (
    <Link href={href} asChild>
      <Pressable
        className="items-center justify-center w-full h-28 rounded-xl border border-slate-200 bg-white active:opacity-90"
        android_ripple={{ color: "rgba(0,0,0,0.05)" }}
        style={cardShadow as any}
      >
        <View className="w-14 h-14 rounded-full items-center justify-center bg-[#F1F5F9]">
          <Ionicons name={icon} size={28} color={COLORS.brand} />
        </View>
        <Text className="text-[13px] text-[#0F2547] mt-2 text-center">
          {label}
        </Text>
      </Pressable>
    </Link>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      {/* Backdrop */}
      <Pressable className="flex-1 bg-black/40" onPress={onClose}>
        {/* Centered sheet */}
        <Pressable
          className="flex-1 items-center justify-center px-6"
          onPress={() => {}}
        >
          <View className="w-full max-w-md rounded-2xl p-6 bg-white">
            <Text className="text-center text-[18px] font-semibold text-[#0F2547] mb-5">
              Other Services
            </Text>

            {/* 2-col grid */}
            <View className="flex-row flex-wrap -mx-2">
              {items.map((it, idx) => (
                <View key={idx} className="w-1/2 px-2 mb-4">
                  <Item icon={it.icon} label={it.label} href={it.href} />
                </View>
              ))}
            </View>

            <Pressable
              onPress={onClose}
              className="self-center mt-2 px-6 py-2 rounded-xl bg-white border border-slate-200"
              android_ripple={{ color: "rgba(0,0,0,0.06)" }}
            >
              <Text className="text-[#0F2547] font-medium">Close</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* -------------------- Pending Emergency Modal -------------------- */
function PendingEmergencyModal({
  visible,
  onClose,
  onCheckStatus,
}: {
  visible: boolean;
  onClose: () => void;
  onCheckStatus: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black/40 items-center justify-center px-6">
        <View className="w-full max-w-md rounded-2xl p-6 bg-white border border-slate-200">
          <Text className="text-[18px] font-semibold text-[#0F2547] mb-2">
            Pending Request!
          </Text>
          <Text className="text-[13px] text-slate-600 mb-5">
            You still have a pending emergency post. You can check its status or
            close this message.
          </Text>

          <View className="flex-row justify-end gap-3">
            <Pressable
              onPress={onClose}
              className="px-4 py-2 rounded-xl bg-white border border-slate-200"
              android_ripple={{ color: "rgba(0,0,0,0.06)" }}
            >
              <Text className="text-[#0F2547] font-medium">Close</Text>
            </Pressable>

            <Pressable
              onPress={onCheckStatus}
              className="px-4 py-2 rounded-xl"
              style={{ backgroundColor: COLORS.primary }}
              android_ripple={{ color: "rgba(255,255,255,0.2)" }}
            >
              <Text className="text-white font-semibold">Check status</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
