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
} from "react-native";
import LoadingScreen from "../../components/LoadingScreen"; // 👈 import it

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; pw?: string }>({});
  const [loading, setLoading] = useState(false); // 👈 loading state

  const isEmailValid = (val: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);

  const canLogin = useMemo(() => {
    return !!email.trim() && !!pw.trim() && isEmailValid(email) && pw.length >= 6;
  }, [email, pw]);

  const handleLogin = () => {
    const newErrors: { email?: string; pw?: string } = {};

    if (!email.trim()) {
      newErrors.email = "Email is required.";
    } else if (!isEmailValid(email)) {
      newErrors.email = "Please enter a valid email address.";
    }

    if (!pw.trim()) {
      newErrors.pw = "Password is required.";
    } else if (pw.length < 6) {
      newErrors.pw = "Password must be at least 6 characters.";
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length === 0) {
      setLoading(true); // 👈 show loading
      // simulate request delay
      setTimeout(() => {
        setLoading(false); // 👈 hide loading
        router.replace("/driver/driverLandingpage");
      }, 1500);
    }
  };

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
              className="ml-2 flex-1 text-base text-black"
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
              className="ml-2 flex-1 text-base text-black"
            />
            <TouchableOpacity
              onPress={() => setShowPw((s) => !s)}
              accessibilityLabel="Toggle password visibility"
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
            <Text className="text-right text-xs text-[#21499F]">Forgot password?</Text>
          </View>

          {/* Sign in */}
          <Pressable
            accessibilityRole="button"
            onPress={handleLogin}
            android_ripple={{ color: "rgba(255,255,255,0.15)" }}
            className={`flex-row items-center justify-center rounded-2xl py-3 ${
              canLogin ? "bg-[#2563EB]" : "bg-[#2563EB]"
            }`}
          >
            <Text className="mr-2 text-base font-semibold text-white">Login</Text>
            <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
          </Pressable>

          {/* Divider */}
          <View className="my-5 flex-row items-center">
            <View className="h-px flex-1 bg-gray-300" />
            <Text className="mx-3 text-[12px] tracking-widest text-gray-500">
              OR CONTINUE WITH
            </Text>
            <View className="h-px flex-1 bg-gray-300" />
          </View>

          {/* Google */}
          <Pressable
            accessibilityRole="button"
            onPress={() => {}}
            android_ripple={{ color: "rgba(0,0,0,0.05)" }}
            className="mb-2 flex-row items-center justify-center rounded-2xl border border-[#4285F4] bg-white py-3"
          >
            <Ionicons name="logo-google" size={18} color="#4285F4" />
            <Text className="ml-2 text-base font-semibold text-[#4285F4]">
              Sign in with Google
            </Text>
          </Pressable>
        </View>

        {/* Bottom link */}
        <View className="mt-4 items-center">
          <Text className="text-sm text-gray-700">
            Don’t have an account?{" "}
            <Text
              className="text-[#2563EB]"
              onPress={() => router.push("/signup")}
            >
              Sign up
            </Text>
          </Text>
        </View>
      </View>

      {/* Loading overlay */}
      <LoadingScreen visible={loading} message="Logging in please wait.." />
    </View>
  );
}
