// app/(auth)/signup.tsx
import { router } from "expo-router";
import * as Crypto from "expo-crypto";
import { Ionicons } from "@expo/vector-icons";
import React, { useMemo, useState, useEffect } from "react";
import {
  Modal,
  Pressable,
  Image as RNImage,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
  Text,
  Linking,
  Alert,
  Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as Location from "expo-location";
import * as FileSystem from "expo-file-system"; // ⬅️ NEW
import { Buffer } from "buffer"; // ⬅️ NEW (fallback if atob is unavailable)
import CheckboxRow from "../../components/CheckboxRow";
import DayCheck from "../../components/DayCheck";
import Section from "../../components/Section";
import LoadingScreen from "../../components/LoadingScreen";
import { supabase } from "../../utils/supabase";
import NetInfo from "@react-native-community/netinfo";

/* ----------------------------- Data sources ----------------------------- */
const SHOP_TYPE_OPTIONS = [
  "Repair and Vulcanizing",
  "Repair only",
  "Vulcanizing only",
] as const;

const SHOP_LIST = [
  "AutoFix Argao",
  "QuickPatch Tire Shop",
  "Bohol Motors",
  "Cebu WrenchWorks",
  "RoadAid Service Center",
  "Shop not Listed",
] as const;

const SERVICES = [
  "Oil Change",
  "Engine Tune-up",
  "Brake Repair",
  "Transmission Service",
  "Wheel Alignment",
  "Tire Rotation",
  "Battery Replacement",
  "Electrical System Repair",
  "Suspension Repair",
  "Air Conditioning Service",
  "Exhaust System Repair",
  "Diagnostic Services",
  "Wheel Balancing",
  "Radiator Flush",
  "Fuel System Cleaning",
  "Belt and Hose Replacement",
  "Headlight Restoration",
  "Windshield Wiper Replacement",
  "Wheel Repair",
  "Vulcanizing/Tire Patching",
];

// ── Time format helpers ──────────────────────────────────────────────────
const convertTo12Hour = (time24: string) => {
  if (!time24 || !time24.includes(':')) return '';
  try {
    const [hours, minutes] = time24.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) return '';
    const period = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
  } catch {
    return '';
  }
};

const convertTo24Hour = (time12: string) => {
  if (!time12) return '';
  try {
    const [time, period] = time12.split(' ');
    if (!time || !time.includes(':')) return '';
    
    let [hours, minutes] = time.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) return '';
    
    if (period === 'PM' && hours < 12) {
      hours += 12;
    } else if (period === 'AM' && hours === 12) {
      hours = 0;
    }
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  } catch {
    return '';
  }
};

// NEW: service_for choices shown to the user (maps to DB values)
const SERVICE_FOR_CHOICES = [
  { label: "All types of vehicles", value: "all_type" },
  { label: "Motorcycles only", value: "motorcycle" },
  { label: "Cars or four wheeled only", value: "car" },
] as const;

const DAY_LABELS = ["M", "T", "W", "Th", "F", "Sat", "Sun"];
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/* ----------------------------- Validators ----------------------------- */
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const isPhone = (v: string) => /^[0-9+\-\s]{7,15}$/.test(v);
const hasMin = (v: string, n: number) => v.trim().length >= n;
const isTime = (v: string) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(v);

// ── Password policy (shared with Login) ──────────────────────────────────
const PASSWORD_MIN = 8;
const UPPER_RE = /[A-Z]/;
const SPECIAL_RE = /[^A-Za-z0-9]/;
/** Returns a human message if password is weak; otherwise null */
function passwordIssue(pw: string): string | null {
  if (!pw.trim()) return "Password is required.";
  if (pw.length < PASSWORD_MIN)
    return `Password must be at least ${PASSWORD_MIN} characters.`;
  if (!UPPER_RE.test(pw))
    return "Password must contain at least one uppercase letter.";
  if (!SPECIAL_RE.test(pw))
    return "Password must contain at least one special character.";
  return null;
}

/* -------------------- Session helper (CRITICAL) -------------------- */
async function waitForSession(maxMs = 4000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const { data } = await supabase.auth.getSession();
    if (data?.session) return data.session;
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
}

/* -------------------- File helpers (match emergency flow) -------------------- */
// Best-effort ext/mime guesser
function guessExtAndMime(name?: string, mime?: string | null) {
  const lower = (name ?? "").toLowerCase();
  const extFromName = lower.split(".").pop() || "";
  const cleanExt = extFromName.replace(/[^\w]+/g, "");

  if (mime && mime.includes("/")) {
    const mext = mime.split("/")[1]?.toLowerCase() || cleanExt || "bin";
    return { ext: mext === "jpeg" ? "jpg" : mext, mime };
  }

  // derive from extension
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    bmp: "image/bmp",
    heic: "image/heic",
    heif: "image/heif",
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  const ext = cleanExt || "jpg";
  const m = map[ext] || "application/octet-stream";
  return { ext: ext === "jpeg" ? "jpg" : ext, mime: m };
}

// Base64 → ArrayBuffer (works on Expo)
// Tries atob first; falls back to Buffer if needed.
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  try {
    // @ts-ignore
    const bin = typeof atob === "function" ? atob(base64) : null;
    if (bin != null) {
      const len = bin.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
      return bytes.buffer;
    }
    // eslint-disable-next-line no-empty
  } catch {}
  const buf = Buffer.from(base64, "base64");
  // Slice to get a proper standalone ArrayBuffer view
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

/* ------------------------- Reusable tiny components ------------------------- */
function Select({
  label,
  value,
  placeholder,
  options,
  onSelect,
  error,
  disabled,
}: {
  label: string;
  value: string | null;
  placeholder?: string;
  options:
    | ReadonlyArray<string>
    | ReadonlyArray<{ label: string; value: string }>;
  onSelect: (val: string) => void;
  error?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const normalized = options.map((o) =>
    typeof o === "string" ? { label: o, value: o } : o
  );
  const selectedLabel =
    normalized.find((o) => o.value === value)?.label ?? value ?? "";
  const borderCls = error ? "border-red-400" : "border-gray-300";

  return (
    <View className="gap-1.5" style={disabled ? { opacity: 0.5 } : undefined}>
      <Text className="ml-1 text-xs text-gray-600">{label}</Text>

      <Pressable
        disabled={disabled}
        onPress={() => setOpen(true)}
        android_ripple={{ color: "#e5e7eb" }}
        className={`flex-row items-center justify-between rounded-xl ${borderCls} bg-[#F7F8FA] px-3 py-3 border`}
      >
        <Text
          numberOfLines={1}
          className={`text-sm ${value ? "text-black" : "text-gray-500"} flex-1`}
        >
          {value ? selectedLabel : placeholder ?? "Select…"}
        </Text>
        <Ionicons name="chevron-down" size={18} />
      </Pressable>
      {error ? (
        <Text className="text-xs text-red-500 ml-1">{error}</Text>
      ) : null}

      <Modal visible={open} transparent animationType="fade">
        <Pressable
          onPress={() => setOpen(false)}
          className="flex-1 justify-center bg-black/25 p-4"
        >
          <View className="rounded-2xl border border-gray-200 bg-white p-3">
            <Text className="mb-2 font-bold text-gray-900">{label}</Text>
            <ScrollView style={{ maxHeight: 340 }}>
              {normalized.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  activeOpacity={0.7}
                  onPress={() => {
                    onSelect(opt.value);
                    setOpen(false);
                  }}
                  className="border-b border-slate-100 px-2 py-2"
                >
                  <Text className="text-sm text-gray-900">{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function RoleRadio({
  value,
  onChange,
}: {
  value: "driver" | "shop" | null;
  onChange: (v: "driver" | "shop") => void;
}) {
  const Item = ({
    label,
    val,
    dotColor,
  }: {
    label: string;
    val: "driver" | "shop";
    dotColor: string;
  }) => {
    const checked = value === val;
    return (
      <Pressable
        onPress={() => onChange(val)}
        className={`flex-row items-center gap-2 rounded-xl border px-3 py-2 ${
          checked ? "border-[#0F2547] bg-white" : "border-gray-200 bg-gray-50"
        }`}
      >
        <View className="h-4 w-4 items-center justify-center rounded-full border-2 border-gray-400">
          <View
            className={`h-2.5 w-2.5 rounded-full ${
              checked ? dotColor : "bg-transparent"
            }`}
          />
        </View>
        <Text className="text-[13px] font-bold text-gray-700">{label}</Text>
      </Pressable>
    );
  };

  return (
    <View className="gap-2">
      <Text className="ml-1 text-xs text-gray-600">I am signing up as</Text>
      <View className="flex-row flex-wrap items-center gap-2">
        <Item label="Driver" val="driver" dotColor="bg-blue-600" />
        <Item label="Shop" val="shop" dotColor="bg-orange-500" />
      </View>
    </View>
  );
}

function buildAddressFromPlace(p: Location.LocationGeocodedAddress) {
  const parts = [
    p.name,
    p.street,
    p.subregion || p.city,
    p.region,
    p.postalCode,
    p.country,
  ];
  return parts.filter(Boolean).join(", ");
}

function FieldRow({
  icon,
  placeholder,
  value,
  onChangeText,
  keyboardType,
  secureTextEntry,
  toggleableSecure,
  error,
  editable = true,
  onBlur,
}: {
  icon: any;
  placeholder: string;
  value: string;
  onChangeText: (t: string) => void;
  keyboardType?: "default" | "email-address" | "phone-pad";
  secureTextEntry?: boolean;
  toggleableSecure?: boolean;
  error?: string;
  editable?: boolean;
  onBlur?: () => void;
}) {
  const [show, setShow] = React.useState(false);
  const borderCls = error ? "border-red-400" : "border-gray-300";
  const isSecure = toggleableSecure
    ? !show && !!secureTextEntry
    : !!secureTextEntry;

  return (
    <View className="mb-3">
      <View
        className={`flex-row items-center rounded-xl border ${borderCls} bg-white px-3`}
        style={editable === false ? { opacity: 0.5 } : undefined}
      >
        <Ionicons name={icon} size={18} style={{ marginRight: 8 }} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#808080"
          className="flex-1 py-3 text-sm text-black"
          keyboardType={keyboardType}
          secureTextEntry={isSecure}
          autoCapitalize="none"
          editable={editable}
          onBlur={onBlur}
        />
        {toggleableSecure ? (
          <Pressable
            onPress={() => setShow((s) => !s)}
            hitSlop={8}
            className="pl-2 py-2"
          >
            <Ionicons
              name={show ? "eye-off-outline" : "eye-outline"}
              size={18}
            />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text className="mt-1 ml-1 text-xs text-red-500">{error}</Text>
      ) : null}
    </View>
  );
}

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
        <Text className="text-sm text-gray-700">Select an action…</Text>
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

// Time Input Component with AM/PM Dropdown
function TimeInput({
  value,
  onChange,
  placeholder,
  error,
  editable = true,
}: {
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  error?: string;
  editable?: boolean;
}) {
  const [timeValue, setTimeValue] = useState("");
  const [period, setPeriod] = useState<"AM" | "PM">("AM");
  const [showPeriodDropdown, setShowPeriodDropdown] = useState(false);

  // Initialize values from props
  useEffect(() => {
    if (value) {
      const parts = value.split(' ');
      if (parts.length === 2) {
        setTimeValue(parts[0]);
        setPeriod(parts[1] as "AM" | "PM");
      } else {
        setTimeValue(value);
        setPeriod("AM");
      }
    } else {
      setTimeValue("");
      setPeriod("AM");
    }
  }, [value]);

  const handleTimeChange = (text: string) => {
    // Only allow numbers and colon
    const cleaned = text.replace(/[^0-9:]/g, '');
    
    // Auto-insert colon after 2 digits
    if (cleaned.length === 2 && timeValue.length === 1) {
      setTimeValue(cleaned + ':');
    } else if (cleaned.length === 2 && !cleaned.includes(':')) {
      setTimeValue(cleaned + ':');
    } else {
      setTimeValue(cleaned);
    }
    
    // Update parent component
    if (cleaned.includes(':') && cleaned.length > 4) {
      onChange(`${cleaned} ${period}`);
    }
  };

  const handlePeriodChange = (newPeriod: "AM" | "PM") => {
    setPeriod(newPeriod);
    setShowPeriodDropdown(false);
    if (timeValue) {
      onChange(`${timeValue} ${newPeriod}`);
    }
  };

  const borderCls = error ? "border-red-400" : "border-gray-300";

  return (
    <View className="gap-1.5">
      <View
        className={`flex-row items-center rounded-xl border ${borderCls} bg-white overflow-hidden`}
        style={editable === false ? { opacity: 0.5 } : undefined}
      >
        <TextInput
          value={timeValue}
          onChangeText={handleTimeChange}
          placeholder={placeholder || "hh:mm"}
          placeholderTextColor="#808080"
          className="flex-1 py-3 px-3 text-sm text-black"
          keyboardType="numbers-and-punctuation"
          editable={editable}
          maxLength={5}
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

      {error ? (
        <Text className="text-xs text-red-500 ml-1">{error}</Text>
      ) : null}
    </View>
  );
}

/* --------------------------------- Screen --------------------------------- */
export default function Signup() {
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (!state.isConnected) {
        Alert.alert("No Internet", "Please check your internet connection");
      }
    });
    return () => unsubscribe();
  }, []);

  const [loading, setLoading] = useState(false);

  // Role (default driver)
  const [role, setRole] = useState<"driver" | "shop" | null>("driver");

  /* Driver fields */
  const [dFullname, setDFullname] = useState("");
  const [dEmail, setDEmail] = useState("");
  const [dPhone, setDPhone] = useState("");
  const [dAddress, setDAddress] = useState("");
  const [dPw, setDPw] = useState("");
  const [dCpw, setDCpw] = useState("");

  // Email verification state (driver)
  const [driverEmailVerified, setDriverEmailVerified] = useState(false);
  const [showDriverOtpModal, setShowDriverOtpModal] = useState(false);
  const [driverOtp, setDriverOtp] = useState("");
  const [driverOtpError, setDriverOtpError] = useState("");
  const [driverEmailCheckLoading, setDriverEmailCheckLoading] =
    useState(false);
  const [driverEmailCheckError, setDriverEmailCheckError] = useState("");
  const [driverOtpResendLoading, setDriverOtpResendLoading] = useState(false);
  const [driverOtpSendLoading, setDriverOtpSendLoading] = useState(false);

  // Shop email verification state
  const [shopEmailVerified, setShopEmailVerified] = useState(false);
  const [showShopOtpModal, setShowShopOtpModal] = useState(false);
  const [sOtp, setSOtp] = useState("");
  const [sOtpError, setSOtpError] = useState("");
  const [sEmailCheckLoading, setSEmailCheckLoading] = useState(false);
  const [sEmailCheckError, setSEmailCheckError] = useState("");
  const [sOtpResendLoading, setSOtpResendLoading] = useState(false);
  const [sOtpSendLoading, setSOtpSendLoading] = useState(false);

  /* Shop fields */
  const [shopType, setShopType] = useState<string | null>(null);
  const [shopName, setShopName] = useState<string | null>(null);
  const [showNotListedModal, setShowNotListedModal] = useState(false);

  const [shopOptions, setShopOptions] = useState<
    Array<{ label: string; value: string }>
  >([]);
  const [shopListLoading, setShopListLoading] = useState(false);
  const [shopListError, setShopListError] = useState<string | null>(null);

  // NEW: fields for unlisted shop
  const [unlistedName, setUnlistedName] = useState(""); // Shop Name
  const [serviceFor, setServiceFor] = useState<string | null>(null); // 'motorcycle' | 'car' | 'all_type'

  const [shopAddress, setShopAddress] = useState("");

  const [locationPromptShown, setLocationPromptShown] = useState(false);
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null
  );
  // NEW: hold plus code (optional; see note in requestLocation)
  const [plusCode, setPlusCode] = useState<string | null>(null);

  const [sFullname, setSFullname] = useState("");
  const [sEmail, setSEmail] = useState("");
  const [sPhone, setSPhone] = useState("");
  const [sAddress, setSAddress] = useState("");
  const [services, setServices] = useState<string[]>([]);
  const [days, setDays] = useState<string[]>([]);
  const [openTime, setOpenTime] = useState("08:00 AM");
  const [closeTime, setCloseTime] = useState("10:00 PM");
  const [sPw, setSPw] = useState("");
  const [sCpw, setSCpw] = useState("");

  type CertFile = { uri: string; name: string; mime: string | null; size?: number };
  const [certs, setCerts] = useState<CertFile[]>([]);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const [askCamera, setAskCamera] = useState(false);
  const [askGallery, setAskGallery] = useState(false);
  const [askFiles, setAskFiles] = useState(false);
  const [askLocation, setAskLocation] = useState(false);

  const [errorsD, setErrorsD] = useState<{ [k: string]: string | undefined }>(
    {}
  );
  const [errorsS, setErrorsS] = useState<{ [k: string]: string | undefined }>(
    {}
  );
  const [touchedD, setTouchedD] = useState<{ [k: string]: boolean }>({});
  const [touchedS, setTouchedS] = useState<{ [k: string]: boolean }>({});

useEffect(() => {
  let mounted = true;
  (async () => {
    try {
      setShopListLoading(true);
      setShopListError(null);

      const ALLOWED = ["vulcanizing", "repair_shop", "vulcanizing_repair"] as const;

      const { data, error } = await supabase
        .from("places")
        .select("place_id, name, address, category")
        .in("category", ALLOWED as unknown as string[]) // Postgrest .in requires string[]
        .or("owner.is.null,owner.eq.")                  // keep your original owner filter
        .order("name", { ascending: true });

      if (error) throw error;

      const opts =
        (data ?? [])
          // (extra safety if old rows slip through)
          .filter((r: any) => ALLOWED.includes(r.category))
          .filter((r: any) => (r?.name ?? "").trim().length > 0)
          .map((r: any) => ({
            label: r.address ? `${r.name} — ${r.address}` : r.name,
            value: r.place_id,
          }));

      if (mounted) setShopOptions(opts);
    } catch (e: any) {
      if (mounted) setShopListError(e?.message ?? "Failed to load shops");
    } finally {
      if (mounted) setShopListLoading(false);
    }
  })();
  return () => {
    mounted = false;
  };
}, []);


  function markTouchedD(field: string) {
    setTouchedD((prev) => ({ ...prev, [field]: true }));
  }
  function markTouchedS(field: string) {
    setTouchedS((prev) => ({ ...prev, [field]: true }));
  }

  async function emailExistsInAppUser(email: string) {
    const normalized = email.trim().toLowerCase();
    const { count, error } = await supabase
      .from("app_user")
      .select("user_id", { count: "exact", head: true })
      .ilike("email", normalized);
    if (error) throw error;
    return (count ?? 0) > 0;
  }

  function toggleService(s: string) {
    setServices((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  }
  function toggleDay(k: string) {
    setDays((prev) =>
      prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]
    );
  }


  const handleSelectAllServices = () => {
  if (shopLocked) return; // Add this line
  if (services.length === SERVICES.length) {
    setServices([]);
  } else {
    setServices([...SERVICES]);
  }
};

const handleSelectAllDays = () => {
  if (shopLocked) return; // Add this line
  if (days.length === DAY_KEYS.length) {
    setDays([]);
  } else {
    setDays([...DAY_KEYS]);
  }
};




  const addCert = (file: CertFile) => setCerts((prev) => [...prev, file]);

  const reallyOpenCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Camera access was denied.");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.8,
    });
    if (!res.canceled) {
      const asset = res.assets[0];
      addCert({
        uri: asset.uri,
        name: asset.fileName ?? "camera.jpg",
        mime: asset.mimeType ?? "image/jpeg",
      });
    }
  };

  const reallyPickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Gallery access was denied.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: false,
      quality: 1,
    });
    if (!res.canceled) {
      const asset = res.assets[0];
      addCert({
        uri: asset.uri,
        name: asset.fileName ?? "image.jpg",
        mime: asset.mimeType ?? "image/jpeg",
      });
    }
  };

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  const reallyPickDocument = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "image/*",
      ],
      copyToCacheDirectory: true,
      multiple: true,
    });
    if (res.canceled) return;

    const files = res.assets ?? [];
    const validFiles = files.filter((file) => {
      if (file.size && file.size > MAX_FILE_SIZE) {
        Alert.alert("File too large", `${file.name} is too large (max 10MB)`);
        return false;
      }
      return true;
    });

    setCerts((prev) => [
      ...prev,
      ...validFiles.map((f) => ({
        uri: f.uri,
        name: f.name ?? "document",
        mime: f.mimeType ?? null,
        size: f.size || 0,
      })),
    ]);
  };

  const openFileExternally = async (idx: number | null) => {
    if (idx == null) return;
    const file = certs[idx];
    if (!file) return;
    try {
      await Linking.openURL(file.uri);
    } catch {}
  };

  // Helper to (optionally) compute Plus Code. You can swap this with a real
  // OLC lib later (e.g., 'open-location-code' → encode(lat, lng)).
  function tryComputePlusCode(lat: number, lng: number): string | null {
    try {
      // Lightweight fallback: leave null if you don't have a local OLC encoder.
      // (Keeps the app stable; DB column can be NULL.)
      return null;
    } catch {
      return null;
    }
  }

  const requestLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Location permission was denied.");
      setLocationEnabled(false);
      setCoords(null);
      setPlusCode(null);
      return;
    }
    setLocationEnabled(true);

    const pos = await Location.getCurrentPositionAsync({});
    const { latitude, longitude } = pos.coords;

    setCoords({ lat: latitude, lng: longitude });
    setLocationPromptShown(true);

    try {
      const places = await Location.reverseGeocodeAsync({
        latitude,
        longitude,
      });
      if (places && places[0]) {
        setShopAddress(buildAddressFromPlace(places[0]));
        markTouchedS("shopAddress");
      }
    } catch {}

    // NEW: attempt to compute plus code (optional)
    setPlusCode(tryComputePlusCode(latitude, longitude));
  };

  const driverValid = useMemo(() => {
    const e: any = {};
    if (!hasMin(dFullname, 2)) e.dFullname = "Full name is required.";
    if (!isEmail(dEmail)) e.dEmail = "Enter a valid email.";
    if (!isPhone(dPhone)) e.dPhone = "Enter a valid phone (7–15 digits).";
    if (!hasMin(dAddress, 2)) e.dAddress = "Address is required.";

    const dPwIssue = passwordIssue(dPw);
    if (dPwIssue) e.dPw = dPwIssue;

    if (dCpw !== dPw) e.dCpw = "Passwords do not match.";
    setErrorsD(e);
    return Object.keys(e).length === 0;
  }, [dFullname, dEmail, dPhone, dAddress, dPw, dCpw]);

  const shopValid = useMemo(() => {
    const e: any = {};
    if (!shopName) e.shopName = "Select your shop.";
    if (shopName === "Shop not Listed") {
      if (!shopType) e.shopType = "Select a shop type.";
      if (!hasMin(unlistedName, 2)) e.unlistedName = "Shop name is required.";
      if (!serviceFor) e.serviceFor = "Select service coverage.";
      if (!locationEnabled)
        e.shopName = "Enable location to register 'Shop not Listed'.";
      if (!hasMin(shopAddress, 2)) e.shopAddress = "Shop address is required.";
    }
    if (!hasMin(sFullname, 2)) e.sFullname = "Full name is required.";
    if (!isEmail(sEmail)) e.sEmail = "Enter a valid email.";
    if (!isPhone(sPhone)) e.sPhone = "Enter a valid phone (7–15 digits).";
    if (!hasMin(sAddress, 2)) e.sAddress = "Address is required.";

    const sPwIssue = passwordIssue(sPw);
    if (sPwIssue) e.sPw = sPwIssue;

    if (sCpw !== sPw) e.sCpw = "Passwords do not match.";
    if (services.length === 0) e.services = "Pick at least 1 service.";
    if (days.length === 0) e.days = "Pick at least 1 operating day.";
    // Convert 12-hour to 24-hour for validation
const openTime24 = convertTo24Hour(openTime);
const closeTime24 = convertTo24Hour(closeTime);

if (!openTime.trim()) e.openTime = "Open time required.";
if (!closeTime.trim()) e.closeTime = "Close time required.";

// Only validate time order if both times are valid
if (openTime24 && closeTime24) {
  const [oh, om] = openTime24.split(":").map(Number);
  const [ch, cm] = closeTime24.split(":").map(Number);
  if (oh * 60 + om >= ch * 60 + cm) {
    e.closeTime = "Close time must be after open time.";
  }
} else {
  // If conversion failed but times are entered, show format error
  if (openTime.trim() && !openTime24) {
    e.openTime = "Please use format: hh:mm AM/PM";
  }
  if (closeTime.trim() && !closeTime24) {
    e.closeTime = "Please use format: hh:mm AM/PM";
  }
}
    if (certs.length === 0)
      e.certificate = "Upload at least one certificate/proof.";
    setErrorsS(e);
    return Object.keys(e).length === 0;
  }, [
    shopName,
    shopType,
    unlistedName,
    serviceFor,
    locationEnabled,
    sFullname,
    sEmail,
    sPhone,
    sAddress,
    sPw,
    sCpw,
    services,
    days,
    openTime,
    closeTime,
    certs,
    shopAddress,
  ]);

  const canDriverSubmit =
    role === "driver" && driverValid && driverEmailVerified;
  const canShopSubmit =
    role === "shop" && shopValid && (driverEmailVerified || shopEmailVerified);
  const shopLocked = !(driverEmailVerified || shopEmailVerified);

  const afterSignupNotice = () =>
    Alert.alert(
      "Submitted!",
      "Your account has been created and needs to be verified by the admins first. You'll be notified once approved."
    );

  useEffect(() => {
    if (driverEmailVerified) {
      const normalized = dEmail.trim().toLowerCase();
      setSEmail(normalized);
      setShopEmailVerified(true);
      setSEmailCheckError("");
      setSOtp("");
      setSOtpError("");
      setShowShopOtpModal(false);
    } else {
      setShopEmailVerified(false);
    }
  }, [driverEmailVerified, dEmail]);

  const submitDriver = async () => {
    if (!driverValid) return;
    if (!driverEmailVerified) {
      Alert.alert("Verify your email", "Please verify your email first.");
      return;
    }

    setLoading(true);
    try {
      const { data: sessData, error: sessErr } =
        await supabase.auth.getSession();
      if (sessErr) throw sessErr;
      if (!sessData?.session) {
        setLoading(false);
        Alert.alert(
          "Not signed in",
          "Your session expired. Please tap Verify Email again."
        );
        return;
      }

      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const user = userData?.user;
      if (!user?.id) {
        setLoading(false);
        Alert.alert(
          "Not signed in",
          "We couldn't find your account. Please re-verify your email."
        );
        return;
      }
      const authUserId: string = user.id;

      const normalizedEmail = dEmail.trim().toLowerCase();
      if (await emailExistsInAppUser(normalizedEmail)) {
        setErrorsD((prev) => ({ ...prev, dEmail: "Email already exist" }));
        Alert.alert(
          "Email already registered",
          "Please use a different email."
        );
        setLoading(false);
        return;
      }

      if (dPw?.trim()) {
        const { error: pwErr } = await supabase.auth.updateUser({
          password: dPw,
        });
        if (pwErr) {
          const msg = String(pwErr.message || "");
          if (!msg.toLowerCase().includes("new password should be different")) {
            throw pwErr;
          }
        }
      }

      let photoUrl: string | null =
        (user.identities ?? []).find((i: any) => i.provider === "google")
          ?.identity_data?.picture ??
        (user.user_metadata as any)?.avatar_url ??
        null;

      if (!photoUrl) {
        const md5 = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.MD5,
          normalizedEmail
        );
        photoUrl = `https://www.gravatar.com/avatar/${md5}?d=identicon`;
      }

      const { error: insertErr } = await supabase.from("app_user").insert([
        {
          user_id: authUserId,
          role: "Driver",
          full_name: dFullname,
          email: normalizedEmail,
          phone: dPhone,
          address: dAddress,
          password: dPw,
          photo_url: photoUrl,
        },
      ]);
      if (insertErr) throw insertErr;

      router.replace("/driver/driverLandingpage");
    } catch (err: any) {
      Alert.alert("Sign up failed", err?.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  // Helper to force sign out & route to login (extra robust)
  const forceLogoutAndGoLogin = async () => {
    try {
      // Global ensures refresh token is revoked; helpful if another listener auto-restores.
      await supabase.auth.signOut({ scope: "global" as any });
    } catch {}
    try {
      await supabase.auth.signOut(); // local fallback
    } catch {}
    // Small delay to let any auth listeners settle before navigation
    await new Promise((r) => setTimeout(r, 150));
    router.replace("/login");
  };

  const submitShop = async () => {
    if (!shopValid) return;

    setLoading(true);
    try {
      const networkState = await NetInfo.fetch();
      if (!networkState.isConnected) {
        throw new Error(
          "No internet connection. Please check your network and try again."
        );
      }

      const { data: sessData, error: sessErr } =
        await supabase.auth.getSession();
      if (sessErr) throw new Error(`Authentication error: ${sessErr.message}`);
      if (!sessData?.session) {
        setLoading(false);
        Alert.alert(
          "Session expired",
          "Your session expired. Please verify email again."
        );
        return;
      }

      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr)
        throw new Error(`User authentication error: ${userErr.message}`);
      const user = userData?.user;
      if (!user?.id) {
        setLoading(false);
        Alert.alert(
          "Not signed in",
          "We couldn't find your account. Please re-verify your email."
        );
        return;
      }
      const authUserId: string = user.id;

      const normalizedEmail = sEmail.trim().toLowerCase();
      if (!driverEmailVerified) {
        const exists = await emailExistsInAppUser(normalizedEmail);
        if (exists) {
          setSEmailCheckError("Email already exist");
          setTouchedS((prev) => ({ ...prev, sEmail: true }));
          setLoading(false);
          return;
        }
      }
      if (sPw?.trim()) {
        const { error: pwErr } = await supabase.auth.updateUser({
          password: sPw,
        });
        if (pwErr) {
          const msg = String(pwErr.message || "");
          if (!msg.toLowerCase().includes("new password should be different")) {
            throw pwErr;
          }
        }
      }

      let photoUrl: string | null =
        (user.identities ?? []).find((i: any) => i.provider === "google")
          ?.identity_data?.picture ??
        (user.user_metadata as any)?.avatar_url ??
        null;

      if (!photoUrl) {
        const md5 = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.MD5,
          normalizedEmail
        );
        photoUrl = `https://www.gravatar.com/avatar/${md5}?d=identicon`;
      }

      // 1) Upsert app_user (Shop owner)
      const appUserRow = {
        user_id: authUserId,
        role: "Shop owner" as const,
        full_name: sFullname,
        email: normalizedEmail,
        phone: sPhone,
        address: sAddress,
        password: sPw,
        photo_url: photoUrl,
      };
      const { error: upsertUserErr } = await supabase
        .from("app_user")
        .upsert([appUserRow], { onConflict: "user_id" });
      if (upsertUserErr) throw upsertUserErr;

      // 2) Upload certificates (EMERGENCY-STYLE)
      const { urls: certificateUrls /*, paths: certificatePaths */ } =
        await uploadCertificatesAndGetUrls(authUserId, certs);

      // 3) Decide or create place_id BEFORE writing shop_details
      let placeIdToUse: string | null = null;

      if (shopName && shopName !== "Shop not Listed") {
        // Existing place selected, the value is already a place_id
        placeIdToUse = shopName as string;
      } else {
        // Create a new place first (without owner yet), then use its place_id
        const lat = coords?.lat ?? null;
        const lng = coords?.lng ?? null;

        // Map UI labels → DB category.
        const category =
          shopType === "Repair and Vulcanizing"
            ? "vulcanizing_repair"
            : shopType === "Vulcanizing only"
            ? "vulcanizing"
            : "repair_shop"; // "Repair only"

        const newPlacePayload: any = {
          name: unlistedName.trim() || null, // NEW
          category, // mapped from shopType
          service_for: serviceFor || null, // NEW
          address: shopAddress || null,
          plus_code: plusCode || null, // NEW (optional if null)
          latitude: lat,
          longitude: lng,
          maps_link:
            lat && lng
              ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
              : null,
          owner: null, // set after we know the shop_id
        };

        const { data: createdPlace, error: insPlaceErr } = await supabase
          .from("places")
          .insert([newPlacePayload])
          .select("place_id")
          .single();
        if (insPlaceErr) throw insPlaceErr;
        placeIdToUse = createdPlace?.place_id ?? null;
        if (!placeIdToUse) throw new Error("Failed to obtain new place_id.");
      }

      // 4) Upsert shop_details - FIXED: Store original 12-hour format times
      const { data: upsertShop, error: upsertShopErr } = await supabase
        .from("shop_details")
        .upsert(
          [
            {
              user_id: authUserId,
              services: JSON.stringify(services),
              certificate_url: JSON.stringify(certificateUrls),
              time_open: openTime, // Store original 12-hour format
              time_close: closeTime, // Store original 12-hour format
              days: JSON.stringify(days),
              place_id: placeIdToUse,
              is_verified: false,
            },
          ],
          { onConflict: "user_id" }
        )
        .select("shop_id")
        .single();
      if (upsertShopErr) throw upsertShopErr;

      const newShopId: string = upsertShop.shop_id;

      // 5) Ensure places.owner points to this shop_id
      if (placeIdToUse) {
        const { error: updPlaceErr } = await supabase
          .from("places")
          .update({ owner: newShopId })
          .eq("place_id", placeIdToUse);
        if (updPlaceErr) throw updPlaceErr;
      }

      // 6) Do NOT auto-login. Force sign-out and return to Login.
      Alert.alert(
        "Submitted!",
        "Your shop owner account was created and is pending admin verification. You can log in once approved."
      );
      await forceLogoutAndGoLogin();
      return;
    } catch (err: any) {
      if (
        err.message?.includes("Network request failed") ||
        err.message?.includes("Failed to fetch")
      ) {
        Alert.alert(
          "Network Error",
          "Please check your internet connection and try again."
        );
      } else if (err.message?.includes("No internet connection")) {
        Alert.alert("No Internet", err.message);
      } else {
        Alert.alert(
          "Submit failed",
          err?.message ?? "Something went wrong. Please try again."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const sanitizeFileName = (name: string) => name.replace(/[^\w.-]+/g, "_");

  // ⬇️ UPDATED: mirror emergency flow (Base64 -> ArrayBuffer -> Storage.upload -> Public URL)
  async function uploadCertificatesAndGetUrls(
    userId: string,
    files: Array<{ uri: string; name: string; mime: string | null }>
  ) {
    const urls: string[] = [];
    const paths: string[] = [];

    // Group all selected proofs under one folder (e.g., to inspect easily in Storage)
    const groupId = `grp_${Date.now()}`;

    const bucket = supabase.storage.from("certificates");

    for (let i = 0; i < files.length; i++) {
      const f = files[i];

      const guessed = guessExtAndMime(f.name, f.mime);
      const ext = sanitizeFileName(guessed.ext);
      const contentType = guessed.mime;

      const baseName = sanitizeFileName(
        (f.name || `certificate_${i}.${ext}`).trim()
      );

      // Path pattern mirrors emergency style: certificates/shop/<userId>/<groupId>/cert-<ts>-<i>.<ext>
      const ts = Date.now();
      const path = `shop/${userId}/${groupId}/cert-${ts}-${i}.${ext}`;

      // Read local file → Base64 → ArrayBuffer
      const base64 = await FileSystem.readAsStringAsync(f.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const arrayBuffer = base64ToArrayBuffer(base64);

      // Try direct upload (RN-compatible body)
      const { error: upErr } = await bucket.upload(path, arrayBuffer, {
        contentType,
        upsert: true,
      });
      if (upErr) {
        throw new Error(`Failed to upload certificate: ${upErr.message}`);
      }

      // Turn into public URL (since bucket is public)
      const { data: pub } = await bucket.getPublicUrl(path);
      urls.push(pub.publicUrl);
      paths.push(path);
    }

    return { urls, paths };
  }

  const handleCertAction = (action: "camera" | "gallery" | "file") => {
    if (action === "camera") setAskCamera(true);
    else if (action === "gallery") setAskGallery(true);
    else if (action === "file") setAskFiles(true);
  };

  return (
    <View className="flex-1 bg-[#EDF2FB]">
      <ScrollView
        contentContainerStyle={{ padding: 16, rowGap: 12 }}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
      >
        {/* Brand header (centered) */}
        <View className="items-center mb-2">
          {/* NOTE: Add a source to avoid RN warning (optional) */}
          {/* <RNImage source={require("../../assets/icon.png")} className="h-16 w-16 mb-2" resizeMode="contain" /> */}
          <Text className="text-3xl font-extrabold text-[#0F2547]">
            Create your account
          </Text>
          <Text className="text-xs text-gray-600">
            Join RideRescue to get help faster or list your shop
          </Text>
        </View>

        {/* Main card */}
        <View className="w-full self-center rounded-2xl bg-white p-5 shadow-md">
          {/* Role */}
          <RoleRadio value={role} onChange={(v) => setRole(v)} />

          {/* DRIVER VIEW */}
          {role === "driver" && (
            <>
              <View className="mt-4 mb-2">
                <Text className="text-sm font-semibold text-gray-900">
                  Driver details
                </Text>
              </View>

              {/* Email + verify button */}
              <FieldRow
                icon="mail-outline"
                placeholder="Email"
                value={dEmail}
                onChangeText={(t) => {
                  setDEmail(t);
                  markTouchedD("dEmail");
                }}
                keyboardType="email-address"
                error={
                  touchedD.dEmail
                    ? errorsD.dEmail || driverEmailCheckError
                    : undefined
                }
                editable={!driverEmailVerified && !driverEmailCheckLoading}
                onBlur={() => markTouchedD("dEmail")}
              />

              {!driverEmailVerified && (
                <Pressable
                  onPress={async () => {
                    setDriverEmailCheckError("");
                    setDriverEmailCheckLoading(true);
                    try {
                      const normalized = dEmail.trim().toLowerCase();
                      if (!isEmail(normalized)) {
                        setDriverEmailCheckError("Enter a valid email.");
                        return;
                      }
                      const exists = await emailExistsInAppUser(normalized);
                      if (exists) {
                        setDriverEmailCheckError("Email already exist");
                        setShowDriverOtpModal(false);
                        setDriverEmailVerified(false);
                        return;
                      }
                      const { error } = await supabase.auth.signInWithOtp({
                        email: normalized,
                        options: { shouldCreateUser: true },
                      });
                      if (error) throw error;
                      setShowDriverOtpModal(true);
                    } catch (err: any) {
                      setDriverEmailCheckError(
                        err?.message || "Failed to verify email."
                      );
                    } finally {
                      setDriverEmailCheckLoading(false);
                    }
                  }}
                  disabled={driverEmailCheckLoading || !isEmail(dEmail)}
                  className={`mt-1 items-center rounded-2xl py-3 ${
                    isEmail(dEmail) && !driverEmailCheckLoading
                      ? "bg-[#2563EB]"
                      : "bg-[#93C5FD]"
                  }`}
                >
                  <Text className="text-[15px] font-extrabold text-white">
                    {driverEmailCheckLoading ? "Checking..." : "Verify Email"}
                  </Text>
                </Pressable>
              )}

              {!driverEmailVerified && (
                <Text className="mt-2 text-xs text-gray-500">
                  Verify your email to enable the rest of the fields.
                </Text>
              )}

              {/* DRIVER OTP Modal */}
              <Modal
                visible={showDriverOtpModal}
                transparent
                animationType="fade"
                onRequestClose={() => setShowDriverOtpModal(false)}
              >
                <View className="flex-1 items-center justify-center bg-black/35 p-4">
                  <View className="w-full rounded-2xl border border-gray-200 bg-white p-5">
                    <Text className="mb-2 text-base font-extrabold text-gray-900">
                      Enter the code sent to your email
                    </Text>
                    <Text className="mb-4 text-gray-900">
                      Please check your inbox (and spam folder) for a 6-digit
                      code.
                    </Text>

                    <TextInput
                      value={driverOtp}
                      onChangeText={setDriverOtp}
                      placeholder="Enter code"
                      keyboardType="number-pad"
                      maxLength={6}
                      className="mb-2 border border-gray-300 rounded-xl px-3 py-2 text-lg text-center"
                      style={{ letterSpacing: 8 }}
                    />

                    {driverOtpError ? (
                      <Text className="mb-2 text-xs text-red-500">
                        {driverOtpError}
                      </Text>
                    ) : null}

                    <View className="flex-row justify-between gap-2 mt-2">
                      <Pressable
                        onPress={async () => {
                          setDriverOtpResendLoading(true);
                          setDriverOtpError("");
                          try {
                            const normalized = dEmail.trim().toLowerCase();
                            const { error } = await supabase.auth.signInWithOtp(
                              {
                                email: normalized,
                                options: { shouldCreateUser: true },
                              }
                            );
                            if (error)
                              setDriverOtpError(
                                error.message || "Failed to resend OTP."
                              );
                          } catch (err: any) {
                            setDriverOtpError(
                              err.message || "Failed to resend OTP."
                            );
                          } finally {
                            setDriverOtpResendLoading(false);
                          }
                        }}
                        disabled={driverOtpResendLoading}
                        className="flex-1 rounded-xl border border-gray-300 py-2 items-center"
                      >
                        <Text className="font-bold text-gray-900">
                          {driverOtpResendLoading ? "Resending..." : "Resend"}
                        </Text>
                      </Pressable>

                      <Pressable
                        onPress={async () => {
                          setDriverOtpSendLoading(true);
                          setDriverOtpError("");
                          try {
                            const normalized = dEmail.trim().toLowerCase();
                            const { error } = await supabase.auth.verifyOtp({
                              email: normalized,
                              token: driverOtp,
                              type: "email",
                            });
                            if (error) {
                              setDriverOtpError(
                                error.message || "Invalid code."
                              );
                              return;
                            }
                            // ✅ Wait for session to be set
                            const session = await waitForSession();
                            if (!session) {
                              setDriverOtpError(
                                "Could not establish a session. Please try again."
                              );
                              return;
                            }
                            setShowDriverOtpModal(false);
                            setDriverEmailVerified(true);
                            Alert.alert(
                              "Email verified!",
                              "You may now complete the form."
                            );
                          } catch (err: any) {
                            setDriverOtpError(
                              err.message || "Failed to verify code."
                            );
                          } finally {
                            setDriverOtpSendLoading(false);
                          }
                        }}
                        disabled={
                          driverOtpSendLoading || driverOtp.length !== 6
                        }
                        className="flex-1 rounded-xl bg-[#2563EB] py-2 items-center"
                      >
                        <Text className="font-extrabold text-white">
                          {driverOtpSendLoading ? "Verifying..." : "Verify"}
                        </Text>
                      </Pressable>
                    </View>

                    <Pressable
                      onPress={() => setShowDriverOtpModal(false)}
                      className="mt-4 items-center"
                    >
                      <Text className="text-xs text-gray-500 underline">
                        Cancel
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </Modal>

              {/* Driver rest of form (disabled until verified) */}
              <FieldRow
                icon="person-outline"
                placeholder="Full name"
                value={dFullname}
                onChangeText={(t) => {
                  setDFullname(t);
                  markTouchedD("dFullname");
                }}
                editable={driverEmailVerified}
                error={
                  driverEmailVerified && touchedD.dFullname
                    ? errorsD.dFullname
                    : undefined
                }
                onBlur={() => markTouchedD("dFullname")}
              />
              <FieldRow
                icon="call-outline"
                placeholder="Phone Number"
                value={dPhone}
                onChangeText={(t) => {
                  setDPhone(t);
                  markTouchedD("dPhone");
                }}
                keyboardType="phone-pad"
                editable={driverEmailVerified}
                error={
                  driverEmailVerified && touchedD.dPhone
                    ? errorsD.dPhone
                    : undefined
                }
                onBlur={() => markTouchedD("dPhone")}
              />
              <FieldRow
                icon="location-outline"
                placeholder="Address"
                value={dAddress}
                onChangeText={(t) => {
                  setDAddress(t);
                  markTouchedD("dAddress");
                }}
                editable={driverEmailVerified}
                error={
                  driverEmailVerified && touchedD.dAddress
                    ? errorsD.dAddress
                    : undefined
                }
                onBlur={() => markTouchedD("dAddress")}
              />
              <FieldRow
                icon="lock-closed-outline"
                placeholder="Password (min 8, 1 uppercase, 1 special)"
                value={dPw}
                onChangeText={(t) => {
                  setDPw(t);
                  markTouchedD("dPw");
                }}
                secureTextEntry
                toggleableSecure
                editable={driverEmailVerified}
                error={
                  driverEmailVerified && touchedD.dPw ? errorsD.dPw : undefined
                }
                onBlur={() => markTouchedD("dPw")}
              />
              <FieldRow
                icon="lock-closed-outline"
                placeholder="Confirm Password"
                value={dCpw}
                onChangeText={(t) => {
                  setDCpw(t);
                  markTouchedD("dCpw");
                }}
                secureTextEntry
                toggleableSecure
                editable={driverEmailVerified}
                error={
                  driverEmailVerified && touchedD.dCpw
                    ? errorsD.dCpw
                    : undefined
                }
                onBlur={() => markTouchedD("dCpw")}
              />

              <Pressable
                onPress={submitDriver}
                disabled={!canDriverSubmit}
                className={`mt-1 items-center rounded-2xl py-3 ${
                  canDriverSubmit ? "bg-[#2563EB]" : "bg-[#93C5FD]"
                }`}
              >
                <Text className="text-[15px] font-extrabold text-white">
                  Sign up
                </Text>
              </Pressable>
            </>
          )}

          {/* SHOP VIEW */}
          {role === "shop" && (
            <>
              <View className="mt-4 mb-2">
                <Text className="text-sm font-semibold text-gray-900">
                  Shop details
                </Text>
              </View>

              <Select
                label="Shop"
                value={shopName}
                placeholder={
                  shopListLoading ? "Loading shops…" : "Select your shop"
                }
                options={[
                  ...shopOptions,
                  { label: "Shop not Listed", value: "Shop not Listed" },
                ]}
                onSelect={(v) => {
                  if (shopLocked) return;
                  setShopName(v);
                  markTouchedS("shopName");
                  if (v === "Shop not Listed") {
                    setAskLocation(true);
                  } else {
                    // reset unlisted fields
                    setShopType(null);
                    setUnlistedName("");
                    setServiceFor(null);
                    setLocationPromptShown(false);
                    setLocationEnabled(false);
                    setCoords(null);
                    setPlusCode(null);
                    setShopAddress("");
                  }
                }}
                disabled={shopLocked || shopListLoading}
                error={touchedS.shopName ? errorsS.shopName : undefined}
              />

              {shopListError ? (
                <Text className="text-xs text-red-500 ml-1">
                  {shopListError}
                </Text>
              ) : null}

              {!shopListLoading && shopOptions.length === 0 ? (
                <Text className="text-xs text-gray-500 ml-1">
                  No available listed shops yet. You can choose "Shop not
                  Listed".
                </Text>
              ) : null}

              {shopName === "Shop not Listed" && (
                <View className="mt-3">
                  <Select
                    label="Type of Shop"
                    value={shopType}
                    placeholder="Select type"
                    options={SHOP_TYPE_OPTIONS}
                    onSelect={(v) => {
                      if (shopLocked) return;
                      setShopType(v);
                      markTouchedS("shopType");
                    }}
                    disabled={shopLocked}
                    error={touchedS.shopType ? errorsS.shopType : undefined}
                  />

                  {/* NEW: Shop Name input */}
                  <View className="mt-3">
                    <FieldRow
                      icon="business-outline"
                      placeholder="Shop Name"
                      value={unlistedName}
                      onChangeText={(t) => {
                        setUnlistedName(t);
                        markTouchedS("unlistedName");
                      }}
                      editable={!shopLocked}
                      error={
                        touchedS.unlistedName ? errorsS.unlistedName : undefined
                      }
                      onBlur={() => markTouchedS("unlistedName")}
                    />
                  </View>

                  {/* NEW: Service offered to */}
                  <View className="mt-1.5">
                    <Select
                      label="Service offered to"
                      value={serviceFor}
                      placeholder="Select coverage"
                      options={SERVICE_FOR_CHOICES as any}
                      onSelect={(v) => {
                        if (shopLocked) return;
                        setServiceFor(v);
                        markTouchedS("serviceFor");
                      }}
                      disabled={shopLocked}
                      error={
                        touchedS.serviceFor ? errorsS.serviceFor : undefined
                      }
                    />
                  </View>
                </View>
              )}

              {locationPromptShown && !shopLocked && (
                <View className="mt-3 flex-row items-center gap-3 rounded-xl border border-gray-300 bg-[#F8FAFF] p-3">
                  <Ionicons name="location-outline" size={18} />
                  <View className="flex-1">
                    <Text className="font-semibold text-gray-900">
                      Location access enabled
                    </Text>
                    <Text className="text-xs text-gray-500">
                      {coords
                        ? `Lat ${coords.lat.toFixed(
                            5
                          )}, Lng ${coords.lng.toFixed(5)}${
                            plusCode ? ` • Plus Code ${plusCode}` : ""
                          }`
                        : "Your shop will be registered at your current address."}
                    </Text>
                  </View>
                  <Pressable
                    onPress={async () => {
                      if (locationEnabled) {
                        setLocationEnabled(false);
                        setCoords(null);
                        setPlusCode(null);
                        setLocationPromptShown(false);
                        setShopAddress("");
                      } else {
                        await requestLocation();
                      }
                    }}
                    className={`rounded-md border px-3 py-2 ${
                      locationEnabled ? "border-green-600" : "border-gray-300"
                    }`}
                  >
                    <Text
                      className={`text-xs font-bold ${
                        locationEnabled ? "text-green-600" : "text-gray-900"
                      }`}
                    >
                      {locationEnabled ? "Enabled ✓" : "Enable"}
                    </Text>
                  </Pressable>
                </View>
              )}

              {shopName === "Shop not Listed" && locationEnabled && (
                <View className="mt-3">
                  <FieldRow
                    icon="location-outline"
                    placeholder="Shop address (auto from your location)"
                    value={shopAddress}
                    onChangeText={(t) => {
                      setShopAddress(t);
                      markTouchedS("shopAddress");
                    }}
                    editable={!shopLocked}
                    error={
                      touchedS.shopAddress ? errorsS.shopAddress : undefined
                    }
                    onBlur={() => markTouchedS("shopAddress")}
                  />
                  <Text className="ml-1 text-[11px] text-gray-500">
                    Based on Lat {coords?.lat.toFixed(5)}, Lng{" "}
                    {coords?.lng.toFixed(5)}
                    {plusCode ? ` • Plus Code ${plusCode}` : ""}
                  </Text>
                </View>
              )}

              <View className="mt-5 mb-2">
                <Text className="text-sm font-semibold text-gray-900">
                  Contact person
                </Text>
              </View>

              <FieldRow
                icon="person-outline"
                placeholder="Full name"
                value={sFullname}
                onChangeText={(t) => {
                  setSFullname(t);
                  markTouchedS("sFullname");
                }}
                editable={!shopLocked}
                error={touchedS.sFullname ? errorsS.sFullname : undefined}
                onBlur={() => markTouchedS("sFullname")}
              />

              <FieldRow
                icon="mail-outline"
                placeholder="Email"
                value={sEmail}
                onChangeText={(t) => {
                  setSEmail(t);
                  markTouchedS("sEmail");
                }}
                keyboardType="email-address"
                editable={
                  !driverEmailVerified &&
                  !sEmailCheckLoading &&
                  !shopEmailVerified
                }
                error={
                  touchedS.sEmail
                    ? errorsS.sEmail || sEmailCheckError
                    : undefined
                }
                onBlur={() => markTouchedS("sEmail")}
              />

              {driverEmailVerified ? (
                <Text className="mt-1 ml-1 text-xs text-green-600">
                  Using your verified driver email ✓
                </Text>
              ) : null}

              {!driverEmailVerified && !shopEmailVerified && (
                <Pressable
                  onPress={async () => {
                    setSEmailCheckError("");
                    setSEmailCheckLoading(true);
                    try {
                      const normalized = sEmail.trim().toLowerCase();
                      markTouchedS("sEmail");
                      if (!isEmail(normalized)) {
                        setSEmailCheckError("Enter a valid email.");
                        return;
                      }
                      const exists = await emailExistsInAppUser(normalized);
                      if (exists) {
                        setSEmailCheckError("Email already exist");
                        setShowShopOtpModal(false);
                        setShopEmailVerified(false);
                        return;
                      }
                      const { error } = await supabase.auth.signInWithOtp({
                        email: normalized,
                        options: { shouldCreateUser: true },
                      });
                      if (error) throw error;
                      setShowShopOtpModal(true);
                    } catch (err: any) {
                      setSEmailCheckError(
                        err?.message || "Failed to verify email."
                      );
                    } finally {
                      setSEmailCheckLoading(false);
                    }
                  }}
                  disabled={sEmailCheckLoading || !isEmail(sEmail)}
                  className={`mt-1 items-center rounded-2xl py-3 ${
                    isEmail(sEmail) && !sEmailCheckLoading
                      ? "bg-[#2563EB]"
                      : "bg-[#93C5FD]"
                  }`}
                >
                  <Text className="text-[15px] font-extrabold text-white">
                    {sEmailCheckLoading ? "Checking..." : "Verify Email"}
                  </Text>
                </Pressable>
              )}

              {/* SHOP OTP Modal */}
              <Modal
                visible={showShopOtpModal}
                transparent
                animationType="fade"
                onRequestClose={() => setShowShopOtpModal(false)}
              >
                <View className="flex-1 items-center justify-center bg-black/35 p-4">
                  <View className="w-full rounded-2xl border border-gray-200 bg-white p-5">
                    <Text className="mb-2 text-base font-extrabold text-gray-900">
                      Enter the code sent to your email
                    </Text>
                    <Text className="mb-4 text-gray-900">
                      Please check your inbox (and spam folder) for a 6-digit
                      code.
                    </Text>

                    <TextInput
                      value={sOtp}
                      onChangeText={setSOtp}
                      placeholder="Enter code"
                      keyboardType="number-pad"
                      maxLength={6}
                      className="mb-2 border border-gray-300 rounded-xl px-3 py-2 text-lg text-center"
                      style={{ letterSpacing: 8 }}
                    />

                    {sOtpError ? (
                      <Text className="mb-2 text-xs text-red-500">
                        {sOtpError}
                      </Text>
                    ) : null}

                    <View className="flex-row justify-between gap-2 mt-2">
                      <Pressable
                        onPress={async () => {
                          setSOtpError("");
                          setSOtpResendLoading(true);
                          try {
                            const normalized = sEmail.trim().toLowerCase();
                            const { error } = await supabase.auth.signInWithOtp(
                              {
                                email: normalized,
                                options: { shouldCreateUser: true },
                              }
                            );
                            if (error)
                              setSOtpError(
                                error.message || "Failed to resend OTP."
                              );
                          } catch (err: any) {
                            setSOtpError(
                              err.message || "Failed to resend OTP."
                            );
                          } finally {
                            setSOtpResendLoading(false);
                          }
                        }}
                        disabled={sOtpResendLoading}
                        className="flex-1 rounded-xl border border-gray-300 py-2 items-center"
                      >
                        <Text className="font-bold text-gray-900">
                          {sOtpResendLoading ? "Resending..." : "Resend"}
                        </Text>
                      </Pressable>

                      <Pressable
                        onPress={async () => {
                          setSOtpError("");
                          setSOtpSendLoading(true);
                          try {
                            const normalized = sEmail.trim().toLowerCase();
                            const { error } = await supabase.auth.verifyOtp({
                              email: normalized,
                              token: sOtp,
                              type: "email",
                            });
                            if (error) {
                              setSOtpError(error.message || "Invalid code.");
                              return;
                            }
                            const session = await waitForSession();
                            if (!session) {
                              setSOtpError(
                                "Could not establish a session. Please try again."
                              );
                              return;
                            }
                            setShowShopOtpModal(false);
                            setShopEmailVerified(true);
                            Alert.alert(
                              "Email verified!",
                              "You may now complete the form."
                            );
                          } catch (err: any) {
                            setSOtpError(err.message || "Failed to verify.");
                          } finally {
                            setSOtpSendLoading(false);
                          }
                        }}
                        disabled={sOtpSendLoading || sOtp.length !== 6}
                        className="flex-1 rounded-xl bg-[#2563EB] py-2 items-center"
                      >
                        <Text className="font-extrabold text-white">
                          {sOtpSendLoading ? "Verifying..." : "Verify"}
                        </Text>
                      </Pressable>
                    </View>

                    <Pressable
                      onPress={() => setShowShopOtpModal(false)}
                      className="mt-4 items-center"
                    >
                      <Text className="text-xs text-gray-500 underline">
                        Cancel
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </Modal>

              {/* Phone & Address */}
              <FieldRow
                icon="call-outline"
                placeholder="Phone Number"
                value={sPhone}
                onChangeText={(t) => {
                  setSPhone(t);
                  markTouchedS("sPhone");
                }}
                keyboardType="phone-pad"
                editable={!shopLocked}
                error={touchedS.sPhone ? errorsS.sPhone : undefined}
                onBlur={() => markTouchedS("sPhone")}
              />
              <FieldRow
                icon="location-outline"
                placeholder="Contact address"
                value={sAddress}
                onChangeText={(t) => {
                  setSAddress(t);
                  markTouchedS("sAddress");
                }}
                editable={!shopLocked}
                error={touchedS.sAddress ? errorsS.sAddress : undefined}
                onBlur={() => markTouchedS("sAddress")}
              />

              {/* Services - Updated to ScrollView Checklist */}
            <View className="mt-4 mb-2">
              <View className="flex-row justify-between items-center">
                <Text className="text-sm font-semibold text-gray-900">
                  Services offered
                </Text>
                <Pressable
                  onPress={handleSelectAllServices}
                  disabled={shopLocked}
                  className={`border border-gray-300 rounded-lg px-3 py-1 ${
                    shopLocked ? "opacity-50" : ""
                  }`}
                >
                  <Text className={`text-xs ${
                    shopLocked ? "text-gray-400" : "text-gray-700"
                  }`}>
                    {services.length === SERVICES.length ? "Deselect All" : "Select All"}
                  </Text>
                </Pressable>
              </View>
              {errorsS.services ? (
                <Text className="text-xs text-red-500 mt-1">
                  {errorsS.services}
                </Text>
              ) : null}
            </View>
              <ScrollView 
                style={{ maxHeight: 200 }}
                className="border border-gray-300 rounded-xl bg-white"
                nestedScrollEnabled
              >
                {SERVICES.map((s) => {
                  const on = services.includes(s);
                  return (
                    <Pressable
                      key={s}
                      onPress={() => !shopLocked && toggleService(s)}
                      className={`flex-row items-center px-4 py-3 border-b border-gray-100 ${
                        on ? "bg-blue-50" : "bg-white"
                      }`}
                      style={shopLocked ? { opacity: 0.5 } : undefined}
                    >
                      <View className={`h-5 w-5 border rounded-md mr-3 items-center justify-center ${
                        on ? "bg-blue-500 border-blue-500" : "border-gray-400"
                      }`}>
                        {on && <Ionicons name="checkmark" size={14} color="white" />}
                      </View>
                      <Text className={`text-sm ${on ? "text-blue-700 font-medium" : "text-gray-800"}`}>
                        {s}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {/* Operating days - Updated to Checklist */}
              <View className="mt-5 mb-2">
                <View className="flex-row justify-between items-center">
                  <Text className="text-sm font-semibold text-gray-900">
                    Operating days
                  </Text>
                  <Pressable
                    onPress={handleSelectAllDays}
                    disabled={shopLocked}
                    className={`border border-gray-300 rounded-lg px-3 py-1 ${
                      shopLocked ? "opacity-50" : ""
                    }`}
                  >
                    <Text className={`text-xs ${
                      shopLocked ? "text-gray-400" : "text-gray-700"
                    }`}>
                      {days.length === DAY_KEYS.length ? "Deselect All" : "Select All"}
                    </Text>
                  </Pressable>
                </View>
                {errorsS.days ? (
                  <Text className="text-xs text-red-500 mt-1">
                    {errorsS.days}
                  </Text>
                ) : null}
              </View>


              <View className="border border-gray-300 rounded-xl bg-white p-3">
                {DAY_LABELS.map((lbl, i) => {
                  const key = DAY_KEYS[i];
                  const on = days.includes(key);
                  return (
                    <Pressable
                      key={key}
                      onPress={() => !shopLocked && toggleDay(key)}
                      className={`flex-row items-center py-2 ${
                        i < DAY_LABELS.length - 1 ? "border-b border-gray-100" : ""
                      }`}
                      style={shopLocked ? { opacity: 0.5 } : undefined}
                    >
                      <View className={`h-5 w-5 border rounded-md mr-3 items-center justify-center ${
                        on ? "bg-blue-500 border-blue-500" : "border-gray-400"
                      }`}>
                        {on && <Ionicons name="checkmark" size={14} color="white" />}
                      </View>
                      <Text className={`text-sm ${on ? "text-blue-700 font-medium" : "text-gray-800"}`}>
                        {lbl}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Operating hours - Updated with AM/PM dropdown */}
              <View className="mt-5 mb-2">
                <Text className="text-sm font-semibold text-gray-900">
                  Operating hours
                </Text>
              </View>
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Text className="ml-1 text-xs text-gray-600">Opens</Text>
                  <TimeInput
                    value={openTime}
                    onChange={setOpenTime}
                    placeholder="hh:mm"
                    error={errorsS.openTime}
                    editable={!shopLocked}
                  />
                  {errorsS.openTime ? (
                    <Text className="mt-1 ml-1 text-xs text-red-500">
                      {errorsS.openTime}
                    </Text>
                  ) : null}
                </View>

                <View className="flex-1">
                  <Text className="ml-1 text-xs text-gray-600">Closes</Text>
                  <TimeInput
                    value={closeTime}
                    onChange={setCloseTime}
                    placeholder="hh:mm"
                    error={errorsS.closeTime}
                    editable={!shopLocked}
                  />
                  {errorsS.closeTime ? (
                    <Text className="mt-1 ml-1 text-xs text-red-500">
                      {errorsS.closeTime}
                    </Text>
                  ) : null}
                </View>
              </View>

              {/* Security */}
              <View className="mt-5 mb-2">
                <Text className="text-sm font-semibold text-gray-900">
                  Security
                </Text>
              </View>
              <FieldRow
                icon="lock-closed-outline"
                placeholder="Password (min 8, 1 uppercase, 1 special)"
                value={sPw}
                onChangeText={(t) => {
                  setSPw(t);
                  markTouchedS("sPw");
                }}
                secureTextEntry
                toggleableSecure
                editable={!shopLocked}
                error={touchedS.sPw ? errorsS.sPw : undefined}
                onBlur={() => markTouchedS("sPw")}
              />
              <FieldRow
                icon="lock-closed-outline"
                placeholder="Confirm Password"
                value={sCpw}
                onChangeText={(t) => {
                  setSCpw(t);
                  markTouchedS("sCpw");
                }}
                secureTextEntry
                toggleableSecure
                editable={!shopLocked}
                error={touchedS.sCpw ? errorsS.sCpw : undefined}
                onBlur={() => markTouchedS("sCpw")}
              />

              {/* Certificates */}
              <View className="mt-5 mb-2">
                <Text className="text-sm font-semibold text-gray-900">
                  Business proof / certificates
                </Text>
                <Text className="text-xs text-gray-500">
                  Upload at least one (DTI/BIR/Mayor's permit, etc.).
                </Text>
                {errorsS.certificate ? (
                  <Text className="text-xs text-red-500 mt-1">
                    {errorsS.certificate}
                  </Text>
                ) : null}
              </View>

              <ActionsDropdown
                label="Upload options"
                onPick={handleCertAction}
                disabled={shopLocked}
              />

              <View className="mt-3 flex-row flex-wrap gap-3">
                {certs.map((f, idx) => {
                  const isImg =
                    (f.mime ?? "").startsWith("image/") ||
                    /\.(png|jpe?g|gif|webp|bmp)$/i.test(f.name);
                  return (
                    <View
                      key={`${f.uri}-${idx}`}
                      className="relative h-24 w-24 overflow-hidden rounded-xl border border-gray-300 bg-white"
                    >
                      <Pressable
                        className="absolute right-1 top-1 z-10 h-6 w-6 items-center justify-center rounded-full bg-black/60"
                        onPress={() =>
                          setCerts((prev) => prev.filter((_, i) => i !== idx))
                        }
                        hitSlop={10}
                      >
                        <Ionicons name="close" size={14} color="#fff" />
                      </Pressable>

                      <Pressable
                        className="flex-1"
                        onPress={() => setPreviewIndex(idx)}
                      >
                        {isImg ? (
                          <RNImage
                            source={{ uri: f.uri }}
                            className="h-full w-full"
                          />
                        ) : (
                          <View className="h-full w-full items-center justify-center">
                            <Ionicons name="document-text-outline" size={28} />
                            <Text
                              numberOfLines={2}
                              className="px-1 text-center text-[10px]"
                            >
                              {f.name}
                            </Text>
                          </View>
                        )}
                      </Pressable>
                    </View>
                  );
                })}
              </View>

              <Pressable
                onPress={submitShop}
                disabled={!canShopSubmit}
                className={`mt-5 items-center rounded-2xl py-3 ${
                  canShopSubmit ? "bg-[#2563EB]" : "bg-[#93C5FD]"
                }`}
              >
                <Text className="text-[15px] font-extrabold text-white">
                  Submit shop
                </Text>
              </Pressable>

              {!shopEmailVerified && !driverEmailVerified ? (
                <Text className="mt-2 text-xs text-gray-500">
                  You need to verify your email first to enable the form.
                </Text>
              ) : null}
            </>
          )}
        </View>

        <View className="mt-4 items-center">
          <Text className="text-sm text-gray-700">
            Already have an account?{" "}
            <Text
              className="text-[#2563EB]"
              onPress={() => router.push("/login")}
            >
              Sign in
            </Text>
          </Text>
        </View>
      </ScrollView>

      {/* PREVIEW MODAL */}
      <Modal
        visible={previewIndex !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewIndex(null)}
      >
        <View className="flex-1 items-center justify-center bg-black/60 p-4">
          <View className="w-full max-w-xl rounded-2xl bg-white p-3">
            {(() => {
              const file = previewIndex !== null ? certs[previewIndex] : null;
              if (!file) return null;
              const isImg =
                (file.mime ?? "").startsWith("image/") ||
                /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name);
              return isImg ? (
                <RNImage
                  source={{ uri: file.uri }}
                  style={{ width: "100%", height: 360, borderRadius: 12 }}
                  resizeMode="contain"
                />
              ) : (
                <View className="items-center p-6">
                  <Ionicons name="document-text-outline" size={48} />
                  <Text className="mt-2 text-sm font-semibold text-gray-900">
                    {file.name}
                  </Text>
                </View>
              );
            })()}
            <View className="mt-3 flex-row justify-end gap-2">
              <Pressable
                onPress={() => openFileExternally(previewIndex)}
                className="rounded-xl border border-gray-300 px-4 py-2"
              >
                <Text className="font-bold text-gray-900">Open</Text>
              </Pressable>
              <Pressable
                onPress={() => setPreviewIndex(null)}
                className="rounded-xl bg-[#2563EB] px-4 py-2"
              >
                <Text className="font-extrabold text-white">Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ASK-FIRST MODALS */}
      <Modal
        visible={askCamera}
        transparent
        animationType="fade"
        onRequestClose={() => setAskCamera(false)}
      >
        <Pressable
          onPress={() => setAskCamera(false)}
          className="flex-1 items-center justify-center bg-black/35 p-4"
        >
          <View className="w-full rounded-2xl border border-gray-200 bg-white p-5">
            <Text className="mb-2 text-base font-extrabold text-gray-900">
              Use camera?
            </Text>
            <Text className="text-gray-900">
              We'll open your camera to capture a certificate photo.
            </Text>
            <View className="mt-3 flex-row justify-end gap-2">
              <Pressable
                onPress={() => setAskCamera(false)}
                className="rounded-xl border border-gray-300 px-4 py-2"
              >
                <Text className="font-bold text-gray-900">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  setAskCamera(false);
                  await reallyOpenCamera();
                }}
                className="rounded-xl bg-[#2563EB] px-4 py-2"
              >
                <Text className="font-extrabold text-white">Continue</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={askGallery}
        transparent
        animationType="fade"
        onRequestClose={() => setAskGallery(false)}
      >
        <Pressable
          onPress={() => setAskGallery(false)}
          className="flex-1 items-center justify-center bg-black/35 p-4"
        >
          <View className="w-full rounded-2xl border border-gray-200 bg-white p-5">
            <Text className="mb-2 text-base font-extrabold text-gray-900">
              Pick from gallery?
            </Text>
            <Text className="text-gray-900">
              Choose existing images of your certificates.
            </Text>
            <View className="mt-3 flex-row justify-end gap-2">
              <Pressable
                onPress={() => setAskGallery(false)}
                className="rounded-xl border border-gray-300 px-4 py-2"
              >
                <Text className="font-bold text-gray-900">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  setAskGallery(false);
                  await reallyPickImage();
                }}
                className="rounded-xl bg-[#2563EB] px-4 py-2"
              >
                <Text className="font-extrabold text-white">Continue</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={askFiles}
        transparent
        animationType="fade"
        onRequestClose={() => setAskFiles(false)}
      >
        <Pressable
          onPress={() => setAskFiles(false)}
          className="flex-1 items-center justify-center bg-black/35 p-4"
        >
          <View className="w-full rounded-2xl border border-gray-200 bg-white p-5">
            <Text className="mb-2 text-base font-extrabold text-gray-900">
              Pick documents?
            </Text>
            <Text className="text-gray-900">
              Choose PDFs, Word docs, or images as proof.
            </Text>
            <View className="mt-3 flex-row justify-end gap-2">
              <Pressable
                onPress={() => setAskFiles(false)}
                className="rounded-xl border border-gray-300 px-4 py-2"
              >
                <Text className="font-bold text-gray-900">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  setAskFiles(false);
                  await reallyPickDocument();
                }}
                className="rounded-xl bg-[#2563EB] px-4 py-2"
              >
                <Text className="font-extrabold text-white">Continue</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={askLocation}
        transparent
        animationType="fade"
        onRequestClose={() => setAskLocation(false)}
      >
        <Pressable
          onPress={() => setAskLocation(false)}
          className="flex-1 items-center justify-center bg-black/35 p-4"
        >
          <View className="w-full rounded-2xl border border-gray-200 bg-white p-5">
            <Text className="mb-2 text-base font-extrabold text-gray-900">
              Enable location?
            </Text>
            <Text className="text-gray-900">
              We need your current location to register a shop that is not yet
              in the list.
            </Text>
            <View className="mt-3 flex-row justify-end gap-2">
              <Pressable
                onPress={() => setAskLocation(false)}
                className="rounded-xl border border-gray-300 px-4 py-2"
              >
                <Text className="font-bold text-gray-900">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  await requestLocation();
                  setAskLocation(false);
                }}
                className="rounded-xl bg-[#2563EB] px-4 py-2"
              >
                <Text className="font-extrabold text-white">Enable</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
      <LoadingScreen visible={loading} message="Creating your account..." />
    </View>
  );
}