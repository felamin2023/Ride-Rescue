// hooks/useOnlineStatus.ts

import { useEffect, useState } from "react";
import { supabase } from "../utils/supabase";
import { AppState, AppStateStatus } from "react-native";

export function useOnlineStatus(userId: string | null) {
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) return;

    const channel = supabase.channel("online-users");

    // Subscribe to presence
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const users = new Set<string>();
        
        Object.keys(state).forEach((key) => {
          const presences = state[key];
          presences.forEach((presence: any) => {
            if (presence.user_id) {
              users.add(presence.user_id);
            }
          });
        });
        
        setOnlineUsers(users);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          // Track this user as online
          await channel.track({
            user_id: userId,
            online_at: new Date().toISOString(),
          });
        }
      });

    // Handle app state changes (background/foreground)
    const subscription = AppState.addEventListener("change", handleAppStateChange);

    async function handleAppStateChange(nextAppState: AppStateStatus) {
      if (nextAppState === "active") {
        // App came to foreground - mark as online
        await channel.track({
          user_id: userId,
          online_at: new Date().toISOString(),
        });
      } else if (nextAppState === "background" || nextAppState === "inactive") {
        // App went to background - untrack
        await channel.untrack();
      }
    }

    return () => {
      channel.untrack();
      channel.unsubscribe();
      subscription?.remove();
    };
  }, [userId]);

  return { onlineUsers, isOnline: (uid: string) => onlineUsers.has(uid) };
}
