// app/(driver)/chat/[threadId].tsx
import React from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChatThread } from "../../../components/chat/ChatModal";

export default function ChatScreen() {
  const router = useRouter();
  const { threadId, name, avatar } = useLocalSearchParams<{
    threadId: string;
    name?: string;
    avatar?: string;
  }>();

  return (
    <ChatThread
      title={name || `Thread ${threadId}`}
      subtitle="Online"
      avatar={typeof avatar === "string" ? avatar : undefined}
      onClose={() => router.back()}
    />
  );
}
