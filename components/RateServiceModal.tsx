// components/RateServiceModal.tsx
import React, { useMemo, useState } from "react";
import { Modal, View, Text, Pressable, TextInput, Image, ScrollView, Alert, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { supabase } from "../utils/supabase";

const cardShadow = Platform.select({
  ios: { shadowColor: "#0F172A", shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  android: { elevation: 2 },
});

const MAX_PHOTOS = 4;

/* ---------- props ---------- */
export type RateTxMeta = {
  transaction_id: string;
  emergency_id: string;
  service_id: string;
  shop_id: string;
  shopTitle?: string;
};

export default function RateServiceModal({
  visible,
  onClose,
  tx,
  onSubmitted,
}: {
  visible: boolean;
  onClose: () => void;
  tx: RateTxMeta | null;
  onSubmitted?: (ratingId: string) => void;
}) {
  const [stars, setStars] = useState<number>(5);
  const [comment, setComment] = useState<string>("");
  const [tags, setTags] = useState<string[]>([]);
  const [uris, setUris] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const tagOptions = useMemo(
    () => ["Fast", "Friendly", "Professional", "Affordable", "Clean Work", "On Time"],
    []
  );

  const toggleTag = (t: string) =>
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  if (!visible || !tx) return null;

  /* ---------- image helpers (same style as emergencyrequest) ---------- */
  const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    let bufferLength = base64.length * 0.75;
    const len = base64.length;
    if (base64[len - 1] === "=") bufferLength--;
    if (base64[len - 2] === "=") bufferLength--;
    const arraybuffer = new ArrayBuffer(bufferLength);
    const bytes = new Uint8Array(arraybuffer);
    let p = 0;
    for (let i = 0; i < len; i += 4) {
      const enc1 = chars.indexOf(base64[i]);
      const enc2 = chars.indexOf(base64[i + 1]);
      const enc3 = chars.indexOf(base64[i + 2]);
      const enc4 = chars.indexOf(base64[i + 3]);
      const chr1 = (enc1 << 2) | (enc2 >> 4);
      const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
      const chr3 = ((enc3 & 3) << 6) | enc4;
      bytes[p++] = chr1;
      if (enc3 !== 64) bytes[p++] = chr2;
      if (enc4 !== 64) bytes[p++] = chr3;
    }
    return arraybuffer;
  };

  function guessExtAndMime(uri: string, fallbackType = "image/jpeg") {
    const ext = uri.split("?")[0].split(".").pop()?.toLowerCase();
    const type =
      ext === "png"
        ? "image/png"
        : ext === "webp"
        ? "image/webp"
        : ext === "heic" || ext === "heif"
        ? "image/heic"
        : fallbackType;
    return { ext: ext || "jpg", type };
  }

  async function uploadReviewPhotos(userId: string, groupId: string, photos: string[]) {
    const bucket = supabase.storage.from("review-attachments");
    const urls: string[] = [];
    for (let i = 0; i < photos.length; i++) {
      const uri = photos[i];
      const { type: contentType, ext } = guessExtAndMime(uri);
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const buf = base64ToArrayBuffer(base64.replace(/\r?\n/g, ""));

      const path = `${userId}/${groupId}/photo-${Date.now()}-${i}.${ext}`;
      let ok = false;
      try {
        const { error } = await bucket.upload(path, buf, { upsert: true, contentType });
        if (error) throw error;
        ok = true;
      } catch {
        const { data: sign, error: signErr } = await bucket.createSignedUploadUrl(path);
        if (signErr) throw signErr;
        const { error: up2Err } = await bucket.uploadToSignedUrl(path, sign.token, buf, {
          upsert: true,
          contentType,
        });
        if (up2Err) throw up2Err;
        ok = true;
      }
      if (ok) {
        const { data } = bucket.getPublicUrl(path);
        urls.push(data.publicUrl);
      }
    }
    return urls;
  }

  /* ---------- pickers ---------- */
  const addUris = (list: string[]) =>
    setUris((prev) => {
      const next = [...prev];
      for (const u of list) {
        if (next.length >= MAX_PHOTOS) break;
        if (!next.includes(u)) next.push(u);
      }
      return next;
    });

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Gallery access was denied.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: Math.max(1, MAX_PHOTOS - uris.length),
      quality: 0.9,
      allowsEditing: false,
    });
    if (!res.canceled) addUris((res.assets || []).map((a) => a.uri).filter(Boolean) as string[]);
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Camera access was denied.");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsEditing: true,
    });
    if (!res.canceled && res.assets?.[0]?.uri) addUris([res.assets[0].uri]);
  };

  const removePhoto = (idx: number) => setUris((prev) => prev.filter((_, i) => i !== idx));

  /* ---------- submit ---------- */
  const canSubmit = stars >= 1 && stars <= 5 && !!tx.transaction_id;

  const onSubmit = async () => {
    try {
      if (!canSubmit) return;
      setSubmitting(true);

      // 1) auth
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id;
      if (!userId) throw new Error("Please sign in.");

      // 2) upload photos (optional)
      const group = Date.now().toString(36);
      const photo_urls = uris.length ? await uploadReviewPhotos(userId, group, uris) : [];

      // 3) insert rating
      const payload = {
        transaction_id: tx.transaction_id,
        emergency_id: tx.emergency_id,
        service_id: tx.service_id,
        shop_id: tx.shop_id,
        driver_user_id: userId,
        stars,
        tags,
        comment: comment?.trim() || null,
        photo_urls,
      };

      const { data, error } = await supabase.from("ratings").insert(payload).select("rating_id").single();
      if (error) throw error;

      onSubmitted?.(data.rating_id);
      // reset & close
      setStars(5);
      setComment("");
      setTags([]);
      setUris([]);
      onClose();
    } catch (e: any) {
      Alert.alert("Submit failed", e?.message ?? "Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const Stars = ({ value, onChange }: { value: number; onChange: (n: number) => void }) => (
    <View className="flex-row">
      {[1, 2, 3, 4, 5].map((i) => (
        <Pressable key={i} onPress={() => onChange(i)} hitSlop={10}>
          <Ionicons name={i <= value ? "star" : "star-outline"} size={26} color={i <= value ? "#F59E0B" : "#CBD5E1"} />
        </Pressable>
      ))}
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/30" onPress={onClose} />
      <View className="w-full rounded-t-3xl bg-white px-5 pt-4 pb-5" style={[{ maxHeight: "88%" }, cardShadow as any]}>
        <View className="items-center mb-3">
          <View className="h-1.5 w-10 bg-slate-200 rounded-full" />
        </View>

        <View className="mb-2 flex-row items-center justify-between">
          <Text className="text-[16px] font-semibold text-slate-900">Rate {tx.shopTitle || "this service"}</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={22} color="#111827" />
          </Pressable>
        </View>

        {/* Stars */}
        <View className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <Text className="text-[12px] font-medium text-slate-700">Overall rating</Text>
          <View className="mt-1">
            <Stars value={stars} onChange={setStars} />
          </View>
        </View>

        {/* Tags */}
        <Text className="mt-3 mb-2 text-[12px] font-medium text-slate-500">What stood out? (optional)</Text>
        <View className="flex-row flex-wrap gap-2">
          {tagOptions.map((t) => {
            const on = tags.includes(t);
            return (
              <Pressable
                key={t}
                onPress={() => toggleTag(t)}
                className={`rounded-xl border px-3 py-1.5 ${on ? "border-blue-600 bg-blue-50" : "border-slate-300 bg-white"}`}
              >
                <Text className={`text-[12px] ${on ? "text-blue-700 font-semibold" : "text-slate-800"}`}>{t}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Comment */}
        <Text className="mt-3 mb-1 text-[12px] font-medium text-slate-500">Comment (optional)</Text>
        <View className="rounded-xl border border-slate-300 bg-white">
          <TextInput
            value={comment}
            onChangeText={setComment}
            placeholder="Share details that could help other drivers…"
            placeholderTextColor="#6B7280"
            multiline
            style={{ textAlignVertical: "top", paddingTop: 8 }}
            className="min-h-[88px] p-3 text-[14px] text-slate-900"
          />
        </View>

        {/* Photos */}
        <Text className="mt-3 mb-1 text-[12px] font-medium text-slate-500">Add photos (optional) — {uris.length}/{MAX_PHOTOS}</Text>
        <View className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-3">
          {!!uris.length && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {uris.map((u, i) => (
                <View key={u} className="mr-2">
                  <Image source={{ uri: u }} className="h-24 w-24 rounded-xl" />
                  <Pressable onPress={() => removePhoto(i)} className="mt-1 self-end rounded-lg border border-slate-300 px-2 py-0.5">
                    <Text className="text-[11px] text-slate-800">Remove</Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          )}
          <View className="mt-2 flex-row gap-2">
            <Pressable onPress={pickImage} className="rounded-xl bg-blue-600 px-3 py-2 active:opacity-90">
              <Text className="text-[12px] font-semibold text-white">Upload</Text>
            </Pressable>
            <Pressable onPress={takePhoto} className="rounded-xl border border-slate-300 px-3 py-2 active:opacity-90">
              <Text className="text-[12px] font-semibold text-slate-900">Take Photo</Text>
            </Pressable>
          </View>
        </View>

        {/* Submit */}
        <Pressable
          disabled={submitting || !canSubmit}
          onPress={onSubmit}
          className="mt-4 items-center justify-center rounded-xl py-3"
          style={{ backgroundColor: submitting || !canSubmit ? "#cbd5e1" : "#2563EB", opacity: submitting || !canSubmit ? 0.7 : 1 }}
        >
          <Text className="text-[14px] font-semibold text-white">{submitting ? "Submitting…" : "Submit review"}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}
