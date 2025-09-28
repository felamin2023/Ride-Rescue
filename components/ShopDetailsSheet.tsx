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
  LayoutChangeEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { supabase } from "../utils/supabase";

/** DB shape (certificate_url holds JSON string of paths OR legacy single string) */
export type ShopInitial = {
  services?: string | null;        // comma-separated (legacy) OR JSON array (signup)
  certificate_url?: string | null; // JSON string of paths OR single path/url
  time_open?: string | null;       // "09:00"
  time_close?: string | null;      // "18:00"
  days?: string | null;            // "Mon–Sun" or "Mon, Tue, Wed" (legacy) OR JSON array of keys ["mon",...]
  is_verified?: boolean;
  shop_id?: string;
  /** include place_id so parent can refresh shop name */
  place_id?: string | null;
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
const ALL_SERVICES = [
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
] as const;

const DAYS: ("Mon"|"Tue"|"Wed"|"Thu"|"Fri"|"Sat"|"Sun")[] =
  ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const DAY_KEY_TO_LABEL: Record<string, typeof DAYS[number]> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};

/** NEW: reverse map so we can save as keys like "mon" */
const LABEL_TO_DAY_KEY: Record<typeof DAYS[number], keyof typeof DAY_KEY_TO_LABEL> = {
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
      const start = parts[0].trim() as any;
      const end = parts[1].trim() as any;
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
    if (DAYS.includes(d as any)) set.add(d);
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
        .filter((v): v is typeof DAYS[number] => !!v);
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

/* -------------------- shared Chip look -------------------- */
function ServiceChip({
  label,
  selected,
  onPress,
  onLayout,
  disabled,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  onLayout?: (e: LayoutChangeEvent) => void;
  disabled?: boolean;
}) {
  const bg = selected ? "#E8F1FF" : "#F1F5F9";
  const border = selected ? "#BFD9FF" : "#E5E9F0";
  const color = selected ? "#0F2547" : "#0F172A";
  const opacity = disabled ? 0.5 : 1;
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      onLayout={onLayout}
      disabled={disabled}
      className="px-3 py-2 rounded-full mr-2 mb-2"
      style={{ backgroundColor: bg, borderColor: border, borderWidth: 1, opacity }}
    >
      <Text className="text-[12px]" style={{ color }}>{label}</Text>
    </Pressable>
  );
}

/* -------------------- Packed services chips -------------------- */
function PackedServiceChips({
  items,
  selectedSet,
  onToggle,
  horizontalGap = 8,
  disabled = false,
}: {
  items: string[];
  selectedSet: Set<string>;
  onToggle: (name: string) => void;
  horizontalGap?: number;
  disabled?: boolean;
}) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [measureMap, setMeasureMap] = useState<Record<string, number>>({});
  const [measured, setMeasured] = useState<Record<string, boolean>>({});
  const measuringDone = containerWidth > 0 && items.every((k) => measureMap[k] && measureMap[k] > 0);

  const onWrapLayout = (e: LayoutChangeEvent) => {
    const w = Math.floor(e.nativeEvent.layout.width);
    if (w !== containerWidth) setContainerWidth(w);
  };

  const HiddenMeasurer = () => (
    <View pointerEvents="none" style={{ position: "absolute", opacity: 0, left: -9999, top: -9999 }}>
      <View className="flex-row flex-wrap">
        {items.map((label) => (
          <ServiceChip
            key={`m-${label}`}
            label={label}
            selected={selectedSet.has(label)}
            onPress={() => {}}
            onLayout={(e) => {
              if (measured[label]) return;
              const w = Math.ceil(e.nativeEvent.layout.width);
              setMeasureMap((m) => ({ ...m, [label]: w }));
              setMeasured((m) => ({ ...m, [label]: true }));
            }}
            disabled
          />
        ))}
      </View>
    </View>
  );

  const rows: string[][] = useMemo(() => {
    if (!measuringDone) return [items];

    const sorted = [...items].sort((a, b) => (measureMap[b] ?? 0) - (measureMap[a] ?? 0));
    const out: string[][] = [];
    const free: number[] = [];

    sorted.forEach((key) => {
      const w = (measureMap[key] ?? 0);
      let placed = false;
      for (let i = 0; i < out.length; i++) {
        const extra = out[i].length === 0 ? 0 : horizontalGap;
        if (w + extra <= free[i]) {
          out[i].push(key);
          free[i] -= w + extra;
          placed = true;
          break;
        }
      }
      if (!placed) {
        out.push([key]);
        free.push(containerWidth - w);
      }
    });

    return out;
  }, [measuringDone, items, measureMap, containerWidth, horizontalGap]);

  return (
    <View onLayout={onWrapLayout}>
      {!measuringDone && <HiddenMeasurer />}
      <View style={disabled ? { opacity: 0.6 } : undefined}>
        {rows.map((row, rIdx) => (
          <View key={`row-${rIdx}`} className="flex-row">
            {row.map((label, i) => (
              <View key={label} style={{ marginRight: i < row.length - 1 ? horizontalGap : 0 }}>
                <ServiceChip
                  label={label}
                  selected={selectedSet.has(label)}
                  onPress={() => onToggle(label)}
                  disabled={disabled}
                />
              </View>
            ))}
          </View>
        ))}
      </View>
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
        className="flex-row items-center justify-between rounded-2xl border border-gray-300 bg-[#F7F8FA] px-3 py-3"
        android_ripple={{ color: "#e5e7eb" }}
      >
        <Text className="text-sm text-gray-700">{disabled ? "Please wait…" : "Select an action…"}</Text>
        <Ionicons name="chevron-down" size={18} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade">
        <Pressable onPress={() => setOpen(false)} className="flex-1 justify-center bg-black/25 p-4">
          <View className="rounded-2xl border border-gray-200 bg-white p-3">
            <Text className="mb-2 font-bold text-gray-900">{label}</Text>
            {items.map((it) => (
              <Pressable
                key={it.value}
                onPress={() => { setOpen(false); onPick(it.value); }}
                className="border-b border-slate-100 px-2 py-2"
              >
                <Text className="text-sm text-gray-900">{it.label}</Text>
              </Pressable>
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

  // time
  const [timeOpen, setTimeOpen] = useState<string>(initial.time_open ?? "");
  const [timeClose, setTimeClose] = useState<string>(initial.time_close ?? "");

  // certificates
  const [certs, setCerts] = useState<CertItem[]>([]);
  const [serverPaths, setServerPaths] = useState<string[]>([]); // paths as fetched from DB (source of truth)
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  // keep place_id in local state and preserve it through saves
  const [placeId, setPlaceId] = useState<string | null>(initial.place_id ?? null);

  // ui state
  const [saving, setSaving] = useState(false);
  const [pickerBusy, setPickerBusy] = useState(false);
  const [loadingShopDetails, setLoadingShopDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        setTimeOpen(data.time_open ?? "");
        setTimeClose(data.time_close ?? "");
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

        // Optionally clean DB JSON so it won’t reappear later
        if (autoCleanupMissingInDB && kept.length !== items.length) {
          const keptPaths = kept.map((k) => k.path!).filter(Boolean);
          await supabase
            .from("shop_details")
            .update({ certificate_url: JSON.stringify(keptPaths) })
            .eq("user_id", userId);
          setServerPaths(keptPaths);
        }

        if (!cancelled) setCerts(kept);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load shop details.");
      } finally {
        if (!cancelled) setLoadingShopDetails(false);
      }
    })();

    return () => { cancelled = true; };
  }, [open, userId, autoCleanupMissingInDB]);

  const canSave = useMemo(() => {
    const openValid = !timeOpen || isTime(timeOpen);
    const closeValid = !timeClose || isTime(timeClose);
    return openValid && closeValid && !loadingShopDetails;
  }, [timeOpen, timeClose, loadingShopDetails]);

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
    if (!canSave) { setError("Please use 24-hour time like 09:00 or 17:30."); return; }

    try {
      setSaving(true); setError(null);

      // keep only files that are both in UI and in the serverPaths fetched from DB,
      // so we never accidentally re-save a deleted path
      const existingKept = certs
        .filter((c) => !c.isNew && c.path && serverPaths.includes(c.path))
        .map((c) => c.path!) ;

      const newToUpload = certs.filter((c) => c.isNew);
      const uploadedPaths = await uploadNewCertsAndGetPaths(userId, newToUpload);
      const allPaths = [...existingKept, ...uploadedPaths];

      /** NEW: build JSON array of keys from selected labels so multiple days save correctly */
      const dayKeys = daySetToKeyArray(daySet);

      const payload = {
        user_id: userId,
        services: stringifyServiceSet(serviceSet) || null,
        certificate_url: JSON.stringify(allPaths),
        time_open: timeOpen.trim() ? timeOpen.trim() : null,
        time_close: timeClose.trim() ? timeClose.trim() : null,
        // SAVE AS JSON ARRAY like ["mon","tue",...]; null if none selected
        days: dayKeys.length ? JSON.stringify(dayKeys) : null,
        // preserve current place_id (we’re not editing it here)
        place_id: placeId ?? null,
      };

      const { data: savedRow, error: upErr } = await supabase
        .from("shop_details")
        .upsert(payload, { onConflict: "user_id" })
        // select place_id back to be 100% sure we have the latest
        .select("services,certificate_url,time_open,time_close,days,is_verified,shop_id,place_id")
        .single();

      if (upErr) throw upErr;

      // keep our local placeId in sync with DB result
      setPlaceId(savedRow?.place_id ?? placeId ?? null);

      onSaved({
        services: savedRow?.services ?? payload.services,
        certificate_url: savedRow?.certificate_url ?? payload.certificate_url,
        time_open: savedRow?.time_open ?? payload.time_open,
        time_close: savedRow?.time_close ?? payload.time_close,
        days: savedRow?.days ?? payload.days,
        is_verified: initial.is_verified ?? false,
        shop_id: initial.shop_id,
        // pass place_id back so parent can refresh the shop name
        place_id: savedRow?.place_id ?? placeId ?? null,
      });

      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Failed to save shop details.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  // list used for the packed services (append any custom services)
  const baseList = [...ALL_SERVICES];
  const extras = Array.from(serviceSet).filter((s) => !baseList.includes(s as any));
  const servicesForUi = [...baseList, ...extras];

  /* -------------------- Fullscreen Preview helpers -------------------- */
  const goPrev = () => {
    if (previewIndex === null) return;
    setPreviewIndex((i) => (i! <= 0 ? certs.length - 1 : (i! - 1)));
  };
  const goNext = () => {
    if (previewIndex === null) return;
    setPreviewIndex((i) => ((i! + 1) % certs.length));
  };
  const closePreview = () => setPreviewIndex(null);

  const currentFile = previewIndex !== null ? certs[previewIndex] : null;
  const isCurrentImage = currentFile ? (isImageUrl(currentFile.uri) || (currentFile.mime ?? "").startsWith("image/")) : false;

  const prettyMime = (mime: string | null, name: string) => {
    if (mime) return mime;
    const ext = (name.split(".").pop() || "").toLowerCase();
    if (!ext) return "file";
    if (["jpg", "jpeg", "png", "webp", "gif", "bmp", "heic"].includes(ext)) return `image/${ext === "jpg" ? "jpeg" : ext}`;
    if (ext === "pdf") return "application/pdf";
    if (ext === "doc") return "application/msword";
    if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    return ext;
  };

  const looksImage = (f: CertItem) =>
    isImageUrl(f.uri) || (f.mime ?? "").startsWith("image/");

  const lockStyle = saving ? { opacity: 0.6 } : undefined;

  return (
    <Modal
      visible
      animationType="fade"
      transparent
      // Prevent closing via back/drop while saving
      onRequestClose={saving ? () => {} : onClose}
    >
      <View className="flex-1 bg-black/40">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 justify-end">
          <View className="bg-white rounded-t-3xl max_h-[85%]" style={{ maxHeight: "85%" }}>
            {/* handle + header */}
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
              <Text className="text-[16px] font-semibold text-[#0F172A]">Shop Details</Text>
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
              contentContainerStyle={{ paddingBottom: 24 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Services packed pills */}
              <View className="mb-2" style={lockStyle}>
                <Text className="text-[12px] mb-1 text-[#64748B]">Services</Text>
                <PackedServiceChips
                  items={servicesForUi}
                  selectedSet={serviceSet}
                  onToggle={toggleService}
                  disabled={saving}
                />
              </View>

              {/* ===== Upload Certificates — signup-like design ===== */}
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
                      className="flex-row items-center rounded-2xl border border-gray-300 bg-[#F7F8FA] px-3 py-3"
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
                          {prettyMime(f.mime, f.name)}
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
              <View className="mt-5 flex-row gap-3" style={lockStyle}>
                <View className="flex-1">
                  <Text className="text-[12px] mb-1 text-[#64748B]">Time Open (24h)</Text>
                  <TextInput
                    value={timeOpen}
                    onChangeText={saving ? undefined : setTimeOpen}
                    placeholder="09:00"
                    autoCapitalize="none"
                    editable={!saving}
                    className="bg-white border rounded-xl px-4 py-3"
                    style={{ borderColor: timeOpen && !isTime(timeOpen) ? "#FCA5A5" : "#E5E9F0", opacity: saving ? 0.6 : 1 }}
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-[12px] mb-1 text-[#64748B]">Time Close (24h)</Text>
                  <TextInput
                    value={timeClose}
                    onChangeText={saving ? undefined : setTimeClose}
                    placeholder="18:00"
                    autoCapitalize="none"
                    editable={!saving}
                    className="bg-white border rounded-xl px-4 py-3"
                    style={{ borderColor: timeClose && !isTime(timeClose) ? "#FCA5A5" : "#E5E9F0", opacity: saving ? 0.6 : 1 }}
                  />
                </View>
              </View>

              {/* Days as pills */}
              <View className="mt-3" style={lockStyle}>
                <Text className="text-[12px] mb-1 text-[#64748B]">Open Days</Text>
                <View className="flex-row flex-wrap">
                  {DAYS.map((d) => (
                    <ServiceChip key={d} label={d} selected={daySet.has(d)} onPress={() => toggleDay(d)} disabled={saving} />
                  ))}
                </View>
                <Text className="text-[11px] text-[#64748B] mt-1">Selected days (soft blue) indicate when your shop is open.</Text>
              </View>

              {error ? <Text className="text-xs text-red-500 mt-3">{error}</Text> : null}

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
        onRequestClose={closePreview}
      >
        <SafeAreaView className="flex-1 bg-black">
          {/* Top bar */}
          <View className="px-3 pb-2 pt-1 flex-row items-center justify-between">
            <Pressable onPress={closePreview} className="h-10 w-10 items-center justify-center rounded-full active:opacity-80">
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </Pressable>

            <View className="flex-1 mx-1">
              <Text numberOfLines={1} className="text-white text-[14px] font-semibold">
                {currentFile?.name ?? ""}
              </Text>
              {currentFile?.mime ? (
                <Text className="text-white/70 text-[11px]">{currentFile.mime}</Text>
              ) : null}
            </View>
          </View>

          {/* Body */}
          <View className="flex-1">
            {isCurrentImage ? (
              <Pressable onPress={goNext} className="flex-1" disabled={saving} style={saving ? { opacity: 0.7 } : undefined}>
                <Image
                  source={{ uri: currentFile!.uri }}
                  style={{ width: "100%", height: "100%" }}
                  resizeMode="contain"
                />
              </Pressable>
            ) : (
              <View className="flex-1 items-center justify-center px-6" style={saving ? { opacity: 0.7 } : undefined}>
                <Ionicons name="document-text-outline" size={64} color="#fff" />
                <Text className="text-white mt-3 mb-6 text-sm text-center">
                  {currentFile?.name ?? "Document"}
                </Text>
                <View className="flex-row gap-3">
                  <Pressable onPress={() => openFileExternally(previewIndex)} className="rounded-xl bg-white px-5 py-3" disabled={saving} style={saving ? { opacity: 0.6 } : undefined}>
                    <Text className="text-black font-semibold">Open Externally</Text>
                  </Pressable>
                  <Pressable onPress={closePreview} className="rounded-xl border border-white px-5 py-3">
                    <Text className="text-white font-semibold">Close</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        </SafeAreaView>
      </Modal>
      {/* =============== /FULLSCREEN PREVIEW =============== */}
    </Modal>
  );
}
