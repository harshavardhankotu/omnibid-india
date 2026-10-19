import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "http";
import app from "../../server/src/app.js";
import {
  autoBootstrap,
  getVapidPublicKey,
  getRegionalTenders,
  getRegionalTenderById,
  SEEDED_REGIONAL_TENDERS,
} from "../../server/src/services/auto-bootstrap.js";
import { SEEDED_AFFILIATE_OFFERS } from "../../server/src/routes/affiliate.js";

describe("Single-Origin Production App & Auto-Bootstrap Engine", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    // Run autoBootstrap
    await autoBootstrap();

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
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  describe("1. Auto-Bootstrap Engine & VAPID Key Manager", () => {
    it("generates/loads valid deterministic VAPID public key without throwing", () => {
      const pubKey = getVapidPublicKey();
      expect(pubKey).toBeDefined();
      expect(typeof pubKey).toBe("string");
      expect(pubKey.length).toBeGreaterThanOrEqual(80); // NIST P-256 base64url is ~87 chars
      expect(process.env.VAPID_PUBLIC_KEY).toBe(pubKey);
      expect(process.env.VAPID_PRIVATE_KEY).toBeDefined();
    });

    it("verifies all 10 Indian B2B Affiliate Offers exist in fallback pool", () => {
      expect(SEEDED_AFFILIATE_OFFERS).toHaveLength(10);
      const partners = SEEDED_AFFILIATE_OFFERS.map((o) => o.partner_name);
      expect(partners).toContain("Lendingkart Finance");
      expect(partners).toContain("JSW One MSME");
      expect(partners).toContain("Tata Steel Tiscon");
      expect(partners).toContain("Shriram Finance");
      expect(partners).toContain("myBillBook (FloBiz)");
      expect(partners).toContain("Moglix Business");
      expect(partners).toContain("Infra.Market");
      expect(partners).toContain("Polycab India");
      expect(partners).toContain("Astral Pipes");
      expect(partners).toContain("Porter Enterprise");
    });

    it("ensures initial high-value regional tenders exist in repository", () => {
      const tenders = getRegionalTenders();
      expect(tenders.length).toBeGreaterThanOrEqual(5);

      // Hyderabad (500081)
      const hyd = tenders.find((t) => t.pincode === "500081");
      expect(hyd).toBeDefined();
      expect(hyd?.title).toContain("Supply of 500 MT Fe 550D TMT Rebars for HITEC City Metro Rail Extension");
      expect(hyd?.budget).toBe(2400000);
      expect(hyd?.category).toBe("construction");

      // Mumbai (400051)
      const mum = tenders.find((t) => t.pincode === "400051");
      expect(mum).toBeDefined();
      expect(mum?.title).toContain("Ready-Mix Concrete M40 Grade 1200 CuM for Bandra Commercial Tower");
      expect(mum?.budget).toBe(5400000);
      expect(mum?.category).toBe("construction");

      // Bengaluru (560100)
      const blr = tenders.find((t) => t.pincode === "560100");
      expect(blr).toBeDefined();
      expect(blr?.title).toContain("HVAC Ducting & High-Pressure Piping for Electronic City Data Center");
      expect(blr?.budget).toBe(3800000);
      expect(blr?.category).toBe("commercial_plumbing");

      // Visakhapatnam (530035)
      const viz = tenders.find((t) => t.pincode === "530035");
      expect(viz).toBeDefined();
      expect(viz?.title).toContain("Marine Grade Structural Steel Fabrications for Vizag Port Terminal");
      expect(viz?.budget).toBe(4200000);
      expect(viz?.category).toBe("steel");

      // Delhi NCR (201301)
      const del = tenders.find((t) => t.pincode === "201301");
      expect(del).toBeDefined();
      expect(del?.title).toContain("Industrial Firefighting Piping & High-Capacity Hydrant Grid in Noida");
      expect(del?.budget).toBe(1850000);
      expect(del?.category).toBe("industrial_safety");
    });

    it("can look up regional tenders by ID", () => {
      const firstTender = SEEDED_REGIONAL_TENDERS[0];
      const found = getRegionalTenderById(firstTender.id);
      expect(found).toBeDefined();
      expect(found?.title).toBe(firstTender.title);
    });
  });

  describe("2. GET /api/push/vapid-public-key", () => {
    it("returns active VAPID public key", async () => {
      const res = await fetch(`${baseUrl}/api/push/vapid-public-key`);
      expect(res.status).toBe(200);

      const data: any = await res.json();
      expect(data.success).toBe(true);
      expect(data.publicKey).toBe(getVapidPublicKey());
    });
  });

  describe("3. Dynamic SEO Routes (/sitemap.xml and /robots.txt)", () => {
    it("GET /robots.txt returns valid text permitting indexing and pointing to sitemap", async () => {
      const res = await fetch(`${baseUrl}/robots.txt`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/plain");

      const text = await res.text();
      expect(text).toContain("User-agent: *");
      expect(text).toContain("Allow: /");
      expect(text).toContain("Allow: /requirements");
      expect(text).toContain("Allow: /auction/*");
      expect(text).toContain("Allow: /marketplace");
      expect(text).toContain("Disallow: /admin/*");
      expect(text).toContain("Disallow: /api/*");
      expect(text).toContain(`Sitemap: ${baseUrl}/sitemap.xml`);
    });

    it("GET /sitemap.xml returns valid XML sitemap with requirements, auctions, and categories", async () => {
      const res = await fetch(`${baseUrl}/sitemap.xml`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/xml");

      const xml = await res.text();
      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
      expect(xml).toContain(`${baseUrl}/`);
      expect(xml).toContain(`${baseUrl}/requirements`);
      expect(xml).toContain(`${baseUrl}/auctions`);
      expect(xml).toContain(`${baseUrl}/marketplace`);

      // Regional tenders
      expect(xml).toContain(`${baseUrl}/requirements/a0000000-0000-0000-0000-000000000001`);
      expect(xml).toContain(`${baseUrl}/auction/a0000000-0000-0000-0000-000000000001`);

      // Categories
      expect(xml).toContain("category=construction");
      expect(xml).toContain("category=steel");
      expect(xml).toContain("category=commercial_plumbing");

      // Verify structure tags
      expect(xml).toContain("<loc>");
      expect(xml).toContain("<lastmod>");
      expect(xml).toContain("<changefreq>");
      expect(xml).toContain("<priority>");
      expect(xml).toContain("</urlset>");
    });
  });

  describe("4. Single-Origin Static Serving & SPA Fallback", () => {
    it("serves index.html with Cache-Control: no-cache, no-store, must-revalidate on /", async () => {
      const res = await fetch(`${baseUrl}/`);
      expect(res.status).toBe(200);
      const cacheControl = res.headers.get("cache-control");
      expect(cacheControl).toContain("no-cache");
      expect(cacheControl).toContain("no-store");
      expect(cacheControl).toContain("must-revalidate");

      const body = await res.text();
      expect(body).toContain("<html");
    });

    it("serves sw.js with Cache-Control: no-cache, no-store, must-revalidate", async () => {
      const res = await fetch(`${baseUrl}/sw.js`);
      expect(res.status).toBe(200);
      const cacheControl = res.headers.get("cache-control");
      expect(cacheControl).toContain("no-cache");
      expect(cacheControl).toContain("no-store");
      expect(cacheControl).toContain("must-revalidate");
    });

    it("falls back to index.html for SPA routes like /requirements/tnd-hyd-1", async () => {
      const res = await fetch(`${baseUrl}/requirements/a0000000-0000-0000-0000-000000000001`);
      expect(res.status).toBe(200);
      const cacheControl = res.headers.get("cache-control");
      expect(cacheControl).toContain("no-cache");
      const body = await res.text();
      expect(body).toContain("<html");
    });

    it("falls back to index.html for /admin/dashboard", async () => {
      const res = await fetch(`${baseUrl}/admin/dashboard`);
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain("<html");
    });

    it("does not fall back to index.html for /api/nonexistent-route", async () => {
      const res = await fetch(`${baseUrl}/api/nonexistent-route`);
      expect(res.status).toBe(404);
    });
  });
});
