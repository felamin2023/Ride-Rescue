import "../global.css";
import "../global";
// import { Stack } from "expo-router";

// export default function RootLayout() {
//   return <Stack screenOptions={{ headerShown: false }} />;
// }
// app/(auth)/_layout.tsx
import React from "react";
import { Stack, useRouter } from "expo-router";
import { supabase } from "../utils/supabase";

function pathForRole(role?: string | null) {
  const r = (role || "").toLowerCase();
  if (r.includes("driver")) return "/driver/driverLandingpage";
  if (r.includes("shop")) return "/shop/mechanicLandingpage";
  if (r.includes("admin")) return "/(admin)/admindashboard";
  return "/driver/driverLandingpage";
}

export default function AuthLayout() {
  const router = useRouter();

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;
      if (!session?.user?.id) return;

      const { data: profile } = await supabase
        .from("app_user")
        .select("role")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (mounted) {
        router.replace(pathForRole(profile?.role ?? null));
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (s?.user?.id) {
        // When login happens while on an auth screen, jump out
        router.replace("/"); // index will re-route by role
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  return <Stack screenOptions={{ headerShown: false }} />;
}
