// components/AdminTopHeader.tsx
import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { supabase } from "../utils/supabase"; // <-- adjust path if your utils lives elsewhere

const COLORS = {
  brand: "#0F2547",
};

type AdminTopHeaderProps = {
  /** Optional page title. Defaults to "Dashboard" for backward compatibility. */
  title?: string;
  /** Optional display name for the profile button. Defaults to "Admin". */
  userName?: string;
  /** Optional logout handler. If provided, it will be used instead of the built-in one. */
  onLogout?: () => void | Promise<void>;
};

export default function AdminTopHeader({
  title = "Dashboard",
  userName = "Admin",
  onLogout,
}: AdminTopHeaderProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const handleLogout = async () => {
    setOpen(false);
    try {
      // Sign out from Supabase
      await supabase.auth.signOut();
    } catch (_) {
      // ignore; we'll still navigate away
    } finally {
      // IMPORTANT: use the public route (no group prefix in URL)
      router.replace("/adminlogin");
    }
  };

  return (
    <View className="h-14 flex-row items-center justify-between border-b border-slate-200 bg-white px-4">
      {/* Title (now dynamic) */}
      <Text className="text-[18px] font-bold text-slate-900">{title}</Text>

      {/* Profile dropdown */}
      <View className="relative">
        <Pressable
          onPress={() => setOpen(!open)}
          className="flex-row items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5"
        >
          <Ionicons name="person-circle-outline" size={20} color={COLORS.brand} />
          <Text className="text-[12px] text-slate-800">{userName}</Text>
          <Ionicons
            name={open ? "chevron-up-outline" : "chevron-down-outline"}
            size={16}
            color="#475569"
          />
        </Pressable>

        {open && (
          <View className="absolute right-0 mt-2 w-28 rounded-md border bg-white shadow-md">
            <Pressable
              className="px-3 py-2 hover:bg-slate-100"
              onPress={async () => {
                if (onLogout) {
                  setOpen(false);
                  await onLogout();
                } else {
                  await handleLogout();
                }
              }}
            >
              <Text className="text-sm text-slate-700">Logout</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}
