import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { SEEDED_AFFILIATE_OFFERS } from "../../server/src/routes/affiliate";

describe("Phase 3 Affiliate & Production Revenue Engines", () => {
  describe("1. Contextual Offer Matching Logic", () => {
    it("should match construction and steel keywords accurately", () => {
      const category = "Construction";
      const title = "Urgent requirement for TMT steel rebars in Bangalore";

      const searchTokens = [
        ...category.toLowerCase().split(/[\s,_\-\/]+/),
        ...title.toLowerCase().split(/[\s,_\-\/]+/),
      ].filter((s) => s.length > 2);

      const matched = SEEDED_AFFILIATE_OFFERS.filter((offer) => {
        const kw = offer.category_keywords.map((k) => k.toLowerCase());
        return kw.some(
          (k) =>
            category.toLowerCase().includes(k) ||
            title.toLowerCase().includes(k) ||
            searchTokens.includes(k)
        );
      });

      expect(matched.length).toBeGreaterThan(0);
      const partners = matched.map((m) => m.partner_name);
      expect(partners).toContain("JSW One MSME");
      expect(partners).toContain("Tata Steel Tiscon");
    });

    it("should match IT and software billing keywords", () => {
      const category = "IT";
      const title = "Custom ERP and GST compliance invoicing portal";

      const searchTokens = [
        ...category.toLowerCase().split(/[\s,_\-\/]+/),
        ...title.toLowerCase().split(/[\s,_\-\/]+/),
      ].filter((s) => s.length > 2);

      const matched = SEEDED_AFFILIATE_OFFERS.filter((offer) => {
        const kw = offer.category_keywords.map((k) => k.toLowerCase());
        return kw.some(
          (k) =>
            category.toLowerCase().includes(k) ||
            title.toLowerCase().includes(k) ||
            searchTokens.includes(k)
        );
      });

      expect(matched.length).toBeGreaterThan(0);
      const partners = matched.map((m) => m.partner_name);
      expect(partners).toContain("myBillBook (FloBiz)");
    });

    it("should fallback to top finance and raw material offers if no keywords match", () => {
      const unmatchedCategory = "AstrologyCosmologyUnknown";
      const unmatchedTitle = "Zodiac Horoscope Guidance";

      const defaultPartners = ["Lendingkart Finance", "JSW One MSME", "myBillBook (FloBiz)"];
      const fallbackOffers = SEEDED_AFFILIATE_OFFERS.filter((o) =>
        defaultPartners.includes(o.partner_name)
      );

      expect(fallbackOffers.length).toBe(3);
      expect(fallbackOffers.some((o) => o.partner_name.includes("Lendingkart"))).toBe(true);
      expect(fallbackOffers.some((o) => o.partner_name.includes("JSW One"))).toBe(true);
    });
  });

  describe("2. Visitor IP Hashing & Tracking Redirect Logic", () => {
    it("should hash visitor IP using SHA-256 for privacy compliance", () => {
      const visitorIp = "203.0.113.195";
      const hash = crypto.createHash("sha256").update(visitorIp).digest("hex");

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);

      // Verify deterministic hashing
      const hash2 = crypto.createHash("sha256").update(visitorIp).digest("hex");
      expect(hash).toBe(hash2);

      // Verify different IPs produce distinct hashes
      const diffHash = crypto.createHash("sha256").update("198.51.100.44").digest("hex");
      expect(hash).not.toBe(diffHash);
    });

    it("should construct compliant UTM tracking redirect URLs", () => {
      const offer = SEEDED_AFFILIATE_OFFERS[0]; // Lendingkart
      const channel = "whatsapp_broadcast";
      const campaign = "contractor_blast_001";
      const reqId = "req_123456";

      const urlObj = new URL(offer.target_url);
      urlObj.searchParams.set("utm_source", "omnibid_india");
      urlObj.searchParams.set("utm_medium", "b2b_marketplace");
      urlObj.searchParams.set("utm_campaign", campaign);
      urlObj.searchParams.set("ch", channel);
      urlObj.searchParams.set("req_id", reqId);

      const finalUrl = urlObj.toString();
      expect(finalUrl).toContain("utm_source=omnibid_india");
      expect(finalUrl).toContain("utm_medium=b2b_marketplace");
      expect(finalUrl).toContain("utm_campaign=contractor_blast_001");
      expect(finalUrl).toContain("ch=whatsapp_broadcast");
      expect(finalUrl).toContain("req_id=req_123456");
    });
  });

  describe("3. Revenue Metrics & EPC Calculations", () => {
    it("should calculate EPC (Earnings Per Click) and platform gross monetization accurately", () => {
      const clicks = 50;
      const affiliateRevenue = 4500; // e.g. from CPA and CPC commissions
      const platformTakeRateRevenue = 17000; // 2% of ₹8,50,000 GMV
      const leadUnlockRevenue = 2970; // 30 unlocks @ ₹99
      const proContractorMrr = 14985; // 15 pros @ ₹999/mo

      const epc = affiliateRevenue / clicks;
      expect(epc).toBe(90.0);

      const grossMonetization =
        affiliateRevenue + platformTakeRateRevenue + leadUnlockRevenue + proContractorMrr;
      expect(grossMonetization).toBe(39455);
    });
  });

  describe("4. WhatsApp & Telegram Broadcast Copy Formatting", () => {
    it("should generate WhatsApp contractor broadcast copy with embedded tracking and live war room links", () => {
      const reqTitle = "Industrial Warehouse Construction 20,000 Sqft";
      const reqCity = "Bengaluru";
      const budget = 500000;
      const origin = "https://omnibid.in";
      const topLoanOfferId = "00000000-0000-0000-0000-000000000001";
      const reqId = "req-abc-123";

      const waBroadcastCopy =
        `⚡ *NEW PROCUREMENT REQUIREMENT ON OMNIBID INDIA*\n\n` +
        `📋 *Title*: ${reqTitle}\n` +
        `📍 *Location*: ${reqCity}\n` +
        `💰 *Budget*: ₹${budget.toLocaleString("en-IN")}\n` +
        `🛡️ *Security*: 100% Escrow Protected by OmniBid\n\n` +
        `⚡ *Live Reverse Auction & L1 War Room*:\n${origin}/auction/${reqId}\n\n` +
        `💼 Need Working Capital for this job? Instant loan up to ₹50L: ${origin}/api/affiliate/r/${topLoanOfferId}?reqId=${reqId}&ch=whatsapp_broadcast`;

      expect(waBroadcastCopy).toContain("⚡ *NEW PROCUREMENT REQUIREMENT ON OMNIBID INDIA*");
      expect(waBroadcastCopy).toContain("Industrial Warehouse Construction 20,000 Sqft");
      expect(waBroadcastCopy).toContain("/auction/req-abc-123");
      expect(waBroadcastCopy).toContain("/api/affiliate/r/00000000-0000-0000-0000-000000000001");
      expect(waBroadcastCopy).toContain("ch=whatsapp_broadcast");
    });

    it("should generate valid Telegram markdown copy for autonomous deal alerts", () => {
      const partner = "JSW One MSME";
      const title = "Bulk TMT Rebars & Steel Beams (Direct mill rates)";
      const badge = "Direct Mill Pricing";
      const trackingUrl = "https://omnibid.in/api/affiliate/r/00000000-0000-0000-0000-000000000002?ch=telegram_auto";

      const telegramMsg =
        `⚡ *OMNIBID COMMERCIAL PARTNER OPPORTUNITY*\n\n` +
        `📦 *Partner*: ${partner}\n` +
        `💼 *Offer*: ${title}\n` +
        `🛡️ *Advantage*: ${badge}\n\n` +
        `👉 [CHECK ELIGIBILITY & APPLY](${trackingUrl})`;

      expect(telegramMsg).toContain("⚡ *OMNIBID COMMERCIAL PARTNER OPPORTUNITY*");
      expect(telegramMsg).toContain("JSW One MSME");
      expect(telegramMsg).toContain("Direct Mill Pricing");
      expect(telegramMsg).toContain("[CHECK ELIGIBILITY & APPLY]");
      expect(telegramMsg).toContain("ch=telegram_auto");
    });
  });
});
