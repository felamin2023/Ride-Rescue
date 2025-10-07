// app/shop/mechanicprofile.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  Image,
  Switch,
  Platform,
  ScrollView,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  ActivityIndicator,
  Animated,
  PanResponder,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "../../utils/supabase";
import EditContactSheet from "../../components/EditContactSheet";
import LoadingScreen from "../../components/LoadingScreen";
import ShopDetailsSheet from "../../components/ShopDetailsSheet";

/* ------------------------------ helpers ------------------------------ */

// Map raw category 
const CATEGORY_LABELS: Record<string, string> = {
  repair_shop: "Repair Shop",
  vulcanizing:"Vulcanizing Shop",
  // add more as needed...
};

// Fallback: turn snake/kebab case into Title Case
function formatCategory(raw?: string | null): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  if (CATEGORY_LABELS[key]) return CATEGORY_LABELS[key];
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const cardShadow = Platform.select({
  ios: {
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  android: { elevation: 3 },
});
const isHttpUrl = (u?: string | null) =>
  !!u && (u.startsWith("http://") || u.startsWith("https://"));
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const guessMimeFromPath = (path: string) => {
  const ext = path.split(".").pop()?.split("?")[0]?.toLowerCase();
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "heic":
      return "image/heic";
    default:
      return "image/jpeg";
  }
};
async function emailExistsInAppUser(email: string) {
  const normalized = email.trim().toLowerCase();
  const { count, error } = await supabase
    .from("app_user")
    .select("user_id", { count: "exact", head: true })
    .ilike("email", normalized);
  if (error) throw error;
  return (count ?? 0) > 0;
}
// password rules
function validateNewPassword(pw: string): string | null {
  if (pw.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw))
    return "Use at least one letter and one number.";
  if (/\s/.test(pw)) return "Password cannot contain spaces.";
  return null;
}
// map DB role to requested display text
function formatRole(role?: string | null) {
  const v = (role ?? "").toLowerCase();
  if (v.includes("driver")) return "Driver";
  if (v.includes("shop")) return "ShopOwner";
  if (v.includes("admin")) return "Admin";
  return role ?? "";
}

/* ---------- tiny role badge (mini banner) ---------- */
function RoleBadge({ role }: { role?: string | null }) {
  const label = formatRole(role);
  if (!label) return null;

  return (
    <View
      className="flex-row items-center rounded-full bg-white/10 border border-white/20 px-2.5 py-1"
      accessibilityLabel={`User role: ${label}`}
    >
      <Ionicons name="ribbon-outline" size={14} color="#FFFFFF" />
      <Text className="text-white text-[11px] ml-1">{label}</Text>
    </View>
  );
}

/* ------------------------------ tiny UI bits ------------------------------ */
function ListItem({
  icon,
  label,
  value,
  onPress,
  chevron = true,
  disabled = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
  chevron?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress || disabled}
      className={`flex-row items-center px-5 py-5 ${disabled ? "opacity-60" : ""}`}
      android_ripple={{ color: "#e5e7eb" }}
    >
      <View className="w-11 h-11 rounded-full bg-[#F1F5F9] items-center justify-center mr-4">
        <Ionicons name={icon} size={22} color="#0F172A" />
      </View>
      <View className="flex-1">
        <Text className="text-[16px] text-[#0F172A]">{label}</Text>
        {value ? (
          <Text className="text-[13px] text-[#64748B] mt-0.5">{value}</Text>
        ) : null}
      </View>
      {chevron && <Ionicons name="chevron-forward" size={20} color="#94A3B8" />}
    </Pressable>
  );
}

/* ------------------------------ reusable dialog ------------------------------ */
type DialogAction = {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "danger";
};
function DialogModal({
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
          {title ? (
            <Text className="mb-2 text-base font-extrabold text-gray-900">{title}</Text>
          ) : null}
          {message ? <Text className="text-gray-900">{message}</Text> : null}

          {actions.length > 0 ? (
            <View className="mt-4 flex-row justify-end gap-2 flex-wrap">
              {actions.map((a, idx) => {
                const base =
                  "px-4 py-2 rounded-xl items-center justify-center min-w-[90px]";
                const styleByVariant =
                  a.variant === "primary"
                    ? "bg-[#2563EB]"
                    : a.variant === "danger"
                    ? "border border-red-300"
                    : "border border-gray-300";
                const textByVariant =
                  a.variant === "primary" ? "text-white font-extrabold" : "text-gray-900 font-bold";
                return (
                  <Pressable
                    key={idx}
                    onPress={a.onPress}
                    className={`${base} ${styleByVariant}`}
                  >
                    <Text className={textByVariant}>{a.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

/* ------------------------------ types for Shop details (Option 1) ------------------------------ */
export type ShopInitial = {
  services?: string | null;
  certificate_url?: string | null;
  time_open?: string | null;
  time_close?: string | null;
  days?: string | null;
  is_verified?: boolean;
  shop_id?: string;
  place_id?: string | null;
};

/* =================================================================== */
export default function DriverProfile() {
  const router = useRouter();

  /* ---------- screen state ---------- */
  const [notifOn, setNotifOn] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  /* ---------- profile state ---------- */
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [shopDisplayName, setShopDisplayName] = useState<string | null>(null);
  const [shopCategory, setShopCategory] = useState<string | null>(null);
  const [authProvider, setAuthProvider] = useState<string | null>(null);
  const [avatarUri, setAvatarUri] = useState<string>("");
  const [fullName, setFullName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [role, setRole] = useState<string>("Driver");

  // contact fields
  const [phone, setPhone] = useState<string>("");
  const [address, setAddress] = useState<string>("");

  // (future) dedicated shop fields in app_user if needed
  const [shopName, setShopName] = useState<string>("");
  const [shopHours, setShopHours] = useState<string>("");

  /* ---------- edit profile modal state ---------- */
  const [editOpen, setEditOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftEmail, setDraftEmail] = useState("");
  const [draftAvatar, setDraftAvatar] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  /* ---------- password change state ---------- */
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwNew2, setPwNew2] = useState("");
  const [pwVisible, setPwVisible] = useState({ current: false, next: false, next2: false });
  const canChangePassword = (authProvider ?? "email") === "email";

  /* ---------- email change modal state ---------- */
  const [emailChangeOpen, setEmailChangeOpen] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [emailChangeSending, setEmailChangeSending] = useState(false);
  const [emailChangeChecking, setEmailChangeChecking] = useState(false);
  const [emailChangeError, setEmailChangeError] = useState<string | null>(null);

  /* ---------- contact sheet state ---------- */
  const [contactOpen, setContactOpen] = useState(false);
  const [contactInitial, setContactInitial] = useState({ phone: "", address: "" });

  /* ---------- password gate for contact ---------- */
  const [contactPwOpen, setContactPwOpen] = useState(false);
  const [contactPw, setContactPw] = useState("");
  const [contactPwVisible, setContactPwVisible] = useState(false);
  const [contactPwLoading, setContactPwLoading] = useState(false);
  const [contactPwError, setContactPwError] = useState<string | null>(null);

  /* ---------- Shop details sheet state (Option 1) ---------- */
  const [shopOpen, setShopOpen] = useState(false);
  const [shopInitial, setShopInitial] = useState<ShopInitial>({});

  // 🔐 password gate for shop details (new)
  const [shopPwOpen, setShopPwOpen] = useState(false);
  const [shopPw, setShopPw] = useState("");
  const [shopPwVisible, setShopPwVisible] = useState(false);
  const [shopPwLoading, setShopPwLoading] = useState(false);
  const [shopPwError, setShopPwError] = useState<string | null>(null);

  // Small summary shown on the list row (optional)
  const shopSummary = useMemo(() => {
    const parts: string[] = [];
    if (shopInitial?.time_open && shopInitial?.time_close) {
      parts.push(`${shopInitial.time_open}-${shopInitial.time_close}`);
    }
    if (shopInitial?.days) parts.push(shopInitial.days);
    if (shopInitial?.services) parts.push(shopInitial.services);
    return parts.length ? parts.join(" • ") : "Hours, days, services";
  }, [shopInitial]);

  /* ---------- app-wide dialog ---------- */
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTitle, setDialogTitle] = useState<string | undefined>(undefined);
  const [dialogMessage, setDialogMessage] = useState<string | undefined>(undefined);
  const [dialogActions, setDialogActions] = useState<DialogAction[]>([]);
  const showDialog = (
    title?: string,
    message?: string,
    actions: DialogAction[] = [{ label: "OK", variant: "primary", onPress: () => setDialogOpen(false) }]
  ) => {
    setDialogTitle(title);
    setDialogMessage(message);
    setDialogActions(
      actions.map((a) => ({
        ...a,
        onPress: () => {
          setDialogOpen(false);
          setTimeout(() => a.onPress?.(), 10);
        },
      }))
    );
    setDialogOpen(true);
  };

  /* ---------- bottom sheet gestures (for edit profile) ---------- */
  const sheetY = useRef(new Animated.Value(0)).current;
  const dismissEditImmediately = () => {
    setEditOpen(false);
    sheetY.setValue(0);
  };
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) =>
          Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
        onMoveShouldSetPanResponderCapture: (_e, g) =>
          g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_e, g) => {
          const translate = g.dy > 0 ? g.dy : Math.max(-20, g.dy);
          sheetY.setValue(translate);
        },
        onPanResponderRelease: (_e, g) => {
          const shouldClose = g.dy > 120 || g.vy > 0.8;
          if (shouldClose) {
            if (dirty) {
              Animated.spring(sheetY, {
                toValue: 0,
                useNativeDriver: true,
                bounciness: 4,
              }).start(() => {
                showDialog("Discard changes?", "You have unsaved edits.", [
                  { label: "Cancel", variant: "secondary" },
                  { label: "Discard", variant: "danger", onPress: dismissEditImmediately },
                ]);
              });
            } else {
              Animated.timing(sheetY, {
                toValue: 600,
                duration: 220,
                useNativeDriver: true,
              }).start(dismissEditImmediately);
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

  /* ---------- bootstrap profile ---------- */
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();
        if (error) throw error;
        if (!user) {
          showDialog("Not signed in", "Please log in again.", [
            { label: "Go to Login", variant: "primary", onPress: () => router.replace("/(auth)/login") },
          ]);
          return;
        }
        if (!mounted) return;
        setAuthUserId(user.id);
        setAuthProvider(user.app_metadata?.provider ?? "email");

        // include role in selection
        const { data: row } = await supabase
          .from("app_user")
          .select("full_name,email,photo_url,phone,address,role")
          .eq("user_id", user.id)
          .maybeSingle();

        let profile = row;
        if (!profile) {
          const { data: created, error: insErr } = await supabase
            .from("app_user")
            .insert({
              user_id: user.id,
              full_name: user.user_metadata?.full_name ?? "Driver",
              email: user.email ?? "",
              photo_url: null,
              phone: null,
              address: null,
            })
            .select("full_name,email,photo_url,phone,address,role")
            .single();
          if (insErr) throw insErr;
          profile = created;
        }

        if (!mounted) return;
        setFullName(profile?.full_name ?? "");
        setEmail(profile?.email ?? user.email ?? "");
        setAvatarUri(profile?.photo_url ?? "");
        setPhone(profile?.phone ?? "");
        setAddress(profile?.address ?? "");
        setRole(profile?.role ?? "Driver");
      } catch (e: any) {
        showDialog("Oops", e?.message ?? "Failed to load your profile.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  /* ---------- prefill Shop details (Option 1 fields) ---------- */
  useEffect(() => {
    if (!authUserId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("shop_details")
          .select(
            "services,certificate_url,time_open,time_close,days,is_verified,shop_id,place_id"
          )
          .eq("user_id", authUserId)
          .maybeSingle();

        if (error) {
          console.warn("shop_details fetch error:", error.message);
        }
        if (cancelled || !data) return;

        setShopInitial({
          services: data.services ?? null,
          certificate_url: data.certificate_url ?? null,
          time_open: data.time_open ?? null,
          time_close: data.time_close ?? null,
          days: data.days ?? null,
          is_verified: data.is_verified ?? false,
          shop_id: data.shop_id ?? undefined,
          place_id: data.place_id ?? null, 
        });
      } catch (e: any) {
        console.warn("shop_details prefill failed:", e?.message);

      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authUserId]);

  useEffect(() => {
    const pid = shopInitial?.place_id;
    if (!pid) {
      setShopDisplayName(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("places")
          .select("name,category")
          .eq("place_id", pid)
          .maybeSingle();
        if (error) {
          console.warn("places fetch error:", error.message);
        }
        if (cancelled) return;
        setShopDisplayName((data?.name ?? "").trim() || null);
        setShopCategory(formatCategory(data?.category));
      } catch (e: any) {
        console.warn("Failed to load place name:", e?.message);
        if (!cancelled) 
        setShopDisplayName(null);
        setShopCategory(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shopInitial?.place_id]);

  /* ---------- edit modal open/close ---------- */
  const openEdit = () => {
    if (saving) return; // safety
    setDraftName(fullName);
    setDraftEmail(email);
    setDraftAvatar(avatarUri || null);
    setPwCurrent("");
    setPwNew("");
    setPwNew2("");
    setDirty(false);
    sheetY.setValue(0);
    setEditOpen(true);
  };
  const closeEdit = () => {
    if (saving) return; // 🚫 ignore while saving
    if (!dirty) return dismissEditImmediately();
    showDialog("Discard changes?", "You have unsaved edits.", [
      { label: "Cancel", variant: "secondary" },
      { label: "Discard", variant: "danger", onPress: dismissEditImmediately },
    ]);
  };

  /* ---------- avatar picking ---------- */
  const pickNewPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      showDialog("Permission needed", "Please allow photo library access.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      quality: 0.8,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      aspect: [1, 1],
    });
    if (!res.canceled && res.assets?.[0]?.uri) {
      setDraftAvatar(res.assets[0].uri);
      setDirty(true);
    }
  };
  const removePhoto = () => {
    setDraftAvatar(null);
    setDirty(true);
  };

  /* ---------- upload avatar ---------- */
  const uploadAvatarIfNeeded = async (localUri: string | null, userId: string) => {
    if (localUri === null) return null; // removed
    if (isHttpUrl(localUri)) return localUri; // unchanged

    const ext = localUri.split(".").pop()?.split("?")[0] || "jpg";
    const contentType = guessMimeFromPath(localUri);
    const path = `${userId}/avatar-${Date.now()}.${ext}`;

    let bytes: ArrayBuffer;
    try {
      const res = await fetch(localUri);
      bytes = await res.arrayBuffer();
    } catch (readErr: any) {
      throw new Error("Failed to read the selected image. Please pick a different photo.");
    }

    const { data, error } = await supabase.storage
      .from("profile_photos")
      .upload(path, bytes, { contentType, upsert: false });
    if (error) throw new Error(error.message || "Upload failed, please try again.");

    const { data: pub } = supabase.storage.from("profile_photos").getPublicUrl(data.path);
    return pub.publicUrl;
  };

  /* ---------- Gmail opener ---------- */
  const openGmailInbox = async () => {
    try {
      const gmailScheme = "googlegmail://";
      const canGmail = await Linking.canOpenURL(gmailScheme);
      if (canGmail) {
        await Linking.openURL(gmailScheme);
        return;
      }
      await Linking.openURL("mailto:");
    } catch {}
  };

  /* ---------- save handler (profile: name/email/photo + optional password) ---------- */
  const handleSave = async () => {
    if (!authUserId) return;
    if (!draftName.trim()) {
      showDialog("Name required", "Please enter your full name.");
      return;
    }

    const nextName = draftName.trim();
    const nextEmail = draftEmail.trim();
    const emailChanged = nextEmail !== email;
    const wantsPwChange = !!(pwCurrent || pwNew || pwNew2);

    try {
      setSaving(true);

      // 0) password update first
      if (wantsPwChange) {
        if (!canChangePassword) throw new Error(`Password change isn't available for ${(authProvider ?? "your")} accounts.`);
        if (!pwCurrent || !pwNew || !pwNew2) throw new Error("Please fill in all password fields.");
        if (pwNew !== pwNew2) throw new Error("New passwords do not match.");
        const pwErr = validateNewPassword(pwNew);
        if (pwErr) throw new Error(pwErr);

        const { error: reauthErr } = await supabase.auth.signInWithPassword({ email, password: pwCurrent });
        if (reauthErr) throw new Error("Current password is incorrect.");

        const { error: updPwErr } = await supabase.auth.updateUser({ password: pwNew });
        if (updPwErr) throw updPwErr;

        setPwCurrent(""); setPwNew(""); setPwNew2("");
      }

      // 1) avatar upload if changed
      let nextPhotoUrl: string | null = avatarUri || null;
      const avatarChanged = draftAvatar !== (avatarUri || null);
      if (avatarChanged) nextPhotoUrl = await uploadAvatarIfNeeded(draftAvatar, authUserId);

      // 2) update app_user (name/photo)
      const { error: upErr1 } = await supabase
        .from("app_user")
        .update({
          full_name: nextName,
          photo_url: nextPhotoUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", authUserId);
      if (upErr1) throw upErr1;

      setFullName(nextName);
      setAvatarUri(nextPhotoUrl ?? "");
      setDirty(false);

      // 3) email change flow (verify first)
      if (emailChanged) {
        if (!isEmail(nextEmail)) throw new Error("Please enter a valid email address.");
        const exists = await emailExistsInAppUser(nextEmail);
        if (exists) throw new Error("That email is already used. Please try another.");

        setPendingEmail(nextEmail);
        setEmailChangeError(null);
        setEmailChangeOpen(true);

        const { error: updAuthErr } = await supabase.auth.updateUser({ email: nextEmail });
        if (updAuthErr) throw updAuthErr;

        Animated.timing(sheetY, { toValue: 600, duration: 220, useNativeDriver: true }).start(dismissEditImmediately);
      } else {
        Animated.timing(sheetY, { toValue: 600, duration: 220, useNativeDriver: true }).start(dismissEditImmediately);
        if (wantsPwChange) {
          showDialog("Password updated", "Your password has been changed. If you get signed out on other devices, sign in with the new password.");
        }
      }
    } catch (e: any) {
      showDialog("Save failed", e?.message ?? "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  /* ---------- email-change modal actions ---------- */
  const resendChangeLink = async () => {
    if (!pendingEmail) return;
    try {
      setEmailChangeSending(true);
      setEmailChangeError(null);
      const { error } = await supabase.auth.updateUser({ email: pendingEmail });
      if (error) throw error;
      showDialog("Email sent", "We re-sent the change link to your new email.");
    } catch (e: any) {
      setEmailChangeError(e?.message ?? "Failed to resend the link.");
    } finally {
      setEmailChangeSending(false);
    }
  };
  const confirmEmailChangeNow = async () => {
    if (!authUserId || !pendingEmail) return;
    try {
      setEmailChangeChecking(true);
      setEmailChangeError(null);

      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();
      if (error) throw error;

      if (user?.email?.toLowerCase() === pendingEmail.toLowerCase()) {
        const { error: upErr } = await supabase
          .from("app_user")
          .update({ email: pendingEmail, updated_at: new Date().toISOString() })
          .eq("user_id", authUserId);
        if (upErr) throw upErr;

        setEmail(pendingEmail);
        setPendingEmail(null);
        setEmailChangeOpen(false);
        showDialog("Email verified!", "Your email address was updated.");
      } else {
        showDialog("Not verified yet", "Please tap the link in the email we sent to your new address, then tap “I've verified”.");
      }
    } catch (e: any) {
      setEmailChangeError(e?.message ?? "Verification check failed.");
    } finally {
      setEmailChangeChecking(false);
    }
  };

  /* ---------- password check before opening contact sheet ---------- */
  const onPressEditContact = () => {
    setContactInitial({ phone, address });
    if ((authProvider ?? "email") === "email") {
      setContactPw("");
      setContactPwError(null);
      setContactPwVisible(false);
      setContactPwOpen(true);
    } else {
      setContactOpen(true);
    }
  };

  const verifyContactPw = async () => {
    if (!email || !contactPw) {
      setContactPwError("Please enter your current password.");
      return;
    }
    try {
      setContactPwLoading(true);
      setContactPwError(null);
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: contactPw,
      });
      if (error) throw error;

      setContactPw("");
      setContactPwOpen(false);
      setContactOpen(true);
    } catch (e: any) {
      setContactPwError("Incorrect password. Please try again.");
    } finally {
      setContactPwLoading(false);
    }
  };

  /* ---------- password check before opening shop details (NEW) ---------- */
  const onPressEditShop = () => {
    if ((authProvider ?? "email") === "email") {
      setShopPw("");
      setShopPwError(null);
      setShopPwVisible(false);
      setShopPwOpen(true);
    } else {
      setShopOpen(true);
    }
  };

  const verifyShopPw = async () => {
    if (!email || !shopPw) {
      setShopPwError("Please enter your current password.");
      return;
    }
    try {
      setShopPwLoading(true);
      setShopPwError(null);
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: shopPw,
      });
      if (error) throw error;

      setShopPw("");
      setShopPwOpen(false);
      setShopOpen(true);
    } catch {
      setShopPwError("Incorrect password. Please try again.");
    } finally {
      setShopPwLoading(false);
    }
  };

  /* ------------------------------ render ------------------------------ */

  return (
    <SafeAreaView className="flex-1 bg-[#EAF1F6]">
      {/* Header */}
      <View className="bg-[#0F2547] pb-6 relative">
        {/* Top-right role badge (mini banner) */}
        <View className="absolute right-4 top-3">
          <RoleBadge role={role} />
        </View>

        <View className="flex-row items-center justify-between px-4 pt-2">
          <Pressable
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full items-center justify-center"
            android_ripple={{ color: "rgba(255,255,255,0.2)", borderless: true }}
          >
            <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
          </Pressable>
          <Text className="text-white text-[18px] font-semibold">Account</Text>
          <View className="w-10" />
        </View>

        {/* Profile block */}
        <View className="items-center mt-5 mb-4">
          <View className="w-24 h-24 rounded-full overflow-hidden border-2 border-white">
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} className="w-full h-full" />
            ) : (
              <View className="w-full h-full items-center justify-center bg-[#EAF1F6]">
                <Ionicons name="person" size={40} color="#D1E0FF" />
              </View>
            )}
          </View>
          <Text className="text-white text-[18px] font-semibold mt-3">
            {shopDisplayName || "----" || "Driver"}
          </Text>
          <Text className="text-[#D1E0FF] text-[13px]">{email || "----"}</Text>
        </View>
      </View>

      {/* Content */}
      <ScrollView className="-mt-6" contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        {/* Main card */}
        <View className="bg-white mx-4 rounded-2xl" style={cardShadow as any}>
          <ListItem icon="person-circle" label="Change Profile" value="Name, photo, email, password" onPress={openEdit} />
          <View className="h-[1px] bg-[#EEF2F7] mx-4" />

          <ListItem
            icon="call-outline"
            label="Edit Contact"
            value="Phone, address"
            onPress={onPressEditContact}
          />
          <View className="h-[1px] bg-[#EEF2F7] mx-4" />

          {/* Notification Preference */}
          <View className="flex-row items-center px-5 py-5">
            <View className="w-11 h-11 rounded-full bg-[#F1F5F9] items-center justify-center mr-4">
              <Ionicons name="notifications-outline" size={22} color="#0F172A" />
            </View>
            <View className="flex-1">
              <Text className="text-[16px] text-[#0F172A]">Notification Preference</Text>
              <Text className="text-[13px] text-[#64748B] mt-0.5">Push alerts & sounds</Text>
            </View>
            <Switch value={notifOn} onValueChange={setNotifOn} />
          </View>
          <View className="h-[1px] bg-[#EEF2F7] mx-4" />

          {/* Shop Details (Option 1) */}
          <ListItem
            icon="construct-outline"
            label="Shop Details"
            value="Shop schedule,services.."
            onPress={onPressEditShop}
          />
        </View>

        {/* Secondary card (spacer) */}
        <View className="bg-white mx-4 mt-4 rounded-2xl" style={cardShadow as any} />
      </ScrollView>

      {/* ========================= EDIT PROFILE SHEET ========================= */}
      <Modal visible={editOpen} animationType="fade" transparent statusBarTranslucent onRequestClose={closeEdit}>
        <View className="flex-1 bg-black/40">
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 justify-end">
            <Animated.View className="bg-white rounded-t-3xl max-h-[90%]" style={{ transform: [{ translateY: sheetY }] }}>
              {/* 🔒 Disable drag when saving */}
              <View {...(saving ? {} : panResponder.panHandlers)}>
                <View className="items-center pt-3">
                  <View className="h-1.5 w-12 rounded-full bg-gray-300" />
                </View>

                <View className="flex-row items-center justify-between px-5 py-3">
                  <Pressable
                    onPress={closeEdit}
                    disabled={saving}
                    className={`px-3 py-2 -ml-2 rounded-lg ${saving ? "opacity-60" : ""}`}
                    android_ripple={{ color: "#e5e7eb" }}
                  >
                    <Ionicons name="close" size={22} color="#0F172A" />
                  </Pressable>
                  <Text className="text-[16px] font-semibold text-[#0F172A]">Edit Profile</Text>
                  <Pressable
                    onPress={handleSave}
                    disabled={saving}
                    className={`px-3 py-1.5 rounded-lg ${saving ? "opacity-60" : ""}`}
                    android_ripple={{ color: "#e5e7eb" }}
                  >
                    {saving ? <ActivityIndicator /> : <Text className="text-[14px] font-semibold text-[#0F2547]">Save</Text>}
                  </Pressable>
                </View>
              </View>

              <ScrollView
                className="px-5"
                contentContainerStyle={{ paddingBottom: 24 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                pointerEvents={saving ? "none" : "auto"} // 🔒 freeze scroll & taps while saving
              >
                {/* avatar */}
                <View className="items-center mt-2 mb-4">
                  <View className="w-24 h-24 rounded-full overflow-hidden border border-[#EEF2F7]">
                    {draftAvatar ? (
                      <Image source={{ uri: draftAvatar }} className="w-full h-full" />
                    ) : (
                      <View className="w-full h-full items-center justify-center bg-[#EAF1F6]">
                        <Ionicons name="person" size={40} color="#64748B" />
                      </View>
                    )}
                  </View>
                  <View className="flex-row gap-3 mt-3">
                    <Pressable
                      onPress={pickNewPhoto}
                      disabled={saving}
                      className={`px-3 py-2 rounded-xxl bg-[#fcfcfc] ${saving ? "opacity-60" : ""}`}
                      android_ripple={{ color: "#dbeafe" }}
                    >
                      <Text className="text-[13px] text-[#0F2547]">Change photo</Text>
                    </Pressable>
                    
                  </View>
                </View>

                {/* fields */}
                <View className="gap-3">
                  <View>
                    {shopCategory ? (
                      <View className="mb-1">
                        <Text className="text-[12px] mb-1 text-[#64748B]">Shop Type</Text>
                        <View className="border rounded-xl px-4 py-3 bg-[#F8FAFC]"  style={{ borderColor: "#E5E9F0" }}>
                          <Text className="text-[#77797a]">{shopCategory}</Text>
                        </View>
                      </View>
                    ) : null}
                    <Text className="text-[12px] mb-1 text-[#64748B]">Contact Person</Text>
                    <TextInput
                      value={draftName}
                      onChangeText={(t) => {
                        setDraftName(t);
                        setDirty(true);
                      }}
                      editable={!saving} // 🔒
                      autoCapitalize="words"
                      autoCorrect={false}
                      placeholder="Full name / contact person"
                      className="bg-white border rounded-xl px-4 py-3 text-[#0F172A]"
                      style={{ borderColor: "#E5E9F0" }}
                    />
                  </View>

                  <View>
                    <Text className="text-[12px] mb-1 text-[#64748B]">Email</Text>
                    <TextInput
                      keyboardType="email-address"
                      autoCapitalize="none"
                      value={draftEmail}
                      onChangeText={(t) => { setDraftEmail(t); setDirty(true); }}
                      editable={!saving} // 🔒
                      placeholder="Enter your email"
                      className="bg-white border rounded-xl px-4 py-3"
                      style={{ borderColor: "#E5E9F0" }}
                    />
                    <Text className="text-[11px] text-[#64748B] mt-1">
                      Changing email sends a verification link to the new address.
                    </Text>
                  </View>

                  {/* Change Password */}
                  <View className="mt-2 p-3 rounded-2xl border" style={{ borderColor: "#E5E9F0" }}>
                    <Text className="text-[13px] font-semibold text-[#0F172A] mb-2">Change Password</Text>

                    {!canChangePassword ? (
                      <Text className="text-[12px] text-[#64748B]">
                        This account uses <Text className="font-semibold">{authProvider ?? "your provider"}</Text>. 
                        Manage your password in your provider settings.
                      </Text>
                    ) : (
                      <>
                        <View className="mb-2">
                          <Text className="text-[12px] mb-1 text-[#64748B]">Current password</Text>
                          <View className="flex-row items-center border rounded-xl px-3" style={{ borderColor: "#E5E9F0" }}>
                            <TextInput
                              value={pwCurrent}
                              onChangeText={(t) => { setPwCurrent(t); setDirty(true); }}
                              placeholder="Enter current password"
                              secureTextEntry={!pwVisible.current}
                              editable={!saving} // 🔒
                              className="flex-1 py-3"
                            />
                            <Pressable
                              onPress={() => setPwVisible((s) => ({ ...s, current: !s.current }))}
                              disabled={saving}
                              className={`px-2 py-2 ${saving ? "opacity-60" : ""}`}
                            >
                              <Ionicons name={pwVisible.current ? "eye-off" : "eye"} size={18} color="#64748B" />
                            </Pressable>
                          </View>
                        </View>

                        <View className="mb-2">
                          <Text className="text-[12px] mb-1 text-[#64748B]">New password</Text>
                          <View className="flex-row items-center border rounded-xl px-3" style={{ borderColor: "#E5E9F0" }}>
                            <TextInput
                              value={pwNew}
                              onChangeText={(t) => { setPwNew(t); setDirty(true); }}
                              placeholder="At least 8 chars, with letters & numbers"
                              secureTextEntry={!pwVisible.next}
                              editable={!saving} // 🔒
                              className="flex-1 py-3"
                            />
                            <Pressable
                              onPress={() => setPwVisible((s) => ({ ...s, next: !s.next }))}
                              disabled={saving}
                              className={`px-2 py-2 ${saving ? "opacity-60" : ""}`}
                            >
                              <Ionicons name={pwVisible.next ? "eye-off" : "eye"} size={18} color="#64748B" />
                            </Pressable>
                          </View>
                        </View>

                        <View className="mb-1">
                          <Text className="text-[12px] mb-1 text-[#64748B]">Confirm new password</Text>
                          <View className="flex-row items-center border rounded-xl px-3" style={{ borderColor: "#E5E9F0" }}>
                            <TextInput
                              value={pwNew2}
                              onChangeText={(t) => { setPwNew2(t); setDirty(true); }}
                              placeholder="Re-type new password"
                              secureTextEntry={!pwVisible.next2}
                              editable={!saving} // 🔒
                              className="flex-1 py-3"
                            />
                            <Pressable
                              onPress={() => setPwVisible((s) => ({ ...s, next2: !s.next2 }))}
                              disabled={saving}
                              className={`px-2 py-2 ${saving ? "opacity-60" : ""}`}
                            >
                              <Ionicons name={pwVisible.next2 ? "eye-off" : "eye"} size={18} color="#64748B" />
                            </Pressable>
                          </View>
                        </View>

                        <Text className="text-[11px] text-[#64748B] mt-1">
                          Tip: Use 8+ characters with a mix of letters and numbers. No spaces.
                        </Text>

                        <Pressable
                          onPress={() => showDialog("Forgot password?", "Go to the login screen and tap “Forgot password”. We’ll send a reset link to your email.")}
                          disabled={saving}
                          className={`mt-2 self-start ${saving ? "opacity-60" : ""}`}
                        >
                          <Text className="text-[12px] underline" style={{ color: "#2563EB" }}>
                            Forgot your password?
                          </Text>
                        </Pressable>
                      </>
                    )}
                  </View>
                </View>
              </ScrollView>

              {/* ✨ Light overlay that blocks touches while saving */}
              {saving && (
                <View
                  pointerEvents="auto"
                  className="absolute left-0 right-0 top-0 bottom-0 rounded-t-3xl items-center justify-center"
                  style={{ backgroundColor: "rgba(255,255,255,0.55)" }}
                >
                  
                </View>
              )}
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
      {/* ======================= /EDIT PROFILE SHEET ======================= */}

      {/* ======================= EMAIL CHANGE MODAL ======================== */}
      <Modal visible={emailChangeOpen} transparent animationType="fade" onRequestClose={() => setEmailChangeOpen(false)}>
        <View className="flex-1 items-center justify-center bg-black/35 p-4">
          <View className="w-full rounded-2xl border border-gray-200 bg-white p-5">
            <Text className="mb-2 text-base font-extrabold text-gray-900">Verify your new email</Text>
            <Text className="text-gray-900">
              We sent a link to <Text className="font-semibold">{pendingEmail ?? ""}</Text>. Open your inbox and tap the link to confirm the change.
            </Text>

            {emailChangeError ? <Text className="mt-2 text-xs text-red-500">{emailChangeError}</Text> : null}

            <View className="mt-4 flex-row justify-between gap-2">
              <Pressable onPress={openGmailInbox} className="flex-1 rounded-xl border border-gray-300 py-2 items-center">
                <Text className="font-bold text-gray-900">Open Gmail</Text>
              </Pressable>

              <Pressable onPress={confirmEmailChangeNow} disabled={emailChangeChecking} className="flex-1 rounded-xl bg-[#2563EB] py-2 items-center">
                <Text className="font-extrabold text-white">{emailChangeChecking ? "Checking…" : "I've verified"}</Text>
              </Pressable>
            </View>

            <Pressable onPress={resendChangeLink} disabled={emailChangeSending} className="mt-3 items-center">
              <Text className="text-xs underline" style={{ color: emailChangeSending ? "#9CA3AF" : "#2563EB" }}>
                {emailChangeSending ? "Resending…" : "Resend verification link"}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ======================= CONTACT PASSWORD MODAL ======================= */}
      <Modal
        visible={contactPwOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setContactPwOpen(false)}
      >
        <View className="flex-1 items-center justify-center bg-black/35 p-4">
          <View className="w-full rounded-2xl border border-gray-200 bg-white p-5">
            <Text className="mb-2 text-base font-extrabold text-gray-900">Confirm it’s you</Text>
            <Text className="text-gray-900">
              Please enter your current password to edit your contact information.
            </Text>

            <View className="mt-3">
              <Text className="text-[12px] mb-1 text-[#64748B]">Password</Text>
              <View className="flex-row items-center border rounded-xl px-3" style={{ borderColor: "#E5E9F0" }}>
                <TextInput
                  value={contactPw}
                  onChangeText={(t) => { setContactPw(t); setContactPwError(null); }}
                  placeholder="Enter your password"
                  secureTextEntry={!contactPwVisible}
                  className="flex-1 py-3"
                />
                <Pressable onPress={() => setContactPwVisible((v) => !v)} className="px-2 py-2">
                  <Ionicons name={contactPwVisible ? "eye-off" : "eye"} size={18} color="#64748B" />
                </Pressable>
              </View>
              {contactPwError ? (
                <Text className="mt-2 text-xs text-red-500">{contactPwError}</Text>
              ) : null}
            </View>

            <View className="mt-4 flex-row justify-between gap-2">
              <Pressable
                onPress={() => setContactPwOpen(false)}
                disabled={contactPwLoading}
                className="flex-1 rounded-xl border border-gray-300 py-2 items-center"
              >
                <Text className="font-bold text-gray-900">Cancel</Text>
              </Pressable>

              <Pressable
                onPress={verifyContactPw}
                disabled={contactPwLoading || !contactPw}
                className="flex-1 rounded-xl bg-[#2563EB] py-2 items-center"
              >
                {contactPwLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="font-extrabold text-white">Continue</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ======================= SHOP PASSWORD MODAL (NEW) ======================= */}
      <Modal
        visible={shopPwOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setShopPwOpen(false)}
      >
        <View className="flex-1 items-center justify-center bg-black/35 p-4">
          <View className="w-full rounded-2xl border border-gray-200 bg-white p-5">
            <Text className="mb-2 text-base font-extrabold text-gray-900">Confirm it’s you</Text>
            <Text className="text-gray-900">
              Please enter your current password to edit your shop details.
            </Text>

            <View className="mt-3">
              <Text className="text-[12px] mb-1 text-[#64748B]">Password</Text>
              <View className="flex-row items-center border rounded-xl px-3" style={{ borderColor: "#E5E9F0" }}>
                <TextInput
                  value={shopPw}
                  onChangeText={(t) => { setShopPw(t); setShopPwError(null); }}
                  placeholder="Enter your password"
                  secureTextEntry={!shopPwVisible}
                  className="flex-1 py-3"
                />
                <Pressable onPress={() => setShopPwVisible((v) => !v)} className="px-2 py-2">
                  <Ionicons name={shopPwVisible ? "eye-off" : "eye"} size={18} color="#64748B" />
                </Pressable>
              </View>
              {shopPwError ? (
                <Text className="mt-2 text-xs text-red-500">{shopPwError}</Text>
              ) : null}
            </View>

            <View className="mt-4 flex-row justify-between gap-2">
              <Pressable
                onPress={() => setShopPwOpen(false)}
                disabled={shopPwLoading}
                className="flex-1 rounded-xl border border-gray-300 py-2 items-center"
              >
                <Text className="font-bold text-gray-900">Cancel</Text>
              </Pressable>

              <Pressable
                onPress={verifyShopPw}
                disabled={shopPwLoading || !shopPw}
                className="flex-1 rounded-xl bg-[#2563EB] py-2 items-center"
              >
                {shopPwLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="font-extrabold text-white">Continue</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===================== APP-WIDE DIALOG ===================== */}
      <DialogModal visible={dialogOpen} title={dialogTitle} message={dialogMessage} actions={dialogActions} onClose={() => setDialogOpen(false)} />

      {/* ===================== EDIT CONTACT SHEET (reusable) ===================== */}
      <EditContactSheet
        open={contactOpen}
        onClose={() => setContactOpen(false)}
        userId={authUserId || undefined}
        initial={contactInitial}
        onSaved={({ phone: p, address: a }) => {
          setPhone(p);
          setAddress(a);
          showDialog("Contact updated", "Your phone and address have been saved.");
        }}
      />

      {/* ===================== SHOP DETAILS SHEET (Option 1) ===================== */}
      <ShopDetailsSheet
        open={shopOpen}
        onClose={() => setShopOpen(false)}
        userId={authUserId || undefined}
        initial={shopInitial}
        onSaved={(data) => {
          setShopInitial(data);
          showDialog("Shop details updated", "Your shop information has been saved.");
        }}
      />
      <LoadingScreen
        visible={loading}
        message="Loading profile…"
        variant="spinner"
      />
    </SafeAreaView>
  );
}