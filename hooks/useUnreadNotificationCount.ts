// hooks/useUnreadNotificationCount.ts

import { useEffect, useState, useCallback } from "react";
import { supabase } from "../utils/supabase";
import { AppState, AppStateStatus } from "react-native";

type NotificationRow = {
  id: string;
  read_at: string | null;
  to_user_id: string;
  created_at: string;
};

export function useUnreadNotificationCount(): number {
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [userId, setUserId] = useState<string | null>(null);

  // Get current user ID
  useEffect(() => {
    const getCurrentUser = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        
        if (error) {
          console.error(" [NotifCount] Auth error:", error.message);
          return;
        }
        
        if (user) {
          console.log(" [NotifCount] User ID:", user.id.substring(0, 8) + "...");
          setUserId(user.id);
        } else {
          console.log(" [NotifCount] No user logged in");
        }
      } catch (error: any) {
        console.error(" [NotifCount] Exception:", error?.message);
      }
    };
    getCurrentUser();
  }, []);

  // Fetch unread count - using the SAME approach as your inbox
  const fetchUnreadCount = useCallback(async (currentUserId: string) => {
    try {
      console.log("[NotifCount] Fetching...");
      
      // Use the same query as your inbox page
      const { data, error } = await supabase
        .from("notifications")
        .select("id, read_at")
        .eq("to_user_id", currentUserId)
        .is("read_at", null)  // Only get unread
        .order("created_at", { ascending: false });

      if (error) {
        console.error("[NotifCount] Query error:", error.message);
        console.error("[NotifCount] Error details:", error);
        return;
      }

      const count = data?.length || 0;
      console.log("[NotifCount] Unread notifications:", count);
      setUnreadCount(count);
    } catch (error: any) {
      console.error("[NotifCount] Unexpected error:", error?.message || error);
    }
  }, []);

  // Setup polling + realtime
  useEffect(() => {
    if (!userId) {
      console.log(" [NotifCount] Waiting for userId...");
      return;
    }

    console.log("🚀 [NotifCount] Starting subscription for:", userId.substring(0, 8) + "...");
    let isActive = true;

    // Initial fetch
    fetchUnreadCount(userId);

    // Poll every 3 seconds
    const pollInterval = setInterval(() => {
      if (isActive) {
        fetchUnreadCount(userId);
      }
    }, 3000);

    // Realtime subscription - same as your inbox
    const channel = supabase
      .channel(`notifications:count:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*", // INSERT, UPDATE, DELETE
          schema: "public",
          table: "notifications",
          filter: `to_user_id=eq.${userId}`,
        },
        (payload) => {
          console.log("⚡ [NotifCount] Realtime event:", payload.eventType);
          if (isActive) {
            // Small delay to ensure DB is updated
            setTimeout(() => {
              if (isActive) {
                fetchUnreadCount(userId);
              }
            }, 100);
          }
        }
      )
      .subscribe((status, err) => {
        if (err) {
          console.error("[NotifCount] Subscription error:", err);
        } else {
          console.log("[NotifCount] Subscription status:", status);
        }
      });

    // Refetch when app comes to foreground
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === "active" && isActive) {
        console.log("[NotifCount] App foregrounded, refetching...");
        fetchUnreadCount(userId);
      }
    };

    const appStateSubscription = AppState.addEventListener("change", handleAppStateChange);

    // Cleanup
    return () => {
      console.log(" [NotifCount] Cleaning up subscription");
      isActive = false;
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
      appStateSubscription.remove();
    };
  }, [userId, fetchUnreadCount]);

  return unreadCount;
}
