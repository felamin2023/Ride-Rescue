// app/(auth)/login.tsx
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Pressable,
  Image as RNImage,
  Text,
  TextInput,
  View,
  TouchableOpacity,
  Alert,
} from "react-native";
import LoadingScreen from "../../components/LoadingScreen";
import { supabase } from "../../utils/supabase";

type LoginErrors = { email?: string; pw?: string };

function isTruthyTrue(v: any) {
  if (v === true) return true;
  if (typeof v === "string") return v.trim().toLowerCase() === "true";
  if (typeof v === "number") return v === 1;
  return false;
}

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState<LoginErrors>({});
  const [loading, setLoading] = useState(false);

  const isEmailValid = (val: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);

  const canLogin = useMemo(() => {
    return (
      !!email.trim() &&
      !!pw.trim() &&
      isEmailValid(email) &&
      pw.length >= 6 &&
      !loading
    );
  }, [email, pw, loading]);

  function landingPathFor(role?: string | null) {
    const r = (role || "").toLowerCase();
    if (r.includes("driver")) return "/driver/driverLandingpage";
    if (r.includes("shop")) return "/shop/mechanicLandingpage";
    if (r.includes("admin")) return "/admindashboard/admin";
    return "/driver/driverLandingpage";
  }

  async function handleLogin() {
    const newErrors: LoginErrors = {};

    if (!email.trim()) newErrors.email = "Email is required.";
    else if (!isEmailValid(email))
      newErrors.email = "Please enter a valid email address.";

    if (!pw.trim()) newErrors.pw = "Password is required.";
    else if (pw.length < 6)
      newErrors.pw = "Password must be at least 6 characters.";

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();

      // 1) Sign in
      const { data: signInData, error: signInErr } =
        await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password: pw,
        });

      if (signInErr) {
        setErrors({ pw: "Invalid email or password." });
        return;
      }

      const userId = signInData?.user?.id;
      if (!userId) {
        setErrors({ pw: "Login failed. Please try again." });
        return;
      }

      // 2) Role
      const { data: profile, error: profErr } = await supabase
        .from("app_user")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();

      if (profErr) {
        Alert.alert("Login error", profErr.message || "Could not load profile.");
        return;
      }

      const role = profile?.role ?? null;

      // 3) Gate: Shop owner must be verified
      const isShopOwner = (role || "").trim().toLowerCase() === "shop owner";
      if (isShopOwner) {
        const { data: shop, error: shopErr } = await supabase
          .from("shop_details")
          .select("is_verified")
          .eq("user_id", userId)
          .maybeSingle();

        if (shopErr) {
          await supabase.auth.signOut();
          Alert.alert(
            "Verification check failed",
            shopErr.message ||
              "We couldn't confirm your shop verification. Please try again."
          );
          return;
        }

        const verified = isTruthyTrue(shop?.is_verified);
        if (!verified) {
          await supabase.auth.signOut();
          Alert.alert(
            "Account pending verification",
            "Your shop owner account was created, but you can’t log in until an admin verifies your shop details."
          );
          return;
        }
      }

      // 4) Proceed
      router.replace(landingPathFor(role));
    } catch (err: any) {
      Alert.alert("Login error", err?.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!isEmailValid(normalizedEmail)) {
      setErrors((e) => ({
        ...e,
        email: "Enter your email to receive a reset link.",
      }));
      return;
    }
    try {
      setLoading(true);
      const { error } = await supabase.auth.resetPasswordForEmail(
        normalizedEmail
      );
      if (error) {
        Alert.alert("Reset failed", error.message);
        return;
      }
      Alert.alert("Check your email", "We sent a password reset link.");
    } catch (err: any) {
      Alert.alert("Reset failed", err?.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View className="flex-1 bg-[#EDF2FB] px-5">
      <View className="flex-1 justify-center">
        {/* Brand */}
        <View className="items-center mb-4">
          <RNImage
            source={require("../../assets/images/logo2.png")}
            resizeMode="contain"
            className="h-40 w-40 mb-2"
          />
        <Text className="text-2xl font-semibold text-[#0F2547]">Welcome back</Text>
          <Text className="text-sm text-gray-600 mt-1">
            Enter your credentials to access your account
          </Text>
        </View>

        {/* Card */}
        <View className="w-full self-center rounded-2xl bg-white p-5 shadow-md">
          {/* Email */}
          <Text className="mb-2 text-[13px] font-medium text-[#0F2547]">Email</Text>
          <View className="flex-row items-center rounded-xl border border-[#21499F]/40 bg-white px-3 py-2.5 mb-1">
            <Ionicons name="mail-outline" size={20} color="#21499F" />
            <TextInput
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                if (errors.email) setErrors((e) => ({ ...e, email: undefined }));
              }}
              placeholder="name@example.com"
              placeholderTextColor="#8A8A8A"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="username"
              className="ml-2 flex-1 text-base text-black"
              editable={!loading}
            />
          </View>
          {errors.email ? (
            <Text className="text-xs text-red-500 mb-2">{errors.email}</Text>
          ) : null}

          {/* Password */}
          <Text className="mb-2 text-[13px] font-medium text-[#0F2547]">Password</Text>
          <View className="flex-row items-center rounded-xl border border-[#21499F]/40 bg-white px-3 py-2.5">
            <Ionicons name="lock-closed-outline" size={20} color="#21499F" />
            <TextInput
              value={pw}
              onChangeText={(t) => {
                setPw(t);
                if (errors.pw) setErrors((e) => ({ ...e, pw: undefined }));
              }}
              placeholder="••••••••"
              placeholderTextColor="#8A8A8A"
              secureTextEntry={!showPw}
              autoComplete="password"
              textContentType="password"
              className="ml-2 flex-1 text-base text-black"
              editable={!loading}
            />
            <TouchableOpacity
              onPress={() => setShowPw((s) => !s)}
              accessibilityLabel="Toggle password visibility"
              disabled={loading}
            >
              <Ionicons
                name={showPw ? "eye-off-outline" : "eye-outline"}
                size={20}
                color="#6B7280"
              />
            </TouchableOpacity>
          </View>
          {errors.pw ? (
            <Text className="text-xs text-red-500 mt-1">{errors.pw}</Text>
          ) : null}

          {/* Forgot */}
          <View className="mt-2 mb-4">
            <Text className="text-right text-xs text-[#21499F]" onPress={handleForgotPassword}>
              Forgot password?
            </Text>
          </View>

          {/* Sign in */}
          <Pressable
            accessibilityRole="button"
            onPress={handleLogin}
            android_ripple={{ color: "rgba(255,255,255,0.15)" }}
            disabled={!canLogin}
            className={`flex-row items-center justify-center rounded-2xl py-3 ${
              canLogin ? "bg-[#2563EB]" : "bg-[#93C5FD]"
            }`}
          >
            <Text className="mr-2 text-base font-semibold text-white">Login</Text>
            <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
          </Pressable>

          {/* Bottom link */}
          <View className="mt-4 items-center">
            <Text className="text-sm text-gray-700">
              Don’t have an account{" "}
              <Text className="text-[#2563EB]" onPress={() => router.push("/signup")}>
                Sign up
              </Text>
            </Text>
          </View>
        </View>
      </View>

      <LoadingScreen visible={loading} message="Logging in please wait.." />
    </View>
  );
}
