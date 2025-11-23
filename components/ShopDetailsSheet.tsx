// components/ShopDetailsSheet.tsx
import React, { useEffect, useMemo, useState } from "react";
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
  Linking,
  Image,
  Alert,
  TouchableOpacity,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as Location from "expo-location";
import { supabase } from "../utils/supabase";
import { buildMapboxBrowserUrl } from "../utils/mapbox";

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
  /** If true, when a storage object no longer exists, we also remove its path from DB JSON. Default false (UI-only cleanup). */
  autoCleanupMissingInDB?: boolean;
};

/* -------------------- constants -------------------- */
// Use string arrays instead of const assertions to avoid type issues
const ALL_SERVICES: string[] = [
  "Oil Change",
  "Engine Tune-up",
  "Brake Repair",
  "Transmission Service",
  "Wheel Alignment",
  "Tire Rotation",
  "Tire Replacement",
  "Wheel Balancing",
  "Wheel Repair",
  "Battery Replacement",
  "Battery Jumpstart",
  "Electrical System Repair",
  "Suspension Repair",
  "Air Conditioning Service",
  "Exhaust System Repair",
  "Diagnostic Services",
  "Radiator Flush",
  "Fuel System Cleaning",
  "Fuel Delivery",
  "Belt and Hose Replacement",
  "Headlight Restoration",
  "Windshield Wiper Replacement",
  "Vulcanizing/Tire Patching",
  "Minor Engine Repair",
  "Towing",
];

// Fuel types for gas stations in the Philippines
const FUEL_TYPES: string[] = [
  "Unleaded (91)",
  "Premium Unleaded (95)",
  "Super Premium (97)",
  "Diesel",
  "Premium Diesel",
  "E10 (Unleaded with 10% ethanol)",
  "E85 (Ethanol 85%)",
  "LPG (Liquefied Petroleum Gas)",
  "CNG (Compressed Natural Gas)",
];

const DAYS: string[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const DAY_KEY_TO_LABEL: Record<string, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};

/** NEW: reverse map so we can save as keys like "mon" */
const LABEL_TO_DAY_KEY: Record<string, string> = {
  Mon: "mon",
  Tue: "tue",
  Wed: "wed",
  Thu: "thu",
  Fri: "fri",
  Sat: "sat",
  Sun: "sun",
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const BUCKET = "certificates";

// UPDATED: Added Gas Station category
const CATEGORY_OPTIONS = [
  { label: "Repair Shop", value: "repair_shop" },
  { label: "Vulcanizing", value: "vulcanizing" },
  { label: "Vulcanizing and Repair Shop", value: "vulcanizing_repair" },
  { label: "Gas Station", value: "gas_station" },
];

const SERVICE_FOR_OPTIONS = [
  { label: "Motorcycles only", value: "motorcycle" },
  { label: "Cars or four-wheeled vehicles only", value: "car" },
  { label: "All types of vehicles", value: "all_type" },
];

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const { height: screenHeight } = Dimensions.get('window');

/* -------------------- helpers -------------------- */
const isTime = (v?: string | null) =>
  !!(v ?? "").match(/^(?:[01]?\d|2[0-3]):[0-5]\d$/);

function parseServiceSetFromCommaString(s?: string | null) {
  if (!s) return new Set<string>();
  return new Set(
    s.split(",").map((x) => x.trim()).filter(Boolean)
  );
}
function stringifyServiceSet(set: Set<string>) {
  return Array.from(set).join(", ");
}

// Legacy days parsing
function parseDaysToSetFromLabelString(s?: string | null) {
  const set = new Set<string>();
  if (!s) return set;
  const v = s.trim();
  if (!v) return set;

  if (v.includes("–") || v.includes("-")) {
    const parts = v.replace("–", "-").split("-");
    if (parts.length === 2) {
      const start = parts[0].trim();
      const end = parts[1].trim();
      const si = DAYS.indexOf(start);
      const ei = DAYS.indexOf(end);
      if (si !== -1 && ei !== -1) {
        if (si <= ei) {
          for (let i = si; i <= ei; i++) set.add(DAYS[i]);
        } else {
          for (let i = si; i < DAYS.length; i++) set.add(DAYS[i]);
          for (let i = 0; i <= ei; i++) set.add(DAYS[i]);
        }
        return set;
      }
    }
  }
  v.split(",").map((x) => x.trim()).forEach((d) => {
    if (DAYS.includes(d)) set.add(d);
  });
  return set;
}
function stringifyDaysSet(set: Set<string>) {
  if (set.size === 7) return "Mon–Sun";
  return DAYS.filter((d) => set.has(d)).join(", ");
}

// Accept both JSON arrays and strings
function normalizeServices(input?: string | null): Set<string> {
  if (!input) return new Set<string>();
  try {
    const parsed = JSON.parse(input);
    if (Array.isArray(parsed)) {
      const cleaned = parsed.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean);
      return new Set<string>(cleaned);
    }
  } catch {}
  return parseServiceSetFromCommaString(input);
}

function normalizeDays(input?: string | null): Set<string> {
  if (!input) return new Set<string>();
  try {
    const parsed = JSON.parse(input);
    if (Array.isArray(parsed)) {
      const labels = parsed
        .map((k) => (typeof k === "string" ? DAY_KEY_TO_LABEL[k.toLowerCase()] : undefined))
        .filter((v): v is string => !!v);
      return new Set<string>(labels);
    }
  } catch {}
  return parseDaysToSetFromLabelString(input);
}

/** NEW: convert selected labels (Mon, Tue, ...) into key array ["mon","tue",...] */
function daySetToKeyArray(set: Set<string>): string[] {
  return DAYS.filter((d) => set.has(d)).map((label) => LABEL_TO_DAY_KEY[label]);
}

const isImageUrl = (u?: string | null) => {
  if (!u) return false;
  const clean = u.split("?")[0].toLowerCase();
  return /\.(png|jpe?g|webp|gif|heic|bmp)$/i.test(clean);
};

const sanitizeFileName = (name: string) => name.replace(/[^\w.-]+/g, "_");

const guessExtFrom = (name?: string, mime?: string | null) => {
  const n = name || "";
  const ext = n.includes(".") ? n.split(".").pop() : "";
  if (ext) return ext.toLowerCase();
  if (!mime) return "bin";
  const m = mime.split("/")[1] || "bin";
  return m.toLowerCase();
};

const guessContentType = (ext: string) => {
  switch (ext.toLowerCase()) {
    case "pdf": return "application/pdf";
    case "png": return "image/png";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "webp": return "image/webp";
    case "gif": return "image/gif";
    case "heic": return "image/heic";
    default: return "application/octet-stream";
  }
};

function parseCertPaths(input?: string | null): string[] {
  if (!input) return [];
  try {
    const parsed = JSON.parse(input);
    if (Array.isArray(parsed)) {
      return parsed.filter((p) => typeof p === "string" && p.trim().length > 0);
    }
  } catch {
    const s = input.trim();
    if (!s) return [];
    return [s];
  }
  return [];
}

async function urlExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

// Time validation helper for 12-hour format
const isValid12HourTime = (time: string): boolean => {
  if (!time) return false;
  const timeRegex = /^(0?[1-9]|1[0-2]):([0-5][0-9])\s?(AM|PM)$/i;
  return timeRegex.test(time.trim());
};

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
  options: { label: string; value: string }[];
  onSelect: (v: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selectedLabel = options.find(opt => opt.value === value)?.label || "Select an option";

  return (
    <View className="mb-3">
      <Text className="text-[12px] mb-1 text-[#64748B]">{label}</Text>
      <Pressable
        onPress={() => !disabled && setOpen(true)}
        className="rounded-xl border px-4 py-3 bg-white"
        style={{
          borderColor: "#E5E9F0",
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <Text className="text-[#0F172A]">
          {selectedLabel}
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
                key={opt.value}
                onPress={() => {
                  onSelect(opt.value);
                  setOpen(false);
                }}
                className="py-2 border-b border-slate-100"
              >
                <Text className="text-[#0F172A]">{opt.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// Improved Time Input Component with AM/PM Dropdown
function TimeInput({
  value,
  onChange,
  placeholder,
  editable = true,
}: {
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  editable?: boolean;
}) {
  const [timeValue, setTimeValue] = useState("");
  const [period, setPeriod] = useState<"AM" | "PM">("AM");
  const [showPeriodDropdown, setShowPeriodDropdown] = useState(false);

  // Initialize values from props
  React.useEffect(() => {
    if (value) {
      // Extract time and period from value
      let timePart = value;
      let newPeriod: "AM" | "PM" = "AM";
      
      if (value.includes(' ')) {
        const parts = value.split(' ');
        timePart = parts[0];
        newPeriod = (parts[1] as "AM" | "PM") || "AM";
      } else if (value.toLowerCase().includes('am') || value.toLowerCase().includes('pm')) {
        const lowerValue = value.toLowerCase();
        if (lowerValue.includes('pm')) {
          newPeriod = 'PM';
          timePart = value.replace(/pm/gi, '').trim();
        } else if (lowerValue.includes('am')) {
          newPeriod = 'AM';
          timePart = value.replace(/am/gi, '').trim();
        }
      }
      
      setTimeValue(timePart);
      setPeriod(newPeriod);
    } else {
      setTimeValue("");
      setPeriod("AM");
    }
  }, [value]);

  const handleTimeChange = (text: string) => {
    // Only allow numbers and colon
    const cleaned = text.replace(/[^0-9:]/g, '');
    
    // Auto-insert colon after 2 digits
    if (cleaned.length === 2 && timeValue.length === 1 && !cleaned.includes(':')) {
      const newValue = cleaned + ':';
      setTimeValue(newValue);
      onChange(`${newValue} ${period}`);
    } else if (cleaned.length <= 5) {
      setTimeValue(cleaned);
      // Update parent only if we have a complete time (has colon)
      if (cleaned.includes(':')) {
        onChange(`${cleaned} ${period}`);
      }
    }
  };

  const handlePeriodChange = (newPeriod: "AM" | "PM") => {
    setPeriod(newPeriod);
    setShowPeriodDropdown(false);
    if (timeValue) {
      onChange(`${timeValue} ${newPeriod}`);
    }
  };

  // Format display value to always show time with period
  const displayValue = timeValue ? `${timeValue} ${period}` : '';

  return (
    <View className="gap-1.5">
      <View
        className={`flex-row items-center rounded-xl border border-gray-300 bg-white overflow-hidden`}
        style={editable === false ? { opacity: 0.5 } : undefined}
      >
        <TextInput
          value={displayValue}
          onChangeText={handleTimeChange}
          placeholder={placeholder || "hh:mm AM/PM"}
          placeholderTextColor="#808080"
          className="flex-1 py-3 px-3 text-sm text-black"
          keyboardType="numbers-and-punctuation"
          editable={editable}
          maxLength={8} // "hh:mm AM" = 8 chars
        />
        
        <Pressable
          onPress={() => setShowPeriodDropdown(true)}
          disabled={!editable}
          className="flex-row items-center border-l border-gray-300 px-3 py-3 bg-gray-50"
        >
          <Text className="text-sm text-gray-700 mr-1">{period}</Text>
          <Ionicons name="chevron-down" size={16} color="#666" />
        </Pressable>
      </View>

      {/* Period Dropdown Modal */}
      <Modal visible={showPeriodDropdown} transparent animationType="fade">
        <Pressable
          onPress={() => setShowPeriodDropdown(false)}
          className="flex-1 justify-center items-center bg-black/25 p-4"
        >
          <View className="w-32 rounded-2xl border border-gray-200 bg-white p-2">
            <TouchableOpacity
              onPress={() => handlePeriodChange("AM")}
              className="px-3 py-3 border-b border-gray-100"
            >
              <Text className="text-sm text-gray-900">AM</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handlePeriodChange("PM")}
              className="px-3 py-3"
            >
              <Text className="text-sm text-gray-900">PM</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

/* --------------- certificates - actions dropdown --------------- */
function ActionsDropdown({
  label,
  onPick,
  disabled,
}: {
  label: string;
  onPick: (action: "camera" | "gallery" | "file") => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const items = [
    { label: "Take Photo", value: "camera" },
    { label: "Pick from Gallery", value: "gallery" },
    { label: "Choose File (PDF/Doc/Image)", value: "file" },
  ] as const;

  return (
    <View className="gap-1.5" style={disabled ? { opacity: 0.5 } : undefined}>
      <Text className="ml-1 text-xs text-gray-600">{label}</Text>
      <Pressable
        disabled={disabled}
        onPress={() => setOpen(true)}
        className="flex-row items-center justify-between rounded-xl border border-gray-300 bg-[#F7F8FA] px-3 py-3"
        android_ripple={{ color: "#e5e7eb" }}
      >
        <Text className="text-sm text-gray-700">{disabled ? "Please wait…" : "Select an action…"}</Text>
        <Ionicons name="chevron-down" size={18} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade">
        <Pressable
          onPress={() => setOpen(false)}
          className="flex-1 justify-center bg-black/25 p-4"
        >
          <View className="rounded-2xl border border-gray-200 bg-white p-3">
            <Text className="mb-2 font-bold text-gray-900">{label}</Text>
            {items.map((it) => (
              <TouchableOpacity
                key={it.value}
                activeOpacity={0.7}
                onPress={() => {
                  setOpen(false);
                  onPick(it.value);
                }}
                className="border-b border-slate-100 px-2 py-2"
              >
                <Text className="text-sm text-gray-900">{it.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

/* -------------------- main -------------------- */
type CertItem = {
  path?: string;          // storage path if uploaded already
  uri: string;            // public URL or local file://
  name: string;
  mime: string | null;
  isNew: boolean;
};

export default function ShopDetailsSheet({
  open,
  onClose,
  userId,
  initial,
  onSaved,
  autoCleanupMissingInDB = false,
}: Props) {
  // services/days state
  const [serviceSet, setServiceSet] = useState<Set<string>>(normalizeServices(initial.services));
  const [daySet, setDaySet] = useState<Set<string>>(normalizeDays(initial.days));

  // time - store and use 12-hour format directly
  const [timeOpen, setTimeOpen] = useState<string>(initial.time_open || "08:00 AM");
  const [timeClose, setTimeClose] = useState<string>(initial.time_close || "06:00 PM");

  // certificates
  const [certs, setCerts] = useState<CertItem[]>([]);
  const [serverPaths, setServerPaths] = useState<string[]>([]); // paths as fetched from DB (source of truth)
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  // places fields
  const [shopName, setShopName] = useState(initial.name ?? "");
  const [category, setCategory] = useState(initial.category ?? "");
  const [serviceFor, setServiceFor] = useState(initial.service_for ?? "");
  const [address, setAddress] = useState(initial.address ?? "");
  const [latitude, setLatitude] = useState(initial.latitude ?? null);
  const [longitude, setLongitude] = useState(initial.longitude ?? null);
  const [mapsLink, setMapsLink] = useState(initial.maps_link ?? null);
  const [placeId, setPlaceId] = useState(initial.place_id ?? null);

  // ui state
  const [saving, setSaving] = useState(false);
  const [pickerBusy, setPickerBusy] = useState(false);
  const [loadingShopDetails, setLoadingShopDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  // NEW: Determine if current shop is a gas station
  const isGasStation = useMemo(() => {
    return category === "gas_station";
  }, [category]);

  // ============ FETCH FROM DB ON OPEN (single source of truth) ============
  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;

    (async () => {
      try {
        setLoadingShopDetails(true);
        setError(null);
        setCerts([]); // clear immediately to avoid showing stale items

        const { data, error: fetchErr } = await supabase
          .from("shop_details")
          // also fetch place_id so we never drop it after saving
          .select("services, days, time_open, time_close, certificate_url, place_id")
          .eq("user_id", userId)
          .maybeSingle();

        if (fetchErr) throw fetchErr;
        if (!data || cancelled) return;

        setServiceSet(normalizeServices(data.services ?? null));
        setDaySet(normalizeDays(data.days ?? null));
        
        // Use 12-hour format directly from database
        setTimeOpen(data.time_open || "08:00 AM");
        setTimeClose(data.time_close || "06:00 PM");
        setPlaceId(data.place_id ?? null); // keep latest place_id

        const paths = parseCertPaths(data.certificate_url);
        setServerPaths(paths);

        // Build items with public URLs
        const items: CertItem[] = [];
        for (const p of paths) {
          let uri = p;
          if (!p.startsWith("http")) {
            const pub = supabase.storage.from(BUCKET).getPublicUrl(p);
            uri = pub.data.publicUrl;
          }
          const name = p.split("/").pop() || "certificate";
          items.push({ path: p, uri, name, mime: null, isNew: false });
        }

        // HEAD-check (filter out missing storage objects)
        const checks = await Promise.all(items.map((f) => urlExists(f.uri)));
        const kept = items.filter((_, i) => checks[i]);

        // Optionally clean DB JSON so it won't reappear later
        if (autoCleanupMissingInDB && kept.length !== items.length) {
          const keptPaths = kept.map((k) => k.path!).filter(Boolean);
          await supabase
            .from("shop_details")
            .update({ certificate_url: JSON.stringify(keptPaths) })
            .eq("user_id", userId);
          setServerPaths(keptPaths);
        }

        if (!cancelled) setCerts(kept);

        // Fetch places data if place_id exists
        if (data.place_id) {
          const { data: placeData, error: placeErr } = await supabase
            .from("places")
            .select("*")
            .eq("place_id", data.place_id)
            .maybeSingle();

          if (placeErr) throw placeErr;

          if (placeData && !cancelled) {
            setShopName(placeData.name ?? "");
            setCategory(placeData.category ?? "");
            setServiceFor(placeData.service_for ?? "");
            setAddress(placeData.address ?? "");
            setLatitude(placeData.latitude);
            setLongitude(placeData.longitude);
            setMapsLink(placeData.maps_link);
          }
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load shop details.");
      } finally {
        if (!cancelled) setLoadingShopDetails(false);
      }
    })();

    return () => { cancelled = true; };
  }, [open, userId, autoCleanupMissingInDB]);

  const canSave = useMemo(() => {
    const openValid = timeOpen && isValid12HourTime(timeOpen);
    const closeValid = timeClose && isValid12HourTime(timeClose);
    return openValid && closeValid && !loadingShopDetails && shopName.trim();
  }, [timeOpen, timeClose, loadingShopDetails, shopName]);

  const toggleService = (name: string) => {
    if (saving) return; // lock while saving
    setServiceSet((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleDay = (name: string) => {
    if (saving) return; // lock while saving
    setDaySet((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  // UPDATED: Select All functionality for services/fuel types based on shop category
  const handleSelectAllServices = () => {
    if (saving) return;
    const currentList = isGasStation ? FUEL_TYPES : ALL_SERVICES;
    if (serviceSet.size === currentList.length) {
      setServiceSet(new Set());
    } else {
      setServiceSet(new Set(currentList));
    }
  };

  // NEW: Select All functionality for days (matching signup.tsx)
  const handleSelectAllDays = () => {
    if (saving) return;
    if (daySet.size === DAYS.length) {
      setDaySet(new Set());
    } else {
      setDaySet(new Set(DAYS));
    }
  };

  /* -------------------- upload pickers -------------------- */
  const addCert = (file: { uri: string; name: string; mime: string | null; size?: number }) => {
    if (file.size && file.size > MAX_FILE_SIZE) {
      setError(`${file.name} is too large (max 10MB).`);
      return;
    }
    setCerts((prev) => [...prev, { path: undefined, uri: file.uri, name: file.name, mime: file.mime ?? null, isNew: true }]);
  };

  const pickFromCamera = async () => {
    try {
      setPickerBusy(true);
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") { setError("Camera access was denied."); return; }
      const res = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.9 });
      if (!res.canceled && res.assets?.[0]) {
        const a = res.assets[0];
        addCert({ uri: a.uri, name: a.fileName ?? "camera.jpg", mime: a.mimeType ?? "image/jpeg" });
      }
    } finally { setPickerBusy(false); }
  };

  const pickFromGallery = async () => {
    try {
      setPickerBusy(true);
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") { setError("Gallery access was denied."); return; }
      const res = await ImagePicker.launchImageLibraryAsync({ allowsMultipleSelection: true, quality: 1, selectionLimit: 10 });
      if (!res.canceled && res.assets) {
        res.assets.forEach((a, i) => addCert({ uri: a.uri, name: a.fileName ?? `image_${i}.jpg`, mime: a.mimeType ?? "image/jpeg" }));
      }
    } finally { setPickerBusy(false); }
  };

  const pickFromFiles = async () => {
    try {
      setPickerBusy(true);
      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/*"],
        multiple: true, copyToCacheDirectory: true,
      });
      if (!res.canceled && res.assets) {
        res.assets.forEach((f) => addCert({ uri: f.uri, name: f.name ?? "document", mime: f.mimeType ?? null, size: f.size || 0 }));
      }
    } finally { setPickerBusy(false); }
  };

  const handleCertAction = (action: "camera" | "gallery" | "file") => {
    if (saving) return; // lock while saving
    if (action === "camera") pickFromCamera();
    else if (action === "gallery") pickFromGallery();
    else pickFromFiles();
  };

  const openFileExternally = async (idx: number | null) => {
    if (saving) return;
    if (idx == null) return;
    const f = certs[idx];
    if (!f) return;
    try { await Linking.openURL(f.uri); } catch {}
  };

  /* ---------- location ---------- */
  const useCurrentLocation = async () => {
    try {
      setLocating(true);
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
      const link = buildMapboxBrowserUrl(lat, lon, {
        title: `${shopName || "Shop"} Location`,
      });
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
      setLocating(false);
    }
  };

  /* -------------------- save -------------------- */
  const uploadNewCertsAndGetPaths = async (userId: string, files: CertItem[]) => {
    const paths: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (!f.isNew) continue;
      const ext = guessExtFrom(f.name, f.mime);
      const contentType = guessContentType(ext);
      const base = sanitizeFileName(f.name || `file_${i}.${ext}`);
      const path = `shop/${userId}/${Date.now()}_${i}_${base}`;

      const bytes = await (await fetch(f.uri)).arrayBuffer();
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, {
        contentType, upsert: false,
      });
      if (upErr) throw new Error(`Failed to upload ${f.name}: ${upErr.message}`);

      paths.push(path);
    }
    return paths;
  };

  const handleSave = async () => {
    if (!userId) { setError("You must be signed in to save shop details."); return; }
    if (!canSave) { 
      if (!shopName.trim()) {
        setError("Shop name is required.");
      } else if (!timeOpen || !timeClose) {
        setError("Please set both opening and closing times.");
      } else {
        setError("Please use valid time format like 7:30 AM or 07:30 PM.");
      }
      return; 
    }

    try {
      setSaving(true); setError(null);

      // Keep times in 12-hour format for storage (no conversion needed)
      const timeOpen12 = timeOpen;
      const timeClose12 = timeClose;

      // keep only files that are both in UI and in the serverPaths fetched from DB,
      // so we never accidentally re-save a deleted path
      const existingKept = certs
        .filter((c) => !c.isNew && c.path && serverPaths.includes(c.path))
        .map((c) => c.path!) ;

      const newToUpload = certs.filter((c) => c.isNew);
      const uploadedPaths = await uploadNewCertsAndGetPaths(userId, newToUpload);
      const allPaths = [...existingKept, ...uploadedPaths];

      /** Build JSON array of keys from selected labels so multiple days save correctly */
      const dayKeys = daySetToKeyArray(daySet);

      // === Prepare payload for 'places' ===
      const placePayload = {
        name: shopName.trim(),
        category: category,
        service_for: serviceFor,
        address: address || null,
        latitude: latitude,
        longitude: longitude,
        maps_link: mapsLink,
      };

      let pid = placeId;

      // === Update or Insert into 'places' ===
      if (pid) {
        const { error: upErr } = await supabase
          .from("places")
          .update(placePayload)
          .eq("place_id", pid);

        if (upErr) throw upErr;
      } else {
        // Get shop_id for the owner field
        const { data: shopRow } = await supabase
          .from("shop_details")
          .select("shop_id")
          .eq("user_id", userId)
          .maybeSingle();

        const { data, error: insErr } = await supabase
          .from("places")
          .insert({
            ...placePayload,
            owner: shopRow?.shop_id || null,
          })
          .select("place_id")
          .single();

        if (insErr) throw insErr;
        pid = data.place_id;
      }

      // === Save 'shop_details' ===
      const payload = {
        user_id: userId,
        services: stringifyServiceSet(serviceSet) || null,
        certificate_url: JSON.stringify(allPaths),
        time_open: timeOpen12, // Store in 12-hour format with AM/PM
        time_close: timeClose12, // Store in 12-hour format with AM/PM
        // SAVE AS JSON ARRAY like ["mon","tue",...]; null if none selected
        days: dayKeys.length ? JSON.stringify(dayKeys) : null,
        place_id: pid,
      };

      const { data: savedRow, error: upErr2 } = await supabase
        .from("shop_details")
        .upsert(payload, { onConflict: "user_id" })
        .select("*, places(*)")
        .single();

      if (upErr2) throw upErr2;

      onSaved({
        services: savedRow?.services ?? payload.services,
        certificate_url: savedRow?.certificate_url ?? payload.certificate_url,
        time_open: savedRow?.time_open ?? payload.time_open,
        time_close: savedRow?.time_close ?? payload.time_close,
        days: savedRow?.days ?? payload.days,
        is_verified: initial.is_verified ?? false,
        shop_id: initial.shop_id,
        // pass place data back
        place_id: pid,
        name: shopName,
        category: category,
        service_for: serviceFor,
        address: address,
        latitude: latitude,
        longitude: longitude,
        maps_link: mapsLink,
      });

      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Failed to save shop details.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  // UPDATED: Use appropriate list based on shop category
  const baseList: string[] = isGasStation ? [...FUEL_TYPES] : [...ALL_SERVICES];
  const extras: string[] = Array.from(serviceSet).filter((s) => !baseList.includes(s));
  const servicesForUi: string[] = [...baseList, ...extras];

  const looksImage = (f: CertItem) =>
    isImageUrl(f.uri) || (f.mime ?? "").startsWith("image/");

  const lockStyle = saving ? { opacity: 0.6 } : undefined;

  return (
    <Modal
      visible
      animationType="fade"
      transparent
      onRequestClose={saving ? () => {} : onClose}
    >
      <View className="flex-1 bg-black/40">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 justify-end">
          <View className="bg-white rounded-t-3xl" style={{ maxHeight: screenHeight * 0.9 }}>
            {/* Header */}
            <View className="items-center pt-3">
              <View className="h-1.5 w-12 rounded-full bg-gray-300" />
            </View>
            <View className="flex-row items-center justify-between px-5 py-3">
              <Pressable
                onPress={saving ? undefined : onClose}
                disabled={saving}
                className="px-3 py-2 -ml-2 rounded-lg active:opacity-80"
                android_ripple={{ color: "#e5e7eb" }}
                style={saving ? { opacity: 0.5 } : undefined}
              >
                <Ionicons name="close" size={22} color="#0F172A" />
              </Pressable>
              <Text className="text-[16px] font-semibold text-[#0F172A]">
                Shop Details
              </Text>
              <Pressable
                onPress={handleSave}
                disabled={saving || !canSave}
                className="px-3 py-1.5 rounded-lg active:opacity-80"
                android_ripple={{ color: "#e5e7eb" }}
              >
                {saving ? <ActivityIndicator /> : (
                  <Text className="text-[14px] font-semibold" style={{ color: canSave ? "#0F2547" : "#9CA3AF" }}>
                    {loadingShopDetails ? "Loading…" : "Save"}
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
                editable={!saving}
              />

              <Dropdown
                label="Type of Shop"
                value={category}
                options={CATEGORY_OPTIONS}
                onSelect={setCategory}
                disabled={saving}
              />

              <Dropdown
                label="Service Offered To"
                value={serviceFor}
                options={SERVICE_FOR_OPTIONS}
                onSelect={setServiceFor}
                disabled={saving}
              />

              <InputField
                label="Address"
                value={address}
                onChangeText={setAddress}
                placeholder="Street, City, Province"
                multiline
                editable={!saving}
              />

              <Pressable
                onPress={useCurrentLocation}
                disabled={saving || locating}
                className="mt-1 self-start bg-[#E8F1FF] px-3 py-2 rounded-xl flex-row items-center gap-2"
                style={saving ? { opacity: 0.5 } : undefined}
              >
                <Ionicons name="location-outline" size={16} color="#0F2547" />
                <Text className="text-[#0F2547] font-semibold text-[13px]">
                  {locating ? "Getting Location..." : "Use Current Location"}
                </Text>
              </Pressable>

              {/* UPDATED: Services/Fuel Types based on shop category */}
              <View className="mt-6" style={lockStyle}>
                <View className="flex-row justify-between items-center mb-1">
                  <Text className="text-[12px] text-[#64748B]">
                    {isGasStation ? "Fuel Types Offered" : "Services Offered"}
                  </Text>
                  <Pressable
                    onPress={handleSelectAllServices}
                    disabled={saving}
                    className={`border border-gray-300 rounded-lg px-3 py-1 ${
                      saving ? "opacity-50" : ""
                    }`}
                  >
                    <Text className={`text-xs ${
                      saving ? "text-gray-400" : "text-gray-700"
                    }`}>
                      {serviceSet.size === baseList.length ? "Deselect All" : "Select All"}
                    </Text>
                  </Pressable>
                </View>
                <View className="border border-gray-300 rounded-xl bg-white overflow-hidden" style={{ height: 200 }}>
                  <ScrollView 
                    style={{ flex: 1 }}
                    showsVerticalScrollIndicator={true}
                    nestedScrollEnabled={true}
                  >
                    {servicesForUi.map((service, i) => {
                      const on = serviceSet.has(service);
                      return (
                        <Pressable
                          key={service}
                          onPress={() => toggleService(service)}
                          disabled={saving}
                          className={`flex-row items-center py-2 px-3 ${
                            i < servicesForUi.length - 1 ? "border-b border-gray-100" : ""
                          }`}
                        >
                          <View className={`h-5 w-5 border rounded-md mr-3 items-center justify-center ${
                            on ? "bg-blue-500 border-blue-500" : "border-gray-400"
                          }`}>
                            {on && <Ionicons name="checkmark" size={14} color="white" />}
                          </View>
                          <Text className={`text-sm ${on ? "text-blue-700 font-medium" : "text-gray-800"}`}>
                            {service}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
                <Text className="text-[11px] text-[#64748B] mt-1">
                  {isGasStation 
                    ? "Selected fuel types will be shown to customers."
                    : "Selected services will be shown to customers."
                  }
                </Text>
              </View>

              {/* ===== Upload Certificates ===== */}
              <View className="mt-4" style={lockStyle}>
                <Text className="text-[12px] mb-1 text-[#64748B]">Upload Certificates / Proof of Business</Text>
                <Text className="text-[11px] text-gray-500 mb-2">Choose how to upload</Text>

                <ActionsDropdown label="Upload options" onPick={handleCertAction} disabled={pickerBusy || saving} />

                {/* File rows */}
                <View className="mt-3 gap-2">
                  {certs.map((f, idx) => (
                    <Pressable
                      key={`${f.uri}-${idx}`}
                      onPress={saving ? undefined : () => setPreviewIndex(idx)}
                      android_ripple={{ color: "#e5e7eb" }}
                      disabled={saving}
                      className="flex-row items-center rounded-xl border border-gray-300 bg-[#F7F8FA] px-3 py-3"
                      style={saving ? { opacity: 0.6 } : undefined}
                    >
                      {/* left icon */}
                      <View className="h-9 w-9 mr-3 items-center justify-center rounded-lg bg-white/70">
                        <Ionicons
                          name={looksImage(f) ? "image-outline" : "document-text-outline"}
                          size={18}
                          color="#0F172A"
                        />
                      </View>

                      {/* middle text */}
                      <View className="flex-1 mr-2">
                        <Text numberOfLines={1} className="text-[15px] font-extrabold text-gray-900">
                          {f.name || "file"}
                        </Text>
                        <Text numberOfLines={1} className="text-[12px] text-gray-500">
                          {f.mime || "file"}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </View>

                <Text className="text-[11px] text-gray-500 mt-3">
                  Tip: Tap a file to preview. You can add more files again via the menu above.
                </Text>
              </View>

              {/* Time open/close */}
              <View className="mt-5">
                <Text className="text-[13px] font-bold mb-2 text-[#0F172A]">
                  Shop Schedule
                </Text>
                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <Text className="text-[12px] mb-1 text-[#64748B]">Time Open</Text>
                    <TimeInput
                      value={timeOpen}
                      onChange={setTimeOpen}
                      placeholder="08:00 AM"
                      editable={!saving}
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-[12px] mb-1 text-[#64748B]">Time Close</Text>
                    <TimeInput
                      value={timeClose}
                      onChange={setTimeClose}
                      placeholder="06:00 PM"
                      editable={!saving}
                    />
                  </View>
                </View>
              </View>

              {/* Days as checklist with Select All - UPDATED */}
              <View className="mt-3" style={lockStyle}>
                <View className="flex-row justify-between items-center mb-1">
                  <Text className="text-[12px] text-[#64748B]">Open Days</Text>
                  <Pressable
                    onPress={handleSelectAllDays}
                    disabled={saving}
                    className={`border border-gray-300 rounded-lg px-3 py-1 ${
                      saving ? "opacity-50" : ""
                    }`}
                  >
                    <Text className={`text-xs ${
                      saving ? "text-gray-400" : "text-gray-700"
                    }`}>
                      {daySet.size === DAYS.length ? "Deselect All" : "Select All"}
                    </Text>
                  </Pressable>
                </View>
                <View className="border border-gray-300 rounded-xl bg-white p-3">
                  {DAYS.map((day, i) => {
                    const on = daySet.has(day);
                    return (
                      <Pressable
                        key={day}
                        onPress={() => toggleDay(day)}
                        disabled={saving}
                        className={`flex-row items-center py-2 ${
                          i < DAYS.length - 1 ? "border-b border-gray-100" : ""
                        }`}
                      >
                        <View className={`h-5 w-5 border rounded-md mr-3 items-center justify-center ${
                          on ? "bg-blue-500 border-blue-500" : "border-gray-400"
                        }`}>
                          {on && <Ionicons name="checkmark" size={14} color="white" />}
                        </View>
                        <Text className={`text-sm ${on ? "text-blue-700 font-medium" : "text-gray-800"}`}>
                          {day}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text className="text-[11px] text-[#64748B] mt-1">Selected days indicate when your shop is open.</Text>
              </View>

              {error ? <Text className="text-xs text-red-500 mt-3 text-center">{error}</Text> : null}

              <View className="mt-3 p-3 rounded-2xl border" style={{ borderColor: "#E5E9F0" }}>
                <Text className="text-[12px] text-[#64748B]">
                  <Text className="font-semibold text-[#0F172A]">Note:</Text> Verification is managed by admins. After saving, an admin can mark your shop as verified.
                </Text>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>

      {/* ================= FULLSCREEN PREVIEW ================= */}
      <Modal
        visible={previewIndex !== null}
        animationType="fade"
        transparent={false}
        presentationStyle="fullScreen"
        onRequestClose={() => setPreviewIndex(null)}
      >
        <SafeAreaView className="flex-1 bg-black">
          {/* Top bar */}
          <View className="px-3 pb-2 pt-1 flex-row items-center justify-between">
            <Pressable onPress={() => setPreviewIndex(null)} className="h-10 w-10 items-center justify-center rounded-full active:opacity-80">
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </Pressable>

            <View className="flex-1 mx-1">
              <Text numberOfLines={1} className="text-white text-[14px] font-semibold">
                {previewIndex !== null ? certs[previewIndex]?.name ?? "" : ""}
              </Text>
              {previewIndex !== null && certs[previewIndex]?.mime ? (
                <Text className="text-white/70 text-[11px]">{certs[previewIndex]?.mime}</Text>
              ) : null}
            </View>
          </View>

          {/* Body */}
          <View className="flex-1">
            {previewIndex !== null && looksImage(certs[previewIndex]) ? (
              <Image
                source={{ uri: certs[previewIndex].uri }}
                style={{ width: "100%", height: "100%" }}
                resizeMode="contain"
              />
            ) : (
              <View className="flex-1 items-center justify-center px-6">
                <Ionicons name="document-text-outline" size={64} color="#fff" />
                <Text className="text-white mt-3 mb-6 text-sm text-center">
                  {previewIndex !== null ? certs[previewIndex]?.name ?? "Document" : "Document"}
                </Text>
                <View className="flex-row gap-3">
                  <Pressable onPress={() => openFileExternally(previewIndex)} className="rounded-xl bg-white px-5 py-3">
                    <Text className="text-black font-semibold">Open Externally</Text>
                  </Pressable>
                  <Pressable onPress={() => setPreviewIndex(null)} className="rounded-xl border border-white px-5 py-3">
                    <Text className="text-white font-semibold">Close</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        </SafeAreaView>
      </Modal>

      {/* Location loading modal */}
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
    </Modal>
  );
}