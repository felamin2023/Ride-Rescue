// app/(driver)/driverLandingpage.tsx
import React, { useEffect, useRef, useState } from "react";
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
} from "react-native";
import { Link } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import SideDrawer from "../../components/SideDrawer";

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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [otherVisible, setOtherVisible] = useState(false);
  const insets = useSafeAreaInsets();

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
          Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      );

    const a1 = makeRipple(ring1, 0);
    const a2 = makeRipple(ring2, 400);
    const a3 = makeRipple(ring3, 800);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, [pulse, ring1, ring2, ring3]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  const ringStyle = (v: Animated.Value) => ({
    transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.9] }) }],
    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.28, 0] }),
  });

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

      {/* ===== Scrollable content ===== */}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Location */}
        <View className="px-6">
          <View
            className="flex-row items-center rounded-2xl bg-white px-4 py-3 border border-slate-200 mt-3"
            style={cardShadow as any}
          >
            <View className="h-9 w-9 items-center justify-center rounded-full bg-[#F1F5F9] mr-3">
              <Ionicons name="navigate-outline" size={18} color={COLORS.brand} />
            </View>
            <View className="flex-1">
              <Text className="text-[12px] text-slate-500">Current location</Text>
              <Text className="text-[13px] font-semibold text-slate-900">
              4th Mound Road, California
            </Text>
            </View>
          </View>
        </View>

        {/* Emergency card + SOS */}
        <View className="px-6 mt-5">
          <View className="rounded-2xl bg-white p-5 border border-slate-200" style={cardShadow as any}>
            <View className="flex-row items-center">
              <View className="flex-1 pr-3">
                <Text className="text-[20px] font-extrabold text-slate-900">Are you in an{"\n"}emergency?</Text>
                <Text className="mt-2 text-[12px] text-slate-600">
                  Press the SOS button. Your live location will be shared with nearby services.
                </Text>
              </View>

              <View className="items-center justify-center">
                <View className="w-36 h-36 items-center justify-center">
                  <Animated.View
                    style={[
                      { position: "absolute", width: 144, height: 144, borderRadius: 999, backgroundColor: COLORS.danger },
                      ringStyle(ring1),
                    ]}
                  />
                  <Animated.View
                    style={[
                      { position: "absolute", width: 144, height: 144, borderRadius: 999, backgroundColor: COLORS.danger },
                      ringStyle(ring2),
                    ]}
                  />
                  <Animated.View
                    style={[
                      { position: "absolute", width: 144, height: 144, borderRadius: 999, backgroundColor: COLORS.danger },
                      ringStyle(ring3),
                    ]}
                  />
                  <Link href="/driver/emergencyrequest" asChild>
                    <Pressable
                      android_ripple={{ color: "rgba(0,0,0,0.08)" }}
                      className="items-center justify-center rounded-full"
                      style={{ width: 108, height: 108, backgroundColor: COLORS.danger }}
                    >
                      <Animated.View style={{ transform: [{ scale }] }}>
                        <Text className="text-white text-[22px] font-extrabold tracking-wide text-center">SOS</Text>
                      </Animated.View>
                    </Pressable>
                  </Link>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Services surface (like the first design) */}
        <View className="px-6">
          <Text className="mt-6 text-[15px] font-semibold text-[#182231]">Nearby Services:</Text>

          <View className="mt-4 rounded-2xl bg-white p-5 border border-slate-200" style={cardShadow as any}>
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

      {/* Other Services Modal */}
      <OtherServicesModal visible={otherVisible} onClose={() => setOtherVisible(false)} />
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

      <Text numberOfLines={2} className="w-full px-4 text-center text-[12px] leading-[16px] text-[#111827]">
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
    { icon: "flame-outline", label: "Fire Station", href: "/driver/firestation" },
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
        <Text className="text-[13px] text-[#0F2547] mt-2 text-center">{label}</Text>
      </Pressable>
    </Link>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* Backdrop */}
      <Pressable className="flex-1 bg-black/40" onPress={onClose}>
        {/* Centered sheet */}
        <Pressable className="flex-1 items-center justify-center px-6" onPress={() => {}}>
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
