// import { createClient } from "@supabase/supabase-js";
// import "react-native-url-polyfill/auto";
// import "react-native-get-random-values";

// const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
// const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// if (!url || !anon) {
//   // Keep this to catch bad env early
//   throw new Error(
//     "[runtime not ready]: Missing Supabase configuration. Check your .env"
//   );
// }

// export const supabase = createClient(url, anon, {
//   auth: { persistSession: true, autoRefreshToken: true },
// });
// utils/supabase.ts
import "react-native-url-polyfill/auto";
import "react-native-get-random-values";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
if (!url || !anon) {
  throw new Error(
    "[runtime not ready]: Missing Supabase configuration. Check your .env"
  );
}

export const supabase = createClient(url, anon, {
  auth: {
    storage: AsyncStorage, // 👈 persist session across app restarts
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false, // 👈 RN/Expo (no URL handling)
    // flowType: "pkce",            // 👈 uncomment if you later add OAuth (Google, etc.)
  },
});
