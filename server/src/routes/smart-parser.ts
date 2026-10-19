import { Router, type IRouter, type Request, type Response } from "express";
import { lookupPinCode, parseSmartProcurementText } from "../services/smart-parser.service.js";
import { SEEDED_AFFILIATE_OFFERS } from "./affiliate.js";
import { db } from "../db/connection.js";
import { affiliate_offers } from "../db/schema.js";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

/**
 * GET /api/geo/pin/:pincode
 * Resolves Indian Postal PIN Code to City and State with commercial hub detection.
 */
router.get("/geo/pin/:pincode", async (req: Request, res: Response): Promise<void> => {
  const pincode = Array.isArray(req.params.pincode) ? req.params.pincode[0] : req.params.pincode;

  if (!pincode || !/^[1-9][0-9]{5}$/.test(pincode.trim())) {
    res.status(400).json({
      valid: false,
      error: "Invalid Indian Postal PIN code. Must be a 6-digit numeric code starting with digits 1-9.",
    });
    return;
  }

  const result = lookupPinCode(pincode.trim());
  res.json(result);
});

/**
 * POST /api/requirements/smart-parse
 * Parses messy WhatsApp / Chat BOQs, extracts tender fields, enriches location from PIN,
 * and attaches contextual affiliate commercial offers for the detected category.
 */
router.post("/requirements/smart-parse", async (req: Request, res: Response): Promise<void> => {
  try {
    const rawText = req.body.text || req.body.message || req.body.query || "";

    if (!rawText || typeof rawText !== "string" || rawText.trim().length === 0) {
      res.status(400).json({ error: "Missing 'text' parameter in request body" });
      return;
    }

    const parsed = parseSmartProcurementText(rawText);

    // Fetch active affiliate offers (DB with fallback to SEEDED_AFFILIATE_OFFERS)
    let allOffers = SEEDED_AFFILIATE_OFFERS;
    try {
      const dbOffers = await db.select().from(affiliate_offers).where(eq(affiliate_offers.active, true));
      if (dbOffers && dbOffers.length > 0) {
        allOffers = dbOffers;
      }
    } catch {
      // In-memory fallback
    }

    // Match contextual offers based on parsed category & title
    const searchTokens = [
      parsed.category.toLowerCase(),
      ...parsed.title.toLowerCase().split(/[\s,_\-\/]+/),
    ].filter((s) => s.length > 2);

    const scoredOffers: { offer: typeof allOffers[0]; score: number }[] = [];

    for (const offer of allOffers) {
      let score = 0;
      const keywords = (offer.category_keywords || []).map((k) => k.toLowerCase());

      for (const token of searchTokens) {
        for (const kw of keywords) {
          if (kw === token) score += 3;
          else if (kw.includes(token) || token.includes(kw)) score += 1;
        }
      }

      if (score > 0) {
        scoredOffers.push({ offer, score });
      }
    }

    scoredOffers.sort((a, b) => b.score - a.score);
    const contextualOffers =
      scoredOffers.length > 0
        ? scoredOffers.slice(0, 3).map((s) => s.offer)
        : allOffers.slice(0, 3);

    res.json({
      success: true,
      parsed: {
        ...parsed,
        matchedAffiliateOffers: contextualOffers,
      },
      contextualOffers,
    });
  } catch (error: any) {
    console.error("Error in smart-parse:", error);
    res.status(500).json({ error: error.message || "Failed to parse procurement text" });
  }
});

export default router;
