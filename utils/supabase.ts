// utils/supabase.ts
import "react-native-url-polyfill/auto";
import "react-native-get-random-values";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

// ⬇️ TEMP hardcode (replace your env reads with these two lines)
const url  = "https://ewrlmlsetyinyhjwgoko.supabase.co";
const anon = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV3cmxtbHNldHlpbnloandnb2tvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUzOTk3OTgsImV4cCI6MjA3MDk3NTc5OH0.Xqt8WHv58IX-bGQt4bo887DUb0L-_4H20KLqH76DtJ8"; // from Settings → API → Client API key (anon)

// (optional) sanity log
console.log("[SB URL]", url);
console.log("[SB KEY first 16]", (anon || "").slice(0, 16));

export const supabase = createClient(url, anon, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
