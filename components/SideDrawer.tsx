// app/components/SideDrawer.tsx
import React, { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Dimensions,
  Pressable,
  View,
  Image,
  Text,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, usePathname, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../utils/supabase";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const DRAWER_WIDTH = Math.min(300, SCREEN_WIDTH * 0.78);

type Item = {
  label: string;
  href: string;
  icon: keyof typeof Ionicons.glyphMap;
};

export type SideDrawerProps = {
  open: boolean;
  onClose: () => void;
  items?: Item[];
  onLogout?: () => void | Promise<void>;
  postLogoutHref?: string;
  logoSource?: any;
  appName?: string;
  // Add these new props for counts
  unreadMessageCount?: number;
  unreadNotificationCount?: number;
};

const DEFAULT_ITEMS: Item[] = [
  { label: "Home", href: "/driver/driverLandingpage", icon: "home-outline" },
  {
    label: "Profile",
    href: "/driver/driverprofile",
    icon: "person-circle-outline",
  },
  {
    label: "Messages",
    href: "/driver/message",
    icon: "chatbubble-ellipses-outline",
  },
  {
    label: "Request Status",
    href: "/driver/requeststatus",
    icon: "document-text-outline",
  },
  {
    label: "Transactions",
    href: "/driver/transactionhistory",
    icon: "receipt-outline",
  },
  { label: "Reviews", href: "/driver/reviews", icon: "star-outline" },
];

// Badge Component
function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  
  return (
    <View className="bg-red-500 rounded-full min-w-[20px] h-[20px] justify-center items-center">
      <Text className="text-white text-[10px] font-bold px-1">
        {count > 99 ? "99+" : count}
      </Text>
    </View>
  );
}

export default function SideDrawer({
  open,
  onClose,
  items,
  onLogout,
  postLogoutHref = "/(auth)/login",
  logoSource,
  appName = "RIDERESCUE",
  // New props with defaults
  unreadMessageCount = 0,
  unreadNotificationCount = 0,
}: SideDrawerProps) {
  const pathname = usePathname();
  const router = useRouter();

  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const navItems = useMemo(() => items ?? DEFAULT_ITEMS, [items]);

  useEffect(() => {
    if (open) {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: -DRAWER_WIDTH,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [open, opacity, translateX]);

  const handleLogout = async () => {
    try {
      onClose(); // close drawer immediately

      // Get current user first
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        // Update online status first - this is the most important part
        const { error: updateError } = await supabase
          .from("app_user")
          .update({ 
            is_online: false,
          })
          .eq("user_id", user.id);

        if (updateError) {
          console.error("Failed to update online status:", updateError);
        }
      }

      // Call custom logout handler if provided
      if (onLogout) {
        await onLogout();
      } else {
        // Default logout behavior - this will also disconnect any realtime channels
        await supabase.auth.signOut();
      }

      // Navigate after everything is complete
      router.replace(postLogoutHref);
      
    } catch (e: any) {
      console.error("Logout error:", e);
      Alert.alert("Logout failed", e?.message ?? "Please try again.");
    }
  };

  return (
    <>
      {/* Backdrop */}
      <Animated.View
        pointerEvents={open ? "auto" : "none"}
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "rgba(0,0,0,0.35)",
          opacity,
          zIndex: 40,
        }}
      >
        <Pressable style={{ flex: 1 }} onPress={onClose} />
      </Animated.View>

      {/* Drawer panel */}
      <Animated.View
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: DRAWER_WIDTH,
          transform: [{ translateX }],
          zIndex: 50,
        }}
      >
        <SafeAreaView className="flex-1 bg-white rounded-r-3xl shadow-2xl">
          {/* Header */}
          <View className="items-center px-5 pb-4 border-b border-slate-200">
            <View className="w-full items-center justify-center bg-[#0F2547] rounded-2xl mt-2 px-5 py-4">
              {logoSource ? (
                <Image
                  source={logoSource}
                  className="w-14 h-14"
                  resizeMode="contain"
                />
              ) : (
                <View className="w-14 h-14 rounded-full bg-white/10 items-center justify-center">
                  <Ionicons name="car-sport-outline" size={28} color="#fff" />
                </View>
              )}
              <Text className="mt-2 text-white text-base font-semibold tracking-wide">
                {appName}
              </Text>
            </View>
          </View>

          {/* Menu items */}
          <View className="flex-1">
            {navItems.map((it) => {
              const active = pathname === it.href;
              return (
                <Link key={it.href} href={it.href} asChild onPress={onClose}>
                  <Pressable
                    android_ripple={{ color: "rgba(15,37,71,0.08)" }}
                    className={`flex-row items-center gap-4 px-6 py-4 ${
                      active ? "bg-slate-100" : "bg-transparent"
                    }`}
                  >
                    <View className="relative">
                      <Ionicons
                        name={it.icon}
                        size={22}
                        color={active ? "#0F2547" : "#111827"}
                      />
                      
                      {/* Show badge for Messages */}
                      {it.label === "Messages" && unreadMessageCount > 0 && (
                        <View className="absolute -top-2 -right-2 bg-red-500 rounded-full min-w-[18px] h-[18px] justify-center items-center border-2 border-white">
                          <Text className="text-white text-[10px] font-bold">
                            {unreadMessageCount > 99 ? "99+" : unreadMessageCount}
                          </Text>
                        </View>
                      )}
                      
                      {/* Show badge for Notifications */}
                      {it.label === "Notifications" && unreadNotificationCount > 0 && (
                        <View className="absolute -top-2 -right-2 bg-red-500 rounded-full min-w-[18px] h-[18px] justify-center items-center border-2 border-white">
                          <Text className="text-white text-[10px] font-bold">
                            {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
                          </Text>
                        </View>
                      )}
                    </View>
                    
                    <Text
                      className={`text-[16px] flex-1 ${
                        active
                          ? "text-[#0F2547] font-semibold"
                          : "text-[#111827]"
                      }`}
                      numberOfLines={1}
                    >
                      {it.label}
                    </Text>

                    {/* Show badge on the right side as alternative option */}
                    {/* Uncomment below if you prefer badges on the right side */}
                    {/* 
                    {it.label === "Messages" && <Badge count={unreadMessageCount} />}
                    {it.label === "Notifications" && <Badge count={unreadNotificationCount} />}
                    */}
                  </Pressable>
                </Link>
              );
            })}
          </View>

          {/* Logout */}
          <View className="px-5 pb-6 pt-2">
            <Pressable
              onPress={handleLogout}
              className="w-full rounded-2xl bg-slate-100 px-5 py-3 active:opacity-90"
              android_ripple={{
                color: "rgba(15,37,71,0.12)",
                borderless: false,
              }}
              accessibilityRole="button"
              accessibilityLabel="Logout"
            >
              <View className="flex-row items-center justify-center gap-2">
                <Ionicons name="log-out-outline" size={20} color="#0F2547" />
                <Text className="text-[#0F2547] font-semibold">Logout</Text>
              </View>
            </Pressable>
          </View>
        </SafeAreaView>
      </Animated.View>
    </>
  );
}