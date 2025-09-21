// app/(auth)/_layout.tsx
import "../global.css";
import "../global";
import React from "react";
import { Stack, useRouter, usePathname } from "expo-router";
import { supabase } from "../utils/supabase";

export default function AuthLayout() {
  const router = useRouter();
  const pathname = usePathname();

  React.useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const userId = session?.user?.id;

      if (event === "SIGNED_OUT") {
        // Explicit sign-out → go to login
        router.replace("/(auth)/login");
        return;
      }

      // ⛔️ Do NOT redirect away on SIGNED_IN while in the auth flow (e.g., during OTP on signup).
      // If you still want to bounce *just from the login screen* when already signed in,
      // keep it scoped to that route only:
      if (
        (event === "SIGNED_IN" ||
          event === "TOKEN_REFRESHED" ||
          event === "INITIAL_SESSION") &&
        userId &&
        pathname === "/(auth)/login" // only bounce if they’re literally on the login page
      ) {
        router.replace("/");
      }
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, [router, pathname]);

  // No bootstrap redirect here — let the individual screens decide.
  return <Stack screenOptions={{ headerShown: false }} />;
}
