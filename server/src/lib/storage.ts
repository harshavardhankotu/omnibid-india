import { createClient } from "@supabase/supabase-js";

function resolveSafeSupabaseUrl(raw: string | undefined): string {
  const trimmed = (raw || "").trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return trimmed;
    }
  } catch {
    // Fallback to mock URL when env var is missing or malformed
  }
  return "https://mock.supabase.co";
}

const supabaseUrl = resolveSafeSupabaseUrl(process.env.SUPABASE_URL);
const supabaseKey =
  (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim() ||
  (process.env.SUPABASE_ANON_KEY || "").trim() ||
  "mock-key";

export const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Generates a secure, temporary download URL for a private bucket file.
 * @param bucket Private bucket name
 * @param path File path inside the bucket
 * @param expiresInSeconds Lifetime of the signed URL (default 1 hour)
 */
export async function getSignedDownloadUrl(
  bucket: string,
  path: string,
  expiresInSeconds: number = 3600
): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
  if (error) {
    throw new Error(`Failed to generate signed url: ${error.message}`);
  }
  return data.signedUrl;
}
