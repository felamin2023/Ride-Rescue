// components/EditContactSheet.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Animated,
  PanResponder,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../utils/supabase";

/* ---------------- helpers ---------------- */
function validatePhone(p?: string): string | null {
  const raw = (p ?? "").trim();
  if (!raw) return null; // phone optional; return message if you want to force it
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7) return "Please enter a valid phone number.";
  return null;
}

/* simple, self-contained dialog (like your DriverProfile’s DialogModal) */
type DialogAction = { label: string; onPress?: () => void; variant?: "primary" | "secondary" | "danger" };
function MiniDialog({
  visible,
  title,
  message,
  actions = [],
  onClose,
}: {
  visible: boolean;
  title?: string;
  message?: string;
  actions?: DialogAction[];
  onClose: () => void;
}) {
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/35 p-4">
        <View className="w-full rounded-2xl border border-gray-200 bg-white p-5">
          {!!title && <Text className="mb-2 text-base font-extrabold text-gray-900">{title}</Text>}
          {!!message && <Text className="text-gray-900">{message}</Text>}
          {actions?.length ? (
            <View className="mt-4 flex-row justify-end gap-2 flex-wrap">
              {actions.map((a, i) => {
                const base = "px-4 py-2 rounded-xl items-center justify-center min-w-[90px]";
                const styleByVariant =
                  a.variant === "primary"
                    ? "bg-[#2563EB]"
                    : a.variant === "danger"
                    ? "border border-red-300"
                    : "border border-gray-300";
                const textByVariant = a.variant === "primary" ? "text-white font-extrabold" : "text-gray-900 font-bold";
                return (
                  <Pressable key={i} className={`${base} ${styleByVariant}`} onPress={a.onPress}>
                    <Text className={textByVariant}>{a.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <Pressable onPress={onClose} className="mt-3 items-center">
            <Text className="text-xs text-gray-500 underline">Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/* ---------------- component ---------------- */
type Props = {
  open: boolean;
  onClose: () => void;
  /** optional: if not provided, we’ll fetch auth user id */
  userId?: string;
  /** prefill values */
  initial?: { phone?: string | null; address?: string | null };
  /** called after successful save */
  onSaved?: (next: { phone: string; address: string }) => void;
  /** optional title override */
  title?: string;
};

export default function EditContactSheet({
  open,
  onClose,
  userId,
  initial,
  onSaved,
  title = "Edit Contact",
}: Props) {
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // dialog
  const [dOpen, setDOpen] = useState(false);
  const [dTitle, setDTitle] = useState<string | undefined>(undefined);
  const [dMsg, setDMsg] = useState<string | undefined>(undefined);
  const [dActions, setDActions] = useState<DialogAction[]>([]);
  const showDialog = (
    t?: string,
    m?: string,
    acts: DialogAction[] = [{ label: "OK", variant: "primary", onPress: () => setDOpen(false) }]
  ) => {
    setDTitle(t);
    setDMsg(m);
    setDActions(
      acts.map((a) => ({
        ...a,
        onPress: () => {
          setDOpen(false);
          setTimeout(() => a.onPress?.(), 10);
        },
      }))
    );
    setDOpen(true);
  };

  // sheet animation / gestures (same feel as your profile sheet)
  const sheetY = useRef(new Animated.Value(0)).current;
  const dismissNow = () => {
    onClose();
    sheetY.setValue(0);
  };
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
        onMoveShouldSetPanResponderCapture: (_e, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_e, g) => sheetY.setValue(g.dy > 0 ? g.dy : Math.max(-20, g.dy)),
        onPanResponderRelease: (_e, g) => {
          const shouldClose = g.dy > 120 || g.vy > 0.8;
          if (shouldClose) {
            if (dirty) {
              Animated.spring(sheetY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start(() => {
                showDialog("Discard changes?", "You have unsaved edits.", [
                  { label: "Cancel", variant: "secondary" },
                  { label: "Discard", variant: "danger", onPress: dismissNow },
                ]);
              });
            } else {
              Animated.timing(sheetY, { toValue: 600, duration: 220, useNativeDriver: true }).start(dismissNow);
            }
          } else {
            Animated.spring(sheetY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
          }
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderTerminate: () => {
          Animated.spring(sheetY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
        },
      }),
    [dirty]
  );
  // 🚫 while saving, disable drag handlers (prevents accidental close)
  const panHandlers = saving ? {} : (panResponder.panHandlers as any);

  // when opened, reset from initial
  useEffect(() => {
    if (open) {
      setPhone(initial?.phone ?? "");
      setAddress(initial?.address ?? "");
      setDirty(false);
      sheetY.setValue(0);
    }
  }, [open, initial?.phone, initial?.address, sheetY]);

  const handleClose = () => {
    // 🚫 don't allow closing while saving
    if (saving) return;
    if (!dirty) return dismissNow();
    showDialog("Discard changes?", "You have unsaved edits.", [
      { label: "Cancel", variant: "secondary" },
      { label: "Discard", variant: "danger", onPress: dismissNow },
    ]);
  };

  const handleSave = async () => {
    const pErr = validatePhone(phone);
    if (pErr) return showDialog("Invalid phone", pErr);

    try {
      setSaving(true);

      // ensure we have uid
      let uid = userId ?? null;
      if (!uid) {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        uid = data.user?.id ?? null;
      }
      if (!uid) throw new Error("Not signed in. Please log in again.");

      const { error: upErr } = await supabase
        .from("app_user")
        .update({
          phone: phone.trim() || null,
          address: address.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", uid);

      if (upErr) throw upErr;

      onSaved?.({ phone: phone.trim(), address: address.trim() });
      setDirty(false);

      Animated.timing(sheetY, { toValue: 600, duration: 220, useNativeDriver: true }).start(dismissNow);
    } catch (e: any) {
      showDialog("Save failed", e?.message ?? "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <Modal visible animationType="fade" transparent statusBarTranslucent onRequestClose={handleClose}>
      <View className="flex-1 bg-black/40">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 justify-end">
          <Animated.View className="bg-white rounded-t-3xl max-h-[90%]" style={{ transform: [{ translateY: sheetY }] }}>
            <View {...panHandlers}>
              {/* drag handle + header */}
              <View className="items-center pt-3">
                <View className="h-1.5 w-12 rounded-full bg-gray-300" />
              </View>

              <View className="flex-row items-center justify-between px-5 py-3">
                <Pressable
                  onPress={handleClose}
                  disabled={saving} // 🔒 block closing while saving
                  className="px-3 py-2 -ml-2 rounded-lg active:opacity-80"
                  android_ripple={{ color: "#e5e7eb" }}
                >
                  <Ionicons name="close" size={22} color="#0F172A" />
                </Pressable>
                <Text className="text-[16px] font-semibold text-[#0F172A]">{title}</Text>
                <Pressable
                  onPress={handleSave}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-lg active:opacity-80"
                  android_ripple={{ color: "#e5e7eb" }}
                >
                  {saving ? <ActivityIndicator /> : <Text className="text-[14px] font-semibold text-[#0F2547]">Save</Text>}
                </Pressable>
              </View>
            </View>

            {/* body */}
            <ScrollView
              className="px-5"
              contentContainerStyle={{ paddingBottom: 24 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              pointerEvents={saving ? "none" : "auto"} // 🔒 freeze touches while saving
            >
              <View className="gap-3 mt-1">
                <View>
                  <Text className="text-[12px] mb-1 text-[#64748B]">Phone</Text>
                  <TextInput
                    editable={!saving} // 🔒
                    value={phone}
                    onChangeText={(t) => {
                      setPhone(t);
                      setDirty(true);
                    }}
                    keyboardType="phone-pad"
                    placeholder="+63 900 000 0000"
                    className="bg-white border rounded-xl px-4 py-3"
                    style={{ borderColor: "#E5E9F0" }}
                  />
                  <Text className="text-[11px] text-[#64748B] mt-1">Use digits only or +country code (e.g., +63).</Text>
                </View>

                <View>
                  <Text className="text-[12px] mb-1 text-[#64748B]">Address</Text>
                  <TextInput
                    editable={!saving} // 🔒
                    value={address}
                    onChangeText={(t) => {
                      setAddress(t);
                      setDirty(true);
                    }}
                    placeholder="House/Street, Barangay, City"
                    className="bg-white border rounded-xl px-4 py-3"
                    style={{ borderColor: "#E5E9F0" }}
                    multiline
                    textAlignVertical="top"
                  />
                </View>
              </View>
            </ScrollView>

            {/* 🔒 subtle overlay (no spinner) so it's visually frozen */}
            {saving && <View className="absolute inset-0 bg-white/40 rounded-t-3xl" />}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>

      {/* dialog */}
      <MiniDialog visible={dOpen} title={dTitle} message={dMsg} actions={dActions} onClose={() => setDOpen(false)} />
    </Modal>
  );
}
