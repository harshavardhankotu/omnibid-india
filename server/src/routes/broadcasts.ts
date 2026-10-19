import { Router, type IRouter, type Request, type Response } from "express";
import {
  getRecentBroadcasts,
  broadcastDeal,
} from "../services/auto-broadcaster.js";
import { SEEDED_AFFILIATE_OFFERS } from "./affiliate.js";

const router: IRouter = Router();

/**
 * GET /api/broadcasts/recent
 * Returns the last 20 auto-broadcast events for the Admin Revenue Cockpit.
 */
router.get("/broadcasts/recent", async (req: Request, res: Response): Promise<void> => {
  const limitParam = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;
  const limit = Math.min(Math.max(1, limitParam), 100);
  const broadcasts = getRecentBroadcasts(limit);

  res.json({
    success: true,
    count: broadcasts.length,
    broadcasts,
  });
});

/**
 * POST /api/broadcasts/trigger
 * Triggers a manual deal broadcast test or simulation.
 */
router.post("/broadcasts/trigger", async (req: Request, res: Response): Promise<void> => {
  try {
    const { requirement, l1Bid, offerId } = req.body;

    const dummyReq = requirement || {
      id: `req_${Date.now()}`,
      title: "500 Bags UltraTech OPC 53 Grade Cement",
      categoryName: "Cement & Concrete",
      city: "Hyderabad",
      state: "Telangana",
      pincode: "500081",
      maxBudget: 190000,
    };

    const dummyBid = l1Bid || {
      id: `bid_${Date.now()}`,
      bidAmount: 172000,
    };

    const matchedOffer =
      SEEDED_AFFILIATE_OFFERS.find((o) => o.id === offerId) ||
      SEEDED_AFFILIATE_OFFERS[0];

    const result = await broadcastDeal(dummyReq, dummyBid, matchedOffer);
    res.json({ success: true, broadcast: result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
