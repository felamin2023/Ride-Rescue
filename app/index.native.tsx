// app/index.native.tsx
import React from "react";
import { Redirect } from "expo-router";
import { supabase } from "../utils/supabase";
import { View, ActivityIndicator } from "react-native";

function pathForRole(role?: string | null) {
  const r = (role || "").toLowerCase();
  if (r.includes("driver")) return "/driver/driverLandingpage";
  if (r.includes("shop")) return "/shop/mechanicLandingpage";
  if (r.includes("admin")) return "/(admin)/admindashboard";
  return "/driver/driverLandingpage";
}

export default function Index() {
  const [ready, setReady] = React.useState(false);
  const [href, setHref] = React.useState<string>("/(auth)/login");

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const session = data?.session;
        if (!session?.user?.id) {
          if (mounted) setHref("/(auth)/login");
          return;
        }
        const { data: profile } = await supabase
          .from("app_user")
          .select("role")
          .eq("user_id", session.user.id)
          .maybeSingle();

        if (mounted) setHref(pathForRole(profile?.role ?? null));
      } finally {
        if (mounted) setReady(true);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!s) setHref("/(auth)/login");
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return <Redirect href={href} />;
}
