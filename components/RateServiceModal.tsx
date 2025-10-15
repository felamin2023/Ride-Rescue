import React, { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, TextInput, Image, ActivityIndicator, Alert } from 'react-native';
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

  const pickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 });
    if (!res.canceled && res.assets?.length) setImageUri(res.assets[0].uri);
  };

  const takePhoto = async () => {
    const res = await ImagePicker.launchCameraAsync({ quality: 0.85 });
    if (!res.canceled && res.assets?.length) setImageUri(res.assets[0].uri);
  };

  const uploadPhoto = async (localUri: string, userId: string, txId: string) => {
  const bucket = supabase.storage.from('ratings_photos');
  const { ext, type: contentType } = guessExtAndMime(localUri);

  // Read with Expo FS → base64 → ArrayBuffer
  const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 });
  const arrayBuffer = base64ToArrayBuffer(base64.replace(/\r?\n/g, ''));

  const path = `${userId}/${txId}/rating-${Date.now()}.${ext}`;

  // 1) Try direct upload
  let uploadedOk = false;
  let lastErr: any = null;
  try {
    const { error } = await bucket.upload(path, arrayBuffer, { upsert: true, contentType });
    if (error) throw error;
    uploadedOk = true;
  } catch (err) {
    lastErr = err;
  }

  // 2) Fallback: signed upload
  if (!uploadedOk) {
    const { data: sign, error: signErr } = await bucket.createSignedUploadUrl(path);
    if (signErr) throw signErr;
    const { error: up2Err } = await bucket.uploadToSignedUrl(path, sign.token, arrayBuffer, { upsert: true, contentType });
    if (up2Err) throw up2Err;
  }

  // 3) Public URL (if bucket is public)
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
            const me = auth?.user?.id!;

            let photoUrl: string | null = imageUri;
            if (imageUri && imageUri.startsWith('file:')) {
            photoUrl = await uploadPhoto(imageUri, me, payload.transaction_id);
            }


      const { data: existing } = await supabase
        .from('ratings')
        .select('id')
        .eq('driver_user_id', me)
        .eq('transaction_id', payload.transaction_id)
        .maybeSingle();

      if (!existing) {
        const { error } = await supabase.from('ratings').insert({
          transaction_id: payload.transaction_id,
          emergency_id: payload.emergency_id,
          shop_id: payload.shop_id,
          driver_user_id: me,
          stars,
          comment: comment?.trim() || null,
          photo_url: photoUrl,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('ratings')
          .update({ stars, comment: comment?.trim() || null, photo_url: photoUrl, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
        if (error) throw error;
      }

      // Notify shop owner
      const { data: shopRow } = await supabase
        .from('shop_details')
        .select('user_id')
        .eq('shop_id', payload.shop_id)
        .maybeSingle();
      if (shopRow?.user_id) {
        await supabase.from('notifications').insert({
          from_user_id: me,
          to_user_id: shopRow.user_id,
          type: 'rating_posted',
          title: 'New rating received',
          body: `A driver left a ${stars}-star rating`,
          data: { transaction_id: payload.transaction_id, emergency_id: payload.emergency_id, shop_id: payload.shop_id },
        });
      }

      onSaved?.(payload.transaction_id);
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
            <View style={{ paddingVertical: 24, alignItems: 'center' }}><ActivityIndicator /></View>
          ) : (
            <>
              {/* Stars */}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                {[1,2,3,4,5].map((n) => (
                  <TouchableOpacity key={n} onPress={() => setStars(n)}>
                    <Ionicons name={n <= stars ? 'star' : 'star-outline'} size={28} color={n <= stars ? '#f59e0b' : '#94A3B8'} />
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

              {/* Actions */}
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
                <TouchableOpacity onPress={onClose} style={{ flex: 1, borderWidth: 1, borderColor: '#D1D5DB', paddingVertical: 12, borderRadius: 12, alignItems: 'center' }}>
                  <Text>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity disabled={!canSubmit || submitting} onPress={submit} style={{ flex: 1, backgroundColor: '#059669', paddingVertical: 12, borderRadius: 12, alignItems: 'center', opacity: (!canSubmit || submitting) ? 0.7 : 1 }}>
                  <Text style={{ color: '#fff', fontWeight: '600' }}>{submitting ? 'Saving…' : 'Submit'}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
