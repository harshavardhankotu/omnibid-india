import { Router, type IRouter, type Request, type Response } from "express";
import { getRegionalTenders } from "../services/auto-bootstrap.js";
import { db } from "../db/connection.js";
import { requirements } from "../db/schema.js";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

function getBaseUrl(req: Request): string {
  const envUrl =
    process.env.APP_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    (process.env.BASE_URL?.startsWith("http") ? process.env.BASE_URL : undefined);

  if (envUrl && envUrl.startsWith("http")) {
    return envUrl.replace(/\/$/, "");
  }

  const host = req.get("host") || "omnibid.in";
  const protocol =
    req.protocol === "https" || req.get("x-forwarded-proto") === "https"
      ? "https"
      : "http";

  return `${protocol}://${host}`;
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&apos;";
      case '"':
        return "&quot;";
      default:
        return c;
    }
  });
}

interface SitemapEntry {
  loc: string;
  lastmod: string;
  changefreq: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly";
  priority: number;
}

/**
 * GET /robots.txt
 * Standard robots.txt permitting indexing of requirements, auctions, marketplace,
 * disallowing /admin/* and /api/*, pointing to the dynamic sitemap.
 */
router.get("/robots.txt", (req: Request, res: Response): void => {
  const baseUrl = getBaseUrl(req);
  const content = [
    "User-agent: *",
    "Allow: /",
    "Allow: /requirements",
    "Allow: /requirements/*",
    "Allow: /auction/*",
    "Allow: /auctions/*",
    "Allow: /marketplace",
    "Allow: /categories",
    "Disallow: /admin/*",
    "Disallow: /admin",
    "Disallow: /api/*",
    "Disallow: /api",
    "",
    `Sitemap: ${baseUrl}/sitemap.xml`,
  ].join("\n");

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.status(200).send(content);
});

/**
 * GET /sitemap.xml
 * Dynamically generated XML sitemap listing active requirements, live auctions,
 * categories, and static pages with standard SEO tags.
 */
router.get("/sitemap.xml", async (req: Request, res: Response): Promise<void> => {
  const baseUrl = getBaseUrl(req);
  const now = new Date().toISOString();
  const entries: SitemapEntry[] = [];
  const seenLocs = new Set<string>();

  const addEntry = (entry: SitemapEntry) => {
    if (!seenLocs.has(entry.loc)) {
      seenLocs.add(entry.loc);
      entries.push(entry);
    }
  };

  // 1. Static Pages
  addEntry({
    loc: `${baseUrl}/`,
    lastmod: now,
    changefreq: "daily",
    priority: 1.0,
  });
  addEntry({
    loc: `${baseUrl}/requirements`,
    lastmod: now,
    changefreq: "hourly",
    priority: 0.9,
  });
  addEntry({
    loc: `${baseUrl}/auctions`,
    lastmod: now,
    changefreq: "hourly",
    priority: 0.9,
  });
  addEntry({
    loc: `${baseUrl}/marketplace`,
    lastmod: now,
    changefreq: "daily",
    priority: 0.8,
  });
  addEntry({
    loc: `${baseUrl}/categories`,
    lastmod: now,
    changefreq: "daily",
    priority: 0.8,
  });
  addEntry({
    loc: `${baseUrl}/compliance`,
    lastmod: now,
    changefreq: "weekly",
    priority: 0.7,
  });

  // 2. Categories
  const standardCategories = [
    "construction",
    "commercial_plumbing",
    "steel",
    "industrial_safety",
    "it",
    "logistics",
    "legal",
    "healthcare",
    "agriculture",
  ];
  for (const cat of standardCategories) {
    addEntry({
      loc: `${baseUrl}/requirements?category=${cat}`,
      lastmod: now,
      changefreq: "daily",
      priority: 0.8,
    });
  }

  // 3. Initial Regional Tenders (Requirements & Live Auctions)
  const regionalTenders = getRegionalTenders();
  for (const tender of regionalTenders) {
    addEntry({
      loc: `${baseUrl}/requirements/${tender.id}`,
      lastmod: tender.createdAt || now,
      changefreq: "hourly",
      priority: 0.8,
    });
    addEntry({
      loc: `${baseUrl}/auction/${tender.id}`,
      lastmod: tender.createdAt || now,
      changefreq: "always",
      priority: 0.9,
    });
  }

  // 4. Dynamic database requirements (if database is available)
  try {
    if (process.env.DATABASE_URL) {
      const dbReqs = await db
        .select({
          id: requirements.id,
          createdAt: requirements.created_at,
          status: requirements.status,
        })
        .from(requirements)
        .where(eq(requirements.status, "open"));

      for (const r of dbReqs) {
        addEntry({
          loc: `${baseUrl}/requirements/${r.id}`,
          lastmod: r.createdAt ? new Date(r.createdAt).toISOString() : now,
          changefreq: "hourly",
          priority: 0.8,
        });
        addEntry({
          loc: `${baseUrl}/auction/${r.id}`,
          lastmod: r.createdAt ? new Date(r.createdAt).toISOString() : now,
          changefreq: "always",
          priority: 0.9,
        });
      }
    }
  } catch (err: any) {
    // Database query deferred or failed, rely on seeded entries
  }

  // Build XML
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map(
      (e) =>
        `  <url>\n    <loc>${escapeXml(e.loc)}</loc>\n    <lastmod>${e.lastmod}</lastmod>\n    <changefreq>${e.changefreq}</changefreq>\n    <priority>${e.priority.toFixed(1)}</priority>\n  </url>`
    ),
    "</urlset>",
  ].join("\n");

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.status(200).send(xml);
});

export default router;
