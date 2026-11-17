import { createClient } from '@supabase/supabase-js';

function resolveSafeSupabaseUrl(raw: string | undefined): string {
  const trimmed = (raw || "").trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return trimmed;
    }
  } catch {
    // Fallback when missing or malformed
  }
  return "https://mock.supabase.co";
}

const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();
const supabaseUrl = resolveSafeSupabaseUrl(rawSupabaseUrl);

if (supabaseUrl.includes("mock") || !supabaseAnonKey) {
  console.warn("Supabase credentials missing or invalid. Auth/realtime will use fallback.");
}

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey || "mock-key"
);
