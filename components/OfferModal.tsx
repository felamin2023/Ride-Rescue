// components/OfferModal.tsx

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  TextInput,
  Platform,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

/* ----------------------------- Types ----------------------------- */

/**
 * Emergency details passed to the modal
 */
export interface EmergencyDetails {
  emergencyId: string;
  customerName: string;
  vehicleType: string;
  breakdownCause: string;
  location: string;
  dateTime: string;
  distanceKm?: number;
}

/**
 * Offer data to be submitted
 */
export interface OfferData {
  distanceFee: number;
  laborCost: number;
  note: string;
  totalFees: number;
}

/**
 * Props for the OfferModal component
 */
export interface OfferModalProps {
  /** Controls modal visibility */
  visible: boolean;
  /** Emergency details to display */
  emergency: EmergencyDetails | null;
  /** Distance in kilometers for automatic distance fee calculation */
  distanceKm?: number;
  /** Rate per kilometer (default: 15.00 PHP) */
  ratePerKm?: number;
  /** Minimum distance in km that applies for distance fee (default: 1.0 km) */
  minimumDistanceKm?: number;
  /** Called when modal is dismissed */
  onClose: () => void;
  /** Called when offer is submitted with valid data */
  onSubmit: (offer: OfferData) => Promise<void>;
  /** Optional: Show loading state during submission */
  isSubmitting?: boolean;
}

/* ----------------------------- Design Tokens ----------------------------- */

const COLORS = {
  bg: "#F4F6F8",
  surface: "#FFFFFF",
  border: "#E5E7EB",
  text: "#0F172A",
  sub: "#475569",
  muted: "#94A3B8",
  primary: "#2563EB",
  danger: "#DC2626",
  success: "#16A34A",
  brand: "#0F2547",
  inputBg: "#F8FAFC",
  placeholder: "#CBD5E1",
};

const cardShadow = Platform.select({
  ios: {
    shadowColor: "#0F172A",
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  android: {
    elevation: 2,
  },
});

/* ----------------------------- Constants ----------------------------- */

const DEFAULT_RATE_PER_KM = 15.0;
const DEFAULT_MINIMUM_DISTANCE_KM = 1.0;
const DEFAULT_LABOR_COST = "50.00";
const MAX_NOTE_LENGTH = 500;
const MIN_LABOR_COST = 0;
const MAX_LABOR_COST = 999999;
const CURRENCY_SYMBOL = "₱";

/* ----------------------------- Helper Functions ----------------------------- */

/**
 * Validates if a string is a valid positive number
 */
function isValidPositiveNumber(value: string): boolean {
  if (!value.trim()) return false;
  const num = parseFloat(value);
  return !isNaN(num) && num >= 0 && isFinite(num);
}

/**
 * Formats a number to 2 decimal places
 */
function formatCurrency(value: number): string {
  return value.toFixed(2);
}

/**
 * Formats input value to always show 2 decimal places
 */
function formatToTwoDecimals(value: string): string {
  if (!value || value.trim() === "") return "";
  
  // Remove any non-numeric characters except decimal point
  const cleaned = value.replace(/[^0-9.]/g, "");
  
  // Parse to number and format to 2 decimals
  const num = parseFloat(cleaned);
  if (isNaN(num)) return "";
  
  return num.toFixed(2);
}

/**
 * Calculates distance fee based on distance and rate
 */
function calculateDistanceFee(
  distanceKm: number,
  ratePerKm: number,
  minimumKm: number
): number {
  const billableDistance = Math.max(distanceKm, minimumKm);
  return billableDistance * ratePerKm;
}

/* ----------------------------- Confirmation Modal Component ----------------------------- */

interface ConfirmationModalProps {
  visible: boolean;
  title: string;
  message?: string;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmColor?: string;
}

/**
 * Centered confirmation modal matching the app's design pattern
 */
function ConfirmationModal({
  visible,
  title,
  message,
  onCancel,
  onConfirm,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmColor = COLORS.danger,
}: ConfirmationModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={{ 
        flex: 1, 
        alignItems: "center", 
        justifyContent: "center",
        backgroundColor: "rgba(0, 0, 0, 0.35)" 
      }}>
        <View style={{ 
          width: "85%",
          maxWidth: 400,
          borderRadius: 20,
          backgroundColor: "white",
          padding: 20,
          ...cardShadow as any,
        }}>
          {/* Icon */}
          <View style={{ alignItems: "center", marginBottom: 8 }}>
            <Ionicons 
              name="alert-circle-outline" 
              size={28} 
              color={confirmColor} 
            />
          </View>

          {/* Title */}
          <Text style={{ 
            fontSize: 16, 
            fontWeight: "bold", 
            color: "#0F172A",
            textAlign: "center",
            marginBottom: message ? 8 : 0,
          }}>
            {title}
          </Text>

          {/* Message */}
          {message ? (
            <Text style={{ 
              fontSize: 13, 
              color: "#475569",
              textAlign: "center",
              lineHeight: 18,
            }}>
              {message}
            </Text>
          ) : null}

          {/* Buttons */}
          <View style={{ 
            marginTop: 20, 
            flexDirection: "row", 
            gap: 10 
          }}>
            <Pressable
              onPress={onCancel}
              style={{
                flex: 1,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "#CBD5E1",
                paddingVertical: 10,
                alignItems: "center",
              }}
            >
              <Text style={{ 
                fontSize: 13, 
                color: "#0F172A",
                fontWeight: "600",
              }}>
                {cancelLabel}
              </Text>
            </Pressable>

            <Pressable
              onPress={onConfirm}
              style={{
                flex: 1,
                borderRadius: 12,
                paddingVertical: 10,
                alignItems: "center",
                backgroundColor: confirmColor,
              }}
            >
              <Text style={{ 
                fontSize: 13, 
                color: "white",
                fontWeight: "bold",
              }}>
                {confirmLabel}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/* ----------------------------- Main Component ----------------------------- */

/**
 * OfferModal Component
 * 
 * A reusable modal for mechanics/shops to send service offers to customers.
 * Features:
 * - Auto-calculated distance fee based on location
 * - Manual labor cost input with validation (default: 50.00)
 * - Automatic decimal formatting (.00)
 * - Optional notes (max 500 characters)
 * - Real-time total calculation
 * - Input validation and error handling
 * - Keyboard-aware scrolling
 * - Platform-specific styling
 * - Compact design with smaller fonts and reduced spacing
 * - Sticky header for better UX
 * - Custom confirmation modal for discard
 */
export default function OfferModal({
  visible,
  emergency,
  distanceKm,
  ratePerKm = DEFAULT_RATE_PER_KM,
  minimumDistanceKm = DEFAULT_MINIMUM_DISTANCE_KM,
  onClose,
  onSubmit,
  isSubmitting = false,
}: OfferModalProps) {
  const { height: screenHeight } = useWindowDimensions();
  
  /* ----------------------------- State ----------------------------- */

  const [laborCostInput, setLaborCostInput] = useState<string>(DEFAULT_LABOR_COST);
  const [noteInput, setNoteInput] = useState<string>("");
  const [laborCostError, setLaborCostError] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState<boolean>(false);

  /* ----------------------------- Derived State ----------------------------- */

  // Use provided distance or fallback to emergency distance
  const effectiveDistance = distanceKm ?? emergency?.distanceKm ?? 1.0;

  // Calculate distance fee
  const distanceFee = calculateDistanceFee(
    effectiveDistance,
    ratePerKm,
    minimumDistanceKm
  );

  // Parse labor cost (default to 0 if invalid)
  const laborCost = isValidPositiveNumber(laborCostInput)
    ? parseFloat(laborCostInput)
    : 0;

  // Calculate total
  const totalFees = distanceFee + laborCost;

  // Check if form is valid
  const isFormValid =
    isValidPositiveNumber(laborCostInput) &&
    laborCost >= MIN_LABOR_COST &&
    laborCost <= MAX_LABOR_COST &&
    noteInput.length <= MAX_NOTE_LENGTH &&
    !laborCostError;

  /* ----------------------------- Effects ----------------------------- */

  // Reset form when modal opens/closes
  useEffect(() => {
    if (visible) {
      setLaborCostInput(DEFAULT_LABOR_COST);
      setNoteInput("");
      setLaborCostError("");
      setIsProcessing(false);
      setShowDiscardConfirm(false);
    }
  }, [visible]);

  /* ----------------------------- Handlers ----------------------------- */

  /**
   * Handles labor cost input changes with validation
   */
  const handleLaborCostChange = useCallback((text: string) => {
    // Allow empty input
    if (text === "") {
      setLaborCostInput("");
      setLaborCostError("Labor cost is required");
      return;
    }

    // Remove non-numeric characters except decimal point
    const cleaned = text.replace(/[^0-9.]/g, "");

    // Prevent multiple decimal points
    const parts = cleaned.split(".");
    if (parts.length > 2) {
      return;
    }

    // Limit decimal places to 2
    if (parts[1] && parts[1].length > 2) {
      return;
    }

    setLaborCostInput(cleaned);

    // Validate
    if (!isValidPositiveNumber(cleaned)) {
      setLaborCostError("Enter a valid amount");
      return;
    }

    const num = parseFloat(cleaned);
    if (num < MIN_LABOR_COST) {
      setLaborCostError(`Minimum is ${CURRENCY_SYMBOL}${MIN_LABOR_COST}`);
      return;
    }

    if (num > MAX_LABOR_COST) {
      setLaborCostError(`Maximum is ${CURRENCY_SYMBOL}${MAX_LABOR_COST.toLocaleString()}`);
      return;
    }

    setLaborCostError("");
  }, []);

  /**
   * Handles labor cost blur event to format with 2 decimal places
   */
  const handleLaborCostBlur = useCallback(() => {
    if (laborCostInput && laborCostInput.trim() !== "") {
      const formatted = formatToTwoDecimals(laborCostInput);
      if (formatted) {
        setLaborCostInput(formatted);
        
        // Revalidate after formatting
        const num = parseFloat(formatted);
        if (num < MIN_LABOR_COST) {
          setLaborCostError(`Minimum is ${CURRENCY_SYMBOL}${MIN_LABOR_COST}`);
        } else if (num > MAX_LABOR_COST) {
          setLaborCostError(`Maximum is ${CURRENCY_SYMBOL}${MAX_LABOR_COST.toLocaleString()}`);
        } else {
          setLaborCostError("");
        }
      }
    } else if (laborCostInput === "") {
      setLaborCostError("Labor cost is required");
    }
  }, [laborCostInput]);

  /**
   * Handles note input changes with character limit
   */
  const handleNoteChange = useCallback((text: string) => {
    if (text.length <= MAX_NOTE_LENGTH) {
      setNoteInput(text);
    }
  }, []);

  /**
   * Handles form submission
   */
  const handleSubmit = useCallback(async () => {
    if (!isFormValid || !emergency) {
      Alert.alert("Invalid Input", "Please check your input and try again.");
      return;
    }

    setIsProcessing(true);

    try {
      const offerData: OfferData = {
        distanceFee,
        laborCost,
        note: noteInput.trim(),
        totalFees,
      };

      await onSubmit(offerData);

      // Close modal on success
      onClose();
    } catch (error: any) {
      console.error("[OfferModal] Submission error:", error);
      Alert.alert(
        "Submission Failed",
        error?.message ?? "Unable to send offer. Please try again."
      );
    } finally {
      setIsProcessing(false);
    }
  }, [
    isFormValid,
    emergency,
    distanceFee,
    laborCost,
    noteInput,
    totalFees,
    onSubmit,
    onClose,
  ]);

  /**
   * Handles modal close with confirmation if data is entered
   */
  const handleClose = useCallback(() => {
    if (laborCostInput !== DEFAULT_LABOR_COST || noteInput) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  }, [laborCostInput, noteInput, onClose]);

  /**
   * Confirms discarding changes
   */
  const handleConfirmDiscard = useCallback(() => {
    setShowDiscardConfirm(false);
    onClose();
  }, [onClose]);

  /**
   * Cancels discarding (stays in modal)
   */
  const handleCancelDiscard = useCallback(() => {
    setShowDiscardConfirm(false);
  }, []);

  /* ----------------------------- Render Guard ----------------------------- */

  if (!emergency) {
    return null;
  }

  /* ----------------------------- Render ----------------------------- */

  const isLoading = isSubmitting || isProcessing;

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={handleClose}
        statusBarTranslucent
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0, 0, 0, 0.4)" }}>
          <Pressable
            style={{ flex: 1 }}
            onPress={handleClose}
            disabled={isLoading}
          />
          
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
            style={{ 
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              maxHeight: screenHeight * 0.90,
            }}
          >
            <View style={{ 
              backgroundColor: "white",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              overflow: "hidden",
            }}>
              {/* Handle Bar */}
              <View style={{ 
                alignItems: "center", 
                paddingTop: 8, 
                paddingBottom: 6 
              }}>
                <View style={{ 
                  height: 3, 
                  width: 40, 
                  backgroundColor: "#CBD5E1", 
                  borderRadius: 2 
                }} />
              </View>

              <ScrollView
                showsVerticalScrollIndicator={true}
                keyboardShouldPersistTaps="handled"
                bounces={true}
                stickyHeaderIndices={[0]}
                contentContainerStyle={{ 
                  flexGrow: 1,
                  paddingBottom: Platform.OS === 'ios' ? 32 : 20,
                }}
              >
                {/* Header - Sticky */}
                <View style={{ 
                  paddingHorizontal: 16, 
                  paddingBottom: 12,
                  paddingTop: 4,
                  borderBottomWidth: 1, 
                  borderBottomColor: "#E5E7EB",
                  backgroundColor: "white",
                }}>
                  <View style={{ 
                    flexDirection: "row", 
                    alignItems: "center", 
                    justifyContent: "space-between" 
                  }}>
                    <Text style={{ 
                      fontSize: 16, 
                      fontWeight: "bold", 
                      color: "#0F172A" 
                    }}>
                      Send Offer
                    </Text>
                    <Pressable
                      onPress={handleClose}
                      disabled={isLoading}
                      hitSlop={8}
                      style={{ padding: 4 }}
                    >
                      <Ionicons name="close" size={20} color={COLORS.text} />
                    </Pressable>
                  </View>
                </View>

                {/* Customer Info */}
                <View style={{ 
                  paddingHorizontal: 16, 
                  paddingVertical: 12, 
                  backgroundColor: "#F8FAFC" 
                }}>
                  <View style={{ 
                    flexDirection: "row", 
                    alignItems: "center", 
                    marginBottom: 6 
                  }}>
                    <Text style={{ 
                      fontSize: 13, 
                      fontWeight: "600", 
                      color: "#0F172A" 
                    }}>
                      {emergency.customerName}
                    </Text>
                  </View>
                  <View style={{ 
                    flexDirection: "row", 
                    alignItems: "center", 
                    marginBottom: 3 
                  }}>
                    <Ionicons name="car" size={11} color={COLORS.sub} />
                    <Text style={{ 
                      marginLeft: 5, 
                      fontSize: 11, 
                      color: "#475569" 
                    }}>
                      {emergency.vehicleType}
                    </Text>
                  </View>
                  <View style={{ 
                    flexDirection: "row", 
                    alignItems: "center", 
                    marginBottom: 3 
                  }}>
                    <Ionicons name="construct-outline" size={11} color={COLORS.sub} />
                    <Text style={{ 
                      marginLeft: 5, 
                      fontSize: 11, 
                      color: "#475569" 
                    }}>
                      {emergency.breakdownCause}
                    </Text>
                  </View>
                  <View style={{ 
                    flexDirection: "row", 
                    alignItems: "center", 
                    marginBottom: 3 
                  }}>
                    <Ionicons name="location-outline" size={11} color={COLORS.sub} />
                    <Text style={{ 
                      marginLeft: 5, 
                      fontSize: 11, 
                      color: "#475569",
                      flex: 1,
                    }}>
                      {emergency.location}
                    </Text>
                  </View>
                  <View style={{ 
                    flexDirection: "row", 
                    alignItems: "center" 
                  }}>
                    <Ionicons name="time-outline" size={11} color={COLORS.muted} />
                    <Text style={{ 
                      marginLeft: 5, 
                      fontSize: 10, 
                      color: "#64748B" 
                    }}>
                      {emergency.dateTime}
                      {effectiveDistance > 0 && (
                        <Text>  •  {effectiveDistance.toFixed(1)} km away</Text>
                      )}
                    </Text>
                  </View>
                </View>

                {/* Driver Note (if exists) */}
                {emergency.breakdownCause && (
                  <View style={{ 
                    paddingHorizontal: 16, 
                    paddingVertical: 10, 
                    backgroundColor: "#FEFCE8", 
                    borderTopWidth: 1, 
                    borderTopColor: "#FDE68A" 
                  }}>
                    <Text style={{ 
                      fontSize: 10, 
                      fontWeight: "600", 
                      color: "#92400E", 
                      marginBottom: 3 
                    }}>
                      Driver note:
                    </Text>
                    <Text style={{ 
                      fontSize: 11, 
                      color: "#92400E" 
                    }}>
                      {emergency.breakdownCause}
                    </Text>
                  </View>
                )}

                {/* Distance Fee Section */}
                <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                  <Text style={{ 
                    fontSize: 12, 
                    fontWeight: "600", 
                    color: "#0F172A", 
                    marginBottom: 8 
                  }}>
                    Distance fee
                  </Text>
                  <View style={{ 
                    backgroundColor: "#F8FAFC", 
                    borderRadius: 12, 
                    padding: 12, 
                    borderWidth: 1, 
                    borderColor: "#E5E7EB" 
                  }}>
                    <View style={{ 
                      flexDirection: "row", 
                      alignItems: "center", 
                      justifyContent: "space-between", 
                      marginBottom: 3 
                    }}>
                      <Text style={{ 
                        fontSize: 11, 
                        color: "#475569" 
                      }}>
                        {effectiveDistance.toFixed(1)} km × {CURRENCY_SYMBOL}{ratePerKm.toFixed(2)}
                      </Text>
                      <Text style={{ 
                        fontSize: 13, 
                        fontWeight: "bold", 
                        color: "#0F172A" 
                      }}>
                        {CURRENCY_SYMBOL}{formatCurrency(distanceFee)}
                      </Text>
                    </View>
                    <Text style={{ 
                      fontSize: 10, 
                      color: "#64748B" 
                    }}>
                      Minimum {minimumDistanceKm.toFixed(1)} km applies
                    </Text>
                  </View>
                </View>

                {/* Labor Cost Section */}
                <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                  <Text style={{ 
                    fontSize: 12, 
                    fontWeight: "600", 
                    color: "#0F172A", 
                    marginBottom: 8 
                  }}>
                    Labor cost
                  </Text>
                  <View>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        backgroundColor: "white",
                        borderRadius: 12,
                        paddingHorizontal: 12,
                        borderWidth: 1,
                        borderColor: laborCostError ? COLORS.danger : COLORS.border,
                      }}
                    >
                      <Text style={{ 
                        fontSize: 16, 
                        fontWeight: "bold", 
                        color: "#475569", 
                        marginRight: 6 
                      }}>
                        {CURRENCY_SYMBOL}
                      </Text>
                      <TextInput
                        value={laborCostInput}
                        onChangeText={handleLaborCostChange}
                        onBlur={handleLaborCostBlur}
                        placeholder="0.00"
                        placeholderTextColor={COLORS.placeholder}
                        keyboardType="decimal-pad"
                        editable={!isLoading}
                        style={{
                          flex: 1,
                          paddingVertical: 11,
                          fontSize: 14,
                          fontWeight: "600",
                          color: "#0F172A",
                        }}
                      />
                    </View>
                    {laborCostError ? (
                      <Text style={{ 
                        marginTop: 6, 
                        fontSize: 10, 
                        color: "#DC2626", 
                        marginLeft: 4 
                      }}>
                        {laborCostError}
                      </Text>
                    ) : null}
                  </View>
                </View>

                {/* Note Section */}
                <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                  <Text style={{ 
                    fontSize: 12, 
                    fontWeight: "600", 
                    color: "#0F172A", 
                    marginBottom: 8 
                  }}>
                    Note (optional)
                  </Text>
                  <View
                    style={{
                      backgroundColor: "white",
                      borderRadius: 12,
                      padding: 10,
                      borderWidth: 1,
                      borderColor: "#E5E7EB",
                      minHeight: 80,
                    }}
                  >
                    <TextInput
                      value={noteInput}
                      onChangeText={handleNoteChange}
                      placeholder="Add any additional information..."
                      placeholderTextColor={COLORS.placeholder}
                      multiline
                      textAlignVertical="top"
                      editable={!isLoading}
                      style={{
                        fontSize: 12,
                        color: "#475569",
                        minHeight: 60,
                        lineHeight: 16,
                      }}
                    />
                  </View>
                  <Text style={{ 
                    marginTop: 4, 
                    fontSize: 10, 
                    color: "#64748B", 
                    textAlign: "right" 
                  }}>
                    {noteInput.length}/{MAX_NOTE_LENGTH}
                  </Text>
                </View>

                {/* Summary Section */}
                <View style={{ 
                  paddingHorizontal: 16, 
                  paddingVertical: 12, 
                  backgroundColor: "#F8FAFC", 
                  borderTopWidth: 1, 
                  borderTopColor: "#E5E7EB",
                  marginTop: 6,
                }}>
                  <View style={{ 
                    flexDirection: "row", 
                    justifyContent: "space-between", 
                    alignItems: "center", 
                    marginBottom: 6 
                  }}>
                    <Text style={{ 
                      fontSize: 11, 
                      color: "#475569" 
                    }}>
                      Distance fee
                    </Text>
                    <Text style={{ 
                      fontSize: 11, 
                      color: "#0F172A" 
                    }}>
                      {CURRENCY_SYMBOL}{formatCurrency(distanceFee)}
                    </Text>
                  </View>
                  <View style={{ 
                    flexDirection: "row", 
                    justifyContent: "space-between", 
                    alignItems: "center", 
                    marginBottom: 8 
                  }}>
                    <Text style={{ 
                      fontSize: 11, 
                      color: "#475569" 
                    }}>
                      Labor cost
                    </Text>
                    <Text style={{ 
                      fontSize: 11, 
                      color: "#0F172A" 
                    }}>
                      {CURRENCY_SYMBOL}{formatCurrency(laborCost)}
                    </Text>
                  </View>
                  <View style={{ 
                    height: 1, 
                    backgroundColor: "#CBD5E1", 
                    marginBottom: 8 
                  }} />
                  <View style={{ 
                    flexDirection: "row", 
                    justifyContent: "space-between", 
                    alignItems: "center" 
                  }}>
                    <Text style={{ 
                      fontSize: 13, 
                      fontWeight: "bold", 
                      color: "#0F172A" 
                    }}>
                      Total fees
                    </Text>
                    <Text style={{ 
                      fontSize: 16, 
                      fontWeight: "bold", 
                      color: "#0F172A" 
                    }}>
                      {CURRENCY_SYMBOL}{formatCurrency(totalFees)}
                    </Text>
                  </View>
                </View>

                {/* Send Offer Button */}
                <View style={{ 
                  paddingHorizontal: 16, 
                  paddingTop: 16,
                }}>
                  <Pressable
                    onPress={handleSubmit}
                    disabled={!isFormValid || isLoading}
                    style={{
                      borderRadius: 12,
                      paddingVertical: 12,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: !isFormValid || isLoading
                        ? COLORS.muted
                        : COLORS.primary,
                      opacity: !isFormValid || isLoading ? 0.6 : 1,
                    }}
                  >
                    {isLoading ? (
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <ActivityIndicator color="#FFFFFF" size="small" />
                        <Text style={{ 
                          marginLeft: 8, 
                          color: "white", 
                          fontSize: 13, 
                          fontWeight: "bold" 
                        }}>
                          Sending...
                        </Text>
                      </View>
                    ) : (
                      <Text style={{ 
                        color: "white", 
                        fontSize: 13, 
                        fontWeight: "bold" 
                      }}>
                        Send Offer
                      </Text>
                    )}
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Discard Confirmation Modal */}
      <ConfirmationModal
        visible={showDiscardConfirm}
        title="Discard Offer?"
        message="You have unsaved changes. Are you sure you want to close?"
        onCancel={handleCancelDiscard}
        onConfirm={handleConfirmDiscard}
        confirmLabel="Discard"
        cancelLabel="Cancel"
        confirmColor={COLORS.danger}
      />
    </>
  );
}
