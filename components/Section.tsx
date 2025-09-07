// components/Section.tsx
import { Text, View } from "react-native";

export default function Section({
  title,
  children,
  footer,
}: {
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <View className="mb-3 rounded-md border border-gray-200 bg-white p-4">
      {title ? (
        <Text className="mb-2 text-lg font-bold text-gray-900">{title}</Text>
      ) : null}

      <View className="gap-3">{children}</View>

      {footer ? <View className="mt-3">{footer}</View> : null}
    </View>
  );
}
