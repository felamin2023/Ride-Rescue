// hooks/useUnreadMessageCount.ts

import { useEffect, useState } from "react";
import { supabase } from "../utils/supabase";
import { AppState, AppStateStatus } from "react-native";

// Define the conversation record type
type ConversationRecord = {
  id: string;
  customer_id: string;
  driver_id: string;
  customer_unread_count: number;
  driver_unread_count: number;
  shop_place_id?: string;
  emergency_id?: string;
  created_at?: string;
  updated_at?: string;
};

/**
 * Fetches total unread message count for the current user.
 * Updates in real-time when conversations change.
 */
export function useUnreadMessageCount(): number {
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [userId, setUserId] = useState<string | null>(null);

  // Get current user ID
  useEffect(() => {
    const getCurrentUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setUserId(user.id);
        }
      } catch (error) {
        console.error("[useUnreadMessageCount] Error getting user:", error);
      }
    };
    getCurrentUser();
  }, []);

  // Fetch unread count function
  const fetchUnreadCount = async (currentUserId: string) => {
    try {
      // Get all conversations where user is customer OR driver
      const { data, error } = await supabase
        .from("conversations")
        .select("customer_id, driver_id, customer_unread_count, driver_unread_count")
        .or(`customer_id.eq.${currentUserId},driver_id.eq.${currentUserId}`);

      if (error) {
        console.error("[useUnreadMessageCount] Error fetching conversations:", error);
        return;
      }

      if (!data || data.length === 0) {
        setUnreadCount(0);
        return;
      }

      // Sum up unread counts based on user's role in each conversation
      const total = data.reduce((sum, conv) => {
        if (conv.customer_id === currentUserId) {
          return sum + (conv.customer_unread_count || 0);
        } else if (conv.driver_id === currentUserId) {
          return sum + (conv.driver_unread_count || 0);
        }
        return sum;
      }, 0);

      console.log("[useUnreadMessageCount] Total unread:", total);
      setUnreadCount(total);
    } catch (error) {
      console.error("[useUnreadMessageCount] Unexpected error:", error);
    }
  };

  // Setup realtime subscription + polling for reliability
  useEffect(() => {
    if (!userId) return;

    let isSubscribed = true;

    // Initial fetch
    fetchUnreadCount(userId);

    // Poll every 3 seconds for guaranteed updates
    const pollInterval = setInterval(() => {
      if (isSubscribed) {
        fetchUnreadCount(userId);
      }
    }, 3000); // 3 seconds - adjust as needed

    // Setup realtime subscription for instant updates
    const channel = supabase
      .channel(`unread-messages-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*", // Listen to INSERT, UPDATE, DELETE
          schema: "public",
          table: "conversations",
        },
        (payload) => {
          console.log("[useUnreadMessageCount] Realtime update:", payload.eventType);
          
          // Type-safe access to record data
          const record = (payload.new || payload.old) as Partial<ConversationRecord> | null;
          
          // Check if this change affects the current user
          if (record && (record.customer_id === userId || record.driver_id === userId)) {
            console.log("[useUnreadMessageCount] Relevant change detected, refetching...");
            if (isSubscribed) {
              fetchUnreadCount(userId);
            }
          }
        }
      )
      .subscribe((status) => {
        console.log("[useUnreadMessageCount] Subscription status:", status);
      });

    // Refetch when app comes to foreground
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === "active" && isSubscribed) {
        console.log("[useUnreadMessageCount] App came to foreground, refetching...");
        fetchUnreadCount(userId);
      }
    };

    const appStateSubscription = AppState.addEventListener("change", handleAppStateChange);

    // Cleanup
    return () => {
      isSubscribed = false;
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
      appStateSubscription.remove();
      console.log("[useUnreadMessageCount] Cleanup completed");
    };
  }, [userId]);

  return unreadCount;
}
