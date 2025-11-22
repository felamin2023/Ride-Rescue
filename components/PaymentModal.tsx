// app/shop/PaymentModal.tsx
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

// ✅ Service item interface (from old version)
interface ServiceItem {
  id: string;
  name: string;
  fee: string; // string for input; parsed to number for math
}

interface PaymentModalProps {
  visible: boolean;
  offerId: string; // emergencyId
  originalOffer: {
    labor_cost: number;
    fuel_cost: number;
    distance_fee: number;
    total_cost: number;
  };
  serviceType?: 'vulcanize' | 'repair' | 'gas' | null;
  fuelType?: string | null;
  customFuelType?: string | null;
  initialLaborCost?: number;
  initialFuelCost?: number;
  onClose: () => void;
  onSubmit: (invoice: {
    offerId: string;
    finalLaborCost: number;
    finalServices: ServiceItem[];
    finalTotal: number;
    finalPartsCost?: number;
  }) => Promise<void>;
}

export default function PaymentModal({
  visible,
  offerId,
  originalOffer,
  serviceType = 'repair',
  fuelType = null,
  customFuelType = null,
  initialLaborCost = 0,
  initialFuelCost = 0,
  onClose,
  onSubmit,
}: PaymentModalProps) {
  const isGasService = serviceType === 'gas';
  
  // For gas services, use initial fuel cost; for others, use initial labor cost
  const initialCost = isGasService ? initialFuelCost : initialLaborCost;
  const [serviceCost, setServiceCost] = useState(initialCost.toFixed(2));
  const [serviceItems, setServiceItems] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [serviceWarning, setServiceWarning] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      const initialCost = isGasService ? initialFuelCost : initialLaborCost;
      setServiceCost(initialCost.toFixed(2));
      setServiceItems([]);
      setShowConfirm(false);
      setServiceWarning(null);
    }
  }, [visible, offerId, isGasService, initialLaborCost, initialFuelCost]);

  // Validate services in real-time (only for non-gas emergencies)
  useEffect(() => {
    if (!isGasService) {
      validateServices();
    }
  }, [serviceItems, isGasService]);

  const handleServiceCostBlur = () => {
    const parsed = parseFloat(serviceCost);
    if (!isNaN(parsed) && parsed >= 0) {
      setServiceCost(parsed.toFixed(2));
    } else {
      const initialCost = isGasService ? initialFuelCost : initialLaborCost;
      setServiceCost(initialCost.toFixed(2));
    }
  };

  const validateServices = () => {
    if (isGasService) return true; // No validation needed for gas services
    
    for (const item of serviceItems) {
      if (item.name.trim() === '') {
        setServiceWarning('Please enter a name for all services or remove empty ones.');
        return false;
      }
      const fee = parseFloat(item.fee);
      if (isNaN(fee) || fee < 0) {
        setServiceWarning(`Please enter a valid fee for "${item.name || 'Service'}".`);
        return false;
      }
    }
    setServiceWarning(null);
    return true;
  };

  // Add a new service item (only for non-gas emergencies)
  const addService = () => {
    if (isGasService) return; // No additional services for gas
    
    if (serviceItems.length >= 10) {
      Alert.alert('Limit Reached', 'You can add up to 10 services.');
      return;
    }
    const newService: ServiceItem = {
      id: Date.now().toString(),
      name: '',
      fee: '0.00',
    };
    setServiceItems([...serviceItems, newService]);
  };

  // Remove a service item
  const removeService = (id: string) => {
    setServiceItems(serviceItems.filter((item) => item.id !== id));
  };

  // Update service name
  const updateServiceName = (id: string, name: string) => {
    setServiceItems(
      serviceItems.map((item) => (item.id === id ? { ...item, name } : item))
    );
  };

  // Update service fee
  const updateServiceFee = (id: string, fee: string) => {
    setServiceItems(
      serviceItems.map((item) => (item.id === id ? { ...item, fee } : item))
    );
  };

  // Format service fee on blur
  const handleServiceFeeBlur = (id: string) => {
    const item = serviceItems.find((s) => s.id === id);
    if (!item) return;
    const parsed = parseFloat(item.fee);
    if (!isNaN(parsed) && parsed >= 0) {
      updateServiceFee(id, parsed.toFixed(2));
    } else {
      updateServiceFee(id, '0.00');
    }
  };

  // Calculate total of extra services (only for non-gas emergencies)
  const calculateServiceTotal = () => {
    if (isGasService) return 0;
    
    return serviceItems.reduce((sum, item) => {
      const fee = parseFloat(item.fee);
      return sum + (isNaN(fee) ? 0 : fee);
    }, 0);
  };

  const validateAndCalculate = () => {
    const cost = parseFloat(serviceCost);

    if (isNaN(cost) || cost < 0) {
      Alert.alert('Invalid Input', `Please enter a valid ${isGasService ? 'fuel' : 'labor'} cost.`);
      return null;
    }

    // Validate additional services only for non-gas emergencies
    if (!isGasService && serviceWarning) {
      // Don't proceed if services are invalid
      return null;
    }

    const serviceFeeTotal = calculateServiceTotal();
    const finalTotal = originalOffer.distance_fee + cost + serviceFeeTotal;

    return {
      finalLaborCost: cost,
      finalServices: serviceItems, // Include additional services for non-gas emergencies
      finalTotal,
    };
  };

  const handleSubmit = () => {
    const calculation = validateAndCalculate();
    if (!calculation) return;
    setShowConfirm(true);
  };

  const confirmSubmit = async () => {
    const calculation = validateAndCalculate();
    if (!calculation) return;

    setShowConfirm(false);
    setLoading(true);

    try {
      await onSubmit({
        offerId,
        ...calculation,
        finalPartsCost: 0,
      });

      onClose();

      Alert.alert(
        'Invoice Submitted',
        'The driver will receive the payment request. Waiting for payment confirmation.'
      );
    } catch (error: any) {
      Alert.alert('Failed to Submit', error?.message || 'Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const serviceFeeTotal = calculateServiceTotal();
  const finalTotal = originalOffer.distance_fee + parseFloat(serviceCost || '0') + serviceFeeTotal;

  // Get display text based on service type
  const getServiceTypeDisplay = () => {
    switch (serviceType) {
      case 'gas': return 'Gas';
      case 'vulcanize': return 'Vulcanize';
      case 'repair': return 'Repair';
      default: return 'Repair';
    }
  };

  const getCostLabel = () => {
    return isGasService ? 'Fuel Cost' : 'Labor Cost';
  };

  const getCostPlaceholder = () => {
    return isGasService ? 'e.g., 150.00' : 'e.g., 50.00';
  };

  const getFuelDisplay = () => {
    if (customFuelType) return customFuelType;
    if (fuelType) return fuelType.charAt(0).toUpperCase() + fuelType.slice(1);
    return "Fuel";
  };

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
              Submit Invoice - {getServiceTypeDisplay()}
            </Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color="#0F172A" />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Original Offer */}
            <View className="rounded-2xl border border-slate-200 bg-slate-50 p-3 mb-4">
              <Text className="text-[12px] text-slate-600 mb-1">Initial Offer</Text>
              <Text className="text-[14px] font-semibold text-slate-900">
                ₱{originalOffer.total_cost.toFixed(2)}
              </Text>
              <Text className="text-[11px] text-slate-500 mt-0.5">
                {isGasService ? 'Fuel' : 'Labor'} ₱{(isGasService ? initialFuelCost : initialLaborCost).toFixed(2)} + Distance ₱
                {originalOffer.distance_fee.toFixed(2)}
              </Text>
              {isGasService && fuelType && (
                <Text className="text-[11px] text-slate-500 mt-0.5">
                  Fuel Type: {getFuelDisplay()}
                </Text>
              )}
            </View>

            {/* Service Cost (Labor for repair, Fuel for gas) */}
            <View className="mb-3">
              <Text className="text-[13px] text-slate-700 mb-2">
                <Text className="font-medium text-slate-900">{getCostLabel()} (Final)</Text>
                <Text className="text-slate-500"> - Adjust if needed</Text>
              </Text>
              <View className="flex-row items-center rounded-2xl border border-slate-300 bg-white py-3 px-4">
                <Text className="text-[14px] text-slate-700">₱</Text>
                <TextInput
                  value={serviceCost}
                  onChangeText={setServiceCost}
                  onBlur={handleServiceCostBlur}
                  placeholder={getCostPlaceholder()}
                  keyboardType="numeric"
                  className="flex-1 ml-2 text-[14px] text-slate-900"
                  placeholderTextColor={COLORS.muted}
                />
              </View>
              {isGasService && (
                <Text className="text-[11px] text-slate-500 mt-1 ml-1">
                  Enter the total fuel cost including any delivery charges
                </Text>
              )}
            </View>

            {/* Additional Services Section (Only for non-gas emergencies) */}
            {!isGasService && (
              <View className="mb-3">
                <View className="flex-row items-center justify-between mb-2">
                  <View className="flex-1">
                    <Text className="text-[13px] text-slate-700">
                      <Text className="font-medium text-slate-900">Additional Services</Text>
                    </Text>
                    {serviceWarning && (
                      <Text className="text-[12px] text-red-500 mt-1">
                        {serviceWarning}
                      </Text>
                    )}
                  </View>
                  <Pressable
                    onPress={addService}
                    className="flex-row items-center rounded-full bg-blue-50 px-3 py-1.5"
                    disabled={serviceItems.length >= 10}
                  >
                    <Ionicons name="add-circle" size={16} color={COLORS.primary} />
                    <Text className="text-[12px] text-blue-600 font-medium ml-1">
                      Add Service
                    </Text>
                  </Pressable>
                </View>

                {serviceItems.length === 0 ? (
                  <View className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 items-center">
                    <Ionicons name="construct-outline" size={24} color={COLORS.muted} />
                    <Text className="text-[12px] text-slate-500 mt-2 text-center">
                      No additional services added yet
                    </Text>
                    <Text className="text-[11px] text-slate-400 mt-1 text-center">
                      Tap "Add Service" to add items like oil change, brake pads, etc.
                    </Text>
                  </View>
                ) : (
                  <View className="gap-3">
                    {serviceItems.map((item, index) => (
                      <View
                        key={item.id}
                        className="rounded-2xl border border-slate-300 bg-white p-3"
                      >
                        <View className="flex-row items-center justify-between mb-2">
                          <Text className="text-[12px] text-slate-600 font-medium">
                            Service {index + 1}
                          </Text>
                          <Pressable onPress={() => removeService(item.id)} hitSlop={8}>
                            <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
                          </Pressable>
                        </View>

                        {/* Service Name */}
                        <TextInput
                          value={item.name}
                          onChangeText={(text) => updateServiceName(item.id, text)}
                          placeholder="e.g., Oil change, Brake pads"
                          className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-[13px] text-slate-900 mb-2"
                          placeholderTextColor={COLORS.muted}
                          maxLength={100}
                        />

                        {/* Service Fee */}
                        <View className="flex-row items-center rounded-xl border border-slate-200 bg-slate-50 py-2 px-3">
                          <Text className="text-[13px] text-slate-700">₱</Text>
                          <TextInput
                            value={item.fee}
                            onChangeText={(text) => updateServiceFee(item.id, text)}
                            onBlur={() => handleServiceFeeBlur(item.id)}
                            placeholder="0.00"
                            keyboardType="numeric"
                            className="flex-1 ml-2 text-[13px] text-slate-900"
                            placeholderTextColor={COLORS.muted}
                          />
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* Summary */}
            <View className="rounded-2xl border border-slate-200 bg-slate-50 p-3 mb-4">
              <View className="gap-1.5">
                <View className="flex-row justify-between items-center">
                  <Text className="text-[12px] text-slate-600">Distance fee</Text>
                  <Text className="text-[12px] text-slate-700">
                    ₱{originalOffer.distance_fee.toFixed(2)}
                  </Text>
                </View>
                <View className="flex-row justify-between items-center">
                  <Text className="text-[12px] text-slate-600">{getCostLabel()}</Text>
                  <Text className="text-[12px] text-slate-700">
                    ₱{parseFloat(serviceCost || '0').toFixed(2)}
                  </Text>
                </View>
                {!isGasService && serviceItems.length > 0 && (
                  <View className="flex-row justify-between items-center">
                    <Text className="text-[12px] text-slate-600">
                      Services ({serviceItems.length})
                    </Text>
                    <Text className="text-[12px] text-slate-700">
                      ₱{serviceFeeTotal.toFixed(2)}
                    </Text>
                  </View>
                )}
                <View className="h-px bg-slate-300 my-1" />
                <View className="flex-row justify-between items-center">
                  <Text className="text-[14px] font-semibold text-slate-900">Final Total</Text>
                  <Text className="text-[16px] font-bold text-slate-900">
                    ₱{finalTotal.toFixed(2)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Submit */}
            <Pressable
              onPress={handleSubmit}
              disabled={loading || (!isGasService && !!serviceWarning)}
              className="rounded-2xl py-2.5 items-center"
              style={{
                backgroundColor: (loading || (!isGasService && serviceWarning)) ? '#cbd5e1' : COLORS.primary,
                opacity: (loading || (!isGasService && serviceWarning)) ? 0.7 : 1,
              }}
            >
              <Text className="text-[14px] text-white font-semibold">
                {loading ? 'Submitting...' : 'Submit Invoice (Pending Payment)'}
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      {/* Confirmation modal */}
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
          <View className="w-11/12 max-w-md rounded-2xl bg-white p-5" style={cardShadow as any}>
            <View className="items-center mb-2">
              <Ionicons name="document-text-outline" size={28} color={COLORS.primary} />
            </View>
            <Text className="text-lg font-semibold text-slate-900 text-center">
              Confirm {getServiceTypeDisplay()} Invoice
            </Text>
            <Text className="mt-2 text-[14px] text-slate-600 text-center">
              Final total: ₱{finalTotal.toFixed(2)}
            </Text>
            {isGasService && fuelType && (
              <Text className="mt-1 text-[12px] text-slate-500 text-center">
                Fuel Type: {getFuelDisplay()}
              </Text>
            )}
            <Text className="mt-1 text-[12px] text-slate-500 text-center">
              This will send the invoice to the driver for payment. The offer will remain pending until payment is confirmed.
            </Text>

            <View className="mt-5 flex-row gap-3">
              <Pressable
                onPress={() => setShowConfirm(false)}
                className="flex-1 rounded-2xl border border-slate-300 py-2.5 items-center"
              >
                <Text className="text-[14px] text-slate-900">Back</Text>
              </Pressable>
              <Pressable
                onPress={confirmSubmit}
                disabled={loading}
                className="flex-1 rounded-2xl py-2.5 items-center"
                style={{
                  backgroundColor: loading ? '#cbd5e1' : COLORS.primary,
                  opacity: loading ? 0.7 : 1,
                }}
              >
                <Text className="text-[14px] text-white font-semibold">
                  {loading ? 'Submitting...' : 'Confirm'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}