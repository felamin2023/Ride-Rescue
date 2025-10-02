// utils/chatHelpers.ts

import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { Alert, Platform } from "react-native";
import { supabase } from "./supabase";

/**
 * =====================================================================
 * CONSTANTS
 * =====================================================================
 */
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB limit for images

/**
 * =====================================================================
 * IMAGE PICKING & COMPRESSION
 * =====================================================================
 * 
 * ANALOGY: Like opening your photo album, picking a photo, and 
 * resizing it to fit in an envelope before mailing it.
 * 
 * CONNECTS TO:
 * - chat/[conversationId].tsx: Called when user taps "image" button
 * - Returns a local URI (file path on device) that can be uploaded
 * 
 * HOW IT WORKS:
 * 1. Asks permission to access photo library
 * 2. Opens photo picker UI
 * 3. Compresses image to 70% quality (smaller file size)
 * 4. Validates file isn't too big (>5MB)
 * 5. Returns local file path (URI) or null if canceled/failed
 */
export async function pickAndCompressImage(): Promise<string | null> {
  // Step 1: Request permission to access photos
  const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
  
  if (!permissionResult.granted) {
    Alert.alert("Permission Required", "Please allow access to your photo library.");
    return null;
  }

  // Step 2: Open image picker with compression settings
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images, // Only images, no videos
    allowsEditing: true, // User can crop/rotate
    quality: 0.7, // Compress to ~70% quality (reduces file size)
    base64: false, // Don't need base64 encoding
  });

  // Step 3: Check if user canceled or no image selected
  if (result.canceled || !result.assets?.[0]) {
    return null;
  }

  const asset = result.assets[0];

  // Step 4: Validate file size (prevent uploading huge files)
  if (asset.fileSize && asset.fileSize > MAX_FILE_SIZE) {
    Alert.alert("File Too Large", "Please select an image smaller than 5MB.");
    return null;
  }

  // Step 5: Return local file path (URI)
  return asset.uri;
}

/**
 * =====================================================================
 * IMAGE UPLOAD TO SUPABASE STORAGE
 * =====================================================================
 * 
 * ANALOGY: Like taking your photo to the post office, they scan it,
 * store it in their archive, and give you a permanent tracking number
 * (public URL) to share with others.
 * 
 * CONNECTS TO:
 * - chat/[conversationId].tsx: Called after pickAndCompressImage()
 * - supabase.ts: Uses the Supabase client to upload to cloud storage
 * - Supabase Storage bucket: "chat-media" (must exist in your project)
 * 
 * HOW IT WORKS:
 * 1. Takes local file URI from pickAndCompressImage()
 * 2. Generates unique filename with timestamp + random string
 * 3. Uploads to Supabase Storage using FormData (React Native) or Blob (Web)
 * 4. Returns public URL (permanent link to access the image)
 * 5. This URL is saved in the messages table as image_url
 * 
 * FILE STRUCTURE IN STORAGE:
 * chat-media/
 *   └── {emergencyId}/
 *       ├── 1701234567_abc123.jpg
 *       ├── 1701234890_xyz789.png
 *       └── ...
 */
export async function uploadChatImage(
  uri: string,        // Local file path from pickAndCompressImage()
  emergencyId: string // Used to organize files by emergency
): Promise<string | null> {
  try {
    console.log("[uploadChatImage] Starting upload for URI:", uri);

    // Step 1: Generate unique filename
    const fileExt = uri.split(".").pop()?.toLowerCase() || "jpg";
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `${emergencyId}/${fileName}`; // Organize by emergency ID

    console.log("[uploadChatImage] File path:", filePath);

    // Step 2: Upload for React Native (iOS/Android)
    if (Platform.OS !== "web") {
      // FormData is like wrapping your photo in an envelope with metadata
      const formData = new FormData();
      formData.append("file", {
        uri: uri,
        type: `image/${fileExt}`,
        name: fileName,
      } as any);

      // Upload to Supabase Storage bucket "chat-media"
      const { data, error } = await supabase.storage
        .from("chat-media")
        .upload(filePath, formData, {
          contentType: `image/${fileExt}`,
          upsert: false, // Don't overwrite if file exists
        });

      if (error) {
        console.error("[uploadChatImage] Upload error:", error);
        Alert.alert("Upload Failed", error.message);
        return null;
      }

      console.log("[uploadChatImage] Upload successful:", data);

      // Step 3: Get permanent public URL
      const { data: urlData } = supabase.storage
        .from("chat-media")
        .getPublicUrl(data.path);

      console.log("[uploadChatImage] Public URL:", urlData.publicUrl);
      return urlData.publicUrl; // This URL is saved in messages table
    }

    // Step 4: Upload for Web (different method)
    const response = await fetch(uri);
    const blob = await response.blob(); // Convert to binary data

    const { data, error } = await supabase.storage
      .from("chat-media")
      .upload(filePath, blob, {
        contentType: `image/${fileExt}`,
        upsert: false,
      });

    if (error) {
      console.error("[uploadChatImage] Upload error:", error);
      Alert.alert("Upload Failed", error.message);
      return null;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("chat-media")
      .getPublicUrl(data.path);

    return urlData.publicUrl;
  } catch (err) {
    console.error("[uploadChatImage] Exception:", err);
    Alert.alert(
      "Upload Error",
      `An unexpected error occurred:\n${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
}

/**
 * =====================================================================
 * MESSAGE TIME FORMATTING
 * =====================================================================
 * 
 * ANALOGY: Like writing "5 minutes ago" instead of "12:43:17 PM"
 * on a note - easier to read at a glance.
 * 
 * CONNECTS TO:
 * - message.tsx: Shows when last message was sent in conversation list
 * - chat/[conversationId].tsx: Shows timestamp under each message bubble
 * 
 * HOW IT WORKS:
 * Takes an ISO date string (e.g., "2025-10-02T12:43:00Z") and converts
 * it to human-readable format based on how long ago it was:
 * - "Just now" (< 1 minute)
 * - "5m ago" (< 1 hour)
 * - "3h ago" (< 24 hours)
 * - "Yesterday" (1 day ago)
 * - "3d ago" (< 1 week)
 * - "10/2/2025" (older than 1 week)
 */
export function formatMessageTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime(); // Difference in milliseconds
  const diffMins = Math.floor(diffMs / 60000); // Convert to minutes

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;

  // For older messages, show full date
  return date.toLocaleDateString();
}

/**
 * =====================================================================
 * GET USER'S CURRENT LOCATION
 * =====================================================================
 * 
 * ANALOGY: Like asking your phone's GPS "where am I right now?"
 * and getting latitude/longitude coordinates.
 * 
 * CONNECTS TO:
 * - chat/[conversationId].tsx: Called when user taps "location" button
 * - Returns coordinates that are saved in messages table
 * - Displayed as a map preview in chat bubbles
 * 
 * HOW IT WORKS:
 * 1. Asks permission to access device location
 * 2. Gets current GPS coordinates
 * 3. Returns {latitude, longitude} object
 * 4. These coordinates are saved as message metadata
 * 5. Tapping the location message opens full map view
 * 
 * PRIVACY NOTE: Only shares location when user explicitly taps button
 */
export async function getCurrentLocation(): Promise<{ latitude: number; longitude: number } | null> {
  try {
    // Step 1: Request location permission
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Required", "Please enable location access.");
      return null;
    }

    // Step 2: Get current GPS coordinates
    const location = await Location.getCurrentPositionAsync({});
    
    // Step 3: Return coordinates object
    return {
      latitude: location.coords.latitude,   // e.g., 14.5995
      longitude: location.coords.longitude, // e.g., 120.9842
    };
  } catch (err) {
    console.error("[getCurrentLocation] Error:", err);
    Alert.alert("Location Error", "Could not get your current location.");
    return null;
  }
}
