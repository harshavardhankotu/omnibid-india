import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "http";
import app from "../../server/src/app.js";
import {
  replenishTendersIfNeeded,
  simulateLiveBidding,
  getActiveTendersCount,
  HARVESTED_COMMERCIAL_TENDERS,
  startAutonomousReplenisher,
  stopAutonomousReplenisher,
  ensureValidGstin,
} from "../../server/src/services/autonomous-engine.js";
import { lookupPinCode } from "../../server/src/services/smart-parser.service.js";
import { validateGSTIN } from "../../server/src/lib/gstin-tds.js";
import { extendedAuctions } from "../../server/src/routes/auction.js";
import { getRecentBroadcasts } from "../../server/src/services/auto-broadcaster.js";

describe("Step 3: Self-Driving Marketplace Automations & Autonomous Engine", { timeout: 15000 }, () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (address && typeof address === "object") {
          baseUrl = `http://127.0.0.1:${address.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    stopAutonomousReplenisher();
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  describe("1. Rotating Commercial Tender Harvester Repository", () => {
    it("includes commercial tenders across all 6 core Indian B2B sectors", () => {
      expect(HARVESTED_COMMERCIAL_TENDERS.length).toBeGreaterThanOrEqual(10);

      const titles = HARVESTED_COMMERCIAL_TENDERS.map((t) => t.title);

      // Cement & RMC (Ultratech, ACC, Dalmia)
      expect(titles.some((t) => t.includes("UltraTech") || t.includes("Cement"))).toBe(true);
      expect(titles.some((t) => t.includes("ACC") || t.includes("RMC"))).toBe(true);
      expect(titles.some((t) => t.includes("Dalmia"))).toBe(true);

      // TMT Rebars & Structural Steel (JSW, Tata Tiscon, SAIL)
      expect(titles.some((t) => t.includes("JSW") || t.includes("TMT"))).toBe(true);
      expect(titles.some((t) => t.includes("Tata Tiscon"))).toBe(true);
      expect(titles.some((t) => t.includes("SAIL"))).toBe(true);

      // Industrial Cables & Electrical Switchgear (Polycab, Havells)
      expect(titles.some((t) => t.includes("Polycab"))).toBe(true);
      expect(titles.some((t) => t.includes("Havells"))).toBe(true);

      // Heavy Equipment & JCB Excavator Rental (Infra.Market, CAT)
      expect(titles.some((t) => t.includes("Infra.Market") || t.includes("JCB"))).toBe(true);
      expect(titles.some((t) => t.includes("CAT") || t.includes("Excavator"))).toBe(true);

      // Commercial CPVC Plumbing & Fire Hydrants (Astral, Ashirvad)
      expect(titles.some((t) => t.includes("Astral") || t.includes("CPVC"))).toBe(true);
      expect(titles.some((t) => t.includes("Ashirvad") || t.includes("Fire Hydrant"))).toBe(true);

      // Logistics & Intercity Freight (Porter Enterprise, VRL)
      expect(titles.some((t) => t.includes("Porter Enterprise") || t.includes("Freight"))).toBe(true);
      expect(titles.some((t) => t.includes("VRL Logistics") || t.includes("Transport"))).toBe(true);
    });

    it("verifies all tender blueprints have valid PIN codes and budgets between ₹1.5L and ₹45L", () => {
      for (const tender of HARVESTED_COMMERCIAL_TENDERS) {
        expect(tender.budget).toBeGreaterThanOrEqual(150000);
        expect(tender.budget).toBeLessThanOrEqual(4500000);

        const pinResult = lookupPinCode(tender.pincode);
        expect(pinResult.valid).toBe(true);
        expect(pinResult.city.length).toBeGreaterThan(0);
        expect(pinResult.state.length).toBeGreaterThan(0);
      }
    });

    it("ensures Mod-36 checksum generation creates valid corporate & proprietor GSTINs", () => {
      for (const tender of HARVESTED_COMMERCIAL_TENDERS) {
        const fullGstin = ensureValidGstin(tender.buyerGstinBase);
        expect(fullGstin).toHaveLength(15);
        const validation = validateGSTIN(fullGstin);
        expect(validation.isValid).toBe(true);
        expect(validation.stateName).toBeDefined();
        expect([0.01, 0.02]).toContain(validation.tdsRate);
      }
    });
  });

  describe("2. Rolling Replenisher & Contextual Deal Broadcast Engine", () => {
    it("replenishes tenders up to threshold when active count < 8", async () => {
      const result = await replenishTendersIfNeeded(8);

      expect(result).toBeDefined();
      expect(result.activeTendersCount).toBeGreaterThanOrEqual(8);

      if (result.replenishedCount > 0) {
        expect(result.newTenders.length).toBe(result.replenishedCount);
        const first = result.newTenders[0];
        expect(first.id).toBeDefined();
        expect(first.title).toBeDefined();
        expect(first.budget).toBeGreaterThanOrEqual(150000);
        expect(first.budget).toBeLessThanOrEqual(4500000);
        expect(new Date(first.auctionEndsAt).getTime()).toBeGreaterThan(Date.now());
        expect(first.buyerGstin).toBeDefined();
        expect(validateGSTIN(first.buyerGstin).isValid).toBe(true);
        expect(first.matchedOffers).toHaveLength(2);
      }
    });

    it("does not over-replenish if active count already meets threshold", async () => {
      const activeBefore = await getActiveTendersCount();
      const result = await replenishTendersIfNeeded(activeBefore);

      expect(result.replenishedCount).toBe(0);
      expect(result.newTenders).toHaveLength(0);
      expect(result.activeTendersCount).toBe(activeBefore);
    });

    it("starts and stops background replenisher pacer interval safely", () => {
      startAutonomousReplenisher(14 * 60 * 1000);
      // Calling start again is idempotent
      startAutonomousReplenisher(14 * 60 * 1000);
      stopAutonomousReplenisher();
    });
  });

  describe("3. War Room Liquidity Pacer (simulateLiveBidding)", () => {
    it("simulates 3 competitive contractors with L1 flips, anti-sniping extension, and outbid alerts", async () => {
      const testReqId = "req-war-room-test-001";
      const result = await simulateLiveBidding(testReqId, { forceAntiSniping: true });

      expect(result.simulatedBidsCount).toBe(3);
      expect(result.newL1Amount).toBeGreaterThan(0);
      expect(result.outbidContractor).toBe("Venkateshwara Infra Corp - Hyderabad");
      expect(result.extended).toBe(true);
      expect(extendedAuctions.has(testReqId)).toBe(true);

      // Verify contractor breakdown:
      // L1: Contractor B (Shree Ganesh Enterprises - Mumbai)
      // L2: Contractor C (Bengaluru Civil Works LLP)
      // L3: Contractor A (Venkateshwara Infra Corp - Hyderabad)
      expect(result.bids).toHaveLength(3);
      const [b1, b2, b3] = result.bids;

      expect(b1.rank).toBe("L1");
      expect(b1.contractorName).toBe("Shree Ganesh Enterprises - Mumbai");
      expect(b1.tdsRatePct).toBe(1); // Individual 1% TDS
      expect(validateGSTIN(b1.gstin).isValid).toBe(true);

      expect(b2.rank).toBe("L2");
      expect(b2.contractorName).toBe("Bengaluru Civil Works LLP");
      expect(b2.tdsRatePct).toBe(2); // LLP 2% TDS
      expect(validateGSTIN(b2.gstin).isValid).toBe(true);

      expect(b3.rank).toBe("L3");
      expect(b3.contractorName).toBe("Venkateshwara Infra Corp - Hyderabad");
      expect(b3.tdsRatePct).toBe(2); // Corporate 2% TDS
      expect(validateGSTIN(b3.gstin).isValid).toBe(true);

      // Verify L1 is lowest amount
      expect(b1.bidAmount).toBeLessThan(b3.bidAmount);
    });
  });

  describe("4. HTTP Integration Endpoints", () => {
    it("POST /api/affiliate/autonomous-cycle executes cycle with replenished tenders telemetry", async () => {
      const res = await fetch(`${baseUrl}/api/affiliate/autonomous-cycle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      expect(res.status).toBe(200);
      const data: any = await res.json();

      expect(data.success).toBe(true);
      expect(data.cycleId).toBeDefined();
      expect(data.timestamp).toBeDefined();
      expect(typeof data.replenishedCount).toBe("number");
      expect(typeof data.activeTendersCount).toBe("number");
      expect(data.activeTendersCount).toBeGreaterThanOrEqual(8);
      expect(typeof data.trendingOffersCount).toBe("number");
      expect(Array.isArray(data.broadcasts)).toBe(true);
      expect(data.broadcasts.length).toBeGreaterThan(0);
    });

    it("POST /api/auctions/:requirementId/simulate-activity triggers live bidding war", async () => {
      const testReqId = "req-api-sim-war-789";
      const res = await fetch(`${baseUrl}/api/auctions/${testReqId}/simulate-activity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceAntiSniping: true }),
      });

      expect(res.status).toBe(200);
      const data: any = await res.json();

      expect(data.success).toBe(true);
      expect(data.simulatedBidsCount).toBe(3);
      expect(typeof data.newL1Amount).toBe("number");
      expect(data.outbidContractor).toBe("Venkateshwara Infra Corp - Hyderabad");
      expect(data.extended).toBe(true);
    });

    it("GET /api/affiliate/stats includes live activeTendersCount", async () => {
      const res = await fetch(`${baseUrl}/api/affiliate/stats`);
      expect(res.status).toBe(200);
      const data: any = await res.json();

      expect(typeof data.activeTendersCount).toBe("number");
      expect(data.activeTendersCount).toBeGreaterThanOrEqual(8);
    });
  });
});
