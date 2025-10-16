// types/chat.ts

export type MessageType = "text" | "image" | "location";

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  type: MessageType;
  metadata: {
    latitude?: number;
    longitude?: number;
    image_url?: string;
    [key: string]: any;
  };
  read_at: string | null;
  created_at: string;
};

export type Conversation = {
  id: string;
  emergency_id: string | null;
  customer_id: string;
  driver_id: string;
  created_at: string;
  updated_at: string;
  customer_unread_count: number;
  driver_unread_count: number;
  
};

export type ConversationWithDetails = Conversation & {
  emergency: {
    vehicle_type: string;
    emergency_status: string;
    latitude: number;
    longitude: number;
  } | null;
  customer: {
    user_id: string;
    full_name: string;
    photo_url: string | null;
    place_name?: string | null; // 🔵 ADDED: Place name from places table
  } | null;
  driver: {
    user_id: string;
    full_name: string;
    photo_url: string | null;
    place_name?: string | null; // 🔵 ADDED: Place name from places table
  } | null;
  last_message: Message | null;
};

export type TypingIndicator = {
  user_id: string;
  conversation_id: string;
  full_name: string;
};
