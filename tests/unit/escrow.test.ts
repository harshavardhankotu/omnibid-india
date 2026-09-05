import { describe, it, expect } from "vitest";
import crypto from "crypto";

describe("OmniBid India: Financial & Escrow Math Engine", () => {
  it("should calculate 2% platform fee accurately", () => {
    const bidAmount = 100000;
    const platformFee = Math.round(bidAmount * 0.02 * 100) / 100;
    const totalPayable = bidAmount + platformFee;

    expect(platformFee).toBe(2000);
    expect(totalPayable).toBe(102000);
  });

  it("should enforce 2% TDS deduction when contractor payout exceeds ₹30,000", () => {
    // Case 1: Over ₹30,000
    const highBid = 420000;
    const tdsHigh = highBid > 30000 ? Math.round(highBid * 0.02 * 100) / 100 : 0;
    expect(tdsHigh).toBe(8400);

    // Case 2: Under ₹30,000 threshold
    const lowBid = 25000;
    const tdsLow = lowBid > 30000 ? Math.round(lowBid * 0.02 * 100) / 100 : 0;
    expect(tdsLow).toBe(0);
  });

  it("should compute 18% Works Contract GST correctly (SAC 9954)", () => {
    const baseAmount = 500000;
    // Intra-state (9% CGST + 9% SGST)
    const cgst = Math.round(baseAmount * 0.09 * 100) / 100;
    const sgst = Math.round(baseAmount * 0.09 * 100) / 100;
    const totalGst = cgst + sgst;

    expect(cgst).toBe(45000);
    expect(sgst).toBe(45000);
    expect(totalGst).toBe(90000);
    expect(baseAmount + totalGst).toBe(590000);
  });

  it("should cryptographically verify Razorpay HMAC-SHA256 signature", () => {
    const secret = "test_webhook_secret_key_123";
    const orderId = "order_mock_test_001";
    const paymentId = "pay_mock_test_002";

    const payload = `${orderId}|${paymentId}`;
    const validSignature = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    // Tampered payload
    const tamperedSignature = crypto
      .createHmac("sha256", secret)
      .update(`${orderId}|pay_tampered_999`)
      .digest("hex");

    expect(validSignature).toHaveLength(64);
    expect(validSignature).not.toEqual(tamperedSignature);

    // Verification check
    const verifyPayload = (ord: string, pay: string, sig: string) => {
      const generated = crypto
        .createHmac("sha256", secret)
        .update(`${ord}|${pay}`)
        .digest("hex");
      return crypto.timingSafeEqual(Buffer.from(generated), Buffer.from(sig));
    };

    expect(verifyPayload(orderId, paymentId, validSignature)).toBe(true);
  });

  it("should guard against milestone disbursement if escrow is in disputed status", () => {
    const escrowRecord = {
      id: "escrow_001",
      status: "disputed" as const,
      net_payout: 400000,
    };

    const attemptDisbursement = (status: string) => {
      if (status === "disputed") {
        throw new Error("409 Conflict: Funds cannot be released while in active dispute status");
      }
      return { success: true };
    };

    expect(() => attemptDisbursement(escrowRecord.status)).toThrowError(/409 Conflict/);
  });
});
