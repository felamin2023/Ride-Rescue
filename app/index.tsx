// app/index.tsx
import { Redirect } from "expo-router";

export default function Start() {
  return <Redirect href="/(auth)/login" />;
}
