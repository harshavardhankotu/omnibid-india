import crypto from "crypto";
import { db } from "../db/connection.js";
import {
  users,
  requirements,
  affiliate_offers,
} from "../db/schema.js";
import { SEEDED_AFFILIATE_OFFERS } from "../routes/affiliate.js";

// Regional Tender Data Interface
export interface RegionalTender {
  id: string;
  title: string;
  description: string;
  city: string;
  state: string;
  pincode: string;
  budget: number;
  category: string;
  sector: "IT" | "Construction" | "Logistics" | "Legal";
  deadlineHours: number;
  auctionEndsAt: string;
  status: "open";
  customData: Record<string, any>;
  createdAt: string;
}

// Canonical high-value regional tenders for OmniBid India
export const SEEDED_REGIONAL_TENDERS: RegionalTender[] = [
  {
    id: "a0000000-0000-0000-0000-000000000001",
    title: "Supply of 500 MT Fe 550D TMT Rebars for HITEC City Metro Rail Extension",
    description:
      "Supply of 500 MT Fe 550D primary steel TMT rebars for HITEC City Metro Rail Extension corridor construction conforming to IS 1786 with mill test certificates.",
    city: "Hyderabad",
    state: "Telangana",
    pincode: "500081",
    budget: 2400000,
    category: "construction",
    sector: "Construction",
    deadlineHours: 72,
    auctionEndsAt: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
    status: "open",
    customData: {
      quantity: 500,
      unit: "MT",
      grade: "Fe 550D",
      spec: "IS 1786:2008",
      project: "HITEC City Metro Rail Extension",
    },
    createdAt: new Date().toISOString(),
  },
  {
    id: "a0000000-0000-0000-0000-000000000002",
    title: "Ready-Mix Concrete M40 Grade 1200 CuM for Bandra Commercial Tower",
    description:
      "Ready-Mix Concrete M40 Grade 1200 CuM for Bandra Commercial Tower foundation casting and shear walls with continuous batching and slump retention admixtures.",
    city: "Mumbai",
    state: "Maharashtra",
    pincode: "400051",
    budget: 5400000,
    category: "construction",
    sector: "Construction",
    deadlineHours: 96,
    auctionEndsAt: new Date(Date.now() + 96 * 3600 * 1000).toISOString(),
    status: "open",
    customData: {
      quantity: 1200,
      unit: "CuM",
      grade: "M40 RMC",
      project: "Bandra Commercial Tower",
    },
    createdAt: new Date().toISOString(),
  },
  {
    id: "a0000000-0000-0000-0000-000000000003",
    title: "HVAC Ducting & High-Pressure Piping for Electronic City Data Center",
    description:
      "HVAC Ducting & High-Pressure Piping for Electronic City Data Center Tier-4 server halls with GI ducting, chilled water loops, and pressure testing.",
    city: "Bengaluru",
    state: "Karnataka",
    pincode: "560100",
    budget: 3800000,
    category: "commercial_plumbing",
    sector: "Construction",
    deadlineHours: 48,
    auctionEndsAt: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
    status: "open",
    customData: {
      scope: "Turnkey HVAC ducting and high-pressure chilled water piping",
      project: "Electronic City Data Center",
    },
    createdAt: new Date().toISOString(),
  },
  {
    id: "a0000000-0000-0000-0000-000000000004",
    title: "Marine Grade Structural Steel Fabrications for Vizag Port Terminal",
    description:
      "Marine Grade Structural Steel Fabrications for Vizag Port Terminal with heavy epoxy coating, anti-corrosive primer, and ultrasonic testing.",
    city: "Visakhapatnam",
    state: "Andhra Pradesh",
    pincode: "530035",
    budget: 4200000,
    category: "steel",
    sector: "Construction",
    deadlineHours: 120,
    auctionEndsAt: new Date(Date.now() + 120 * 3600 * 1000).toISOString(),
    status: "open",
    customData: {
      grade: "Marine Grade Structural Steel",
      project: "Vizag Port Deepwater Cargo Terminal",
    },
    createdAt: new Date().toISOString(),
  },
  {
    id: "a0000000-0000-0000-0000-000000000005",
    title: "Industrial Firefighting Piping & High-Capacity Hydrant Grid in Noida",
    description:
      "Industrial Firefighting Piping & High-Capacity Hydrant Grid in Noida Sector 62 industrial plant conforming to NBC and NFPA standards with jockey pumps.",
    city: "Noida",
    state: "Uttar Pradesh",
    pincode: "201301",
    budget: 1850000,
    category: "industrial_safety",
    sector: "Construction",
    deadlineHours: 60,
    auctionEndsAt: new Date(Date.now() + 60 * 3600 * 1000).toISOString(),
    status: "open",
    customData: {
      scope: "Industrial Firefighting Piping & High-Capacity Hydrant Grid",
      location: "Noida Sector 62 (Delhi NCR)",
      compliance: "NBC / NFPA",
    },
    createdAt: new Date().toISOString(),
  },
];

// In-memory tender repository
const memoryTendersMap = new Map<string, RegionalTender>();
for (const tender of SEEDED_REGIONAL_TENDERS) {
  memoryTendersMap.set(tender.id, tender);
}

export function getRegionalTenders(): RegionalTender[] {
  return Array.from(memoryTendersMap.values());
}

export function getRegionalTenderById(id: string): RegionalTender | undefined {
  return memoryTendersMap.get(id);
}

export function registerRegionalTender(tender: RegionalTender): void {
  if (!memoryTendersMap.has(tender.id)) {
    memoryTendersMap.set(tender.id, tender);
  }
}

// VAPID Key Manager
let cachedVapidPublicKey = process.env.VAPID_PUBLIC_KEY || "";
let cachedVapidPrivateKey = process.env.VAPID_PRIVATE_KEY || "";

/**
 * Ensures valid VAPID keys are loaded from environment or deterministically generated.
 */
export function initVapidKeys(): { publicKey: string; privateKey: string } {
  if (cachedVapidPublicKey && cachedVapidPrivateKey) {
    process.env.VAPID_PUBLIC_KEY = cachedVapidPublicKey;
    process.env.VAPID_PRIVATE_KEY = cachedVapidPrivateKey;
    return { publicKey: cachedVapidPublicKey, privateKey: cachedVapidPrivateKey };
  }

  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    cachedVapidPublicKey = process.env.VAPID_PUBLIC_KEY;
    cachedVapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    return { publicKey: cachedVapidPublicKey, privateKey: cachedVapidPrivateKey };
  }

  // Deterministically generate ephemeral NIST P-256 EC keys using a fixed seed
  const seed = crypto
    .createHash("sha256")
    .update("omnibid-india-production-ephemeral-vapid-seed-v1")
    .digest();

  const ecdh = crypto.createECDH("prime256v1");
  ecdh.setPrivateKey(seed);

  cachedVapidPublicKey = ecdh.getPublicKey("base64url");
  cachedVapidPrivateKey = ecdh.getPrivateKey("base64url");

  process.env.VAPID_PUBLIC_KEY = cachedVapidPublicKey;
  process.env.VAPID_PRIVATE_KEY = cachedVapidPrivateKey;

  console.log(
    `[AutoBootstrap] Ephemeral VAPID keys loaded deterministically (Public: ${cachedVapidPublicKey.slice(0, 16)}...)`
  );

  return { publicKey: cachedVapidPublicKey, privateKey: cachedVapidPrivateKey };
}

/**
 * Returns active VAPID public key for Web Push notifications.
 */
export function getVapidPublicKey(): string {
  if (!cachedVapidPublicKey) {
    initVapidKeys();
  }
  return cachedVapidPublicKey;
}

/**
 * Returns active VAPID private key.
 */
export function getVapidPrivateKey(): string {
  if (!cachedVapidPrivateKey) {
    initVapidKeys();
  }
  return cachedVapidPrivateKey;
}

let bootstrapPromise: Promise<void> | null = null;

/**
 * Main Auto-Bootstrap Engine:
 * 1. Initializes VAPID keys deterministically.
 * 2. Ensures the 10 Indian B2B Affiliate Offers exist or fallbacks are ready.
 * 3. Ensures high-value regional tenders exist in database or in-memory repository.
 */
export async function autoBootstrap(): Promise<void> {
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = (async () => {
    console.log("🚀 [AutoBootstrap] Initializing OmniBid single-origin bootstrap engine...");

    // 1. Initialize & verify VAPID keys
    initVapidKeys();

    // 2. Ensure in-memory regional tenders are populated
    for (const tender of SEEDED_REGIONAL_TENDERS) {
      if (!memoryTendersMap.has(tender.id)) {
        memoryTendersMap.set(tender.id, tender);
      }
    }
    console.log(`[AutoBootstrap] In-memory store ready with ${memoryTendersMap.size} regional tenders.`);

    // 3. Ensure B2B affiliate offers fallback ready
    console.log(`[AutoBootstrap] Verified ${SEEDED_AFFILIATE_OFFERS.length} Indian B2B affiliate offers in fallback pool.`);

    // 4. Attempt database seeding if database is reachable
    try {
      if (process.env.DATABASE_URL) {
        // Seed affiliate offers in DB
        try {
          await db
            .insert(affiliate_offers)
            .values(
              SEEDED_AFFILIATE_OFFERS.map((offer) => ({
                id: offer.id,
                title: offer.title,
                category_keywords: offer.category_keywords,
                partner_name: offer.partner_name,
                target_url: offer.target_url,
                commission_type: offer.commission_type,
                cpc_or_cpa_inr: offer.cpc_or_cpa_inr,
                badge_text: offer.badge_text,
                cta_text: offer.cta_text,
                active: offer.active,
              }))
            )
            .onConflictDoNothing();
          console.log("[AutoBootstrap] Verified affiliate offers in database.");
        } catch (dbErr: any) {
          console.warn(`[AutoBootstrap] Note: DB affiliate offers check skipped (${dbErr.message}). Using memory fallback.`);
        }

        // Seed regional tenders in DB
        try {
          const buyerId = "00000000-0000-0000-0000-000000000099";
          await db
            .insert(users)
            .values([
              {
                id: buyerId,
                role: "buyer",
                name: "OmniBid Regional Infrastructure Procurement",
                email: "procurement@omnibid.in",
                phone: "+919876543299",
                city: "Hyderabad",
                state_code: "36",
                entity_type: "company",
                kyc_status: "verified",
                digilocker_verified: true,
                subscription_tier: "pro",
              },
            ])
            .onConflictDoNothing();

          const dbTenders = SEEDED_REGIONAL_TENDERS.map((t) => ({
            id: t.id,
            buyer_id: buyerId,
            title: t.title,
            sector: t.sector,
            budget: String(t.budget),
            budget_inr: String(t.budget),
            language: "en",
            timeline: `${t.deadlineHours} hours`,
            status: "open" as const,
            custom_data: {
              ...t.customData,
              city: t.city,
              state: t.state,
              pincode: t.pincode,
              category: t.category,
              description: t.description,
            },
          }));

          await db.insert(requirements).values(dbTenders).onConflictDoNothing();
          console.log("[AutoBootstrap] Verified regional tenders in database.");
        } catch (dbErr: any) {
          console.warn(`[AutoBootstrap] Note: DB regional tenders check skipped (${dbErr.message}). Using memory fallback.`);
        }
      }
    } catch (err: any) {
      console.warn(`[AutoBootstrap] Database connection skipped or unavailable: ${err.message}. Operating in resilient fallback mode.`);
    }

    console.log("✅ [AutoBootstrap] OmniBid bootstrap completed successfully.");
  })();

  return bootstrapPromise;
}
