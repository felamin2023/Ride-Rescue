import React, { useState } from "react";
import { View, Text, Image, Pressable, Modal } from "react-native";
import { Link } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

// ⬅️ adjust this path if your component lives elsewhere
import SideDrawer from "../../components/SideDrawer";

export default function DriverHome() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [otherVisible, setOtherVisible] = useState(false);

  return (
    <SafeAreaView className="flex-1 bg-[#EDF2FB]">
      {/* Drawer (overlay) */}
      <SideDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        logoSource={require("../../assets/images/logo2.png")}
        appName="RIDERESCUE"
        onLogout={() => {
          console.log("logout");
        }}
      />

      {/* Header */}
      <View className="flex-row items-center justify-between px-6 py-3 bg-[#0F2547]">
        <View className="flex-row items-center gap-3">
          <Image
            source={require("../../assets/images/logo2.png")}
            className="w-14 h-14"
            resizeMode="contain"
          />
          <Text className="text-white text-[21px] font-semibold">Ride Rescue</Text>
        </View>

        <Pressable
          className="p-2 rounded-lg active:opacity-80"
          android_ripple={{ color: "rgba(255,255,255,0.18)", borderless: true }}
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

        {/* Services surface */}
        <View className="mt-4 rounded-2xl bg-white p-5 border border-slate-200 shadow-sm">
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
                labelTop="Other Help"
                labelBottom="Services"
                onPress={() => setOtherVisible(true)}
              />
            </TileWrap>
          </View>
        </View>

        {/* SOS Button */}
        <View className="items-center">
          <Link href="/driver/sos" asChild>
            <Pressable
              className="mt-8 w-28 h-28 items-center justify-center rounded-full bg-[#E53935] shadow-lg"
              android_ripple={{ color: "rgba(0,0,0,0.08)" }}
            >
              <Text className="text-white text-[22px] font-extrabold tracking-wide">
                SOS
              </Text>
            </Pressable>
          </Link>
        </View>
      </View>

      {/* Other Services Modal */}
      <OtherServicesModal
        visible={otherVisible}
        onClose={() => setOtherVisible(false)}
      />
    </SafeAreaView>
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
      <Pressable className="items-center justify-center w-full py-3 rounded-xl">
        <View className="w-14 h-14 rounded-full items-center justify-center border border-slate-300">
          <Ionicons name={icon} size={28} color="#0F2547" />
        </View>
        <Text className="text-[13px] text-[#0F2547] mt-2 text-center">{label}</Text>
      </Pressable>
    </Link>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/40" onPress={onClose}>
        <View className="flex-1 items-center justify-center px-6">
          <Pressable className="w-full max-w-md rounded-2xl p-6 bg-white" onPress={() => {}}>
            <Text className="text-center text-[18px] font-semibold text-[#0F2547] mb-5">
              Other Services
            </Text>

            <View className="flex-row flex-wrap -mx-2">
              <View className="w-1/2 px-2 mb-4">
                <Item icon="medkit-outline" label="Hospital" href="/driver/hospital" />
              </View>
              <View className="w-1/2 px-2 mb-4">
                <Item icon="ambulance-outline" label="Rescue/MDRRMO" href="/driver/rescue" />
              </View>
              <View className="w-1/2 px-2">
                <Item icon="shield-outline" label="Police Station" href="/driver/police" />
              </View>
              <View className="w-1/2 px-2">
                <Item icon="flame-outline" label="Fire Station" href="/driver/firestation" />
              </View>
            </View>

            <Pressable
              onPress={onClose}
              className="self-center mt-6 px-6 py-2 rounded-xl bg-white border border-slate-200"
              android_ripple={{ color: "rgba(0,0,0,0.06)" }}
            >
              <Text className="text-[#0F2547] font-medium">Close</Text>
            </Pressable>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}
