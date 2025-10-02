// hooks/useConversations.ts

import { useEffect, useState } from "react";
import { supabase } from "../utils/supabase";
import { ConversationWithDetails } from "../types/chat";

export function useConversations(userId: string | null) {
  const [conversations, setConversations] = useState<ConversationWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    fetchConversations();
    subscribeToConversations();

    return () => {
      supabase.channel("conversations").unsubscribe();
    };
  }, [userId]);

  async function fetchConversations() {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from("conversations")
        .select(
          `
          *,
          emergency:emergency_id (vehicle_type, emergency_status, latitude, longitude),
          customer:customer_id (user_id, full_name, photo_url),
          driver:driver_id (user_id, full_name, photo_url)
        `
        )
        .or(`customer_id.eq.${userId},driver_id.eq.${userId}`)
        .order("updated_at", { ascending: false });

      if (fetchError) throw fetchError;

      // Get all user IDs from conversations
      const userIds = Array.from(
        new Set([
          ...((data || []).map((c) => c.customer_id).filter(Boolean)),
          ...((data || []).map((c) => c.driver_id).filter(Boolean)),
        ])
      );

      // Fetch shop_details with place_id
      const { data: shopData } = await supabase
        .from("shop_details")
        .select("user_id, place_id")
        .in("user_id", userIds);

      // Get place_ids from shop_details
      const placeIds = Array.from(
        new Set(shopData?.map((s) => s.place_id).filter(Boolean) || [])
      );

      // Fetch place names
      const { data: placesData } = await supabase
        .from("places")
        .select("place_id, name")
        .in("place_id", placeIds);

      // Create mapping: user_id → place_name
      const userToPlaceMap = new Map<string, string>();
      shopData?.forEach((shop) => {
        if (shop.place_id) {
          const place = placesData?.find((p) => p.place_id === shop.place_id);
          if (place?.name) {
            userToPlaceMap.set(shop.user_id, place.name);
          }
        }
      });

      // Enrich conversations with place names
      const enrichedData = (data || []).map((conv) => {
        return {
          ...conv,
          customer: conv.customer
            ? {
                ...conv.customer,
                place_name: userToPlaceMap.get(conv.customer.user_id) || null,
              }
            : null,
          driver: conv.driver
            ? {
                ...conv.driver,
                place_name: userToPlaceMap.get(conv.driver.user_id) || null,
              }
            : null,
        };
      });

      // Fetch last message for each conversation
      const withLastMessage = await Promise.all(
        enrichedData.map(async (conv) => {
          const { data: lastMsg } = await supabase
            .from("messages")
            .select("*")
            .eq("conversation_id", conv.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

          return { ...conv, last_message: lastMsg || null };
        })
      );

      setConversations(withLastMessage as ConversationWithDetails[]);
    } catch (err: any) {
      console.error("[useConversations] Error:", err);
      setError(err.message || "Failed to load conversations");
    } finally {
      setLoading(false);
    }
  }

  function subscribeToConversations() {
    const channel = supabase
      .channel("conversations")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `customer_id=eq.${userId},driver_id=eq.${userId}`,
        },
        () => {
          fetchConversations();
        }
      )
      .subscribe();
  }

  return { conversations, loading, error, refetch: fetchConversations };
}
