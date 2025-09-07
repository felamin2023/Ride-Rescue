// components/DayCheck.tsx
import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

export default function DayCheck({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      onPress={onToggle}
      className="flex-row items-center gap-1"
      android_ripple={{ color: "#e5e7eb" }}
    >
      <View
        className={`h-[18px] w-[18px] items-center justify-center rounded-[3px] border ${
          checked ? "bg-[#0F2547] border-[#0F2547]" : "bg-white border-gray-300"
        }`}
      >
        {checked && <Ionicons name="checkmark" size={14} color="#fff" />}
      </View>
      <Text className="text-xs font-semibold text-gray-900">{label}</Text>
    </Pressable>
  );
}
