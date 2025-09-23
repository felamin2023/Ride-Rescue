// components/ConfirmModal.tsx
import React from "react";
import { Modal, View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Tone = "warning" | "danger" | "info" | "success" | "none";

export default function ConfirmModal({
  visible,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  tone = "info",
  showIcon = true,                 // ✅ new prop with default true
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: Tone;
  showIcon?: boolean;              // ✅ new prop type
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const iconName: Record<Exclude<Tone, "none">, keyof typeof Ionicons.glyphMap> = {
    info: "information-circle-outline",
    warning: "warning-outline",
    danger: "alert-circle-outline",
    success: "checkmark-circle-outline",
  };

  const tint: Record<Exclude<Tone, "none">, string> = {
    info: "#2563EB",
    warning: "#F59E0B",
    danger: "#DC2626",
    success: "#16A34A",
  };

  // ✅ Only show icon if showIcon = true AND tone isn’t "none"
  const shouldShowIcon = showIcon && tone !== "none";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.3)" }}>
        <View className="w-[92%] sm:w-[520px] rounded-xl bg-white p-4">
          <View className="flex-row items-start gap-3">
            {shouldShowIcon ? (
              <Ionicons
                name={iconName[(tone as Exclude<Tone, "none">) || "info"]}
                size={24}
                color={tint[(tone as Exclude<Tone, "none">) || "info"]}
              />
            ) : null}

            <View className="flex-1">
              {!!title && (
                <Text style={{ color: "#0F172A", fontWeight: "700", fontSize: 16 }}>{title}</Text>
              )}
              {!!message && (
                <Text style={{ color: "#475569", marginTop: 4, fontSize: 13 }}>{message}</Text>
              )}
            </View>
          </View>

          <View className="mt-5 flex-row justify-end gap-2">
            <Pressable onPress={onCancel} className="rounded-lg border px-3 py-2" style={{ borderColor: "#E5E9F0" }}>
              <Text style={{ color: "#0F172A" }}>{cancelText}</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              className="rounded-lg px-3 py-2"
              style={{ backgroundColor: "#E8F1FF", borderColor: "#C7D7FE", borderWidth: 1 }}
            >
              <Text style={{ color: "#1D4ED8" }}>{confirmText}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
