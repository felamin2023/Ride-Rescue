// app/index.native.tsx
import React from "react";
import { Redirect } from "expo-router";
import { supabase } from "../utils/supabase";
import { View, ActivityIndicator } from "react-native";

function pathForRole(role?: string | null) {
  const r = (role || "").toLowerCase();
  if (!r) return "/(auth)/login";
  if (r.includes("driver")) return "/driver/driverLandingpage";
  if (r.includes("shop")) return "/shop/mechanicLandingpage";
  if (r.includes("admin")) return "/(admin)/admindashboard";
  return "/(auth)/login";
}

export default function Index() {
  const [hydrated, setHydrated] = React.useState(false);
  const [href, setHref] = React.useState<string>("/(auth)/login");

  React.useEffect(() => {
    let disposed = false;
    let gotInitial = false;

    async function routeBySession(
      session: Awaited<
        ReturnType<typeof supabase.auth.getSession>
      >["data"]["session"]
    ) {
      if (!session?.user?.id) {
        if (!disposed) setHref("/(auth)/login");
        return;
      }

      const { data: profile, error } = await supabase
        .from("app_user")
        .select("role")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (error || !profile?.role) {
        // If profile missing/invalid, force a clean local+remote sign-out
        await supabase.auth.signOut({ scope: "local" }).catch(() => {});
        await supabase.auth.signOut().catch(() => {});
        if (!disposed) setHref("/(auth)/login");
        return;
      }

      if (!disposed) setHref(pathForRole(profile.role));
    }

    const { data: sub } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!gotInitial && event === "INITIAL_SESSION") {
          gotInitial = true;
          await routeBySession(session);
          if (!disposed) setHydrated(true);
          return;
        }

        if (event === "SIGNED_OUT") {
          if (!disposed) setHref("/(auth)/login");
          return;
        }

        if (
          (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") &&
          session?.user?.id
        ) {
          await routeBySession(session);
        }
      }
    );

    return () => {
      disposed = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!hydrated) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return <Redirect href={href} />;
}