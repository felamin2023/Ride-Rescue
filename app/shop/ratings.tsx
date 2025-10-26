// app/shop/ratings.tsx
import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  Pressable,
  Modal,
  ScrollView,
  useWindowDimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../utils/supabase'; // adjust if your path differs


type RatingRow = {
  id: string;
  stars: number;
  comment: string | null;
  photo_url: string | null;
  created_at: string;
  driver_user_id: string;
  driver_photo_url: string | null;
  driver_email: string;
  vehicle_type: string;
  breakdown_cause: string | null;
  emergency_status: string;
  tags: string[] | null;
};


// Predefined tag lists - positive service feedback
const LIKE_SERVICE_TAGS = [
  "Fast response",
  "Professional mechanic",
  "Accurate diagnosis",
  "Quality repair",
  "Fair pricing",
  "Transparent quote",
  "Good communication",
  "Friendly service",
  "Clean workmanship",
  "Had parts available",
  "Towing handled well",
  "Clear post-repair tips",
];


// Predefined tag lists - negative service feedback
const DISLIKE_SERVICE_TAGS = [
  "Slow response",
  "Rude staff",
  "Misdiagnosis",
  "Issue came back",
  "Overpriced",
  "Hidden charges",
  "Poor communication",
  "Messy work",
  "No parts available",
  "Late arrival",
  "Long waiting time",
  "Unclear explanation",
];


// ============================================================================
// IMAGE VIEWER MODAL - DARK THEME WITH LEFT COUNTER
// ============================================================================


interface ImageViewerModalProps {
  visible: boolean;
  images: string[];
  startIndex?: number;
  onClose: () => void;
}


function ImageViewerModal({
  visible,
  images,
  startIndex = 0,
  onClose,
}: ImageViewerModalProps) {
  const { width, height } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(startIndex);


  useEffect(() => {
    if (visible) {
      setIndex(startIndex);
      setTimeout(() => {
        scrollRef.current?.scrollTo({ x: startIndex * width, animated: false });
      }, 0);
    }
  }, [visible, startIndex, width]);


  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    setIndex(Math.min(Math.max(i, 0), images.length - 1));
  };


  if (!visible) return null;


  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent={true}
    >
      <View style={{ flex: 1, backgroundColor: "#000000" }}>
        <StatusBar barStyle="light-content" />
        
        <View
          style={{
            flex: 1,
            backgroundColor: "#000000",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <View
            style={{
              position: "absolute",
              top: Platform.OS === "ios" ? 80 : 50,
              left: 16,
              backgroundColor: "rgba(0, 0, 0, 0.7)",
              borderRadius: 20,
              paddingHorizontal: 12,
              paddingVertical: 6,
              zIndex: 10,
              borderWidth: 1,
              borderColor: "rgba(255, 255, 255, 0.2)",
            }}
          >
            <Text 
              style={{ 
                fontSize: 12,
                fontWeight: "700", 
                color: "#FFFFFF",
                letterSpacing: 0.3,
              }}
            >
              {images.length ? `${index + 1}/${images.length}` : "0/0"}
            </Text>
          </View>


          <Pressable
            onPress={onClose}
            hitSlop={8}
            style={{
              position: "absolute",
              top: Platform.OS === "ios" ? 80 : 50,
              right: 16,
              zIndex: 10,
              padding: 8,
              backgroundColor: "rgba(0, 0, 0, 0.5)",
              borderRadius: 20,
            }}
          >
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </Pressable>


          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onScrollEnd}
            decelerationRate="fast"
            snapToInterval={width}
            style={{ width, height }}
          >
            {images.map((uri, i) => (
              <View
                key={`viewer-img-${i}`}
                style={{
                  width,
                  height,
                  justifyContent: "center",
                  alignItems: "center",
                  padding: 20,
                }}
              >
                <Image
                  source={{ uri }}
                  style={{
                    width: width - 40,
                    height: height * 0.8,
                    borderRadius: 8,
                  }}
                  resizeMode="contain"
                />
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}


// ============================================================================
// MAIN COMPONENT
// ============================================================================


export default function ShopRatings() {
  const router = useRouter();
  const [rows, setRows] = useState<RatingRow[]>([]);
  const [loading, setLoading] = useState(true);


  // Image viewer state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);


  // Create normalized lookup sets for O(1) performance
  const likeTagsSet = useMemo(() => {
    return new Set(LIKE_SERVICE_TAGS.map(tag => tag.toLowerCase().trim()));
  }, []);


  const dislikeTagsSet = useMemo(() => {
    return new Set(DISLIKE_SERVICE_TAGS.map(tag => tag.toLowerCase().trim()));
  }, []);


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
        .select(`
          id, 
          stars, 
          comment, 
          photo_url, 
          created_at, 
          driver_user_id,
          tags,
          emergency:emergency_id (
            vehicle_type,
            breakdown_cause,
            emergency_status
          ),
          driver:driver_user_id (
            email,
            photo_url
          )
        `)
        .eq('shop_id', shop.shop_id)
        .order('created_at', { ascending: false })
        .limit(100);


      // Transform the data to match our RatingRow type
      const transformedData = (data ?? []).map((item: any) => ({
        id: item.id,
        stars: item.stars,
        comment: item.comment,
        photo_url: item.photo_url,
        created_at: item.created_at,
        driver_user_id: item.driver_user_id,
        driver_photo_url: item.driver?.photo_url || null,
        driver_email: item.driver?.email || '',
        vehicle_type: item.emergency?.vehicle_type || 'Unknown Vehicle',
        breakdown_cause: item.emergency?.breakdown_cause || null,
        emergency_status: item.emergency?.emergency_status || 'completed',
        tags: item.tags || null,
      }));


      setRows(transformedData as RatingRow[]);
      setLoading(false);
    })();
  }, []);


  // Function to hash email (e.g., avi********@gmail.com)
  const hashEmail = (email: string) => {
    if (!email) return 'Unknown User';
    const [localPart, domain] = email.split('@');
    if (localPart.length <= 3) {
      return `${localPart}***@${domain}`;
    }
    return `${localPart.substring(0, 3)}***@${domain}`;
  };


  // Determine tag sentiment using exact matching against predefined lists
  const getTagSentiment = useCallback((tag: string): 'positive' | 'negative' => {
    if (!tag) return 'positive';
    
    // Normalize: lowercase and trim whitespace
    const normalizedTag = tag.toLowerCase().trim();
    
    // Check dislike tags first (negative sentiment)
    if (dislikeTagsSet.has(normalizedTag)) {
      return 'negative';
    }
    
    // Check like tags (positive sentiment)
    if (likeTagsSet.has(normalizedTag)) {
      return 'positive';
    }
    
    // Default to positive for unknown tags
    return 'positive';
  }, [likeTagsSet, dislikeTagsSet]);


  // Open image viewer
  const openImageViewer = useCallback((imageUrl: string) => {
    setViewerImages([imageUrl]);
    setViewerIndex(0);
    setViewerOpen(true);
  }, []);


  // Calculate average rating
  const avg = useMemo(() => {
    if (!rows.length) return 0;
    const sum = rows.reduce((a, r) => a + (r.stars || 0), 0);
    return Math.round((sum / rows.length) * 10) / 10;
  }, [rows]);


  // Get background color for circular badge based on average
  const getBadgeColor = (rating: number) => {
    if (rating > 4.0) return '#10B981'; // Green
    if (rating >= 3.0) return '#F59E0B'; // Orange
    return '#EF4444'; // Red
  };


  // Render filled stars based on average (rounded)
  const renderAverageStars = () => {
    const roundedAvg = Math.round(avg);
    return (
      <Text className="text-amber-500 text-2xl">
        {'★'.repeat(roundedAvg)}{'☆'.repeat(5 - roundedAvg)}
      </Text>
    );
  };


  const Header = () => (
    <SafeAreaView edges={["top"]} className="bg-white border-b border-slate-200">
      <View className="flex-row items-center justify-between px-4 py-3">
        <Pressable 
          onPress={() => router.back()} 
          hitSlop={8}
          className="p-2 rounded-lg active:opacity-80"
        >
          <Ionicons name="arrow-back" size={24} color="#0F172A" />
        </Pressable>
        
        <Text className="text-xl font-bold text-[#0F172A]">Ratings & Reviews</Text>
        
        <View style={{ width: 40 }} />
      </View>
    </SafeAreaView>
  );


  const renderItem = ({ item }: { item: RatingRow }) => (
    <View className="mt-3 bg-white rounded-2xl p-5 border border-gray-100 mx-4 shadow-sm">
      <View className="flex-row items-start justify-between mb-4">
        <View className="flex-row items-center flex-1">
          <View className="w-12 h-12 rounded-full bg-gray-200 mr-3 overflow-hidden">
            {item.driver_photo_url ? (
              <Image 
                source={{ uri: item.driver_photo_url }} 
                className="w-full h-full"
              />
            ) : (
              <View className="w-full h-full bg-blue-500 items-center justify-center">
                <Text className="text-white font-bold text-base">
                  {item.driver_email ? item.driver_email[0].toUpperCase() : 'U'}
                </Text>
              </View>
            )}
          </View>
          
          <View className="flex-1">
            <Text className="text-sm font-semibold text-gray-900">
              {hashEmail(item.driver_email)}
            </Text>
            <Text className="text-xs text-gray-600 mt-0.5">
              {item.vehicle_type}
            </Text>
          </View>
        </View>


        {item.emergency_status === 'completed' && (
          <View className="bg-green-100 px-3 py-1.5 rounded-full">
            <Text className="text-green-800 text-xs font-semibold">Completed</Text>
          </View>
        )}
        {item.emergency_status === 'canceled' && (
          <View className="bg-red-100 px-3 py-1.5 rounded-full">
            <Text className="text-red-800 text-xs font-semibold">Canceled</Text>
          </View>
        )}
      </View>


      <View className="mb-3">
        <Text className="text-xl font-medium text-amber-500">
          {'★'.repeat(item.stars)}{'☆'.repeat(5 - item.stars)}
        </Text>
      </View>


      {item.tags && item.tags.length > 0 && (
        <View className="flex-row flex-wrap mb-4">
          {item.tags.map((tag, index) => {
            const sentiment = getTagSentiment(tag);
            const isNegative = sentiment === 'negative';
            
            return (
              <View
                key={`${item.id}-tag-${index}`}
                className={`px-3 py-1.5 rounded-full mr-2 mb-2 ${
                  isNegative ? 'bg-red-100' : 'bg-green-100'
                }`}
              >
                <Text 
                  className={`text-xs font-semibold ${
                    isNegative ? 'text-red-800' : 'text-green-800'
                  }`}
                >
                  {tag}
                </Text>
              </View>
            );
          })}
        </View>
      )}
      
      {item.comment ? (
        <Text 
          className="text-gray-700 text-sm leading-6 mb-3" 
          style={{ paddingLeft: 12 }}
        >
          {item.comment}
        </Text>
      ) : null}
      
      {item.photo_url ? (
        <View style={{ position: 'relative' }}>
          <Pressable onPress={() => openImageViewer(item.photo_url!)}>
            <Image 
              source={{ uri: item.photo_url }} 
              style={{ 
                width: '100%', 
                height: 180, 
                borderRadius: 12, 
                marginBottom: 12 
              }} 
              resizeMode="cover"
            />
          </Pressable>
          
          <View
            style={{
              position: 'absolute',
              top: 8,
              left: 8,
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              borderRadius: 12,
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderWidth: 1,
              borderColor: 'rgba(255, 255, 255, 0.15)',
            }}
          >
            <Text 
              style={{ 
                fontSize: 10,
                fontWeight: '700', 
                color: '#FFFFFF',
                letterSpacing: 0.3,
              }}
            >
              1/1
            </Text>
          </View>
        </View>
      ) : null}
      
      <Text className="text-xs text-gray-500 mt-2">
        {new Date(item.created_at).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })}
      </Text>
    </View>
  );


  return (
    <View className="flex-1 bg-[#F4F6F8]">
      <Header />
      
      <View className="flex-1">
        <View className="bg-white rounded-2xl p-5 border border-gray-100 mx-4 mt-4 mb-4 shadow-sm">
          <View className="flex-row items-center">
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: 36,
                backgroundColor: getBadgeColor(avg),
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 16,
              }}
            >
              <Text className="text-white text-3xl font-bold">
                {avg.toFixed(1)}
              </Text>
            </View>


            <View className="flex-1">
              {renderAverageStars()}
              <View className="flex-row items-center mt-2">
                <Ionicons 
                  name="person-outline" 
                  size={16} 
                  color="#6B7280" 
                  style={{ marginRight: 6 }} 
                />
                <Text className="text-gray-600 text-sm">
                  Based on {rows.length} {rows.length === 1 ? 'review' : 'reviews'}
                </Text>
              </View>
            </View>
          </View>
        </View>


        {loading ? (
          <View className="flex-1 items-center justify-center">
            <Text className="text-gray-500 text-lg">Loading reviews…</Text>
          </View>
        ) : rows.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <Ionicons name="star-outline" size={64} color="#9CA3AF" />
            <Text className="text-gray-500 text-lg mt-4">No ratings yet</Text>
            <Text className="text-gray-400 text-center mt-2 px-8">
              Customer ratings will appear here once they review your services
            </Text>
          </View>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(it) => it.id}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 24 }}
          />
        )}
      </View>


      <ImageViewerModal
        visible={viewerOpen}
        images={viewerImages}
        startIndex={viewerIndex}
        onClose={() => setViewerOpen(false)}
      />
    </View>
  );
}
