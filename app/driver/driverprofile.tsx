// app/(driver)/driverprofile.tsx
import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  Image,
  Switch,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

/** Card shadow that looks nice on both platforms */
const cardShadow = Platform.select({
  ios: {
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  android: { elevation: 3 },
});

/** Simple reusable row */
function ListItem({
  icon,
  label,
  value,
  onPress,
  chevron = true,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
  chevron?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center px-4 py-4 active:opacity-80"
      android_ripple={{ color: "#e5e7eb" }}
    >
      <View className="w-9 h-9 rounded-full bg-[#F1F5F9] items-center justify-center mr-3">
        <Ionicons name={icon} size={18} color="#0F172A" />
      </View>
      <View className="flex-1">
        <Text className="text-[15px] text-[#0F172A]">{label}</Text>
        {value ? (
          <Text className="text-[12px] text-[#64748B] mt-0.5">{value}</Text>
        ) : null}
      </View>
      {chevron && (
        <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
      )}
    </Pressable>
  );
}

export default function DriverProfile() {
  const router = useRouter();
  const [notifOn, setNotifOn] = useState(true);

  return (
    <SafeAreaView className="flex-1 bg-[#EAF1F6]">
      {/* Header */}
      <View className="bg-[#0F2547] pb-5">
        <View className="flex-row items-center justify-between px-4 pt-2">
          <Pressable
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full items-center justify-center"
            android_ripple={{ color: "rgba(255,255,255,0.2)", borderless: true }}
          >
            <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
          </Pressable>
          <Text className="text-white text-[17px] font-semibold">Account</Text>
          <View className="w-10" />
        </View>

        {/* Profile block */}
        <View className="items-center mt-4 mb-3">
          <View className="w-20 h-20 rounded-full overflow-hidden border-2 border-white">
            <Image
              source={{
                uri:
                  "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?q=80&w=200&auto=format&fit=crop",
              }}
              className="w-full h-full"
            />
          </View>
          <Text className="text-white text-base font-medium mt-3">
            Marie T Wiedman
          </Text>
          <Text className="text-[#D1E0FF] text-xs">marie@gmail.com</Text>
        </View>
      </View>

      {/* Content */}
      <ScrollView
        className="-mt-6"
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Main card */}
        <View className="bg-white mx-4 rounded-2xl" style={cardShadow as any}>
          <ListItem
            icon="person-circle"
            label="Change Profile"
            value="Name, photo, bio"
            onPress={() => router.push("/(driver)/edit-profile")}
          />
          <View className="h-[1px] bg-[#EEF2F7] mx-4" />

          <ListItem
            icon="settings-outline"
            label="Change Settings"
            value="Preferences & privacy"
            onPress={() => router.push("/(driver)/settings")}
          />
          <View className="h-[1px] bg-[#EEF2F7] mx-4" />

          <ListItem
            icon="call-outline"
            label="Edit Contact"
            value="Phone, email, address"
            onPress={() => router.push("/(driver)/edit-contact")}
          />
          <View className="h-[1px] bg-[#EEF2F7] mx-4" />

          {/* Notification Preference (toggle row) */}
          <View className="flex-row items-center px-4 py-4">
            <View className="w-9 h-9 rounded-full bg-[#F1F5F9] items-center justify-center mr-3">
              <Ionicons name="notifications-outline" size={18} color="#0F172A" />
            </View>
            <View className="flex-1">
              <Text className="text-[15px] text-[#0F172A]">
                Notification Preference
              </Text>
              <Text className="text-[12px] text-[#64748B] mt-0.5">
                Push alerts & sounds
              </Text>
            </View>
            <Switch value={notifOn} onValueChange={setNotifOn} />
          </View>
          <View className="h-[1px] bg-[#EEF2F7] mx-4" />

          <ListItem
            icon="car-outline"
            label="Vehicle Details"
            value="Plate, make & model"
            onPress={() => router.push("/(driver)/vehicle-details")}
          />
        </View>

        {/* Secondary card (optional quick links) */}
        <View
          className="bg-white mx-4 mt-4 rounded-2xl"
          style={cardShadow as any}
        >
          <ListItem
            icon="information-circle-outline"
            label="About"
            onPress={() => router.push("/(public)/about")}
          />
          <View className="h-[1px] bg-[#EEF2F7] mx-4" />
          <ListItem
            icon="lock-closed-outline"
            label="Privacy Policy"
            onPress={() => router.push("/(public)/privacy")}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
