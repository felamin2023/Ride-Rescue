// app/index.web.tsx
import { Redirect } from "expo-router";

export default function IndexWeb() {
  return <Redirect href="/(admin)/admindashboard" />;
}
