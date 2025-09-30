// app/(auth)/adminlogin.tsx
import React, { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, Platform, ActivityIndicator, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { supabase } from "../../utils/supabase";

/* =============================== THEME =============================== */
const COLORS = {
  bg: "#F4F6F8",
  surface: "#FFFFFF",
  border: "#E5E9F0",
  text: "#0F172A",
  sub: "#64748B",
  primary: "#2563EB",
  brand: "#0F2547",
  danger: "#EF4444",
  success: "#16A34A",
};
const ADMIN_HOME = "/admindashboard"; 
const LOGO_URL = "/images/ride-rescue-logo.png";
/* =============================== BACKEND (inline) =============================== */
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

async function waitForSession(maxMs = 4000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const { data } = await supabase.auth.getSession();
    if (data?.session) return data.session;
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
}

async function readOwnProfile(userId: string) {
  const { data, error } = await supabase
    .from("app_user")
    .select("email, role")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data; // { email, role }
}

/** LOGIN: must have app_user row AND role === 'Admin' */
async function adminLogin(email: string, password: string) {
  const normalized = (email || "").trim().toLowerCase();
  if (!isEmail(normalized)) throw new Error("Invalid email.");
  if ((password ?? "").length < 6) throw new Error("Invalid password.");

  const { data, error } = await supabase.auth.signInWithPassword({ email: normalized, password });
  if (error) throw new Error("Invalid email or password.");
  const userId = data?.user?.id;
  if (!userId) throw new Error("Login failed. Please try again.");

  const profile = await readOwnProfile(userId);
  if (!profile?.email) {
    await supabase.auth.signOut();
    throw new Error("Profile not found. Please contact support.");
  }

  // ✅ Hard gate to Admin
  if ((profile.role || "").toLowerCase() !== "admin") {
    await supabase.auth.signOut();
    throw new Error("This account is not authorized for Admin access.");
  }

  return { userId };
}

async function adminForgotPassword(email: string, redirectTo?: string) {
  const normalized = (email || "").trim().toLowerCase();
  if (!isEmail(normalized)) throw new Error("Enter a valid email.");
  const { error } = await supabase.auth.resetPasswordForEmail(normalized, { redirectTo });
  if (error) throw new Error(error.message);
}

/**
 * REGISTER: create Auth user, then upsert into `app_user` with:
 *  user_id, email, full_name, password, role:'Admin'
 * RLS: insert_own requires auth.uid() = user_id
 */
async function adminRegister(fullName: string, email: string, password: string) {
  const normalized = (email || "").trim().toLowerCase();
  if (!isEmail(normalized)) throw new Error("Enter a valid email.");
  if (!fullName?.trim()) throw new Error("Full name is required.");
  if ((password ?? "").length < 6) throw new Error("Password must be at least 6 characters.");

  // 1) Create auth user
  const { error: signUpErr } = await supabase.auth.signUp({
    email: normalized,
    password,
    options: { data: { full_name: fullName } },
  });
  if (signUpErr) throw new Error(signUpErr.message);

  // 2) Wait for session (if email confirm ON, user must confirm first)
  const session = await waitForSession();
  if (!session) return { needsEmailConfirm: true as const };

  // 3) Upsert full record with role:'Admin' (overrides any 'Driver' default)
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user?.id) throw new Error("Could not get user after signup.");
  const user_id = userData.user.id;

  const { error: upErr } = await supabase
    .from("app_user")
    .upsert(
      [
        {
          user_id,            // required for insert_own
          email: normalized,  // NOT NULL
          full_name: fullName,
          password,           // (plaintext as requested; consider hashing)
          role: "Admin",      // ✅ force Admin on insert
        },
      ],
      { onConflict: "user_id" }
    );
  if (upErr) throw new Error(upErr.message);

  return { needsEmailConfirm: false as const, userId: user_id };
}

/* =================================== UI =================================== */
type Mode = "login" | "register";

export default function AdminLoginScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");

  if (Platform.OS !== "web") {
    return (
      <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: COLORS.bg }}>
        <View className="items-center rounded-2xl bg-white p-5 shadow-md border border-slate-200">
          <Ionicons name="laptop-outline" size={38} color={COLORS.brand} />
          <Text className="mt-2 text-[15px] font-semibold text-slate-900">Admin is web-only</Text>
          <Text className="mt-1 text-[12px] text-slate-500 text-center">Open this page on desktop.</Text>
        </View>
      </View>
    );
  }

  /* =============================== STATE =============================== */
  const [email, setEmail] = useState<string>(() => (typeof window !== "undefined" ? localStorage.getItem("rr_admin_email") ?? "" : ""));
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState<boolean>(() => (typeof window !== "undefined" ? !!localStorage.getItem("rr_admin_email") : true));
  const [loading, setLoading] = useState(false);
  const [globalMsg, setGlobalMsg] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [fullName, setFullName] = useState("");
  const [confirmPw, setConfirmPw] = useState("");

  const emailErr = !email ? "" : isEmail(email) ? "" : "Please enter a valid email.";
  const pwErr = password.length === 0 ? "" : password.length < 6 ? "Password must be at least 6 characters." : "";
  const fullNameErr = mode === "register" && fullName.trim().length > 0 ? "" : mode === "register" ? "Full name is required." : "";
  const confirmErr = mode === "register" && confirmPw.length > 0 ? (confirmPw !== password ? "Passwords do not match." : "") : mode === "register" ? "Please retype your password." : "";

  /* Auto-redirect if already signed in as Admin */
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      try {
        const profile = await readOwnProfile(data.user.id);
        if (mounted && profile?.email && (profile.role || "").toLowerCase() === "admin") {
          router.replace(ADMIN_HOME);
        }
      } catch {}
    })();
    return () => {
      mounted = false;
    };
  }, [router]);

  /* ============================== ACTIONS ============================== */
  const handleLogin = async () => {
    setGlobalMsg(null);
    if (!email || !password || emailErr || pwErr) {
      setGlobalMsg({ type: "error", text: "Please fill in valid credentials." });
      return;
    }
    setLoading(true);
    try {
      await adminLogin(email, password);

      if (typeof window !== "undefined") {
        if (remember) localStorage.setItem("rr_admin_email", email);
        else localStorage.removeItem("rr_admin_email");
      }

      setGlobalMsg({ type: "success", text: "Welcome back! Redirecting to Admin…" });
      setTimeout(() => router.replace(ADMIN_HOME), 300);
    } catch (err: any) {
      setGlobalMsg({ type: "error", text: err?.message || "Sign-in failed. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async () => {
    setGlobalMsg(null);
    try {
      await adminForgotPassword(
        email,
        (process.env.EXPO_PUBLIC_SUPABASE_REDIRECT_URL as string) || "https://example.com/auth/callback"
      );
      setGlobalMsg({ type: "success", text: "If this email exists, a reset link has been sent." });
    } catch (err: any) {
      setGlobalMsg({ type: "error", text: err?.message || "Failed to request reset link." });
    }
  };

  const handleRegister = async () => {
    setGlobalMsg(null);
    if (!email || emailErr || !password || pwErr || fullNameErr || confirmErr) {
      setGlobalMsg({ type: "error", text: "Please finish the form correctly." });
      return;
    }

    setLoading(true);
    try {
      const res = await adminRegister(fullName, email, password);
      if (res.needsEmailConfirm) {
        setGlobalMsg({
          type: "success",
          text: "Registration received. Please check your email to confirm, then log in here.",
        });
        return;
      }

      setGlobalMsg({ type: "success", text: "Registered! Redirecting to Admin…" });
      setTimeout(() => router.replace(ADMIN_HOME), 300);
    } catch (err: any) {
      setGlobalMsg({ type: "error", text: err?.message || "Registration failed. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  /* ================================== UI ================================== */
  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: COLORS.bg }}>
      <View className="w-full h-full items-center justify-center px-4">
        {/* Card */}
        <View className="w-full max-w-[460px] bg-white border border-slate-200 rounded-2xl shadow-lg p-6">
          {/* Brand: image logo */}
          <View className="items-center">
            <Image source={{ uri: LOGO_URL }} accessibilityLabel="RideRescue Logo" style={{ width: 48, height: 48 }} resizeMode="contain" />
            <Text className="mt-3 text-[20px] font-extrabold text-slate-900">RideRescue Admin</Text>
            <Text className="mt-1 text-[12px] text-slate-500">
              {mode === "login" ? "Sign in to manage the platform" : "Create an admin account"}
            </Text>

            {/* Mode switch pills */}
            <View className="mt-3 flex-row bg-slate-100 rounded-full p-1">
              <Pressable onPress={() => setMode("login")} className={["px-4 py-1.5 rounded-full", mode === "login" ? "bg-blue-600" : ""].join(" ")}>
                <Text className={["text-[12px] font-bold", mode === "login" ? "text-white" : "text-slate-700"].join(" ")}>Login</Text>
              </Pressable>
              <Pressable onPress={() => setMode("register")} className={["px-4 py-1.5 rounded-full ml-2", mode === "register" ? "bg-blue-600" : ""].join(" ")}>
                <Text className={["text-[12px] font-bold", mode === "register" ? "text-white" : "text-slate-700"].join(" ")}>Register</Text>
              </Pressable>
            </View>
          </View>

          {/* Global message */}
          {globalMsg ? (
            <View className={["mt-4 rounded-lg px-3 py-2 border", globalMsg.type === "error" ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"].join(" ")}>
              <Text className={["text-[12px] font-medium", globalMsg.type === "error" ? "text-red-700" : "text-green-700"].join(" ")}>{globalMsg.text}</Text>
            </View>
          ) : null}

          {/* Forms */}
          <View className="mt-5">
            {/* Email */}
            <View className="mb-3">
              <Text className="mb-1 text-[12px] font-semibold text-slate-700">Email</Text>
              <View className="flex-row items-center rounded-xl border bg-white px-3" style={{ borderColor: emailErr ? COLORS.danger : COLORS.border, height: 44 }}>
                <Ionicons name="mail-outline" size={18} color={emailErr ? COLORS.danger : "#64748B"} />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  placeholder="admin@example.com"
                  placeholderTextColor="#94A3B8"
                  className="ml-2 flex-1 text-[14px] text-slate-900"
                />
              </View>
              {!!emailErr && <Text className="mt-1 text-[11px] text-red-600">{emailErr}</Text>}
            </View>

            {/* Register-only: Full name */}
            {mode === "register" ? (
              <View className="mb-3">
                <Text className="mb-1 text-[12px] font-semibold text-slate-700">Full name</Text>
                <View className="flex-row items-center rounded-xl border bg-white px-3" style={{ borderColor: fullNameErr ? COLORS.danger : COLORS.border, height: 44 }}>
                  <Ionicons name="person-outline" size={18} color={fullNameErr ? COLORS.danger : "#64748B"} />
                  <TextInput value={fullName} onChangeText={setFullName} placeholder="Jane Doe" placeholderTextColor="#94A3B8" className="ml-2 flex-1 text-[14px] text-slate-900" />
                </View>
                {!!fullNameErr && <Text className="mt-1 text-[11px] text-red-600">{fullNameErr}</Text>}
              </View>
            ) : null}

            {/* Password */}
            <View className="mb-3">
              <Text className="mb-1 text-[12px] font-semibold text-slate-700">Password</Text>
              <View className="flex-row items-center rounded-xl border bg-white px-3" style={{ borderColor: pwErr ? COLORS.danger : COLORS.border, height: 44 }}>
                <Ionicons name="lock-closed-outline" size={18} color={pwErr ? COLORS.danger : "#64748B"} />
                <TextInput value={password} onChangeText={setPassword} secureTextEntry={!showPw} placeholder="••••••••" placeholderTextColor="#94A3B8" className="ml-2 flex-1 text-[14px] text-slate-900" />
                <Pressable onPress={() => setShowPw((s) => !s)} className="pl-2">
                  <Ionicons name={showPw ? "eye-off-outline" : "eye-outline"} size={18} color="#64748B" />
                </Pressable>
              </View>
              {!!pwErr && <Text className="mt-1 text-[11px] text-red-600">{pwErr}</Text>}
            </View>

            {/* Register-only: Confirm password */}
            {mode === "register" ? (
              <View className="mb-3">
                <Text className="mb-1 text-[12px] font-semibold text-slate-700">Confirm password</Text>
                <View className="flex-row items-center rounded-xl border bg-white px-3" style={{ borderColor: confirmErr ? COLORS.danger : COLORS.border, height: 44 }}>
                  <Ionicons name="lock-closed-outline" size={18} color={confirmErr ? COLORS.danger : "#64748B"} />
                  <TextInput value={confirmPw} onChangeText={setConfirmPw} secureTextEntry={!showPw} placeholder="••••••••" placeholderTextColor="#94A3B8" className="ml-2 flex-1 text-[14px] text-slate-900" />
                </View>
                {!!confirmErr && <Text className="mt-1 text-[11px] text-red-600">{confirmErr}</Text>}
              </View>
            ) : null}

            {/* Row: remember + forgot (login mode only) */}
            {mode === "login" ? (
              <View className="flex-row items-center justify-between mb-4">
                <Pressable onPress={() => setRemember((r) => !r)} className="flex-row items-center" accessibilityRole="checkbox" accessibilityState={{ checked: remember }}>
                  <View className={["w-[18px] h-[18px] rounded-md border items-center justify-center", remember ? "bg-blue-600 border-blue-600" : "bg-white border-slate-300"].join(" ")}>
                    {remember ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                  </View>
                  <Text className="ml-2 text-[12px] text-slate-700">Remember me</Text>
                </Pressable>

                <Pressable onPress={handleForgot}>
                  <Text className="text-[12px] font-semibold" style={{ color: COLORS.primary }}>
                    Forgot password?
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {/* Submit */}
            <Pressable onPress={mode === "login" ? handleLogin : handleRegister} disabled={loading} className={["h-11 rounded-xl items-center justify-center", loading ? "bg-blue-400" : "bg-blue-600 hover:bg-blue-700"].join(" ")}>
              {loading ? (
                <View className="flex-row items-center">
                  <ActivityIndicator color="#fff" />
                  <Text className="ml-2 text-white font-semibold text-[14px]">{mode === "login" ? "Signing in…" : "Creating account…"}</Text>
                </View>
              ) : (
                <Text className="text-white font-bold text-[14px]">{mode === "login" ? "Sign in" : "Register"}</Text>
              )}
            </Pressable>

            {/* Hint */}
            <View className="mt-4 items-center">
              <Text className="text-[11px] text-slate-500">
                {mode === "login" ? "Admin access is restricted. Use authorized credentials." : "An Admin record will be saved into app_user."}
              </Text>
            </View>
          </View>
        </View>

        {/* Footer brand line */}
        <View className="mt-6 items-center">
          <Text className="text-[11px] text-slate-500">© {new Date().getFullYear()} RideRescue • Admin Panel</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
