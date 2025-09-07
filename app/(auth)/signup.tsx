// app/(auth)/signup.tsx
import { Ionicons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
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
import CheckboxRow from "../../components/CheckboxRow";
import DayCheck from "../../components/DayCheck";
import Section from "../../components/Section";
import LoadingScreen from "../../components/LoadingScreen";

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

const DAY_LABELS = ["M", "T", "W", "Th", "F", "Sat", "Sun"];
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/* ----------------------------- Validators ----------------------------- */
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const isPhone = (v: string) => /^[0-9+\-\s]{7,15}$/.test(v);
const hasMin = (v: string, n: number) => v.trim().length >= n;
const isTime = (v: string) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(v);

/* ------------------------- Reusable tiny components ------------------------- */
function Select({
  label,
  value,
  placeholder,
  options,
  onSelect,
  error,
}: {
  label: string;
  value: string | null;
  placeholder?: string;
  options:
    | ReadonlyArray<string>
    | ReadonlyArray<{ label: string; value: string }>;
  onSelect: (val: string) => void;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const normalized = options.map((o) =>
    typeof o === "string" ? { label: o, value: o } : o
  );
  const selectedLabel =
    normalized.find((o) => o.value === value)?.label ?? value ?? "";

  const borderCls = error ? "border-red-400" : "border-gray-300";

  return (
    <View className="gap-1.5">
      <Text className="ml-1 text-xs text-gray-600">{label}</Text>

      <Pressable
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
      {error ? <Text className="text-xs text-red-500 ml-1">{error}</Text> : null}

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

function FieldRow({
  icon,
  placeholder,
  value,
  onChangeText,
  keyboardType,
  secureTextEntry,
  toggleableSecure, // NEW: enable eye/eye-off toggle
  error,
}: {
  icon: any;
  placeholder: string;
  value: string;
  onChangeText: (t: string) => void;
  keyboardType?: "default" | "email-address" | "phone-pad";
  secureTextEntry?: boolean;
  toggleableSecure?: boolean;
  error?: string;
}) {
  const [show, setShow] = React.useState(false);
  const borderCls = error ? "border-red-400" : "border-gray-300";
  const isSecure = toggleableSecure ? !show && !!secureTextEntry : !!secureTextEntry;

  return (
    <View className="mb-3">
      <View className={`flex-row items-center rounded-xl border ${borderCls} bg-white px-3`}>
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
        />
        {toggleableSecure ? (
          <Pressable
            onPress={() => setShow((s) => !s)}
            hitSlop={8}
            accessibilityLabel={show ? "Hide password" : "Show password"}
            className="pl-2 py-2"
          >
            <Ionicons name={show ? "eye-off-outline" : "eye-outline"} size={18} />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text className="mt-1 ml-1 text-xs text-red-500">{error}</Text> : null}
    </View>
  );
}

/* ------------------------- Small dropdown menu (actions) ------------------------- */
function ActionsDropdown({
  label,
  onPick,
}: {
  label: string;
  onPick: (action: "camera" | "gallery" | "file" | "request") => void;
}) {
  const [open, setOpen] = useState(false);
  const items = [
    { label: "Take Photo", value: "camera" },
    { label: "Pick from Gallery", value: "gallery" },
    { label: "Choose File (PDF/Doc/Image)", value: "file" },
    { label: "Request a certificate", value: "request" },
  ] as const;

  return (
    <View className="gap-1.5">
      <Text className="ml-1 text-xs text-gray-600">{label}</Text>
      <Pressable
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

/* --------------------------------- Screen --------------------------------- */
export default function Signup() {
  const [loading, setLoading] = useState(false);

  // Role (default driver)
  const [role, setRole] = useState<"driver" | "shop" | null>("driver");

  /* Driver fields */
  const [dFullname, setDFullname] = useState("");
  const [dEmail, setDEmail] = useState("");
  const [dPhone, setDPhone] = useState("");
  const [dPw, setDPw] = useState("");
  const [dCpw, setDCpw] = useState("");

  /* Shop fields */
  const [shopType, setShopType] = useState<string | null>(null);
  const [shopName, setShopName] = useState<string | null>(null);
  const [showNotListedModal, setShowNotListedModal] = useState(false);

  const [locationPromptShown, setLocationPromptShown] = useState(false);
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  const [sFullname, setSFullname] = useState("");
  const [sEmail, setSEmail] = useState("");
  const [sPhone, setSPhone] = useState("");
  const [services, setServices] = useState<string[]>([]);
  const [days, setDays] = useState<string[]>([]);
  const [openTime, setOpenTime] = useState("08:00");
  const [closeTime, setCloseTime] = useState("22:00");
  const [sPw, setSPw] = useState("");
  const [sCpw, setSCpw] = useState("");

  // Certificates / files (MULTI)
  type CertFile = { uri: string; name: string; mime: string | null };
  const [certs, setCerts] = useState<CertFile[]>([]);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  // Ask-first modals
  const [askCamera, setAskCamera] = useState(false);
  const [askGallery, setAskGallery] = useState(false);
  const [askFiles, setAskFiles] = useState(false);
  const [askLocation, setAskLocation] = useState(false);

  /* ----------------------------- Validation state ----------------------------- */
  const [errorsD, setErrorsD] = useState<{ [k: string]: string | undefined }>(
    {}
  );
  const [errorsS, setErrorsS] = useState<{ [k: string]: string | undefined }>(
    {}
  );

  /* ----------------------------- Helpers ----------------------------- */
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

  /* ----------------------------- File pickers (with ask-first) ----------------------------- */
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

  const reallyPickDocument = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "image/*",
      ],
      copyToCacheDirectory: true,
      multiple: true, // allow multi-pick
    });
    if (res.canceled) return;
    const files = res.assets ?? [];
    setCerts((prev) => [
      ...prev,
      ...files.map((f) => ({
        uri: f.uri,
        name: f.name ?? "document",
        mime: f.mimeType ?? null,
      })),
    ]);
  };

  const openFileExternally = async (idx: number | null) => {
    if (idx == null) return;
    const file = certs[idx];
    if (!file) return;
    try {
      await Linking.openURL(file.uri);
    } catch {
      // no-op
    }
  };

  /* ----------------------------- Location permission ----------------------------- */
  const requestLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Location permission was denied.");
      setLocationEnabled(false);
      setCoords(null);
      return;
    }
    setLocationEnabled(true);
    const pos = await Location.getCurrentPositionAsync({});
    setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    setLocationPromptShown(true);
  };

  /* ----------------------------- Validation rules ----------------------------- */
  const driverValid = useMemo(() => {
    const e: any = {};
    if (!hasMin(dFullname, 2)) e.dFullname = "Full name is required.";
    if (!isEmail(dEmail)) e.dEmail = "Enter a valid email.";
    if (!isPhone(dPhone)) e.dPhone = "Enter a valid phone (7–15 digits).";
    if (!hasMin(dPw, 6)) e.dPw = "Min 6 characters.";
    if (dCpw !== dPw) e.dCpw = "Passwords do not match.";
    setErrorsD(e);
    return Object.keys(e).length === 0;
  }, [dFullname, dEmail, dPhone, dPw, dCpw]);

  const shopValid = useMemo(() => {
    const e: any = {};
    if (!shopType) e.shopType = "Select a shop type.";
    if (!shopName) e.shopName = "Select your shop.";
    if (shopName === "Shop not Listed" && !locationEnabled)
      e.shopName = "Enable location to register 'Shop not Listed'.";
    if (!hasMin(sFullname, 2)) e.sFullname = "Full name is required.";
    if (!isEmail(sEmail)) e.sEmail = "Enter a valid email.";
    if (!isPhone(sPhone)) e.sPhone = "Enter a valid phone (7–15 digits).";
    if (!hasMin(sPw, 6)) e.sPw = "Min 6 characters.";
    if (sCpw !== sPw) e.sCpw = "Passwords do not match.";
    if (services.length === 0) e.services = "Pick at least 1 service.";
    if (days.length === 0) e.days = "Pick at least 1 operating day.";
    if (!openTime.trim() || !isTime(openTime))
      e.openTime = "Open time (HH:MM) required.";
    if (!closeTime.trim() || !isTime(closeTime))
      e.closeTime = "Close time (HH:MM) required.";
    if (isTime(openTime) && isTime(closeTime)) {
      const [oh, om] = openTime.split(":").map(Number);
      const [ch, cm] = closeTime.split(":").map(Number);
      if (oh * 60 + om >= ch * 60 + cm) {
        e.closeTime = "Close time must be after open time.";
      }
    }
    if (certs.length === 0) e.certificate = "Upload at least one certificate/proof.";
    setErrorsS(e);
    return Object.keys(e).length === 0;
  }, [
    shopType,
    shopName,
    locationEnabled,
    sFullname,
    sEmail,
    sPhone,
    sPw,
    sCpw,
    services,
    days,
    openTime,
    closeTime,
    certs,
  ]);

  const canDriverSubmit = role === "driver" && driverValid;
  const canShopSubmit = role === "shop" && shopValid;

  /* ----------------------------- Submit handlers ----------------------------- */
  const afterSignupNotice = () =>
    Alert.alert(
      "Submitted!",
      "Your account has been created and needs to be verified by the admins first. You'll be notified once approved."
    );

  const submitDriver = () => {
    if (!driverValid) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      afterSignupNotice();
    }, 900);
  };

  const submitShop = () => {
    if (!shopValid) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      afterSignupNotice();
    }, 900);
  };

  /* ----------------------------- Actions from dropdown ----------------------------- */
  const handleCertAction = (action: "camera" | "gallery" | "file" | "request") => {
    if (action === "camera") {
      setAskCamera(true); // ask first
    } else if (action === "gallery") {
      setAskGallery(true); // ask first
    } else if (action === "file") {
      setAskFiles(true); // ask first
    } else if (action === "request") {
      Alert.alert(
        "Request a certificate",
        "Please contact your local office or upload an existing proof (business permit, DTI, BIR, etc.)."
      );
    }
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
          <RNImage
            className="h-16 w-16 mb-2"
            resizeMode="contain"
          />
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

              <FieldRow
                icon="person-outline"
                placeholder="Full name"
                value={dFullname}
                onChangeText={setDFullname}
                error={errorsD.dFullname}
              />
              <FieldRow
                icon="mail-outline"
                placeholder="Email"
                value={dEmail}
                onChangeText={setDEmail}
                keyboardType="email-address"
                error={errorsD.dEmail}
              />
              <FieldRow
                icon="call-outline"
                placeholder="Phone Number"
                value={dPhone}
                onChangeText={setDPhone}
                keyboardType="phone-pad"
                error={errorsD.dPhone}
              />
              {/* Security under phone */}
              <FieldRow
                icon="lock-closed-outline"
                placeholder="Password (min 6)"
                value={dPw}
                onChangeText={setDPw}
                secureTextEntry
                toggleableSecure
                error={errorsD.dPw}
              />
              <FieldRow
                icon="lock-closed-outline"
                placeholder="Confirm Password"
                value={dCpw}
                onChangeText={setDCpw}
                secureTextEntry
                toggleableSecure
                error={errorsD.dCpw}
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
                label="Type of Shop"
                value={shopType}
                placeholder="Select type"
                options={SHOP_TYPE_OPTIONS}
                onSelect={setShopType}
                error={errorsS.shopType}
              />

              <View className="mt-3" />

              <Select
                label="Shop"
                value={shopName}
                placeholder="Select your shop"
                options={SHOP_LIST}
                onSelect={(v) => {
                  setShopName(v);
                  if (v === "Shop not Listed") {
                    setAskLocation(true); // ask permission first
                  }
                }}
                error={errorsS.shopName}
              />

              {/* Location prompt (after permission) */}
              {locationPromptShown && (
                <View className="mt-3 flex-row items-center gap-3 rounded-xl border border-gray-300 bg-[#F8FAFF] p-3">
                  <Ionicons name="location-outline" size={18} />
                  <View className="flex-1">
                    <Text className="font-semibold text-gray-900">
                      Location access enabled
                    </Text>
                    <Text className="text-xs text-gray-500">
                      {coords
                        ? `Lat ${coords.lat.toFixed(5)}, Lng ${coords.lng.toFixed(5)}`
                        : "Your shop will be registered at your current address."}
                    </Text>
                  </View>
                  <Pressable
                    onPress={async () => {
                      if (locationEnabled) {
                        setLocationEnabled(false);
                        setCoords(null);
                        setLocationPromptShown(false);
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

              <View className="mt-5 mb-2">
                <Text className="text-sm font-semibold text-gray-900">
                  Contact person
                </Text>
              </View>

              <FieldRow
                icon="person-outline"
                placeholder="Full name"
                value={sFullname}
                onChangeText={setSFullname}
                error={errorsS.sFullname}
              />
              <FieldRow
                icon="mail-outline"
                placeholder="Email"
                value={sEmail}
                onChangeText={setSEmail}
                keyboardType="email-address"
                error={errorsS.sEmail}
              />
              <FieldRow
                icon="call-outline"
                placeholder="Phone Number"
                value={sPhone}
                onChangeText={setSPhone}
                keyboardType="phone-pad"
                error={errorsS.sPhone}
              />

              {/* ⬇️ Security directly below phone */}
              <View className="mt-2 mb-2">
                <Text className="text-sm font-semibold text-gray-900">
                  Security
                </Text>
              </View>
              <FieldRow
                icon="lock-closed-outline"
                placeholder="Password (min 6)"
                value={sPw}
                onChangeText={setSPw}
                secureTextEntry
                toggleableSecure
                error={errorsS.sPw}
              />
              <FieldRow
                icon="lock-closed-outline"
                placeholder="Confirm Password"
                value={sCpw}
                onChangeText={setSCpw}
                secureTextEntry
                toggleableSecure
                error={errorsS.sCpw}
              />

              {/* Certificates → dropdown */}
              <Section title="Upload Certificates / Proof of Business">
                {errorsS.certificate ? (
                  <Text className="mb-2 ml-1 text-xs text-red-500">
                    {errorsS.certificate}
                  </Text>
                ) : null}

                <ActionsDropdown
                  label="Choose how to upload"
                  onPick={handleCertAction}
                />

                {/* MULTI-FILE list */}
                {certs.length > 0 && (
                  <View className="mt-3 gap-2">
                    {certs.map((f, idx) => (
                      <Pressable
                        key={`${f.uri}-${idx}`}
                        onPress={() => setPreviewIndex(idx)}
                        className="flex-row items-center justify-between rounded-xl border border-gray-200 bg-[#FAFAFF] px-3 py-2"
                      >
                        <View className="flex-row items-center gap-2 flex-1">
                          <Ionicons name="document-attach-outline" size={18} />
                          <Text
                            numberOfLines={1}
                            className="flex-1 text-ellipsis font-medium italic text-[#0F2547]"
                          >
                            {f.name}
                          </Text>
                          <Text className="text-[11px] text-gray-500">
                            {f.mime ?? "file"}
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={() =>
                            setCerts((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="ml-3 rounded-md px-2 py-1 active:opacity-80"
                          accessibilityLabel="Remove file"
                        >
                          <Ionicons name="trash-outline" size={18} />
                        </TouchableOpacity>
                      </Pressable>
                    ))}
                    <Text className="text-[11px] text-gray-500">
                      Tip: Tap a file to preview. You can add more files again via the menu above.
                    </Text>
                  </View>
                )}
              </Section>

              {/* Services (inner scroll) */}
              <Section title="Services Offered">
                {errorsS.services ? (
                  <Text className="mb-2 ml-1 text-xs text-red-500">
                    {errorsS.services}
                  </Text>
                ) : null}
                <ScrollView
                  style={{ height: 260 }}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                >
                  <View className="gap-2 pb-2">
                    {SERVICES.map((s) => (
                      <CheckboxRow
                        key={s}
                        label={s}
                        checked={services.includes(s)}
                        onToggle={() => toggleService(s)}
                      />
                    ))}
                  </View>
                </ScrollView>
              </Section>

              {/* Schedule (fix cropped hours text on Android) */}
              <Section title="Shop Schedule">
                {errorsS.days ? (
                  <Text className="mb-2 ml-1 text-xs text-red-500">
                    {errorsS.days}
                  </Text>
                ) : null}

                <Text className="mb-2 font-bold text-gray-900">Days</Text>
                <View className="mb-3 flex-row flex-wrap gap-3">
                  {DAY_LABELS.map((label, i) => (
                    <DayCheck
                      key={label}
                      label={label}
                      checked={days.includes(DAY_KEYS[i])}
                      onToggle={() => toggleDay(DAY_KEYS[i])}
                    />
                  ))}
                </View>

                <View className="flex-row items-center gap-3">
                  <Text className="text-gray-900">Hours:</Text>

                  {/* Open */}
                  <View
                    className={`rounded-xl border ${
                      errorsS.openTime ? "border-red-400" : "border-gray-300"
                    } w-24 h-10 justify-center`}
                  >
                    <TextInput
                      value={openTime}
                      onChangeText={setOpenTime}
                      placeholder="08:00"
                      placeholderTextColor="#808080"
                      className="h-10 px-2 text-center text-base text-black"
                      maxLength={5}
                      style={{
                        textAlignVertical: "center" as const,
                        paddingVertical: 0,
                      }}
                    />
                  </View>

                  <Text className="text-gray-900">to</Text>

                  {/* Close */}
                  <View
                    className={`rounded-xl border ${
                      errorsS.closeTime ? "border-red-400" : "border-gray-300"
                    } w-24 h-10 justify-center`}
                  >
                    <TextInput
                      value={closeTime}
                      onChangeText={setCloseTime}
                      placeholder="22:00"
                      placeholderTextColor="#808080"
                      className="h-10 px-2 text-center text-base text-black"
                      maxLength={5}
                      style={{
                        textAlignVertical: "center" as const,
                        paddingVertical: 0,
                      }}
                    />
                  </View>
                </View>

                {(errorsS.openTime || errorsS.closeTime) && (
                  <Text className="mt-1 ml-1 text-xs text-red-500">
                    {errorsS.openTime || errorsS.closeTime}
                  </Text>
                )}
              </Section>

              <Pressable
                onPress={submitShop}
                disabled={!canShopSubmit}
                className={`mt-1 items-center rounded-2xl py-3 ${
                  canShopSubmit ? "bg-[#2563EB]" : "bg-[#93C5FD]"
                }`}
              >
                <Text className="text-[15px] font-extrabold text-white">
                  Continue
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>

      {/* Ask-first: Shop not Listed → OS location permission */}
      <Modal visible={askLocation} transparent animationType="fade">
        <View className="flex-1 items-center justify-center bg-black/35 p-4">
          <View className="w-full rounded-2xl border border-gray-200 bg-white p-5">
            <Text className="mb-2 text-base font-extrabold text-gray-900">
              Allow location access?
            </Text>
            <Text className="mb-4 text-gray-900">
              We’ll use your device location to register your shop at your
              current address.
            </Text>
            <View className="flex-row justify-end gap-3">
              <Pressable
                onPress={() => {
                  setAskLocation(false);
                  setLocationPromptShown(false);
                  setLocationEnabled(false);
                }}
                className="rounded-md bg-gray-100 px-3 py-2.5"
              >
                <Text className="font-bold text-gray-900">Not now</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  setAskLocation(false);
                  await requestLocation();
                  setShowNotListedModal(true); // keep your original reminder
                }}
                className="rounded-md bg-[#0F2547] px-3 py-2.5"
              >
                <Text className="font-extrabold text-white">Allow</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Your original reminder (kept) */}
      <Modal visible={showNotListedModal} transparent animationType="fade">
        <View className="flex-1 items-center justify-center bg-black/35 p-4">
          <View className="w-full rounded-2xl border border-gray-200 bg-white p-5">
            <Text className="mb-2 text-base font-extrabold text-gray-900">
              Reminder
            </Text>
            <Text className="mb-4 text-gray-900">
              Make sure you are in your Shop&apos;s Location to be able to
              register your shop.
            </Text>
            <View className="flex-row justify-end gap-3">
              <Pressable
                onPress={() => {
                  setShowNotListedModal(false);
                }}
                className="rounded-md bg-gray-100 px-3 py-2.5"
              >
                <Text className="font-bold text-gray-900">Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Ask-first: Camera */}
      <Modal visible={askCamera} transparent animationType="fade">
        <View className="flex-1 items-center justify-center bg-black/35 p-4">
          <View className="w-full rounded-2xl border border-gray-200 bg-white p-5">
            <Text className="mb-2 text-base font-extrabold text-gray-900">
              Use your camera?
            </Text>
            <Text className="mb-4 text-gray-900">
              RideRescue needs your permission to take a photo of your
              certificate.
            </Text>
            <View className="flex-row justify-end gap-3">
              <Pressable
                onPress={() => setAskCamera(false)}
                className="rounded-md bg-gray-100 px-3 py-2.5"
              >
                <Text className="font-bold text-gray-900">Not now</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  setAskCamera(false);
                  await reallyOpenCamera();
                }}
                className="rounded-md bg-[#0F2547] px-3 py-2.5"
              >
                <Text className="font-extrabold text-white">Allow</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Ask-first: Gallery */}
      <Modal visible={askGallery} transparent animationType="fade">
        <View className="flex-1 items-center justify-center bg-black/35 p-4">
          <View className="w-full rounded-2xl border border-gray-200 bg-white p-5">
            <Text className="mb-2 text-base font-extrabold text-gray-900">
              Access your photos?
            </Text>
            <Text className="mb-4 text-gray-900">
              RideRescue needs your permission to choose a certificate from your
              gallery.
            </Text>
            <View className="flex-row justify-end gap-3">
              <Pressable
                onPress={() => setAskGallery(false)}
                className="rounded-md bg-gray-100 px-3 py-2.5"
              >
                <Text className="font-bold text-gray-900">Not now</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  setAskGallery(false);
                  await reallyPickImage();
                }}
                className="rounded-md bg-[#0F2547] px-3 py-2.5"
              >
                <Text className="font-extrabold text-white">Allow</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Ask-first: Files */}
      <Modal visible={askFiles} transparent animationType="fade">
        <View className="flex-1 items-center justify-center bg-black/35 p-4">
          <View className="w-full rounded-2xl border border-gray-200 bg-white p-5">
            <Text className="mb-2 text-base font-extrabold text-gray-900">
              Allow file access?
            </Text>
            <Text className="mb-4 text-gray-900">
              We’ll open your file picker so you can select PDFs, Word docs, or images.
            </Text>
            <View className="flex-row justify-end gap-3">
              <Pressable
                onPress={() => setAskFiles(false)}
                className="rounded-md bg-gray-100 px-3 py-2.5"
              >
                <Text className="font-bold text-gray-900">Not now</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  setAskFiles(false);
                  await reallyPickDocument();
                }}
                className="rounded-md bg-[#0F2547] px-3 py-2.5"
              >
                <Text className="font-extrabold text-white">Continue</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: File preview (multi) */}
      <Modal visible={previewIndex !== null} transparent animationType="fade">
        <Pressable
          onPress={() => setPreviewIndex(null)}
          className="flex-1 justify-center bg-black/50 p-4"
        >
          <View className="rounded-2xl border border-gray-200 bg-white p-4">
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="text-base font-extrabold text-gray-900">
                File Preview
              </Text>
              <Pressable
                onPress={() => setPreviewIndex(null)}
                className="rounded-md px-2 py-1"
              >
                <Ionicons name="close" size={20} />
              </Pressable>
            </View>

            {(() => {
              const idx = previewIndex ?? -1;
              const file = certs[idx];
              if (!file) return null;
              const looksImage =
                file.mime?.startsWith("image/") ||
                /\.(jpg|jpeg|png|gif)$/i.test(file.uri);

              return looksImage ? (
                <RNImage
                  source={{ uri: file.uri }}
                  style={{ width: "100%", height: 300, borderRadius: 12 }}
                  resizeMode="contain"
                />
              ) : (
                <View className="items-center justify-center p-4">
                  <Ionicons name="document-text-outline" size={48} />
                  <Text className="mt-2 text-center font-semibold text-gray-800">
                    {file.name}
                  </Text>
                  <Text className="text-xs text-gray-500">
                    {file.mime ?? "Unknown type"}
                  </Text>
                  <Pressable
                    onPress={() => openFileExternally(idx)}
                    className="mt-3 rounded-md bg-[#0F2547] px-3 py-2"
                  >
                    <Text className="font-extrabold text-white">Open file</Text>
                  </Pressable>
                  <Text className="mt-2 text-center text-[11px] text-gray-500">
                    Note: Opening local files depends on your device&apos;s installed apps.
                  </Text>
                </View>
              );
            })()}
          </View>
        </Pressable>
      </Modal>

      {/* Loading overlay */}
      <LoadingScreen visible={loading} message="Creating your account..." />
    </View>
  );
}
