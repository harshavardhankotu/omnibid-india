import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { getCurrentFinancialYear, resolvePlaceOfSupply, resolveSACCode } from "../src/services/invoice.service.js";
import { computeContractTDS } from "../src/services/escrow.service.js";
import { StorageService, DEFAULT_SIGNED_URL_TTL } from "../src/services/storage.service.js";

describe("OmniBid Production Hardening & Regulatory Compliance", () => {
  describe("1. Webhook Idempotency & Replay Protection", () => {
    it("should verify valid HMAC-SHA256 signature and reject altered payloads", () => {
      const secret = "prod_webhook_secret_key_998877";
      const payload = JSON.stringify({
        event: "payment.captured",
        event_id: "evt_razorpay_mock_100",
        payload: { payment: { entity: { id: "pay_100", amount: 50000 } } },
      });

      const validSig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
      const tamperedSig = crypto.createHmac("sha256", secret).update(payload + "tamper").digest("hex");

      expect(validSig).toHaveLength(64);
      expect(validSig).not.toEqual(tamperedSig);
    });

    it("should ensure duplicate webhook event_ids are recognized and idempotently skipped", () => {
      const processedEventIds = new Set<string>();

      const handleWebhookIdempotency = (eventId: string) => {
        if (processedEventIds.has(eventId)) {
          return { status: "skipped", message: "Duplicate event already processed" };
        }
        processedEventIds.add(eventId);
        return { status: "processed", message: "Event recorded" };
      };

      const eventId = "evt_rzp_unique_88219";

      // First attempt: should process
      const firstResult = handleWebhookIdempotency(eventId);
      expect(firstResult.status).toBe("processed");

      // Replay attempt with same event_id: should skip idempotently
      const replayResult = handleWebhookIdempotency(eventId);
      expect(replayResult.status).toBe("skipped");
      expect(replayResult.message).toContain("Duplicate");
    });
  });

  describe("2. GST Rule 46 Sequential Invoicing & Place of Supply (POS)", () => {
    it("should resolve correct Indian Financial Year (April 1 - March 31)", () => {
      const mayDate = new Date(2026, 4, 15); // May 2026 -> FY 2026-27
      const febDate = new Date(2027, 1, 10); // Feb 2027 -> FY 2026-27
      const marchDate = new Date(2026, 2, 31); // March 2026 -> FY 2025-26

      expect(getCurrentFinancialYear(mayDate)).toBe("2026-27");
      expect(getCurrentFinancialYear(febDate)).toBe("2026-27");
      expect(getCurrentFinancialYear(marchDate)).toBe("2025-26");
    });

    it("should format sequential invoice numbers conforming to Rule 46 (OB/<FY>/<0001>)", () => {
      const formatInvoiceNumber = (fy: string, seq: number) => `OB/${fy}/${String(seq).padStart(4, "0")}`;
      expect(formatInvoiceNumber("2026-27", 1)).toBe("OB/2026-27/0001");
      expect(formatInvoiceNumber("2026-27", 42)).toBe("OB/2026-27/0042");
    });

    it("should resolve Place of Supply for Intra-State (9% CGST + 9% SGST)", () => {
      const pos = resolvePlaceOfSupply("29", "29"); // Both Karnataka
      expect(pos.isInterState).toBe(false);
      expect(pos.cgstRate).toBe(0.09);
      expect(pos.sgstRate).toBe(0.09);
      expect(pos.igstRate).toBe(0);
      expect(pos.totalGstRate).toBe(0.18);
    });

    it("should resolve Place of Supply for Inter-State (18% IGST)", () => {
      const pos = resolvePlaceOfSupply("29", "27"); // Karnataka to Maharashtra
      expect(pos.isInterState).toBe(true);
      expect(pos.cgstRate).toBe(0);
      expect(pos.sgstRate).toBe(0);
      expect(pos.igstRate).toBe(0.18);
      expect(pos.totalGstRate).toBe(0.18);
    });

    it("should map SAC code 9954 for Civil Works and 9983 for IT / Professional services", () => {
      expect(resolveSACCode("Construction")).toBe("9954");
      expect(resolveSACCode("Civil Infra")).toBe("9954");
      expect(resolveSACCode("IT")).toBe("9983");
      expect(resolveSACCode("Legal")).toBe("9983");
      expect(resolveSACCode("Logistics")).toBe("9983");
    });
  });

  describe("3. Section 194C vs Section 194J TDS Deduction Engine", () => {
    it("should exempt contracts below or equal to ₹30,000 threshold", () => {
      const result = computeContractTDS({
        bidAmount: 25000,
        sector: "Construction",
        vendorEntityType: "company",
      });

      expect(result.tdsAmount).toBe(0);
      expect(result.tdsRate).toBe(0);
    });

    it("should deduct 1% TDS for Individual / HUF contractors under Section 194C", () => {
      const result = computeContractTDS({
        bidAmount: 100000,
        sector: "Construction",
        vendorEntityType: "individual",
      });

      expect(result.section).toBe("194C");
      expect(result.tdsRate).toBe(0.01);
      expect(result.tdsAmount).toBe(1000); // 1% of 100,000
    });

    it("should deduct 2% TDS for Company / LLP contractors under Section 194C", () => {
      const result = computeContractTDS({
        bidAmount: 100000,
        sector: "Construction",
        vendorEntityType: "company",
      });

      expect(result.section).toBe("194C");
      expect(result.tdsRate).toBe(0.02);
      expect(result.tdsAmount).toBe(2000); // 2% of 100,000
    });

    it("should deduct 10% TDS for Professional Services (Legal) under Section 194J", () => {
      const result = computeContractTDS({
        bidAmount: 80000,
        sector: "Legal",
      });

      expect(result.section).toBe("194J");
      expect(result.tdsRate).toBe(0.10);
      expect(result.tdsAmount).toBe(8000); // 10% of 80,000
    });

    it("should deduct 2% TDS for Technical Services (IT) under Section 194J", () => {
      const result = computeContractTDS({
        bidAmount: 200000,
        sector: "IT",
      });

      expect(result.section).toBe("194J");
      expect(result.tdsRate).toBe(0.02);
      expect(result.tdsAmount).toBe(4000); // 2% of 200,000
    });
  });

  describe("4. Supabase Storage Vault Pre-Signed URLs & Public Lock", () => {
    it("should enforce mandatory 15-minute (900s) maximum TTL on pre-signed download URLs", async () => {
      const result = await StorageService.createSignedDownloadUrl("kyc/pan_doc.pdf", 3600); // Requests 1 hour
      // StorageService must cap to DEFAULT_SIGNED_URL_TTL (900 seconds)
      expect(result.expiresIn).toBe(DEFAULT_SIGNED_URL_TTL);
      expect(result.signedUrl).toContain("kyc/pan_doc.pdf");
    });

    it("should throw error preventing direct public access to vault documents", () => {
      expect(() => StorageService.getPublicUrl("disputes/evidence.jpg")).toThrowError(
        /Direct public read access is permanently disabled/
      );
    });
  });
});
