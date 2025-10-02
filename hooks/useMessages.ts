// hooks/useMessages.ts

import { useEffect, useState, useCallback } from "react";
import { supabase } from "../utils/supabase";
import { Message } from "../types/chat";

const PAGE_SIZE = 15;

export function useMessages(conversationId: string | null, userId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!conversationId || !userId) {
      setLoading(false);
      return;
    }

    fetchInitialMessages();
    subscribeToMessages();
    markMessagesAsRead();

    return () => {
      supabase.channel(`messages:${conversationId}`).unsubscribe();
    };
  }, [conversationId, userId]);

  async function fetchInitialMessages() {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

      if (fetchError) throw fetchError;

      setMessages((data || []).reverse());
      setHasMore((data || []).length === PAGE_SIZE);
    } catch (err: any) {
      console.error("[useMessages] Error:", err);
      setError(err.message || "Failed to load messages");
    } finally {
      setLoading(false);
    }
  }

  const loadMoreMessages = useCallback(async () => {
    if (!hasMore || loadingMore || messages.length === 0) return;

    try {
      setLoadingMore(true);
      const oldestMessage = messages[0];

      const { data, error: fetchError } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .lt("created_at", oldestMessage.created_at)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

      if (fetchError) throw fetchError;

      if ((data || []).length < PAGE_SIZE) {
        setHasMore(false);
      }

      setMessages((prev) => [...(data || []).reverse(), ...prev]);
    } catch (err) {
      console.error("[loadMoreMessages] Error:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [conversationId, messages, hasMore, loadingMore]);

  function subscribeToMessages() {
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
          markMessagesAsRead();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === payload.new.id ? (payload.new as Message) : m))
          );
        }
      )
      .subscribe();
  }

  async function markMessagesAsRead() {
    if (!conversationId || !userId) return;

    try {
      // Mark all unread messages as read
      await supabase
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .eq("conversation_id", conversationId)
        .neq("sender_id", userId)
        .is("read_at", null);

      // Reset unread count in conversation
      const { data: conv } = await supabase
        .from("conversations")
        .select("customer_id, driver_id")
        .eq("id", conversationId)
        .single();

      if (conv) {
        const isCustomer = conv.customer_id === userId;
        await supabase
          .from("conversations")
          .update({
            [isCustomer ? "customer_unread_count" : "driver_unread_count"]: 0,
          })
          .eq("id", conversationId);
      }
    } catch (err) {
      console.error("[markMessagesAsRead] Error:", err);
    }
  }

  async function sendMessage(content: string, type: Message["type"], metadata = {}) {
    if (!conversationId || !userId || !content.trim()) return;

    try {
      const { error: insertError } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: userId,
        content: content.trim(),
        type,
        metadata,
      });

      if (insertError) throw insertError;
    } catch (err: any) {
      console.error("[sendMessage] Error:", err);
      throw err;
    }
  }

  return {
    messages,
    loading,
    loadingMore,
    hasMore,
    error,
    sendMessage,
    loadMoreMessages,
  };
}
