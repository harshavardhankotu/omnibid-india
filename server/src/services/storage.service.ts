import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "https://mock.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "mock-service-key";

export const VAULT_BUCKET = "omnibid-vault";
export const DEFAULT_SIGNED_URL_TTL = 900; // 15 minutes in seconds

export class StorageService {
  private static client: SupabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  /**
   * Initializes or verifies the private storage vault bucket.
   */
  static async ensureVaultBucket(): Promise<void> {
    try {
      if (supabaseUrl.includes("mock")) return;
      const { data: buckets } = await this.client.storage.listBuckets();
      const vaultExists = buckets?.some((b) => b.name === VAULT_BUCKET);
      if (!vaultExists) {
        await this.client.storage.createBucket(VAULT_BUCKET, {
          public: false, // Strict private bucket: Direct public read access is forbidden
          fileSizeLimit: 25 * 1024 * 1024, // 25MB max per document
          allowedMimeTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
        });
      }
    } catch (err) {
      console.warn("Storage vault bucket check/creation notice:", err);
    }
  }

  /**
   * Generates a pre-signed download URL with a mandatory maximum 15-minute (900 seconds) TTL.
   * Direct public URLs are strictly blocked to enforce KYC and dispute evidence confidentiality.
   */
  static async createSignedDownloadUrl(
    filePath: string,
    ttlSeconds: number = DEFAULT_SIGNED_URL_TTL
  ): Promise<{ signedUrl: string; expiresIn: number }> {
    // Enforce mandatory 15-minute (900s) maximum TTL
    const effectiveTTL = Math.min(Math.max(ttlSeconds, 60), DEFAULT_SIGNED_URL_TTL);

    if (supabaseUrl.includes("mock")) {
      const mockExpiry = Math.floor(Date.now() / 1000) + effectiveTTL;
      return {
        signedUrl: `https://mock.supabase.co/storage/v1/object/sign/${VAULT_BUCKET}/${filePath}?token=mock_signed_token&expires=${mockExpiry}`,
        expiresIn: effectiveTTL,
      };
    }

    const { data, error } = await this.client.storage
      .from(VAULT_BUCKET)
      .createSignedUrl(filePath, effectiveTTL);

    if (error || !data?.signedUrl) {
      throw new Error(`Failed to generate signed URL for vault object: ${error?.message || "Unknown error"}`);
    }

    return {
      signedUrl: data.signedUrl,
      expiresIn: effectiveTTL,
    };
  }

  /**
   * Securely uploads a document (KYC document, Aadhaar/PAN record, dispute evidence)
   * directly to the private encrypted vault bucket.
   */
  static async uploadPrivateFile(params: {
    filePath: string;
    fileBuffer: Buffer;
    contentType: string;
  }): Promise<{ path: string; bucket: string }> {
    const { filePath, fileBuffer, contentType } = params;

    if (supabaseUrl.includes("mock")) {
      return { path: filePath, bucket: VAULT_BUCKET };
    }

    const { data, error } = await this.client.storage
      .from(VAULT_BUCKET)
      .upload(filePath, fileBuffer, {
        contentType,
        upsert: false, // Prevent accidental overwriting of audit evidence
      });

    if (error || !data) {
      throw new Error(`Failed to upload file to vault: ${error?.message || "Unknown error"}`);
    }

    return {
      path: data.path,
      bucket: VAULT_BUCKET,
    };
  }

  /**
   * Strictly prevents direct public read access to KYC & dispute vault files.
   * Throws an explicit exception if called.
   */
  static getPublicUrl(filePath: string): never {
    throw new Error(
      `Forbidden: Direct public read access is permanently disabled for '${VAULT_BUCKET}'. ` +
      `Access to '${filePath}' requires a time-bound pre-signed URL via createSignedDownloadUrl.`
    );
  }
}
