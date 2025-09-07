// components/CheckboxRow.tsx
import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

export default function CheckboxRow({
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
      className="flex-row items-center gap-2"
      android_ripple={{ color: "#e5e7eb" }}
    >
      <View
        className={`h-5 w-5 items-center justify-center rounded border ${
          checked ? "bg-[#0F2547] border-[#0F2547]" : "bg-white border-gray-300"
        }`}
      >
        {checked && <Ionicons name="checkmark" size={16} color="#fff" />}
      </View>
      <Text className="text-sm text-gray-900">{label}</Text>
    </Pressable>
  );
}
