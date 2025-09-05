import React, { useState } from "react";
import { View, Text, Image, Pressable } from "react-native";
import { Link } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { Ionicons } from "@expo/vector-icons";

// ⬅️ adjust this path if your component lives elsewhere
import SideDrawer from "../../components/SideDrawer";

export default function DriverHome() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <SafeAreaView className="flex-1 bg-[#EDF2FB]">
      {/* Drawer (overlay) */}
      <SideDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        logoSource={require("../../assets/images/logo2.png")}
        appName="RIDERESCUE"
        onLogout={() => {
          // TODO: clear auth + navigate to login
          console.log("logout");
        }}
      />

      {/* Header (minimal) */}
      <View className="flex-row items-center justify-between px-6 py-3 bg-[#0F2547]">
        <View className="flex-row items-center gap-3">
          <Image
            source={require("../../assets/images/logo2.png")}
            className="w-10 h-10"
            resizeMode="contain"
          />
          <Text className="text-white text-xl font-semibold">Ride Rescue</Text>
        </View>

        <Pressable
          className="p-2 rounded-lg active:opacity-80"
          android_ripple={{ color: "rgba(255,255,255,0.18)", borderless: true }}
          accessibilityLabel="Open menu"
          onPress={() => setDrawerOpen(true)}
        >
          <Ionicons name="menu" size={24} color="#fff" />
        </Pressable>
      </View>

      {/* Body */}
      <View className="flex-1 px-6">
        <Text className="mt-6 text-[20px] font-semibold text-[#0F2547]">
          Help Services
        </Text>
        <Text className="mt-1 text-[13px] text-[#64748B]">Nearby services</Text>

        {/* Services surface (floating) */}
        <View className="mt-4 rounded-2xl bg-white p-5 border border-slate-200 shadow-sm">
          {/* 2×2 grid */}
          <View className="flex-row flex-wrap -mx-2">
            <TileWrap>
              <Tile
                iconSrc={require("../../assets/images/vulcanizing.png")}
                labelTop="Vulcanizing"
                labelBottom="Shops"
                href="/driver/vulcanizing"
              />
            </TileWrap>

            <TileWrap>
              <Tile
                iconSrc={require("../../assets/images/repair_shop.png")}
                labelTop="Repair"
                labelBottom="Shop"
                href="/driver/repair"
              />
            </TileWrap>

            <TileWrap>
              <Tile
                iconSrc={require("../../assets/images/gas_station.png")}
                labelTop="Gas"
                labelBottom="Station"
                href="/driver/gas"
              />
            </TileWrap>

            <TileWrap>
              <Tile
                iconSrc={require("../../assets/images/others.png")}
                labelTop="Other Help"
                labelBottom="Services"
                href="/driver/others"
              />
            </TileWrap>
          </View>
        </View>

        {/* Bigger Circular SOS */}
        <View className="items-center">
          <Link href="/driver/sos" asChild>
            <Pressable
              className="mt-8 w-28 h-28 items-center justify-center rounded-full bg-[#E53935] shadow-lg"
              android_ripple={{ color: "rgba(0,0,0,0.08)" }}
              accessibilityRole="button"
              accessibilityLabel="Send SOS"
            >
              <Text className="text-white text-[22px] font-extrabold tracking-wide">
                SOS
              </Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </SafeAreaView>
  );
}

/** 1/2 width for clean 2×2 grid with even gutters */
function TileWrap({ children }: { children: React.ReactNode }) {
  return <View className="w-1/2 px-2 mb-4">{children}</View>;
}

/** Bigger tile + smaller font so labels always fit */
function Tile({
  iconSrc,
  labelTop,
  labelBottom,
  href,
}: {
  iconSrc: any;
  labelTop: string;
  labelBottom: string;
  href: string;
}) {
  return (
    <Link href={href} asChild>
      <Pressable
        className="h-40 items-center justify-start rounded-2xl border border-slate-200 bg-white active:opacity-85 pt-4 pb-3"
        android_ripple={{ color: "rgba(0,0,0,0.04)" }}
      >
        {/* Icon circle */}
        <View className="w-[80px] h-[80px] rounded-full bg-slate-100 items-center justify-center mb-3">
          <Image source={iconSrc} resizeMode="contain" className="w-9 h-9" />
        </View>

        {/* Labels: smaller font, clamp to 2 lines */}
        <Text
          numberOfLines={2}
          ellipsizeMode="tail"
          className="px-2 text-center text-[12px] leading-[16px] text-[#111827]"
        >
          {labelTop}
          {"\n"}
          {labelBottom}
        </Text>
      </Pressable>
    </Link>
  );
}
