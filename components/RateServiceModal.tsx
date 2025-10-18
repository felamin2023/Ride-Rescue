// components/RateServiceModal.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, TextInput, Image,
  ActivityIndicator, Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import { supabase } from '../utils/supabase';

export type RatePayload = {
  transaction_id: string;
  emergency_id: string;
  shop_id: string;
};

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let bufferLength = base64.length * 0.75;
  const len = base64.length;
  if (base64[len - 1] === '=') bufferLength--;
  if (base64[len - 2] === '=') bufferLength--;
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
}

function guessExtAndMime(uri: string, fallbackType = 'image/jpeg') {
  const ext = uri.split('?')[0].split('.').pop()?.toLowerCase();
  const type =
    ext === 'png' ? 'image/png' :
    ext === 'webp' ? 'image/webp' :
    ext === 'heic' || ext === 'heif' ? 'image/heic' :
    fallbackType;
  return { ext: ext || 'jpg', type };
}

export default function RateServiceModal({
  visible,
  onClose,
  payload,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  payload: RatePayload | null;
  onSaved?: (transaction_id: string) => void;
}) {
  const [stars, setStars] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(false);

  const canSubmit = useMemo(() => !!payload && stars >= 1 && stars <= 5, [payload, stars]);

  useEffect(() => {
    const loadExisting = async () => {
      if (!payload) return;
      setLoadingExisting(true);
      const { data: auth } = await supabase.auth.getUser();
      const me = auth?.user?.id;
      const { data } = await supabase
        .from('ratings')
        .select('id, stars, comment, photo_url')
        .eq('driver_user_id', me)
        .eq('transaction_id', payload.transaction_id)
        .maybeSingle();

      if (data) {
        setStars(data.stars ?? 0);
        setComment(data.comment ?? '');
        setImageUri(data.photo_url ?? null);
      } else {
        setStars(0);
        setComment('');
        setImageUri(null);
      }
      setLoadingExisting(false);
    };
    if (visible) loadExisting();
  }, [visible, payload?.transaction_id]);

  async function requestMedia() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    return status === 'granted';
  }
  async function requestCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    return status === 'granted';
  }

  const pickImage = async () => {
    const ok = await requestMedia();
    if (!ok) return Alert.alert('Permission needed', 'Please allow gallery access.');
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (!res.canceled && res.assets?.length) setImageUri(res.assets[0].uri);
  };

  const takePhoto = async () => {
    const ok = await requestCamera();
    if (!ok) return Alert.alert('Permission needed', 'Please allow camera access.');
    const res = await ImagePicker.launchCameraAsync({ quality: 0.85 });
    if (!res.canceled && res.assets?.length) setImageUri(res.assets[0].uri);
  };

  // Upload to public bucket 'ratings_photos'
  const uploadPhoto = async (localUri: string, userId: string, txId: string) => {
    const bucket = supabase.storage.from('ratings_photos');

    // 🔒 make sure the request carries a valid JWT; refresh if needed
    const { data: sess } = await supabase.auth.getSession();
    console.log('session?', !!sess?.session, sess?.session?.user?.id?.slice(0, 8));
    if (!sess?.session) {
      const { data: refreshed, error: refErr } = await supabase.auth.refreshSession();
      if (refErr || !refreshed?.session) throw new Error('Not authenticated. Please sign in again.');
    }

    // 🩺 quick ping to confirm Storage sees us as authenticated
    const ping = await supabase.storage.from('ratings_photos').list(userId, { limit: 1 });
    if (ping.error) console.warn('ratings_photos list error →', ping.error.message);

    const { ext, type: contentType } = guessExtAndMime(localUri);
    const path = `${userId}/${txId}/rating-${Date.now()}.${ext}`;

    // debug + guard (must match Storage RLS)
    console.log('[ratings upload]', { userId, txId, path, bucket: 'ratings_photos' });
    if (!path.startsWith(`${userId}/`)) {
      throw new Error('Upload path must start with your auth uid');
    }

    // Read file → base64 → ArrayBuffer
    const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 });
    const arrayBuffer = base64ToArrayBuffer(base64.replace(/\r?\n/g, ''));

    // 1) Direct upload (overwrite OK)
    try {
      const { error } = await bucket.upload(path, arrayBuffer, { contentType, upsert: true });
      if (error) throw error;
    } catch (_err) {
      // 2) Fallback: signed upload (also upsert)
      const { data: sign, error: signErr } = await bucket.createSignedUploadUrl(path, { upsert: true });
      if (signErr) throw signErr;
      const { error: up2Err } = await bucket.uploadToSignedUrl(path, sign.token, arrayBuffer, { contentType });
      if (up2Err) throw up2Err;
    }

    // 3) Public URL
    const { data } = bucket.getPublicUrl(path);
    return data.publicUrl;
  };

  const submit = async () => {
    if (!payload) return;
    if (!stars) {
      Alert.alert('Pick a rating', 'Please select 1 to 5 stars.');
      return;
    }

    setSubmitting(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const me = auth?.user?.id;
      if (!me) throw new Error('You need to sign in again to rate.');

      // must be PAID to satisfy your ratings insert policy
      const { data: paymentRow, error: paymentErr } = await supabase
        .from('payment_transaction')
        .select('transaction_id, emergency_id, shop_id, status, driver_user_id')
        .eq('transaction_id', payload.transaction_id)
        .eq('driver_user_id', me)
        .maybeSingle();
      if (paymentErr) throw paymentErr;
      if (!paymentRow) throw new Error('We could not find that transaction anymore.');
      const isPaid = (paymentRow.status || '').toLowerCase() === 'paid';
      if (!isPaid) throw new Error('Only completed (paid) services can be rated.');

      // Upload if a new local image exists; keep existing https:// as-is
      let photoUrl: string | null = imageUri;
      if (imageUri && imageUri.startsWith('file:')) {
        photoUrl = await uploadPhoto(imageUri, me, paymentRow.transaction_id);
      }

      // Insert or update per (driver_user_id, transaction_id)
      const { data: existing } = await supabase
        .from('ratings')
        .select('id')
        .eq('driver_user_id', me)
        .eq('transaction_id', paymentRow.transaction_id)
        .maybeSingle();

      if (!existing) {
        const { error } = await supabase.from('ratings').insert({
          transaction_id: paymentRow.transaction_id,
          emergency_id: paymentRow.emergency_id,
          shop_id: paymentRow.shop_id,
          driver_user_id: me,
          stars,
          comment: comment?.trim() || null,
          photo_url: photoUrl,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('ratings')
          .update({
            stars,
            comment: comment?.trim() || null,
            photo_url: photoUrl,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
        if (error) throw error;
      }

      // Optional: notify shop owner
      const { data: shopRow } = await supabase
        .from('shop_details')
        .select('user_id')
        .eq('shop_id', paymentRow.shop_id)
        .maybeSingle();
      if (shopRow?.user_id) {
        await supabase.from('notifications').insert({
          from_user_id: me,
          to_user_id: shopRow.user_id,
          type: 'rating_posted',
          title: 'New rating received',
          body: `A driver left a ${stars}-star rating`,
          data: {
            transaction_id: paymentRow.transaction_id,
            emergency_id: paymentRow.emergency_id,
            shop_id: paymentRow.shop_id,
          },
        });
      }

      onSaved?.(paymentRow.transaction_id);
      onClose();
    } catch (e: any) {
      console.error(e);
      Alert.alert('Error', e?.message || 'Could not save rating.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', alignItems: 'center' }}>
        <View style={{ width: '100%', backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16 }}>
          <View style={{ height: 6, width: 48, backgroundColor: '#E5E7EB', alignSelf: 'center', borderRadius: 999 }} />
          <Text style={{ fontSize: 18, fontWeight: '600', marginTop: 12 }}>Rate this service</Text>

          {loadingExisting ? (
            <View style={{ paddingVertical: 24, alignItems: 'center' }}>
              <ActivityIndicator />
            </View>
          ) : (
            <>
              {/* Stars */}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <TouchableOpacity key={n} onPress={() => setStars(n)}>
                    <Ionicons
                      name={n <= stars ? 'star' : 'star-outline'}
                      size={28}
                      color={n <= stars ? '#f59e0b' : '#94A3B8'}
                    />
                  </TouchableOpacity>
                ))}
                <Text style={{ marginLeft: 8, fontSize: 12, color: '#64748B' }}>{stars || 0}/5</Text>
              </View>

              {/* Comment */}
              <TextInput
                placeholder="Share your experience (optional)"
                multiline
                value={comment}
                onChangeText={setComment}
                style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 12, minHeight: 96, marginTop: 8 }}
              />

              {/* Photo */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity onPress={pickImage} style={{ backgroundColor: '#F3F4F6', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 }}>
                    <Text>Upload</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={takePhoto} style={{ borderWidth: 1, borderColor: '#D1D5DB', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 }}>
                    <Text>Take Photo</Text>
                  </TouchableOpacity>
                </View>
                {imageUri ? <Image source={{ uri: imageUri }} style={{ width: 56, height: 56, borderRadius: 8 }} /> : null}
              </View>

              {/* Submit */}
              <TouchableOpacity
                disabled={!canSubmit || submitting}
                onPress={submit}
                style={{
                  marginTop: 16,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 12,
                  borderRadius: 12,
                  backgroundColor: !canSubmit || submitting ? '#9CA3AF' : '#2563EB',
                  opacity: !canSubmit || submitting ? 0.7 : 1,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '600' }}>{submitting ? 'Saving…' : 'Submit rating'}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
