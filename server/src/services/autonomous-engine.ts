import crypto from "crypto";
import { lookupPinCode } from "./smart-parser.service.js";
import {
  calculateGstinChecksum,
  validateGSTIN,
  type GstinValidationResult,
} from "../lib/gstin-tds.js";
import { broadcastDeal } from "./auto-broadcaster.js";
import { notifyOutbid } from "./push-notification.service.js";
import {
  broadcastAuctionEvent,
  extendedAuctions,
} from "../routes/auction.js";
import { SEEDED_AFFILIATE_OFFERS } from "../routes/affiliate.js";
import { type AffiliateOffer } from "../db/schema.js";
import { db, requirementsTable, usersTable, bidsTable, categoriesTable } from "@omnibid/db";
import { eq, and, sql } from "drizzle-orm";
import { getRegionalTenders, getRegionalTenderById, registerRegionalTender, type RegionalTender } from "./auto-bootstrap.js";

/**
 * Ensures valid 15-character Mod-36 GSTIN with calculated checksum.
 */
export function ensureValidGstin(base14: string): string {
  const clean14 = base14.trim().toUpperCase().substring(0, 14);
  const checksum = calculateGstinChecksum(clean14);
  return `${clean14}${checksum}`;
}

export interface CommercialTenderBlueprint {
  id?: string;
  title: string;
  description: string;
  category: string;
  sector: "IT" | "Construction" | "Logistics" | "Legal";
  pincode: string;
  budget: number;
  deadlineHours: number;
  buyerName: string;
  buyerGstinBase: string; // 14-char base
  customData: Record<string, any>;
}

/**
 * Rotating commercial tender repository across 6 primary Indian B2B sectors:
 * 1. Cement & RMC (Ultratech, ACC, Dalmia)
 * 2. TMT Rebars & Structural Steel (JSW, Tata Tiscon, SAIL)
 * 3. Industrial Cables & Electrical Switchgear (Polycab, Havells)
 * 4. Heavy Equipment & JCB Excavator Rental (Infra.Market, CAT)
 * 5. Commercial CPVC Plumbing & Fire Hydrants (Astral, Ashirvad)
 * 6. Logistics & Intercity Freight (Porter Enterprise, VRL)
 */
export const HARVESTED_COMMERCIAL_TENDERS: CommercialTenderBlueprint[] = [
  // 1. Cement & RMC (Ultratech, ACC, Dalmia)
  {
    title: "Supply of 1,200 Bags UltraTech Super PPC Cement for Metro Pillar Foundation",
    description: "Procurement of 1,200 bags (50kg each) UltraTech Super PPC cement conforming to IS 1489 Part 1 for Metro corridor pile caps and pier casting with fast-track batch delivery.",
    category: "construction",
    sector: "Construction",
    pincode: "500081", // Hyderabad, Telangana
    budget: 468000,
    deadlineHours: 48,
    buyerName: "Deccan Metro Infrastructure Pvt Ltd",
    buyerGstinBase: "36AAACD1234F1Z",
    customData: {
      brand: "UltraTech Cement",
      grade: "Super PPC IS 1489",
      quantity: 1200,
      unit: "Bags",
      project: "HITEC City Metro Extension Corridor",
    },
  },
  {
    title: "ACC Ready-Mix Concrete (RMC) M35 Grade 850 CuM for Bandra IT Park",
    description: "Supply of 850 CuM ACC M35 Grade RMC with slump retention admixtures and continuous transit mixer batching for commercial IT building foundation and shear wall casting.",
    category: "construction",
    sector: "Construction",
    pincode: "400051", // Mumbai, Maharashtra
    budget: 3825000,
    deadlineHours: 72,
    buyerName: "WestCoast Commercial Spaces LLP",
    buyerGstinBase: "27AAAFW9876C1Z",
    customData: {
      brand: "ACC Concrete",
      grade: "M35 RMC",
      quantity: 850,
      unit: "CuM",
      project: "Bandra Commercial IT Tower",
    },
  },
  {
    title: "Dalmia DSP Superior Cement 2,500 Bags for Flyover Ramp Casting",
    description: "Bulk procurement of 2,500 bags of Dalmia DSP Cement for high early-strength flyover bridge deck and approach ramp concrete casting with test certificates.",
    category: "construction",
    sector: "Construction",
    pincode: "600001", // Chennai, Tamil Nadu
    budget: 975000,
    deadlineHours: 36,
    buyerName: "Southern Urban Developers Ltd",
    buyerGstinBase: "33AAACS5555B1Z",
    customData: {
      brand: "Dalmia DSP",
      quantity: 2500,
      unit: "Bags",
      project: "Chennai Outer Ring Road Flyover",
    },
  },

  // 2. TMT Rebars & Structural Steel (JSW, Tata Tiscon, SAIL)
  {
    title: "Supply of 120 MT JSW Fe 550D TMT Steel Rebars for Commercial High-Rise",
    description: "Procurement of 120 Metric Tonnes of JSW Neosteel Fe 550D primary TMT rebars (12mm, 16mm, 20mm, 25mm) with mill test certificates conforming to IS 1786.",
    category: "steel",
    sector: "Construction",
    pincode: "560001", // Bengaluru, Karnataka
    budget: 3650000,
    deadlineHours: 48,
    buyerName: "Karnataka Metro Constructions LLP",
    buyerGstinBase: "29AAAFK1111A1Z",
    customData: {
      brand: "JSW Neosteel",
      grade: "Fe 550D",
      quantity: 120,
      unit: "MT",
      project: "Bengaluru Tech Hub Phase 2",
    },
  },
  {
    title: "Tata Tiscon Super Ductile TMT Rebars 45 MT for Industrial Warehouse",
    description: "Delivery of 45 MT Tata Tiscon 550D grade earthquake-resistant TMT rebars for industrial warehouse foundation plinth and PEB column anchor footings.",
    category: "steel",
    sector: "Construction",
    pincode: "380001", // Ahmedabad, Gujarat
    budget: 1840000,
    deadlineHours: 60,
    buyerName: "Gujarat Logistics Hub Pvt Ltd",
    buyerGstinBase: "24AAACG3333E1Z",
    customData: {
      brand: "Tata Steel Tiscon",
      grade: "550D Super Ductile",
      quantity: 45,
      unit: "MT",
      project: "Sanand Industrial Logistics Depot",
    },
  },
  {
    title: "SAIL Structural Steel Beams & ISMB 400 Channels for Port Logistics Depot",
    description: "Supply of 60 MT SAIL primary structural steel beams, ISMB 400 joists, and equal angles conforming to IS 2062 E250 for deepwater port terminal warehouse.",
    category: "steel",
    sector: "Construction",
    pincode: "530035", // Visakhapatnam, Andhra Pradesh
    budget: 2980000,
    deadlineHours: 96,
    buyerName: "Andhra Coastal Engineering Works",
    buyerGstinBase: "37AAACA7777D1Z",
    customData: {
      brand: "SAIL",
      spec: "ISMB 400 / IS 2062",
      quantity: 60,
      unit: "MT",
      project: "Vizag Port Deepwater Terminal",
    },
  },

  // 3. Industrial Cables & Electrical Switchgear (Polycab, Havells)
  {
    title: "Polycab 11kV HT XLPE Armoured Aluminum 3-Core Power Cables (4,000 Metres)",
    description: "Supply of 4,000 Metres Polycab 11kV cross-linked polyethylene insulated armoured power transmission cable for industrial sub-station yard grid.",
    category: "electrical",
    sector: "IT",
    pincode: "201301", // Noida, Uttar Pradesh
    budget: 1680000,
    deadlineHours: 40,
    buyerName: "NCR Power Infrastructure Corp",
    buyerGstinBase: "09AAACN4444F1Z",
    customData: {
      brand: "Polycab",
      spec: "11kV HT XLPE 3-Core",
      quantity: 4000,
      unit: "Metres",
      project: "Noida Sector 62 Sub-station Upgrade",
    },
  },
  {
    title: "Havells Industrial Switchgear & Motor Control Center Panels for Pharma Facility",
    description: "Procurement of Havells air circuit breakers (ACB), MCCB distribution boards, and modular motor control centers for biotech fermentation facility.",
    category: "electrical",
    sector: "IT",
    pincode: "500081", // Hyderabad, Telangana
    budget: 2250000,
    deadlineHours: 54,
    buyerName: "Telangana Life Sciences Infra Pvt Ltd",
    buyerGstinBase: "36AAACT8888H1Z",
    customData: {
      brand: "Havells",
      type: "ACB & MCCB MCC Panels",
      project: "Genome Valley Phase 3 Cleanroom Expansion",
    },
  },

  // 4. Heavy Equipment & JCB Excavator Rental (Infra.Market, CAT)
  {
    title: "Infra.Market Heavy JCB 3DX & 20-Ton Crawler Excavator 90-Day Wet Lease Rental",
    description: "Wet lease rental of 2 JCB 3DX backhoe loaders and 1 20-ton tracked hydraulic excavator including licensed operators, fuel allowances, and routine site maintenance.",
    category: "machinery",
    sector: "Construction",
    pincode: "560100", // Bengaluru, Karnataka
    budget: 1420000,
    deadlineHours: 72,
    buyerName: "Silicon Valley Tech Parks Pvt Ltd",
    buyerGstinBase: "29AAACS6666J1Z",
    customData: {
      equipment: "2x JCB 3DX + 1x 20T Excavator",
      leasePeriod: "90 Days Wet Lease",
      project: "Electronic City Campus Earthworks",
    },
  },
  {
    title: "CAT 320D Hydraulic Excavator & Soil Compactor Rental for Ring Road Expansion",
    description: "60-day lease of Caterpillar 320D heavy crawler excavator and vibratory soil roller for arterial ring road subgrade compaction and earthmoving.",
    category: "machinery",
    sector: "Construction",
    pincode: "400051", // Mumbai, Maharashtra
    budget: 1950000,
    deadlineHours: 60,
    buyerName: "Mumbai Infrastructure Projects Ltd",
    buyerGstinBase: "27AAACM2222K1Z",
    customData: {
      equipment: "CAT 320D Excavator + Vibratory Compactor",
      leasePeriod: "60 Days",
      project: "Mumbai Coastal Road Linking Project",
    },
  },

  // 5. Commercial CPVC Plumbing & Fire Hydrants (Astral, Ashirvad)
  {
    title: "Astral SDR 11 & SDR 13.5 Commercial CPVC Plumbing Grid for 500-Bed Hospital",
    description: "Supply of Astral CPVC Pro pipes and brass fittings (15mm to 100mm) for high-temperature potable water circulation in multispecialty hospital.",
    category: "commercial_plumbing",
    sector: "Construction",
    pincode: "110001", // New Delhi
    budget: 890000,
    deadlineHours: 36,
    buyerName: "Capital Healthcare Infrastructure Ltd",
    buyerGstinBase: "07AAACC9999M1Z",
    customData: {
      brand: "Astral CPVC Pro",
      spec: "SDR 11 / SDR 13.5",
      project: "Central Delhi Super Specialty Hospital",
    },
  },
  {
    title: "Ashirvad High-Pressure Fire Hydrant Piping Network & Standpipe System",
    description: "Turnkey supply of Ashirvad fire hydrant GI pipes, landing valves, hose reels, and booster pumps conforming to NBC 2016 Part 4 for commercial mall.",
    category: "industrial_safety",
    sector: "Construction",
    pincode: "700001", // Kolkata, West Bengal
    budget: 1275000,
    deadlineHours: 48,
    buyerName: "Eastern Commercial Real Estate LLP",
    buyerGstinBase: "19AAAFE1212P1Z",
    customData: {
      brand: "Ashirvad Fire Protection",
      compliance: "NBC 2016 Part 4 / NFPA",
      project: "Kolkata Central Commercial Complex",
    },
  },

  // 6. Logistics & Intercity Freight (Porter Enterprise, VRL)
  {
    title: "Porter Enterprise Dedicated 32-Foot Multi-Axle Container Fleets (50 Trips Delhi-Mumbai)",
    description: "Contract for 50 intercity trips of 32-foot multi-axle MXL closed containers with real-time GPS tracking, electronic proof of delivery, and transit insurance.",
    category: "logistics",
    sector: "Logistics",
    pincode: "110001", // New Delhi
    budget: 2400000,
    deadlineHours: 72,
    buyerName: "North-South Cargo Solutions Pvt Ltd",
    buyerGstinBase: "07AAACN5555R1Z",
    customData: {
      carrier: "Porter Enterprise",
      fleet: "32-Foot MXL Containers (50 Trips)",
      route: "Delhi NCR to Mumbai Bhiwandi",
    },
  },
  {
    title: "VRL Logistics Intercity Heavy Machinery Transport (Bengaluru to Hyderabad)",
    description: "Intercity freight transportation of oversized precision machinery using 40-foot low-bed hydraulic trailers with route surveys and transit risk coverage.",
    category: "logistics",
    sector: "Logistics",
    pincode: "560001", // Bengaluru, Karnataka
    budget: 680000,
    deadlineHours: 30,
    buyerName: "Deccan Express Cargo Logistics",
    buyerGstinBase: "29AAACD3434S1Z",
    customData: {
      carrier: "VRL Logistics",
      type: "Low-bed Hydraulic Trailers",
      route: "Peenya Industrial Area to HITEC City",
    },
  },
];

// In-memory rotating self-driving tenders store
export const selfDrivingTendersMap = new Map<string, any>();
let tenderHarvestIndex = 0;

/**
 * Finds top contextual affiliate offers matching a tender's keywords and category.
 */
export function matchContextualOffers(tender: {
  title: string;
  category: string;
  sector?: string;
}): AffiliateOffer[] {
  const text = `${tender.title} ${tender.category} ${tender.sector || ""}`.toLowerCase();

  const scored = SEEDED_AFFILIATE_OFFERS.map((offer) => {
    let score = 0;
    for (const kw of offer.category_keywords) {
      if (text.includes(kw.toLowerCase())) {
        score += 2;
      }
    }
    if (offer.title.toLowerCase().includes(tender.category.toLowerCase())) {
      score += 3;
    }
    return { offer, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // Return top 2 offers, falling back to first 2 active offers
  const top2 = scored.filter((s) => s.score > 0).slice(0, 2).map((s) => s.offer);
  if (top2.length < 2) {
    const active = SEEDED_AFFILIATE_OFFERS.filter((o) => o.active);
    for (const o of active) {
      if (!top2.some((t) => t.id === o.id)) {
        top2.push(o);
        if (top2.length >= 2) break;
      }
    }
  }

  return top2;
}

let dbHealthState = {
  isHealthy: true,
  lastChecked: 0,
};

async function safeDbQuery<T>(queryFn: () => Promise<T>, fallback: T, timeoutMs = 250): Promise<T> {
  const now = Date.now();
  if (!process.env.DATABASE_URL) return fallback;
  if (!dbHealthState.isHealthy && now - dbHealthState.lastChecked < 60000) {
    return fallback;
  }

  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("DB timeout")), timeoutMs);
  });

  try {
    const result = await Promise.race([queryFn(), timeoutPromise]);
    dbHealthState.isHealthy = true;
    dbHealthState.lastChecked = now;
    return result;
  } catch {
    dbHealthState.isHealthy = false;
    dbHealthState.lastChecked = now;
    return fallback;
  } finally {
    clearTimeout(timer!);
  }
}

/**
 * Counts total active requirements in DB or in-memory store.
 */
export async function getActiveTendersCount(): Promise<number> {
  const dbRows = await safeDbQuery(
    async () =>
      db
        .select({ id: requirementsTable.id })
        .from(requirementsTable)
        .where(eq(requirementsTable.status, "open")),
    []
  );
  const memoryCount = selfDrivingTendersMap.size + getRegionalTenders().length;
  return Math.max(dbRows.length, memoryCount);
}

export interface ReplenishmentResult {
  replenishedCount: number;
  activeTendersCount: number;
  newTenders: any[];
}

/**
 * Tender Harvester & Rolling Replenisher:
 * Checks active requirements count. If < 8, automatically generates and publishes fresh Indian B2B requirements.
 * - Valid 6-digit PIN code + city + state (via lookupPinCode)
 * - Mod-36 GST-verified corporate/proprietor buyer name and GSTIN
 * - Realistic commercial budget (₹1,50,000 to ₹45,00,000)
 * - Sets auctionEndsAt to future (e.g. 2 to 48 hours)
 * - Matches top 2 contextual affiliate offers
 * - Automatically fires the non-blocking Telegram deal broadcast (broadcastDeal)
 */
export async function replenishTendersIfNeeded(targetThreshold: number = 8): Promise<ReplenishmentResult> {
  const currentActiveCount = await getActiveTendersCount();
  const newTenders: any[] = [];

  if (currentActiveCount >= targetThreshold) {
    return {
      replenishedCount: 0,
      activeTendersCount: currentActiveCount,
      newTenders: [],
    };
  }

  const countToGenerate = targetThreshold - currentActiveCount;
  const now = Date.now();

  for (let i = 0; i < countToGenerate; i++) {
    const blueprint = HARVESTED_COMMERCIAL_TENDERS[tenderHarvestIndex % HARVESTED_COMMERCIAL_TENDERS.length];
    tenderHarvestIndex++;

    const tenderId = crypto.randomUUID();
    const pinData = lookupPinCode(blueprint.pincode);
    const verifiedGstin = ensureValidGstin(blueprint.buyerGstinBase);
    const gstinValidation: GstinValidationResult = validateGSTIN(verifiedGstin);

    // Realistic deadline between 2 and 48 hours
    const deadlineHours = Math.max(2, Math.min(48, blueprint.deadlineHours || 24));
    const auctionEndsAt = new Date(now + deadlineHours * 3600 * 1000).toISOString();

    const matchedOffers = matchContextualOffers({
      title: blueprint.title,
      category: blueprint.category,
      sector: blueprint.sector,
    });

    const newTender = {
      id: tenderId,
      title: blueprint.title,
      description: blueprint.description,
      category: blueprint.category,
      sector: blueprint.sector,
      city: pinData.city || "Hyderabad",
      state: pinData.state || "Telangana",
      pincode: blueprint.pincode,
      budget: blueprint.budget,
      maxBudget: blueprint.budget,
      deadlineHours,
      auctionEndsAt,
      status: "open" as const,
      buyerName: blueprint.buyerName,
      buyerGstin: verifiedGstin,
      buyerEntityType: gstinValidation.entityType || "Company",
      tdsRate: gstinValidation.tdsRate,
      matchedOffers: matchedOffers.slice(0, 2),
      customData: {
        ...blueprint.customData,
        source: "autonomous_tender_harvester",
        gstVerified: gstinValidation.isValid,
        replenishedAt: new Date().toISOString(),
      },
      createdAt: new Date().toISOString(),
    };

    // Store in-memory
    selfDrivingTendersMap.set(tenderId, newTender);
    registerRegionalTender({
      id: tenderId,
      title: newTender.title,
      description: newTender.description,
      city: newTender.city,
      state: newTender.state,
      pincode: newTender.pincode,
      budget: newTender.budget,
      category: newTender.category,
      sector: newTender.sector,
      deadlineHours: newTender.deadlineHours,
      auctionEndsAt: newTender.auctionEndsAt,
      status: "open",
      customData: newTender.customData,
      createdAt: newTender.createdAt,
    });

    // Fire non-blocking Telegram broadcast alert
    const primaryOffer = matchedOffers[0] || null;
    broadcastDeal(newTender, null, primaryOffer).catch((err) =>
      console.warn("[AutonomousEngine] Telegram broadcast skipped:", err?.message || err)
    );

    newTenders.push(newTender);
  }

  // Attempt batch DB insertion if DB connection is active
  await safeDbQuery(async () => {
    const buyerId = "00000000-0000-0000-0000-000000000099";
    const cats = await db.select().from(categoriesTable).limit(1);
    const categoryId = cats.length > 0 ? cats[0].id : null;
    if (categoryId && newTenders.length > 0) {
      await db.insert(requirementsTable).values(
        newTenders.map((t) => ({
          id: t.id,
          buyerId,
          categoryId,
          title: t.title,
          description: t.description,
          city: t.city,
          state: t.state,
          pincode: t.pincode,
          maxBudget: String(t.budget),
          deadlineHours: t.deadlineHours,
          auctionEndsAt: new Date(t.auctionEndsAt),
          status: "open" as const,
          customData: t.customData,
        }))
      ).onConflictDoNothing();
    }
  }, null);

  const updatedActiveCount = await getActiveTendersCount();

  return {
    replenishedCount: newTenders.length,
    activeTendersCount: updatedActiveCount,
    newTenders,
  };
}

export interface LiveBiddingSimulationResult {
  simulatedBidsCount: number;
  newL1Amount: number;
  outbidContractor: string;
  extended: boolean;
  bids: Array<{
    rank: "L1" | "L2" | "L3";
    bidId: string;
    contractorName: string;
    gstin: string;
    bidAmount: number;
    tdsRatePct: number;
  }>;
}

/**
 * War Room Liquidity Pacer:
 * Simulates 3 verified regional contractors live in the auction war room:
 * 1. Contractor A (Venkateshwara Infra Corp - Hyderabad, GST 36AAACB1234C1Z1, Corporate 2% TDS) drops price by 1.5% -> Captures L1.
 * 2. Contractor B (Shree Ganesh Enterprises - Mumbai, GST 27AAAPL5555C1Z2, Individual 1% TDS) drops price by 2.2% -> Reclaims L1,
 *    triggers Anti-Sniping +120s extension if within 120s, and triggers VAPID Outbid Alert to Contractor A.
 * 3. Contractor C (Bengaluru Civil Works LLP, GST 29AAAFB9999C1Z3, LLP 2% TDS) places competitive bid.
 * Broadcasts SNAPSHOT_SYNC and AUCTION_EXTENDED over active SSE clients.
 */
export async function simulateLiveBidding(
  requirementId: string,
  options?: { forceAntiSniping?: boolean }
): Promise<LiveBiddingSimulationResult> {
  const reqId = String(requirementId);

  // 1. Fetch requirement from DB or in-memory repositories
  let requirement: any = selfDrivingTendersMap.get(reqId) || getRegionalTenderById(reqId);

  if (!requirement) {
    const dbRow = await safeDbQuery(
      async () => {
        const [row] = await db
          .select()
          .from(requirementsTable)
          .where(eq(requirementsTable.id, reqId));
        return row;
      },
      null
    );
    if (dbRow) {
      requirement = {
        id: dbRow.id,
        title: dbRow.title,
        description: dbRow.description,
        city: dbRow.city,
        state: dbRow.state,
        pincode: dbRow.pincode,
        maxBudget: Number(dbRow.maxBudget),
        budget: Number(dbRow.maxBudget),
        auctionEndsAt: dbRow.auctionEndsAt.toISOString(),
        status: dbRow.status,
      };
    }
  }

  // Fallback demo requirement if not found
  if (!requirement) {
    requirement = {
      id: reqId,
      title: "Commercial Infrastructure Procurement",
      description: "Bulk commercial procurement and installation tender with verified escrow.",
      city: "Hyderabad",
      state: "Telangana",
      pincode: "500081",
      budget: 2400000,
      maxBudget: 2400000,
      auctionEndsAt: new Date(Date.now() + 60 * 1000).toISOString(), // 60s remaining to trigger anti-sniping
      status: "open",
    };
    selfDrivingTendersMap.set(reqId, requirement);
  }

  const baseBudget = Number(requirement.maxBudget || requirement.budget || 2400000);

  // Fetch current lowest bid if available
  let currentL1 = baseBudget;
  const lowestBid = await safeDbQuery(
    async () => {
      const [lowest] = await db
        .select({ bidAmount: bidsTable.bidAmount })
        .from(bidsTable)
        .where(and(eq(bidsTable.requirementId, reqId), sql`${bidsTable.status} not in ('withdrawn', 'rejected')`))
        .orderBy(sql`${bidsTable.bidAmount} ASC`)
        .limit(1);
      return lowest ? Number(lowest.bidAmount) : null;
    },
    null
  );
  if (lowestBid !== null) {
    currentL1 = lowestBid;
  }

  // 2. Contractor A: "Venkateshwara Infra Corp - Hyderabad" (Corporate 2% TDS)
  // Drops price by 1.5% -> Captures L1
  const contractorA = {
    id: "a1111111-1111-4111-a111-111111111111",
    name: "Venkateshwara Infra Corp - Hyderabad",
    gstin: ensureValidGstin("36AAACB1234C1Z"),
    city: "Hyderabad",
    trustScore: 94,
    tdsRatePct: 2,
  };
  const priceA = Math.round(currentL1 * 0.985);
  const bidAId = `bid_sim_a_${Date.now()}`;

  // Emit SSE: Contractor A captures L1
  broadcastAuctionEvent(reqId, "NEW_L1_BID", {
    requirementId: reqId,
    bidId: bidAId,
    amount: priceA,
    providerId: contractorA.id,
    providerName: contractorA.name,
    timestamp: new Date().toISOString(),
  });

  // 3. Contractor B: "Shree Ganesh Enterprises - Mumbai" (Individual 1% TDS)
  // Drops price by 2.2% below Contractor A -> Reclaims L1
  const contractorB = {
    id: "b2222222-2222-4222-b222-222222222222",
    name: "Shree Ganesh Enterprises - Mumbai",
    gstin: ensureValidGstin("27AAAPL5555C1Z"),
    city: "Mumbai",
    trustScore: 97,
    tdsRatePct: 1,
  };
  const priceB = Math.round(priceA * 0.978);
  const bidBId = `bid_sim_b_${Date.now()}`;

  // Check Anti-Sniping condition (within 120s of auctionEndsAt)
  const now = Date.now();
  const endsAtMs = requirement.auctionEndsAt
    ? new Date(requirement.auctionEndsAt).getTime()
    : now + 60 * 1000;
  const remainingSeconds = Math.max(0, Math.floor((endsAtMs - now) / 1000));
  const isWithin120s = remainingSeconds <= 120 || options?.forceAntiSniping === true;
  let extended = false;

  if (isWithin120s) {
    const newEndsAt = new Date(now + 120 * 1000);
    requirement.auctionEndsAt = newEndsAt.toISOString();
    extendedAuctions.add(reqId);
    extended = true;

    // Persist new deadline if in DB
    safeDbQuery(async () => {
      await db
        .update(requirementsTable)
        .set({ auctionEndsAt: newEndsAt })
        .where(eq(requirementsTable.id, reqId));
    }, null).catch(() => {});

    // Emit AUCTION_EXTENDED event
    broadcastAuctionEvent(reqId, "AUCTION_EXTENDED", {
      requirementId: reqId,
      newAuctionEndsAt: newEndsAt.toISOString(),
      remainingSeconds: 120,
      extendedBySeconds: 120,
      triggeredByBidId: bidBId,
      newL1Amount: priceB,
      reason: "Anti-sniping auto extension triggered within final 120 seconds",
      timestamp: new Date().toISOString(),
    });
  }

  // Trigger VAPID Outbid Alert to Contractor A
  notifyOutbid(reqId, contractorA.id, priceB, requirement.title).catch((err) =>
    console.warn("[AutonomousEngine] Outbid alert error:", err?.message || err)
  );

  // Emit SSE: Contractor B captures L1
  broadcastAuctionEvent(reqId, "NEW_L1_BID", {
    requirementId: reqId,
    bidId: bidBId,
    amount: priceB,
    providerId: contractorB.id,
    providerName: contractorB.name,
    timestamp: new Date().toISOString(),
  });

  // 4. Contractor C: "Bengaluru Civil Works LLP" (LLP 2% TDS)
  // Places competitive bid
  const contractorC = {
    id: "c3333333-3333-4333-c333-333333333333",
    name: "Bengaluru Civil Works LLP",
    gstin: ensureValidGstin("29AAAFB9999C1Z"),
    city: "Bengaluru",
    trustScore: 92,
    tdsRatePct: 2,
  };
  const priceC = Math.round((priceA + priceB) / 2);
  const bidCId = `bid_sim_c_${Date.now()}`;

  // 5. Assemble synchronized leaderboard (L1: B, L2: C, L3: A)
  const leaderboard = [
    {
      rank: "L1" as const,
      bidId: bidBId,
      providerId: contractorB.id,
      providerName: contractorB.name,
      providerTrustScore: contractorB.trustScore,
      providerIsVerified: true,
      providerCity: contractorB.city,
      hasGstin: true,
      bidAmount: priceB,
      createdAt: new Date().toISOString(),
    },
    {
      rank: "L2" as const,
      bidId: bidCId,
      providerId: contractorC.id,
      providerName: contractorC.name,
      providerTrustScore: contractorC.trustScore,
      providerIsVerified: true,
      providerCity: contractorC.city,
      hasGstin: true,
      bidAmount: priceC,
      createdAt: new Date().toISOString(),
    },
    {
      rank: "L3" as const,
      bidId: bidAId,
      providerId: contractorA.id,
      providerName: contractorA.name,
      providerTrustScore: contractorA.trustScore,
      providerIsVerified: true,
      providerCity: contractorA.city,
      hasGstin: true,
      bidAmount: priceA,
      createdAt: new Date().toISOString(),
    },
  ];

  // 6. Broadcast event: SNAPSHOT_SYNC over active SSE clients
  const snapshotPayload = {
    leaderboard,
    totalBids: 3,
    remainingSeconds: extended ? 120 : remainingSeconds,
    extended: extendedAuctions.has(reqId) || extended,
    currentL1: priceB,
    timestamp: new Date().toISOString(),
  };

  broadcastAuctionEvent(reqId, "SNAPSHOT_SYNC", snapshotPayload);

  return {
    simulatedBidsCount: 3,
    newL1Amount: priceB,
    outbidContractor: contractorA.name,
    extended: extended || extendedAuctions.has(reqId),
    bids: [
      {
        rank: "L1",
        bidId: bidBId,
        contractorName: contractorB.name,
        gstin: contractorB.gstin,
        bidAmount: priceB,
        tdsRatePct: contractorB.tdsRatePct,
      },
      {
        rank: "L2",
        bidId: bidCId,
        contractorName: contractorC.name,
        gstin: contractorC.gstin,
        bidAmount: priceC,
        tdsRatePct: contractorC.tdsRatePct,
      },
      {
        rank: "L3",
        bidId: bidAId,
        contractorName: contractorA.name,
        gstin: contractorA.gstin,
        bidAmount: priceA,
        tdsRatePct: contractorA.tdsRatePct,
      },
    ],
  };
}

// Background Pacer / Interval: runs tender replenishment check every 14 minutes
let replenishmentInterval: NodeJS.Timeout | null = null;

export function startAutonomousReplenisher(intervalMs: number = 14 * 60 * 1000): void {
  if (replenishmentInterval) return;
  replenishmentInterval = setInterval(() => {
    replenishTendersIfNeeded().catch((err) =>
      console.warn("[AutonomousEngine] Periodic replenishment error:", err)
    );
  }, intervalMs);
  replenishmentInterval.unref(); // Ensure unref so background timer does not hold test processes open
}

export function stopAutonomousReplenisher(): void {
  if (replenishmentInterval) {
    clearInterval(replenishmentInterval);
    replenishmentInterval = null;
  }
}
