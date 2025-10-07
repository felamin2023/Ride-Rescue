// components/ShopDetailsSheet.tsx
import React, { useState } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as Location from "expo-location";
import { supabase } from "../utils/supabase";

/** Combined shape for shop_details + places */
export type ShopInitial = {
  services?: string | null;
  certificate_url?: string | null;
  time_open?: string | null;
  time_close?: string | null;
  days?: string | null;
  is_verified?: boolean;
  shop_id?: string;
  place_id?: string | null;
  /** joined from places */
  name?: string | null;
  category?: string | null;
  service_for?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  maps_link?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  userId?: string;
  initial: ShopInitial;
  onSaved: (data: ShopInitial) => void;
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const CATEGORY_OPTIONS = [
  { label: "Repair Shop", value: "repair_shop" },
  { label: "Vulcanizing", value: "vulcanizing" },
  { label: "Vulcanizing and Repair Shop", value: "vulcanizing_repair" },
];


const SERVICE_FOR_OPTIONS = [
  { label: "Motorcycles only", value: "motorcycle" },
  { label: "Cars or four-wheeled vehicles only", value: "car" },
  { label: "All types of vehicles", value: "all_type" },
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const isTime = (v?: string | null) =>
  !!(v ?? "").match(/^(?:[01]?\d|2[0-3]):[0-5]\d$/);

const parseJSONSafe = <T,>(input: string | null, fallback: T): T => {
  try {
    return input ? (JSON.parse(input) as T) : fallback;
  } catch {
    return fallback;
  }
};

/* ---------- Reusable small components ---------- */
function InputField({
  label,
  value,
  onChangeText,
  placeholder,
  editable = true,
  multiline = false,
}: any) {
  return (
    <View className="mb-3">
      <Text className="text-[12px] mb-1 text-[#64748B]">{label}</Text>
      <TextInput
        value={value ?? ""}
        onChangeText={onChangeText}
        placeholder={placeholder}
        editable={editable}
        multiline={multiline}
        className="bg-white border rounded-xl px-4 py-3 text-[#0F172A]"
        style={{ borderColor: "#E5E9F0", opacity: editable ? 1 : 0.6 }}
      />
    </View>
  );
}

function Dropdown({
  label,
  value,
  options,
  onSelect,
  disabled,
}: {
  label: string;
  value?: string | null;
  options: string[];
  onSelect: (v: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View className="mb-3">
      <Text className="text-[12px] mb-1 text-[#64748B]">{label}</Text>
      <Pressable
        onPress={() => !disabled && setOpen(true)}
        className="rounded-xl border px-4 py-3 bg-[#F8FAFC]"
        style={{
          borderColor: "#E5E9F0",
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <Text className="text-[#0F172A]">
          {value || "Select an option"}
        </Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade">
        <Pressable
          onPress={() => setOpen(false)}
          className="flex-1 bg-black/40 justify-center p-6"
        >
          <View className="bg-white rounded-2xl p-4">
            <Text className="font-semibold mb-2 text-[#0F172A]">{label}</Text>
            {options.map((opt) => (
              <Pressable
                key={opt}
                onPress={() => {
                  onSelect(opt);
                  setOpen(false);
                }}
                className="py-2 border-b border-slate-100"
              >
                <Text className="text-[#0F172A]">{opt}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

/* ---------- MAIN ---------- */
export default function ShopDetailsSheet({
  open,
  onClose,
  userId,
  initial,
  onSaved,
}: Props) {
  // existing fields
  const [services, setServices] = useState(initial.services ?? "");
  const [timeOpen, setTimeOpen] = useState(initial.time_open ?? "");
  const [timeClose, setTimeClose] = useState(initial.time_close ?? "");
  const [days, setDays] = useState<string[]>(
    parseJSONSafe(initial.days ?? null, [])
  );
  const [certs, setCerts] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // places fields
  const [shopName, setShopName] = useState(initial.name ?? "");
  const [category, setCategory] = useState(initial.category ?? "");
  const [serviceFor, setServiceFor] = useState(initial.service_for ?? "");
  const [address, setAddress] = useState(initial.address ?? "");
  const [latitude, setLatitude] = useState(initial.latitude ?? null);
  const [longitude, setLongitude] = useState(initial.longitude ?? null);
  const [mapsLink, setMapsLink] = useState(initial.maps_link ?? null);
  const [placeId, setPlaceId] = useState(initial.place_id ?? null);

  /* ---------- pick certs ---------- */
  const addCert = (file: { uri: string; name: string; mime: string | null; size?: number }) => {
    if (file.size && file.size > MAX_FILE_SIZE) {
      setError(`${file.name} too large (max 10MB).`);
      return;
    }
    setCerts((p) => [...p, file]);
  };

  const pickDocs = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      multiple: true,
      type: ["application/pdf", "image/*"],
    });
    if (!res.canceled && res.assets) {
      res.assets.forEach((f) =>
        addCert({ uri: f.uri, name: f.name, mime: f.mimeType ?? null })
      );
    }
  };

  /* ---------- location ---------- */
  // Add this new state near your other useState lines:
const [locating, setLocating] = useState(false);

// Replace the whole useCurrentLocation function:
const useCurrentLocation = async () => {
  try {
    setLocating(true); // show waiting modal
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      setLocating(false);
      Alert.alert("Permission denied", "Location access is required.");
      return;
    }

    const loc = await Location.getCurrentPositionAsync({});
    const lat = loc.coords.latitude;
    const lon = loc.coords.longitude;
    setLatitude(lat);
    setLongitude(lon);
    const link = `https://www.google.com/maps?q=${lat},${lon}`;
    setMapsLink(link);

    const rev = await Location.reverseGeocodeAsync(loc.coords);
    if (rev[0]) {
      setAddress(
        `${rev[0].name || ""} ${rev[0].street || ""}, ${rev[0].city || ""}`
      );
    }

    Alert.alert("Success", "Location set successfully!");
  } catch (e: any) {
    Alert.alert("Location error", e?.message || "Failed to get location");
  } finally {
    setLocating(false); // close waiting modal
  }
};


const handleSave = async () => {
  if (!userId) return;
  if (!shopName.trim()) {
    setError("Shop name is required.");
    return;
  }
  if (!isTime(timeOpen) || !isTime(timeClose)) {
    setError("Please use 24-hour time like 09:00.");
    return;
  }

  try {
    setSaving(true);
    setError(null);

    // === Get the shop_id of the current user ===
    const { data: shopRow, error: shopErr } = await supabase
      .from("shop_details")
      .select("shop_id, place_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (shopErr) throw shopErr;

    const currentShopId = shopRow?.shop_id ?? null;
    let pid = shopRow?.place_id ?? placeId ?? null; // <-- use place_id from DB if available

    // === Normalize values for backend (match constraint) ===
    const normalizeCategory = (cat?: string | null) => {
      if (!cat) return null;
      const map: Record<string, string> = {
        "Repair Shop": "repair_shop",
        "Vulcanizing": "vulcanizing",
        "Vulcanizing and Repair Shop": "vulcanizing_repair",
      };
      return map[cat] ?? cat.toLowerCase().replace(/\s+/g, "_");
    };

    const normalizeServiceFor = (s?: string | null) => {
      if (!s) return null;
      const map: Record<string, string> = {
        "Motorcycles only": "motorcycle",
        "Cars or four-wheeled vehicles only": "car",
        "All types of vehicles": "all_type",
      };
      return map[s] ?? s.toLowerCase().replace(/\s+/g, "_");
    };

    // === Prepare payload for 'places' ===
    const placePayload = {
      name: shopName.trim(),
      category: normalizeCategory(category),
      service_for: normalizeServiceFor(serviceFor),
      address: address || null,
      latitude: latitude,
      longitude: longitude,
      maps_link: mapsLink,
      owner: currentShopId, // use shop_id instead of userId
    };

    // === Update or Insert into 'places' ===
    if (pid) {
      const { error: upErr } = await supabase
        .from("places")
        .update(placePayload)
        .eq("place_id", pid);

      if (upErr) throw upErr;
    } else {
      const { data, error: insErr } = await supabase
        .from("places")
        .insert(placePayload)
        .select("place_id")
        .single();

      if (insErr) throw insErr;
      pid = data.place_id;

      // link new place to shop_details
      await supabase
        .from("shop_details")
        .update({ place_id: pid })
        .eq("shop_id", currentShopId);
    }

    // === Save 'shop_details' ===
    const payload = {
      user_id: userId,
      services: services || null,
      certificate_url: JSON.stringify([]),
      time_open: timeOpen,
      time_close: timeClose,
      days: JSON.stringify(days),
      place_id: pid,
    };

    const { data: savedRow, error: upErr2 } = await supabase
      .from("shop_details")
      .upsert(payload, { onConflict: "user_id" })
      .select("*, place_id")
      .single();

    if (upErr2) throw upErr2;

    onSaved({
      ...initial,
      ...payload,
      ...placePayload,
      place_id: pid,
    });

    onClose();
  } catch (e: any) {
    setError(e?.message ?? "Failed to save shop details.");
  } finally {
    setSaving(false);
  }
};


  if (!open) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black/40">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1 justify-end"
        >
          <View className="bg-white rounded-t-3xl max-h-[90%]">
            {/* Header */}
            <View className="items-center pt-3">
              <View className="h-1.5 w-12 rounded-full bg-gray-300" />
            </View>
            <View className="flex-row items-center justify-between px-5 py-3">
              <Pressable onPress={onClose}>
                <Ionicons name="close" size={22} color="#0F172A" />
              </Pressable>
              <Text className="text-[16px] font-semibold text-[#0F172A]">
                Shop Details
              </Text>
              <Pressable onPress={handleSave} disabled={saving}>
                {saving ? (
                  <ActivityIndicator />
                ) : (
                  <Text className="text-[14px] font-semibold text-[#0F2547]">
                    Save
                  </Text>
                )}
              </Pressable>
            </View>

            <ScrollView
              className="px-5"
              contentContainerStyle={{ paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}
            >
              <Text className="text-[13px] font-bold mb-2 text-[#0F172A]">
                Shop Information
              </Text>

              <InputField
                label="Shop Name"
                value={shopName}
                onChangeText={setShopName}
                placeholder="e.g., Juan's Auto Repair"
              />
              <Dropdown
                label="Type of Shop"
                value={
                  CATEGORY_OPTIONS.find((opt) => opt.value === category)?.label || "Select"
                }
                options={CATEGORY_OPTIONS.map((opt) => opt.label)}
                onSelect={(label) => {
                  const selected = CATEGORY_OPTIONS.find((opt) => opt.label === label);
                  setCategory(selected?.value ?? "");
                }}
              />

              <Dropdown
                label="Service Offered To"
                value={
                  SERVICE_FOR_OPTIONS.find((opt) => opt.value === serviceFor)?.label || "Select"
                }
                options={SERVICE_FOR_OPTIONS.map((opt) => opt.label)}
                onSelect={(label) => {
                  const selected = SERVICE_FOR_OPTIONS.find((opt) => opt.label === label);
                  setServiceFor(selected?.value ?? "");
                }}
              />

              <InputField
                label="Address"
                value={address}
                onChangeText={setAddress}
                placeholder="Street, City, Province"
                multiline
              />

              <Pressable
                onPress={useCurrentLocation}
                className="mt-1 self-start bg-[#E8F1FF] px-3 py-2 rounded-xl flex-row items-center gap-2"
              >
                <Ionicons name="location-outline" size={16} color="#0F2547" />
                <Text className="text-[#0F2547] font-semibold text-[13px]">
                  Use Current Location
                </Text>
              </Pressable>

              <View className="mt-6">
                <Text className="text-[13px] font-bold mb-2 text-[#0F172A]">
                  Shop Schedule
                </Text>
                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <InputField
                      label="Time Open (24h)"
                      value={timeOpen}
                      onChangeText={setTimeOpen}
                      placeholder="09:00"
                    />
                  </View>
                  <View className="flex-1">
                    <InputField
                      label="Time Close (24h)"
                      value={timeClose}
                      onChangeText={setTimeClose}
                      placeholder="18:00"
                    />
                  </View>
                </View>
                <Text className="text-[12px] mb-1 text-[#64748B]">
                  Open Days (tap to toggle)
                </Text>
                <View className="flex-row flex-wrap gap-2 mb-3">
                  {DAYS.map((d) => (
                    <Pressable
                      key={d}
                      onPress={() =>
                        setDays((prev) =>
                          prev.includes(d)
                            ? prev.filter((x) => x !== d)
                            : [...prev, d]
                        )
                      }
                      className="px-3 py-2 rounded-full border"
                      style={{
                        borderColor: days.includes(d)
                          ? "#BFD9FF"
                          : "#E5E9F0",
                        backgroundColor: days.includes(d)
                          ? "#E8F1FF"
                          : "#F1F5F9",
                      }}
                    >
                      <Text
                        className="text-[12px]"
                        style={{
                          color: days.includes(d) ? "#0F2547" : "#0F172A",
                        }}
                      >
                        {d}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Certificates */}
              <View className="mt-6">
                <Text className="text-[13px] font-bold mb-2 text-[#0F172A]">
                  Proof of Business / Certificates
                </Text>
                <Pressable
                  onPress={pickDocs}
                  className="bg-[#F8FAFC] border border-[#E5E9F0] rounded-xl px-4 py-3 flex-row items-center gap-2"
                >
                  <Ionicons
                    name="cloud-upload-outline"
                    size={18}
                    color="#0F2547"
                  />
                  <Text className="text-[#0F2547] font-semibold text-[13px]">
                    Upload Files
                  </Text>
                </Pressable>

                {certs.length > 0 && (
                  <View className="mt-3">
                    {certs.map((c, i) => (
                      <View
                        key={i}
                        className="flex-row items-center border border-[#E5E9F0] rounded-xl px-3 py-2 mb-2"
                      >
                        <Ionicons
                          name="document-text-outline"
                          size={18}
                          color="#0F172A"
                        />
                        <Text className="ml-2 text-[#0F172A]">{c.name}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {error && (
                <Text className="text-xs text-red-500 mt-4 text-center">
                  {error}
                </Text>
              )}

              {/* WAITING MODAL */}
<Modal visible={locating} transparent animationType="fade">
  <View className="flex-1 items-center justify-center bg-black/40">
    <View className="bg-white p-6 rounded-2xl items-center">
      <ActivityIndicator size="large" color="#0F2547" />
      <Text className="mt-3 text-[#0F2547] font-semibold">
        Please wait, gathering location…
      </Text>
    </View>
  </View>
</Modal>

            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
