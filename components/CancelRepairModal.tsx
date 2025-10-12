// app/components/CancelRepairModal.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  Modal,
  Alert,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const COLORS = {
  bg: '#F4F6F8',
  surface: '#FFFFFF',
  border: '#E5E7EB',
  text: '#0F172A',
  sub: '#475569',
  muted: '#94A3B8',
  primary: '#2563EB',
  danger: '#DC2626',
  success: '#16A34A',
  brand: '#0F2547',
};

const cardShadow = Platform.select({
  ios: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  android: { elevation: 2 },
});

interface CancelRepairModalProps {
  visible: boolean;
  offerId: string;
  originalOffer: {
    labor_cost: number;
    distance_fee: number;
    total_cost: number;
  };
  onClose: () => void;
  onSubmit: (cancelData: {
    offerId: string;
    cancelOption: 'incomplete' | 'diagnose_only';
    reason?: string;
    totalFees: number;
  }) => Promise<void>;
}

export default function CancelRepairModal({
  visible,
  offerId,
  originalOffer,
  onClose,
  onSubmit,
}: CancelRepairModalProps) {
  const [cancelOption, setCancelOption] = useState<'incomplete' | 'diagnose_only' | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (visible) {
      setCancelOption(null);
      setCancelReason('');
      setShowConfirm(false);
    }
  }, [visible, offerId]);

  // Calculate total fees based on cancellation option
  const calculateTotalFees = (option: 'incomplete' | 'diagnose_only') => {
    if (option === 'incomplete') {
      // Distance fee + 50% of labor
      return originalOffer.distance_fee + (originalOffer.labor_cost * 0.5);
    } else {
      // Distance fee only
      return originalOffer.distance_fee;
    }
  };

  const handleCancelRepair = () => {
    if (!cancelOption) {
      Alert.alert('Selection Required', 'Please select a cancellation option.');
      return;
    }
    setShowConfirm(true);
  };

  const confirmCancelRepair = async () => {
    if (!cancelOption) return;

    setShowConfirm(false);
    setLoading(true);

    try {
      const totalFees = calculateTotalFees(cancelOption);
      
      await onSubmit({
        offerId,
        cancelOption,
        reason: cancelReason.trim() || undefined,
        totalFees,
      });

      onClose();

      Alert.alert(
        'Repair Cancelled',
        `The repair has been cancelled. Total fees: ₱${totalFees.toFixed(2)}`
      );
    } catch (error: any) {
      Alert.alert(
        'Failed to Cancel',
        error?.message || 'Please try again later.'
      );
    } finally {
      setLoading(false);
    }
  };

  const totalFees = cancelOption ? calculateTotalFees(cancelOption) : 0;

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onClose}
      >
        <Pressable className="flex-1 bg-black/30" onPress={onClose} />
        <View
          className="w-full bg-white rounded-t-3xl px-5 pt-3 pb-5"
          style={[{ maxHeight: '88%' }, cardShadow as any]}
        >
          <View className="items-center mb-3">
            <View className="h-1.5 w-10 bg-slate-200 rounded-full" />
          </View>

          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-[18px] font-semibold text-slate-900">
              Cancel Repair Service
            </Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color="#0F172A" />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View className="rounded-2xl border border-slate-200 bg-slate-50 p-4 mb-4">
              <Text className="text-[14px] font-semibold text-slate-900 mb-2">
                Cancel Repair Service
              </Text>
              <Text className="text-[12px] text-slate-600">
                Select the reason for cancelling this repair service.
              </Text>
            </View>

            {/* Cancellation Options */}
            <View className="mb-4">
              <Text className="text-[13px] font-medium text-slate-900 mb-3">
                Select Cancellation Option:
              </Text>
              
              {/* Option 1: Incomplete Repair */}
              <Pressable
                onPress={() => setCancelOption('incomplete')}
                className={`rounded-2xl border p-4 mb-3 ${
                  cancelOption === 'incomplete' 
                    ? 'border-blue-300 bg-blue-50' 
                    : 'border-slate-300 bg-white'
                }`}
              >
                <View className="flex-row items-center">
                  <View className={`w-5 h-5 rounded-full border-2 mr-3 items-center justify-center ${
                    cancelOption === 'incomplete' 
                      ? 'border-blue-600 bg-blue-600' 
                      : 'border-slate-400'
                  }`}>
                    {cancelOption === 'incomplete' && (
                      <View className="w-2 h-2 rounded-full bg-white" />
                    )}
                  </View>
                  <View className="flex-1">
                    <Text className="text-[14px] font-medium text-slate-900 mb-1">
                      On the process of repair but can't complete/Finish
                    </Text>
                    <Text className="text-[12px] text-slate-600">
                      Distance fee + 50% of labor fee
                    </Text>
                    <Text className="text-[12px] text-slate-700 font-medium mt-1">
                      Total Fees: ₱{calculateTotalFees('incomplete').toFixed(2)}
                    </Text>
                  </View>
                </View>
              </Pressable>

              {/* Option 2: Diagnose Only */}
              <Pressable
                onPress={() => setCancelOption('diagnose_only')}
                className={`rounded-2xl border p-4 ${
                  cancelOption === 'diagnose_only' 
                    ? 'border-blue-300 bg-blue-50' 
                    : 'border-slate-300 bg-white'
                }`}
              >
                <View className="flex-row items-center">
                  <View className={`w-5 h-5 rounded-full border-2 mr-3 items-center justify-center ${
                    cancelOption === 'diagnose_only' 
                      ? 'border-blue-600 bg-blue-600' 
                      : 'border-slate-400'
                  }`}>
                    {cancelOption === 'diagnose_only' && (
                      <View className="w-2 h-2 rounded-full bg-white" />
                    )}
                  </View>
                  <View className="flex-1">
                    <Text className="text-[14px] font-medium text-slate-900 mb-1">
                      Check or Diagnose only
                    </Text>
                    <Text className="text-[12px] text-slate-600">
                      Distance fee only, no labor fee
                    </Text>
                    <Text className="text-[12px] text-slate-700 font-medium mt-1">
                      Total Fees: ₱{calculateTotalFees('diagnose_only').toFixed(2)}
                    </Text>
                  </View>
                </View>
              </Pressable>
            </View>

            {/* Reason Input */}
            <View className="mb-4">
              <Text className="text-[13px] font-medium text-slate-900 mb-2">
                Reason for cancelling (Optional):
              </Text>
              <TextInput
                value={cancelReason}
                onChangeText={setCancelReason}
                placeholder="Enter reason for cancellation..."
                multiline
                numberOfLines={3}
                className="rounded-2xl border border-slate-300 bg-white p-3 text-[14px] text-slate-900 min-h-[80px]"
                placeholderTextColor={COLORS.muted}
                textAlignVertical="top"
              />
            </View>

            {/* Cancel Repair Button */}
            <Pressable
              onPress={handleCancelRepair}
              disabled={loading || !cancelOption}
              className="rounded-2xl py-2.5 items-center"
              style={{
                backgroundColor: loading || !cancelOption ? '#cbd5e1' : COLORS.danger,
                opacity: loading ? 0.7 : 1,
              }}
            >
              <Text className="text-[14px] text-white font-semibold">
                {loading ? 'Processing...' : 'Cancel Repair Service'}
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      {/* Cancel Repair Confirmation Modal */}
      <Modal
        visible={showConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConfirm(false)}
      >
        <View
          className="flex-1 items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.35)' }}
        >
          <View
            className="w-11/12 max-w-md rounded-2xl bg-white p-5"
            style={cardShadow as any}
          >
            <View className="items-center mb-2">
              <Ionicons
                name="warning-outline"
                size={28}
                color={COLORS.danger}
              />
            </View>
            <Text className="text-lg font-semibold text-slate-900 text-center">
              Confirm Cancellation
            </Text>
            <Text className="mt-2 text-[14px] text-slate-600 text-center">
              Total Fees: ₱{totalFees.toFixed(2)}
            </Text>
            <Text className="mt-1 text-[12px] text-slate-500 text-center">
              {cancelOption === 'incomplete' 
                ? 'The driver will pay the distance fee + 50% of labor fee.'
                : 'The driver will pay the distance fee only.'}
            </Text>
            {cancelReason && (
              <View className="mt-3 bg-slate-50 rounded-xl p-3">
                <Text className="text-[12px] text-slate-600 font-medium">Reason:</Text>
                <Text className="text-[12px] text-slate-700 mt-1">{cancelReason}</Text>
              </View>
            )}

            <View className="mt-5 flex-row gap-3">
              <Pressable
                onPress={() => setShowConfirm(false)}
                className="flex-1 rounded-2xl border border-slate-300 py-2.5 items-center"
              >
                <Text className="text-[14px] text-slate-900">Back</Text>
              </Pressable>
              <Pressable
                onPress={confirmCancelRepair}
                disabled={loading}
                className="flex-1 rounded-2xl py-2.5 items-center"
                style={{
                  backgroundColor: loading ? '#cbd5e1' : COLORS.danger,
                  opacity: loading ? 0.7 : 1,
                }}
              >
                <Text className="text-[14px] text-white font-semibold">
                  {loading ? 'Processing...' : 'Confirm Cancel'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}