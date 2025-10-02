// hooks/useTypingIndicator.ts

import { useEffect, useState, useRef } from "react";
import { supabase } from "../utils/supabase";
import { TypingIndicator } from "../types/chat";

const TYPING_TIMEOUT = 300; // Stop broadcasting after 300ms of no typing

export function useTypingIndicator(
  conversationId: string | null,
  userId: string | null,
  userName: string | null
) {
  const [typingUsers, setTypingUsers] = useState<TypingIndicator[]>([]);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    if (!conversationId || !userId) return;

    const channel = supabase.channel(`typing:${conversationId}`);

    channel
      .on("broadcast", { event: "typing" }, (payload) => {
        const indicator = payload.payload as TypingIndicator;
        
        // Ignore own typing events
        if (indicator.user_id === userId) return;

        setTypingUsers((prev) => {
          const filtered = prev.filter((t) => t.user_id !== indicator.user_id);
          return [...filtered, indicator];
        });

        // Clear typing indicator after 3 seconds
        setTimeout(() => {
          setTypingUsers((prev) => prev.filter((t) => t.user_id !== indicator.user_id));
        }, 3000);
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [conversationId, userId]);

  function broadcastTyping() {
    if (!conversationId || !userId || !userName) return;

    // Clear previous timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Broadcast typing event
    channelRef.current?.send({
      type: "broadcast",
      event: "typing",
      payload: {
        user_id: userId,
        conversation_id: conversationId,
        full_name: userName,
      } as TypingIndicator,
    });

    // Stop broadcasting after timeout
    timeoutRef.current = setTimeout(() => {
      // Could send "stop_typing" event here if needed
    }, TYPING_TIMEOUT);
  }

  return { typingUsers, broadcastTyping };
}
