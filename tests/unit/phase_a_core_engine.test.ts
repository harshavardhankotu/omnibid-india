import { describe, it, expect } from "vitest";
import {
  validateGSTIN,
  validatePAN,
  calculateGstinChecksum,
  calculateEscrowBreakdown,
  GSTIN_STATE_CODES,
} from "../../shared/gstin-tds.js";
import {
  lookupPinCode,
  parseIndianBudget,
  parseQuantityAndUnit,
  detectCategory,
  parseSmartProcurementText,
} from "../../server/src/services/smart-parser.service.js";
import {
  broadcastDeal,
  getRecentBroadcasts,
  buildDealAlertMessage,
} from "../../server/src/services/auto-broadcaster.js";
import {
  savePushSubscription,
  getUserSubscriptions,
  notifyOutbid,
  sendWebPush,
} from "../../server/src/services/push-notification.service.js";

describe("Phase A: GSTIN Mod-36 & Section 194C TDS Engine", () => {
  it("computes accurate Mod-36 checksum according to Indian GSTN standards", () => {
    // Test base 14 characters and generate checksum
    const base14Individual = "36AAAPL1234C1Z"; // Telangana, Individual PAN (AAAPL1234C)
    const checksum = calculateGstinChecksum(base14Individual);
    expect(checksum).toBeDefined();
    expect(checksum.length).toBe(1);

    const fullGstin = `${base14Individual}${checksum}`;
    const validation = validateGSTIN(fullGstin);
    expect(validation.isValid).toBe(true);
    expect(validation.stateCode).toBe("36");
    expect(validation.stateName).toBe("Telangana");
    expect(validation.pan).toBe("AAAPL1234C");
    expect(validation.entityType).toBe("Individual / Proprietor / HUF");
    expect(validation.tdsRate).toBe(0.01); // 1% for individual under Sec 194C
  });

  it("identifies corporate GSTIN and assigns 2% Section 194C TDS rate", () => {
    // 27 = Maharashtra, AAACB1234C = Company PAN (4th char 'C')
    const base14Company = "27AAACB1234C1Z";
    const checksum = calculateGstinChecksum(base14Company);
    const fullGstin = `${base14Company}${checksum}`;

    const validation = validateGSTIN(fullGstin);
    expect(validation.isValid).toBe(true);
    expect(validation.stateCode).toBe("27");
    expect(validation.stateName).toBe("Maharashtra");
    expect(validation.entityCategory).toBe("company");
    expect(validation.tdsRate).toBe(0.02); // 2% for company under Sec 194C
  });

  it("rejects invalid GSTIN checksums and malformed state codes", () => {
    // Corrupted checksum digit
    const invalidChecksumGstin = "36AAAPL1234C1Z9";
    const res = validateGSTIN(invalidChecksumGstin);
    // If 9 happens to not match expected checksum
    const expected = calculateGstinChecksum("36AAAPL1234C1Z");
    if (expected !== "9") {
      expect(res.isValid).toBe(false);
      expect(res.error).toContain("Checksum digit mismatch");
    }

    // Invalid length
    expect(validateGSTIN("INVALID").isValid).toBe(false);

    // Invalid state code
    expect(validateGSTIN("98AAACB1234C1Z1").isValid).toBe(false);
  });

  it("covers all 38 Indian State & UT codes in lookup table", () => {
    expect(GSTIN_STATE_CODES["01"]).toBe("Jammu & Kashmir");
    expect(GSTIN_STATE_CODES["07"]).toBe("Delhi");
    expect(GSTIN_STATE_CODES["27"]).toBe("Maharashtra");
    expect(GSTIN_STATE_CODES["29"]).toBe("Karnataka");
    expect(GSTIN_STATE_CODES["36"]).toBe("Telangana");
    expect(GSTIN_STATE_CODES["37"]).toBe("Andhra Pradesh");
    expect(GSTIN_STATE_CODES["38"]).toBe("Ladakh");
  });

  it("calculates statutory escrow breakdown with Section 194C exemption threshold", () => {
    // Case 1: Under or equal to statutory exemption threshold (≤ ₹30,000) -> 0% TDS
    const exemptBreakdown = calculateEscrowBreakdown({
      grossAmountInr: 25000,
      gstinOrPan: "27AAACB1234C1Z",
    });

    expect(exemptBreakdown.grossAmountInr).toBe(25000);
    expect(exemptBreakdown.platformFeeRate).toBe(0.02);
    expect(exemptBreakdown.platformFeeInr).toBe(500); // 25000 * 0.02
    expect(exemptBreakdown.tdsRate).toBe(0); // Exempt under single contract threshold
    expect(exemptBreakdown.tdsInr).toBe(0);
    expect(exemptBreakdown.netSettlementInr).toBe(24500); // 25000 - 500 - 0

    // Case 2: Above threshold (> ₹30,000) with Individual Contractor (1% TDS)
    const base14Ind = "36AAAPL1234C1Z";
    const gstinInd = `${base14Ind}${calculateGstinChecksum(base14Ind)}`;

    const individualBreakdown = calculateEscrowBreakdown({
      grossAmountInr: 100000, // ₹1,00,000
      gstinOrPan: gstinInd,
    });

    expect(individualBreakdown.grossAmountInr).toBe(100000);
    expect(individualBreakdown.platformFeeInr).toBe(2000); // 2% = 2,000
    expect(individualBreakdown.tdsRate).toBe(0.01); // 1%
    expect(individualBreakdown.tdsInr).toBe(1000); // 1% = 1,000
    expect(individualBreakdown.netSettlementInr).toBe(97000); // 100,000 - 2000 - 1000
    expect(individualBreakdown.validGstin).toBe(true);
    expect(individualBreakdown.stateName).toBe("Telangana");

    // Case 3: Above threshold with Corporate Contractor (2% TDS)
    const base14Corp = "29AAACB1234C1Z";
    const gstinCorp = `${base14Corp}${calculateGstinChecksum(base14Corp)}`;

    const corporateBreakdown = calculateEscrowBreakdown({
      grossAmountInr: 500000, // ₹5,00,000
      gstinOrPan: gstinCorp,
    });

    expect(corporateBreakdown.grossAmountInr).toBe(500000);
    expect(corporateBreakdown.platformFeeInr).toBe(10000); // 2% = 10,000
    expect(corporateBreakdown.tdsRate).toBe(0.02); // 2%
    expect(corporateBreakdown.tdsInr).toBe(10000); // 2% = 10,000
    expect(corporateBreakdown.netSettlementInr).toBe(480000); // 500,000 - 10,000 - 10,000
    expect(corporateBreakdown.stateName).toBe("Karnataka");
  });
});

describe("Phase A: Smart Procurement Text & PIN Parser", () => {
  it("resolves major Indian industrial and commercial PIN codes to City and State", () => {
    // Hyderabad, Telangana
    const hyd = lookupPinCode("500081");
    expect(hyd.valid).toBe(true);
    expect(hyd.city).toBe("Hyderabad");
    expect(hyd.state).toBe("Telangana");

    // Mumbai, Maharashtra
    const mum = lookupPinCode("400001");
    expect(mum.valid).toBe(true);
    expect(mum.city).toBe("Mumbai");
    expect(mum.state).toBe("Maharashtra");

    // Bengaluru, Karnataka
    const blr = lookupPinCode("560001");
    expect(blr.valid).toBe(true);
    expect(blr.city).toBe("Bengaluru");
    expect(blr.state).toBe("Karnataka");

    // New Delhi, Delhi
    const del = lookupPinCode("110001");
    expect(del.valid).toBe(true);
    expect(del.city).toBe("New Delhi");
    expect(del.state).toBe("Delhi");

    // Noida, UP
    const noida = lookupPinCode("201301");
    expect(noida.valid).toBe(true);
    expect(noida.city).toBe("Noida");
    expect(noida.state).toBe("Uttar Pradesh");

    // Ahmedabad, Gujarat
    const amd = lookupPinCode("380001");
    expect(amd.valid).toBe(true);
    expect(amd.city).toBe("Ahmedabad");
    expect(amd.state).toBe("Gujarat");
  });

  it("parses diverse Indian currency formats accurately", () => {
    expect(parseIndianBudget("Need materials budget 1.9L")).toBe(190000);
    expect(parseIndianBudget("Urgent requirement budget 12 Lakhs")).toBe(1200000);
    expect(parseIndianBudget("Small order ceiling 50K")).toBe(50000);
    expect(parseIndianBudget("Mega tender budget 2.5 Cr")).toBe(25000000);
    expect(parseIndianBudget("Total cost ₹ 1,90,000")).toBe(190000);
    expect(parseIndianBudget("Estimate INR 3,50,000")).toBe(350000);
  });

  it("extracts quantities and canonical Indian procurement units", () => {
    expect(parseQuantityAndUnit("Need 500 bags Ultratech OPC 53 cement")).toEqual({
      quantity: 500,
      unit: "bags",
    });

    expect(parseQuantityAndUnit("Urgent: 20 MT TMT steel bars in Hyderabad")).toEqual({
      quantity: 20,
      unit: "MT",
    });

    expect(parseQuantityAndUnit("Plastering sand 5 brass required at site")).toEqual({
      quantity: 5,
      unit: "brass",
    });

    expect(parseQuantityAndUnit("Flooring tiles 1200 sqft vitrified")).toEqual({
      quantity: 1200,
      unit: "sqft",
    });

    expect(parseQuantityAndUnit("Copper wiring 500 meters required")).toEqual({
      quantity: 500,
      unit: "meters",
    });

    expect(parseQuantityAndUnit("Binding wire 150 kg")).toEqual({
      quantity: 150,
      unit: "kg",
    });
  });

  it("classifies Indian procurement categories based on industrial terminology", () => {
    expect(detectCategory("Ultratech OPC 53 grade cement bags")).toBe("Cement & Concrete");
    expect(detectCategory("20 MT TMT steel rebar Fe 550D")).toBe("Steel & Structural Metals");
    expect(detectCategory("River sand and aggregate 20mm")).toBe("Aggregates & Sand");
    expect(detectCategory("JCB and excavator rental for excavation")).toBe("Machinery & Equipment Rental");
    expect(detectCategory("Polycab 2.5 sqmm FR copper wire")).toBe("Electrical & Wiring");
    expect(detectCategory("Astral CPVC pipes and fittings")).toBe("Plumbing & Sanitary");
  });

  it("parses full messy chat messages into structured tender requirements", () => {
    const rawChat = "Need 500 bags Ultratech OPC 53 cement at 500081 budget 1.9L";
    const result = parseSmartProcurementText(rawChat);

    expect(result.quantity).toBe(500);
    expect(result.unit).toBe("bags");
    expect(result.category).toBe("Cement & Concrete");
    expect(result.pincode).toBe("500081");
    expect(result.city).toBe("Hyderabad");
    expect(result.state).toBe("Telangana");
    expect(result.budgetInr).toBe(190000);
    expect(result.title).toBeDefined();

    const rawChat2 = "Urgent requirement: 20 MT TMT steel bars in Hyderabad 500032 budget 12 Lakhs";
    const result2 = parseSmartProcurementText(rawChat2);

    expect(result2.quantity).toBe(20);
    expect(result2.unit).toBe("MT");
    expect(result2.category).toBe("Steel & Structural Metals");
    expect(result2.pincode).toBe("500032");
    expect(result2.city).toBe("Hyderabad");
    expect(result2.state).toBe("Telangana");
    expect(result2.budgetInr).toBe(1200000);
  });
});

describe("Phase A: Telegram Auto-Broadcaster Service", () => {
  it("formats rich Markdown deal alerts in English, Hindi, and Telugu with live URLs", () => {
    const requirement = {
      id: "req_test_12345",
      title: "500 Bags UltraTech OPC 53 Cement",
      city: "Hyderabad",
      state: "Telangana",
      pincode: "500081",
      maxBudget: 190000,
    };

    const l1Bid = {
      id: "bid_test_67890",
      bidAmount: 175000,
    };

    const matchedOffer = {
      id: "00000000-0000-0000-0000-000000000001",
      partner_name: "Lendingkart Finance",
      title: "MSME Working Capital Loans",
      badge_text: "Pre-Approved",
    };

    const warRoomUrl = `https://omnibid-india.onrender.com/auction/${requirement.id}`;
    const affiliateUrl = `https://omnibid-india.onrender.com/api/affiliate/r/${matchedOffer.id}?reqId=${requirement.id}&ch=telegram_auto`;

    const msg = buildDealAlertMessage({
      requirement,
      l1Bid,
      matchedOffer,
      warRoomUrl,
      affiliateUrl,
    });

    // Contains English title, Indian currency format, and War Room URL
    expect(msg).toContain("OMNIBID INDIA — LIVE DEAL ALERT");
    expect(msg).toContain("₹1.75 L");
    expect(msg).toContain(warRoomUrl);

    // Contains Hindi alert
    expect(msg).toContain("लाइव नीलामी सूचना (हिंदी)");

    // Contains Telugu alert
    expect(msg).toContain("ప్రత్యక్ష బిడ్డింగ్ హెచ్చరిక (తెలుగు)");

    // Contains Partner tracked URL
    expect(msg).toContain(affiliateUrl);
  });

  it("handles unconfigured Telegram bot environment gracefully and records history", async () => {
    const req = {
      id: "req_demo_history",
      title: "10 MT TMT Bars Fe550",
      maxBudget: 650000,
      city: "Pune",
      state: "Maharashtra",
    };

    const result = await broadcastDeal(req, { bidAmount: 620000 }, null);
    expect(result.status).toBe("simulated");
    expect(result.requirementId).toBe("req_demo_history");

    const recent = getRecentBroadcasts(10);
    expect(recent.length).toBeGreaterThan(0);
    const found = recent.find((b) => b.requirementId === "req_demo_history");
    expect(found).toBeDefined();
    expect(found?.status).toBe("simulated");
  });
});

describe("Phase A: VAPID Web Push & Outbid Alerts", () => {
  it("registers and retrieves user Web Push subscriptions", () => {
    const userId = "user-contractor-001";
    const subData = {
      endpoint: "https://fcm.googleapis.com/fcm/send/sample-token-123",
      keys: {
        p256dh: "BMockP256dhKeyExample1234567890==",
        auth: "MockAuthToken987==",
      },
    };

    const registered = savePushSubscription(userId, subData, "Mozilla/5.0 (Windows NT 10.0)");
    expect(registered.id).toBeDefined();
    expect(registered.userId).toBe(userId);

    const subs = getUserSubscriptions(userId);
    expect(subs.length).toBe(1);
    expect(subs[0].subscription.endpoint).toBe(subData.endpoint);
  });

  it("handles outbid notifications in mock/development mode without throwing", async () => {
    const userId = "user-outbid-contractor-999";
    savePushSubscription(userId, {
      endpoint: "https://updates.push.services.mozilla.com/wpush/v2/mock-endpoint",
      keys: { p256dh: "key-123", auth: "auth-123" },
    });

    await expect(
      notifyOutbid("req-auction-123", userId, 185000, "500 Bags Cement")
    ).resolves.not.toThrow();
  });
});
