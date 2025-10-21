// hooks/useOnlineStatus.ts
import { useEffect, useState, useRef } from "react";
import { supabase } from "../utils/supabase";
import { AppState, AppStateStatus } from "react-native";

export function useOnlineStatus(userId: string | null) {
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [dbOnlineUsers, setDbOnlineUsers] = useState<Set<string>>(new Set());
  const channelRef = useRef<any>(null);

  useEffect(() => {
    if (!userId) return;

    // Set user as online in database on mount
    setUserOnlineInDb(userId);

    // Setup presence channel
    setupPresenceChannel(userId);

    // Subscribe to database online status changes
    const dbSubscription = setupDbSubscription();

    // Load initially online users from database
    loadOnlineUsersFromDb();

    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === "active") {
        await setUserOnlineInDb(userId);
      }
    };

    const appStateSubscription = AppState.addEventListener("change", handleAppStateChange);

    return () => {
      // Cleanup when component unmounts OR userId changes
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
      dbSubscription.unsubscribe();
      appStateSubscription.remove();
    };
  }, [userId]);

  const setupPresenceChannel = (userId: string) => {
    // Clean up existing channel first
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase.channel("online-users", {
      config: {
        presence: {
          key: userId,
        },
      },
    });
    
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const users = new Set<string>();
        
        Object.values(state).forEach((presences: any) => {
          presences.forEach((presence: any) => {
            if (presence.user_id) {
              users.add(presence.user_id);
            }
          });
        });
        
        setOnlineUsers(users);
      })
      .on("presence", { event: "join" }, ({ newPresences }) => {
        setOnlineUsers(prev => {
          const next = new Set(prev);
          newPresences.forEach((presence: any) => {
            if (presence.user_id) next.add(presence.user_id);
          });
          return next;
        });
      })
      .on("presence", { event: "leave" }, ({ leftPresences }) => {
        setOnlineUsers(prev => {
          const next = new Set(prev);
          leftPresences.forEach((presence: any) => {
            if (presence.user_id) next.delete(presence.user_id);
          });
          return next;
        });
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            user_id: userId,
            online_at: new Date().toISOString(),
          });
          channelRef.current = channel;
        }
      });

    return channel;
  };

  const setupDbSubscription = () => {
    return supabase
      .channel('online_status_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'app_user',
        },
        (payload) => {
          const user = payload.new as { user_id: string; is_online: boolean };
          if (user.is_online) {
            setDbOnlineUsers(prev => new Set([...prev, user.user_id]));
          } else {
            setDbOnlineUsers(prev => {
              const next = new Set(prev);
              next.delete(user.user_id);
              return next;
            });
          }
        }
      )
      .subscribe();
  };

  const setUserOnlineInDb = async (userId: string) => {
    const { error } = await supabase
      .from("app_user")
      .update({ 
        is_online: true,
      })
      .eq("user_id", userId);

    if (error) {
      console.error("Failed to set user online:", error);
    }
  };

  const loadOnlineUsersFromDb = async () => {
    const { data: onlineUsers, error } = await supabase
      .from("app_user")
      .select("user_id")
      .eq("is_online", true);

    if (error) {
      console.error("Failed to load online users:", error);
      return;
    }

    if (onlineUsers) {
      setDbOnlineUsers(new Set(onlineUsers.map(user => user.user_id)));
    }
  };

  const isOnline = (uid: string) => {
    return onlineUsers.has(uid) || dbOnlineUsers.has(uid);
  };

  return { onlineUsers, isOnline };
}