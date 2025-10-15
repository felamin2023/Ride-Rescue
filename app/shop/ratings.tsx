// app/shop/ratings.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, Image } from 'react-native';
import { supabase } from '../../utils/supabase'; // adjust if your path differs

type RatingRow = {
  id: string;
  stars: number;
  comment: string | null;
  photo_url: string | null;
  created_at: string;
  driver_user_id: string;
};

export default function ShopRatings() {
  const [rows, setRows] = useState<RatingRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const me = auth?.user?.id;
      if (!me) { setLoading(false); return; }

      const { data: shop } = await supabase
        .from('shop_details')
        .select('shop_id')
        .eq('user_id', me)
        .maybeSingle();

      if (!shop?.shop_id) { setLoading(false); return; }

      const { data } = await supabase
        .from('ratings')
        .select('id, stars, comment, photo_url, created_at, driver_user_id')
        .eq('shop_id', shop.shop_id)
        .order('created_at', { ascending: false })
        .limit(100);

      setRows((data ?? []) as RatingRow[]);
      setLoading(false);
    })();
  }, []);

  const avg = useMemo(() => {
    if (!rows.length) return 0;
    const sum = rows.reduce((a, r) => a + (r.stars || 0), 0);
    return Math.round((sum / rows.length) * 10) / 10;
  }, [rows]);

  const renderItem = ({ item }: { item: RatingRow }) => (
    <View className="mt-3 bg-white rounded-2xl p-4 border border-gray-100">
      <Text className="text-base font-medium">{'★'.repeat(item.stars)}{'☆'.repeat(5 - item.stars)}</Text>
      {item.comment ? <Text className="mt-2">{item.comment}</Text> : null}
      {item.photo_url ? (
        <Image source={{ uri: item.photo_url }} style={{ width: '100%', height: 160, borderRadius: 12, marginTop: 8 }} />
      ) : null}
      <Text className="mt-2 text-xs text-gray-500">{new Date(item.created_at).toLocaleString()}</Text>
    </View>
  );

  return (
    <View className="flex-1 p-4 gap-3">
      <Text className="text-2xl font-bold">Ratings</Text>

      <View className="bg-white rounded-2xl p-4 border border-gray-100">
        <Text className="text-lg">Average: {avg} ★</Text>
        <Text className="text-gray-500">Total reviews: {rows.length}</Text>
      </View>

      {loading ? (
        <Text className="mt-6 text-gray-500">Loading…</Text>
      ) : rows.length === 0 ? (
        <Text className="mt-6 text-gray-500">No ratings yet.</Text>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(it) => it.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      )}
    </View>
  );
}
