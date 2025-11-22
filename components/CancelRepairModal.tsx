// FILE: app/components/CancelRepairModal.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  Modal,
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
  danger: '#DC2626',
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
    fuel_cost: number;
    distance_fee: number;
    total_cost: number;
  };
  serviceType?: 'vulcanize' | 'repair' | 'gas' | null;
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
  serviceType = 'repair',
  onClose,
  onSubmit,
}: CancelRepairModalProps) {
  const [cancelOption, setCancelOption] = useState<'incomplete' | 'diagnose_only' | null>(null);
  const [gasCancelReason, setGasCancelReason] = useState<'cannot_deliver' | 'other_reason' | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isGasService = serviceType === 'gas';

  useEffect(() => {
    if (visible) {
      // For gas services, automatically set to incomplete (only option)
      if (isGasService) {
        setCancelOption('incomplete');
        setGasCancelReason('cannot_deliver'); // Default to first option
      } else {
        setCancelOption(null);
        setGasCancelReason(null);
      }
      setCancelReason('');
      setShowConfirm(false);
      setErrorMsg(null);
    }
  }, [visible, offerId, isGasService]);

  /** For gas emergencies, no fees are charged */
  const calculateTotalFees = (option: 'incomplete' | 'diagnose_only') => {
    // No fees for gas emergencies
    if (isGasService) return 0;
    
    if (option === 'diagnose_only') return 0;
    
    // For non-gas incomplete services
    const baseDistance = Number(originalOffer.distance_fee || 0);
    const baseServiceCost = Number(originalOffer.labor_cost || 0);
    const halfServiceCost = Number((baseServiceCost * 0.5).toFixed(2));
    return baseDistance + halfServiceCost;
  };

  const handleCancelRepair = () => {
    if (!cancelOption) return;
    
    // For gas services with "other reason", require note
    if (isGasService && gasCancelReason === 'other_reason' && !cancelReason.trim()) {
      setErrorMsg("Please provide details for the other reason");
      return;
    }
    
    setShowConfirm(true);
    setErrorMsg(null);
  };

  const confirmCancelRepair = async () => {
    if (!cancelOption) return;

    setShowConfirm(false);
    setLoading(true);
    setErrorMsg(null);

    try {
      const totalFees = calculateTotalFees(cancelOption);
      
      // Build final reason string
      let finalReason = cancelReason;
      if (isGasService) {
        if (gasCancelReason === 'cannot_deliver') {
          finalReason = "Cannot deliver gas right now";
        } else if (gasCancelReason === 'other_reason' && cancelReason.trim()) {
          finalReason = cancelReason.trim();
        }
      }

      await onSubmit({
        offerId,
        cancelOption,
        reason: finalReason || undefined,
        totalFees,
      });
      onClose();
    } catch (error: any) {
      const msg = error?.message || 'Failed to cancel. Please try again.';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  // Get display text based on service type
  const getServiceTypeDisplay = () => {
    switch (serviceType) {
      case 'gas': return 'Gas';
      case 'vulcanize': return 'Vulcanize';
      case 'repair': return 'Repair';
      default: return 'Repair';
    }
  };

  const getFeeDescription = () => {
    if (isGasService) {
      return "No fees will be charged. Driver will be notified of cancellation.";
    }
    return cancelOption === 'incomplete' 
      ? `Distance fee + 50% of labor fee`
      : 'No service fees will be charged';
  };

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onClose}
      >
        <Pressable
          className="flex-1 bg-black/30"
          onPress={showConfirm ? undefined : onClose}
        />
        <View
          className="w-full bg-white rounded-t-3xl px-5 pt-3 pb-5"
          style={[{ maxHeight: '88%' }, cardShadow as any]}
        >
          <View className="items-center mb-3">
            <View className="h-1.5 w-10 bg-slate-200 rounded-full" />
          </View>

          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-[18px] font-semibold text-slate-900">
              Cancel {getServiceTypeDisplay()} Service
            </Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color="#0F172A" />
            </Pressable>
          </View>

          {/* Inline error message */}
          {errorMsg ? (
            <View className="mb-3 rounded-xl bg-rose-50 border border-rose-200 p-3">
              <Text className="text-[12px] text-rose-700">{errorMsg}</Text>
            </View>
          ) : null}

          <ScrollView showsVerticalScrollIndicator={false}>
            <View className="rounded-2xl border border-slate-200 bg-slate-50 p-4 mb-4">
              <Text className="text-[14px] font-semibold text-slate-900 mb-2">
                Cancel {getServiceTypeDisplay()} Service
              </Text>
              <Text className="text-[12px] text-slate-600">
                {isGasService 
                  ? "Please provide the reason for cancelling this gas delivery service. No fees will be charged."
                  : `Select the reason for cancelling this ${getServiceTypeDisplay().toLowerCase()} service.`}
              </Text>
            </View>

            {/* Cancellation Options */}
            <View className="mb-4">
              <Text className="text-[13px] font-medium text-slate-900 mb-3">
                {isGasService ? "Cancellation Reason:" : "Select Cancellation Option:"}
              </Text>

              {/* For Gas Services: Show two specific options */}
              {isGasService ? (
                <View className="space-y-3">
                  {/* Option 1: Cannot deliver gas right now */}
                  <Pressable
                    onPress={() => setGasCancelReason('cannot_deliver')}
                    className={`rounded-2xl border p-4 ${
                      gasCancelReason === 'cannot_deliver'
                        ? 'border-blue-300 bg-blue-50'
                        : 'border-slate-300 bg-white'
                    }`}
                  >
                    <View className="flex-row items-center">
                      <View
                        className={`w-5 h-5 rounded-full border-2 mr-3 items-center justify-center ${
                          gasCancelReason === 'cannot_deliver'
                            ? 'border-blue-600 bg-blue-600'
                            : 'border-slate-400'
                        }`}
                      >
                        {gasCancelReason === 'cannot_deliver' && (
                          <View className="w-2 h-2 rounded-full bg-white" />
                        )}
                      </View>
                      <View className="flex-1">
                        <Text className="text-[14px] font-medium text-slate-900 mb-1">
                          Cannot deliver gas right now
                        </Text>
                        <Text className="text-[12px] text-slate-600">
                          No fees charged
                        </Text>
                      </View>
                    </View>
                  </Pressable>

                  {/* Option 2: Other reason */}
                  <Pressable
                    onPress={() => setGasCancelReason('other_reason')}
                    className={`rounded-2xl border p-4 ${
                      gasCancelReason === 'other_reason'
                        ? 'border-blue-300 bg-blue-50'
                        : 'border-slate-300 bg-white'
                    }`}
                  >
                    <View className="flex-row items-center">
                      <View
                        className={`w-5 h-5 rounded-full border-2 mr-3 items-center justify-center ${
                          gasCancelReason === 'other_reason'
                            ? 'border-blue-600 bg-blue-600'
                            : 'border-slate-400'
                        }`}
                      >
                        {gasCancelReason === 'other_reason' && (
                          <View className="w-2 h-2 rounded-full bg-white" />
                        )}
                      </View>
                      <View className="flex-1">
                        <Text className="text-[14px] font-medium text-slate-900 mb-1">
                          Other reason
                        </Text>
                        <Text className="text-[12px] text-slate-600">
                          No fees charged
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                </View>
              ) : (
                /* For Non-Gas Services: Show both options */
                <>
                  {/* Option 1: Incomplete Service */}
                  <Pressable
                    onPress={() => setCancelOption('incomplete')}
                    className={`rounded-2xl border p-4 mb-3 ${
                      cancelOption === 'incomplete'
                        ? 'border-blue-300 bg-blue-50'
                        : 'border-slate-300 bg-white'
                    }`}
                  >
                    <View className="flex-row items-center">
                      <View
                        className={`w-5 h-5 rounded-full border-2 mr-3 items-center justify-center ${
                          cancelOption === 'incomplete'
                            ? 'border-blue-600 bg-blue-600'
                            : 'border-slate-400'
                        }`}
                      >
                        {cancelOption === 'incomplete' && (
                          <View className="w-2 h-2 rounded-full bg-white" />
                        )}
                      </View>
                      <View className="flex-1">
                        <Text className="text-[14px] font-medium text-slate-900 mb-1">
                          On the process of {getServiceTypeDisplay().toLowerCase()} but can't complete/Finish
                        </Text>
                        <Text className="text-[12px] text-slate-600">
                          Distance fee + 50% of labor fee
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
                      <View
                        className={`w-5 h-5 rounded-full border-2 mr-3 items-center justify-center ${
                          cancelOption === 'diagnose_only'
                            ? 'border-blue-600 bg-blue-600'
                            : 'border-slate-400'
                        }`}
                      >
                        {cancelOption === 'diagnose_only' && (
                          <View className="w-2 h-2 rounded-full bg-white" />
                        )}
                      </View>
                      <View className="flex-1">
                        <Text className="text-[14px] font-medium text-slate-900 mb-1">
                          Check or Diagnose only
                        </Text>
                        <Text className="text-[12px] text-slate-600">
                          No service fees will be charged
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                </>
              )}
            </View>

            {/* Reason Input - Only show for gas "other reason" or non-gas services */}
            {(isGasService && gasCancelReason === 'other_reason') || (!isGasService && cancelOption) ? (
              <View className="mb-4">
                <Text className="text-[13px] font-medium text-slate-900 mb-2">
                  {isGasService ? "Please specify the other reason:" : "Reason for cancelling (Optional):"}
                </Text>
                <TextInput
                  value={cancelReason}
                  onChangeText={setCancelReason}
                  placeholder={isGasService 
                    ? "Please explain why you cannot deliver gas..." 
                    : "Enter reason for cancellation..."}
                  multiline
                  numberOfLines={3}
                  className="rounded-2xl border border-slate-300 bg-white p-3 text-[14px] text-slate-900 min-h-[80px]"
                  placeholderTextColor={COLORS.muted}
                  textAlignVertical="top"
                />
                {isGasService && gasCancelReason === 'other_reason' && !cancelReason.trim() && (
                  <Text className="text-[12px] text-rose-600 mt-1">
                    Please provide cancellation details
                  </Text>
                )}
              </View>
            ) : null}

            {/* Cancel Service Button */}
            <Pressable
              onPress={handleCancelRepair}
              disabled={loading || !cancelOption || (isGasService && !gasCancelReason)}
              className="rounded-2xl py-2.5 items-center"
              style={{
                backgroundColor: loading || !cancelOption || (isGasService && !gasCancelReason) ? '#cbd5e1' : COLORS.danger,
                opacity: loading ? 0.7 : 1,
              }}
            >
              <Text className="text-[14px] text-white font-semibold">
                {loading ? 'Processing...' : `Cancel ${getServiceTypeDisplay()} Service`}
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      {/* Confirm Cancellation */}
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
              Confirm {getServiceTypeDisplay()} Cancellation
            </Text>

            <Text className="mt-2 text-[14px] text-slate-600 text-center">
              {getFeeDescription()}
            </Text>

            {cancelReason || (isGasService && gasCancelReason === 'cannot_deliver') ? (
              <View className="mt-3 bg-slate-50 rounded-xl p-3">
                <Text className="text-[12px] text-slate-600 font-medium">Reason:</Text>
                <Text className="text-[12px] text-slate-700 mt-1">
                  {isGasService && gasCancelReason === 'cannot_deliver' 
                    ? "Cannot deliver gas right now" 
                    : cancelReason}
                </Text>
              </View>
            ) : null}

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
};