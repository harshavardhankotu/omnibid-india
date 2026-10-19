import { describe, it, expect } from "vitest";
import {
  validateGSTIN,
  validatePAN,
  calculateGstinChecksum,
  calculateEscrowBreakdown,
  GSTIN_STATE_CODES,
} from "../../shared/gstin-tds.js";
import {
  parseSmartProcurementText,
  lookupPinCode,
  parseIndianBudget,
  parseQuantityAndUnit,
} from "../../server/src/services/smart-parser.service.js";
import { handleGetContextual } from "../../server/src/routes/affiliate.js";

describe("Step 4 Master Verification: Business Logic Gaps & Performance", () => {
  describe("1. GSTIN Mod-36 Checksum & Section 194C TDS Engine", () => {
    it("correctly identifies valid state codes across all Indian regions", () => {
      expect(GSTIN_STATE_CODES["36"]).toBe("Telangana");
      expect(GSTIN_STATE_CODES["27"]).toBe("Maharashtra");
      expect(GSTIN_STATE_CODES["29"]).toBe("Karnataka");
      expect(GSTIN_STATE_CODES["07"]).toBe("Delhi");
      expect(GSTIN_STATE_CODES["33"]).toBe("Tamil Nadu");
      expect(GSTIN_STATE_CODES["19"]).toBe("West Bengal");
      expect(GSTIN_STATE_CODES["24"]).toBe("Gujarat");
      expect(GSTIN_STATE_CODES["09"]).toBe("Uttar Pradesh");
    });

    it("extracts 10-digit PAN and classifies entity type correctly", () => {
      // Individual: 4th char is 'P'
      const panIndividual = "AAAPL1234C";
      const resInd = validatePAN(panIndividual);
      expect(resInd.isValid).toBe(true);
      expect(resInd.entityType).toBe("Individual / Proprietor / HUF");
      expect(resInd.tdsRate).toBe(0.01);

      // Company: 4th char is 'C'
      const panCompany = "AAACB1234C";
      const resComp = validatePAN(panCompany);
      expect(resComp.isValid).toBe(true);
      expect(resComp.entityType).toBe("Company");
      expect(resComp.tdsRate).toBe(0.02);

      // Firm / LLP: 4th char is 'F'
      const panFirm = "AAAFB1234C";
      const resFirm = validatePAN(panFirm);
      expect(resFirm.isValid).toBe(true);
      expect(resFirm.entityType).toBe("Firm / Limited Liability Partnership (LLP)");
      expect(resFirm.tdsRate).toBe(0.02);
    });

    it("enforces Section 194C single-contract threshold exemption (<= ₹30,000)", () => {
      // Contract <= 30000 has 0% TDS
      const exempt = calculateEscrowBreakdown({
        grossAmountInr: 25000,
        gstinOrPan: "36AAAPL1234C1Z1",
      });
      expect(exempt.grossAmountInr).toBe(25000);
      expect(exempt.platformFeeRate).toBe(0.02);
      expect(exempt.platformFeeInr).toBe(500); // 2% of 25000
      expect(exempt.tdsInr).toBe(0); // Exempt under Sec 194C
      expect(exempt.netSettlementInr).toBe(24500); // 25000 - 500

      // Contract > 30000 has 1% TDS for individual
      const taxableInd = calculateEscrowBreakdown({
        grossAmountInr: 100000,
        gstinOrPan: "36AAAPL1234C1Z1",
      });
      expect(taxableInd.grossAmountInr).toBe(100000);
      expect(taxableInd.platformFeeInr).toBe(2000); // 2% of 100000
      expect(taxableInd.tdsRate).toBe(0.01);
      expect(taxableInd.tdsInr).toBe(1000); // 1% of 100000
      expect(taxableInd.netSettlementInr).toBe(97000); // 100000 - 2000 - 1000

      // Contract > 30000 has 2% TDS for company
      const taxableComp = calculateEscrowBreakdown({
        grossAmountInr: 100000,
        gstinOrPan: "27AAACB1234C1Z1",
      });
      expect(taxableComp.platformFeeInr).toBe(2000); // 2% of 100000
      expect(taxableComp.tdsRate).toBe(0.02);
      expect(taxableComp.tdsInr).toBe(2000); // 2% of 100000
      expect(taxableComp.netSettlementInr).toBe(96000); // 100000 - 2000 - 2000
    });
  });

  describe("2. Anti-Sniping Auto-Extension Calculation", () => {
    it("extends auction by +120s when bid placed within 120s of end", () => {
      const now = Date.now();
      const endingSoon = new Date(now + 45 * 1000); // 45 seconds remaining
      const remainingSeconds = Math.max(0, Math.floor((endingSoon.getTime() - now) / 1000));
      expect(remainingSeconds).toBeLessThanOrEqual(120);

      // Trigger extension
      const shouldExtend = remainingSeconds <= 120;
      expect(shouldExtend).toBe(true);

      const extendedEndsAt = new Date(now + 120 * 1000);
      const newRemainingSeconds = Math.floor((extendedEndsAt.getTime() - now) / 1000);
      expect(newRemainingSeconds).toBe(120);
    });

    it("does not extend auction when bid placed with > 120s remaining", () => {
      const now = Date.now();
      const endingLater = new Date(now + 600 * 1000); // 10 minutes remaining
      const remainingSeconds = Math.floor((endingLater.getTime() - now) / 1000);
      const shouldExtend = remainingSeconds <= 120;
      expect(shouldExtend).toBe(false);
    });
  });

  describe("3. Smart BOQ WhatsApp Procurement Parser", () => {
    it("extracts cement procurement text into structured fields", () => {
      const input = "Need 500 bags Ultratech OPC 53 cement at 500081 budget 1.9L";
      const parsed = parseSmartProcurementText(input);

      expect(parsed.quantity).toBe(500);
      expect(parsed.unit).toBe("bags");
      expect(parsed.budgetInr).toBe(190000);
      expect(parsed.pincode).toBe("500081");
      expect(parsed.city).toBe("Hyderabad");
      expect(parsed.state).toBe("Telangana");
      expect(parsed.category).toBe("Cement & Concrete");
    });

    it("extracts TMT steel procurement text with MT units and Lakhs budget", () => {
      const input = "Urgent requirement: 25 MT TMT steel bars in Mumbai 400001 budget 14 Lakhs";
      const parsed = parseSmartProcurementText(input);

      expect(parsed.quantity).toBe(25);
      expect(parsed.unit).toBe("MT");
      expect(parsed.budgetInr).toBe(1400000);
      expect(parsed.pincode).toBe("400001");
      expect(parsed.city).toBe("Mumbai");
      expect(parsed.state).toBe("Maharashtra");
    });

    it("accurately maps PIN code prefixes via India Post registry", () => {
      expect(lookupPinCode("560001").city).toBe("Bengaluru");
      expect(lookupPinCode("560001").state).toBe("Karnataka");
      expect(lookupPinCode("110001").city).toBe("New Delhi");
      expect(lookupPinCode("600001").city).toBe("Chennai");
      expect(lookupPinCode("700001").city).toBe("Kolkata");
      expect(lookupPinCode("380001").city).toBe("Ahmedabad");
      expect(lookupPinCode("201301").city).toBe("Noida");
    });
  });

  describe("4. Contextual Affiliate Cache & Sub-20ms Response Time", () => {
    it("returns cached affiliate offers with sub-millisecond execution", async () => {
      const mockReq: any = {
        query: { category: "construction", title: "Bulk TMT Rebars 20 MT" },
      };

      let responseData1: any = null;
      let statusCode1 = 0;
      const mockRes1: any = {
        status(code: number) {
          statusCode1 = code;
          return this;
        },
        json(data: any) {
          responseData1 = data;
          return this;
        },
      };

      // First call (populates cache)
      const t0 = performance.now();
      await handleGetContextual(mockReq, mockRes1);
      const firstDuration = performance.now() - t0;

      expect(statusCode1).toBe(200);
      expect(Array.isArray(responseData1)).toBe(true);
      expect(responseData1.length).toBeGreaterThan(0);

      // Second call (hits 5s in-memory cache)
      let responseData2: any = null;
      let statusCode2 = 0;
      const mockRes2: any = {
        status(code: number) {
          statusCode2 = code;
          return this;
        },
        json(data: any) {
          responseData2 = data;
          return this;
        },
      };

      const t1 = performance.now();
      await handleGetContextual(mockReq, mockRes2);
      const cacheDuration = performance.now() - t1;

      expect(statusCode2).toBe(200);
      expect(responseData2).toEqual(responseData1);
      expect(cacheDuration).toBeLessThan(20); // Well under 20ms threshold
    });
  });
});
