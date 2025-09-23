// components/AdminSideDrawer.tsx
import React from "react";
import { View, Text, Pressable, Image, ScrollView } from "react-native";
import { Link, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

const COLORS = {
  brand: "#0F2547",
};

const menu = [
  { label: "Dashboard", icon: "grid-outline" as const, href: "/(admin)/admindashboard" },
  { label: "Shops & Mechanics", icon: "build-outline" as const, href: "/(admin)/adminshop-mechanic" },
  { label: "Users", icon: "people-outline" as const, href: "/(admin)/adminusers" },
  //{ label: "Payments", icon: "card-outline" as const, href: "/(admin)/payments" },
];

type Props = {
  width?: number;
};

export default function AdminSideDrawer({ width = 220 }: Props) {
  const router = useRouter();

  return (
    <View style={{ width }} className="border-r border-slate-200 bg-white">
      {/* Logo */}
      <View className="border-b border-slate-200 px-5 py-4 flex-row items-center gap-3">
        <Image
          source={require("../assets/images/logo2.png")}
          style={{ width: 36, height: 36, borderRadius: 8 }}
          resizeMode="contain"
        />
        <Text className="text-[15px] font-extrabold" style={{ color: COLORS.brand }}>
          RIDERESCUE
        </Text>
      </View>

      {/* Menu */}
      <ScrollView>
        {menu.map((m) => (
          <Link key={m.label} href={m.href} asChild>
            <Pressable className="mx-2 my-1 flex-row items-center gap-3 rounded-md px-3 py-2 hover:bg-slate-100">
              <Ionicons name={m.icon} size={18} color="#475569" />
              <Text className="text-[13px] text-slate-700">{m.label}</Text>
            </Pressable>
          </Link>
        ))}
      </ScrollView>
    </View>
  );
}
