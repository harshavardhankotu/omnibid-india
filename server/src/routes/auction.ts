import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import {
  db, usersTable, requirementsTable, bidsTable,
  auctionConfigsTable, requirementLotsTable,
} from "@omnibid/db";
import { requireAuth } from "../middlewares/auth";
import { z } from "zod";

const router: IRouter = Router();

const BUYER_ROLES = ["buyer", "both", "retail_buyer", "enterprise_buyer"];
const ENTERPRISE_ROLES = ["enterprise_buyer"];

function isEnterpriseBuyer(role: string) {
  return ENTERPRISE_ROLES.includes(role);
}

// POST /auctions/:requirementId/config — create or update auction config
router.post("/auctions/:requirementId/config", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId));
  if (!user || !BUYER_ROLES.includes(user.role)) { res.status(403).json({ error: "Buyers only" }); return; }

  const reqId = String(req.params.requirementId);
  const [req_] = await db.select().from(requirementsTable).where(and(eq(requirementsTable.id, reqId), eq(requirementsTable.buyerId, user.id)));
  if (!req_) { res.status(404).json({ error: "Requirement not found or not yours" }); return; }

  const parsed = z.object({
    auctionType: z.enum(["standard", "limited", "sealed", "multi_round", "multi_lot"]).default("standard"),
    maxRounds: z.number().min(1).max(5).default(1),
    lotCount: z.number().min(1).max(20).default(1),
    vendorQualificationRequired: z.boolean().default(false),
    qualifiedVendorIds: z.array(z.string().uuid()).default([]),
    sealedRevealAt: z.string().datetime().optional(),
    rankingMode: z.enum(["balanced", "lowest_cost", "best_compliance", "fastest_start"]).default("balanced"),
    roundDeadlines: z.array(z.string().datetime()).default([]),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  // Validate: limited/sealed/multi_round require enterprise role
  if (["limited", "multi_round"].includes(parsed.data.auctionType) && !isEnterpriseBuyer(user.role)) {
    res.status(403).json({ error: "Limited and multi-round auctions require Enterprise Buyer role" });
    return;
  }

  const existing = await db.select().from(auctionConfigsTable).where(eq(auctionConfigsTable.requirementId, reqId));

  let config;
  if (existing.length > 0) {
    [config] = await db.update(auctionConfigsTable).set({
      auctionType: parsed.data.auctionType,
      maxRounds: parsed.data.maxRounds,
      lotCount: parsed.data.lotCount,
      vendorQualificationRequired: parsed.data.vendorQualificationRequired,
      qualifiedVendorIds: parsed.data.qualifiedVendorIds,
      sealedRevealAt: parsed.data.sealedRevealAt ? new Date(parsed.data.sealedRevealAt) : null,
      rankingMode: parsed.data.rankingMode,
      roundDeadlines: parsed.data.roundDeadlines,
      updatedAt: new Date(),
    }).where(eq(auctionConfigsTable.requirementId, reqId)).returning();
  } else {
    [config] = await db.insert(auctionConfigsTable).values({
      requirementId: reqId,
      auctionType: parsed.data.auctionType,
      maxRounds: parsed.data.maxRounds,
      lotCount: parsed.data.lotCount,
      vendorQualificationRequired: parsed.data.vendorQualificationRequired,
      qualifiedVendorIds: parsed.data.qualifiedVendorIds,
      sealedRevealAt: parsed.data.sealedRevealAt ? new Date(parsed.data.sealedRevealAt) : null,
      rankingMode: parsed.data.rankingMode,
      roundDeadlines: parsed.data.roundDeadlines,
    }).returning();
  }

  // Update requirement's auction type columns
  await db.update(requirementsTable).set({
    auctionType: parsed.data.auctionType,
    vendorQualificationRequired: parsed.data.vendorQualificationRequired,
    isMultiLot: parsed.data.lotCount > 1,
    lotCount: parsed.data.lotCount,
    maxRounds: parsed.data.maxRounds,
    rankingMode: parsed.data.rankingMode,
  }).where(eq(requirementsTable.id, reqId));

  res.json({
    ...config,
    sealedRevealAt: config.sealedRevealAt?.toISOString() ?? null,
    createdAt: config.createdAt.toISOString(),
    updatedAt: config.updatedAt.toISOString(),
  });
});

// GET /auctions/:requirementId/config
router.get("/auctions/:requirementId/config", requireAuth, async (req, res): Promise<void> => {
  const reqId = String(req.params.requirementId);
  const configs = await db.select().from(auctionConfigsTable).where(eq(auctionConfigsTable.requirementId, reqId));
  if (configs.length === 0) {
    res.json({ requirementId: reqId, auctionType: "standard", maxRounds: 1, lotCount: 1, currentRound: 1, vendorQualificationRequired: false, qualifiedVendorIds: [], rankingMode: "balanced", roundDeadlines: [] });
    return;
  }
  const config = configs[0];
  res.json({ ...config, sealedRevealAt: config.sealedRevealAt?.toISOString() ?? null, createdAt: config.createdAt.toISOString(), updatedAt: config.updatedAt.toISOString() });
});

// POST /auctions/:requirementId/advance-round — move multi-round to next round
router.post("/auctions/:requirementId/advance-round", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId));
  if (!user || !isEnterpriseBuyer(user.role)) { res.status(403).json({ error: "Enterprise buyers only" }); return; }

  const reqId = String(req.params.requirementId);
  const [config] = await db.select().from(auctionConfigsTable).where(eq(auctionConfigsTable.requirementId, reqId));
  if (!config || config.auctionType !== "multi_round") { res.status(400).json({ error: "Not a multi-round auction" }); return; }

  if (config.currentRound >= config.maxRounds) {
    res.status(400).json({ error: `Already at final round (${config.maxRounds})` });
    return;
  }

  // Reject non-shortlisted bids from round 1
  const shortlistBody = z.object({ shortlistedBidIds: z.array(z.string().uuid()) }).safeParse(req.body);
  if (shortlistBody.success && shortlistBody.data.shortlistedBidIds.length > 0) {
    // Reject bids not in shortlist
    await db.update(bidsTable)
      .set({ status: "rejected" })
      .where(and(
        eq(bidsTable.requirementId, reqId),
        eq(bidsTable.roundNumber, config.currentRound),
        sql`id not in (${sql.join(shortlistBody.data.shortlistedBidIds.map(id => sql`${id}::uuid`), sql`, `)})`,
      ));
  }

  const [updated] = await db.update(auctionConfigsTable)
    .set({ currentRound: config.currentRound + 1, updatedAt: new Date() })
    .where(eq(auctionConfigsTable.requirementId, reqId))
    .returning();

  await db.update(requirementsTable).set({ currentRound: config.currentRound + 1 }).where(eq(requirementsTable.id, reqId));

  res.json({ newRound: updated.currentRound, maxRounds: config.maxRounds, message: `Advanced to round ${updated.currentRound} of ${config.maxRounds}` });
});

// POST /auctions/:requirementId/reveal — reveal sealed bids
router.post("/auctions/:requirementId/reveal", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId));
  if (!user || !BUYER_ROLES.includes(user.role)) { res.status(403).json({ error: "Buyers only" }); return; }

  const reqId = String(req.params.requirementId);
  const [config] = await db.select().from(auctionConfigsTable).where(eq(auctionConfigsTable.requirementId, reqId));
  if (!config || config.auctionType !== "sealed") { res.status(400).json({ error: "Not a sealed-bid auction" }); return; }

  // Reveal all bids (in real system, unsealing would happen here)
  const bids = await db.select({
    id: bidsTable.id,
    providerId: bidsTable.providerId,
    bidAmount: bidsTable.bidAmount,
    status: bidsTable.status,
    estimatedCompletion: bidsTable.estimatedCompletion,
    message: bidsTable.message,
  }).from(bidsTable)
    .where(and(eq(bidsTable.requirementId, reqId), sql`status not in ('withdrawn','rejected')`))
    .orderBy(sql`bid_amount asc`);

  await db.update(auctionConfigsTable).set({ updatedAt: new Date() }).where(eq(auctionConfigsTable.id, config.id));

  res.json({
    revealed: true,
    revealedAt: new Date().toISOString(),
    bids: bids.map(b => ({ ...b, bidAmount: Number(b.bidAmount) })),
    lowestBid: bids.length > 0 ? Number(bids[0].bidAmount) : null,
  });
});

// GET /auctions/:requirementId/lots
router.get("/auctions/:requirementId/lots", requireAuth, async (req, res): Promise<void> => {
  const reqId = String(req.params.requirementId);
  const lots = await db.select().from(requirementLotsTable)
    .where(eq(requirementLotsTable.requirementId, reqId))
    .orderBy(requirementLotsTable.lotNumber);

  res.json(lots.map(l => ({
    ...l,
    maxBudget: Number(l.maxBudget ?? 0),
    createdAt: l.createdAt.toISOString(),
  })));
});

// POST /auctions/:requirementId/lots — create lots for multi-lot auction
router.post("/auctions/:requirementId/lots", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId));
  if (!user || !isEnterpriseBuyer(user.role)) { res.status(403).json({ error: "Enterprise buyers only" }); return; }

  const reqId = String(req.params.requirementId);
  const [req_] = await db.select().from(requirementsTable).where(and(eq(requirementsTable.id, reqId), eq(requirementsTable.buyerId, user.id)));
  if (!req_) { res.status(404).json({ error: "Requirement not found" }); return; }

  const parsed = z.object({
    lots: z.array(z.object({
      lotNumber: z.number().min(1),
      title: z.string().min(1),
      description: z.string().optional(),
      city: z.string().optional(),
      pincode: z.string().optional(),
      maxBudget: z.number().min(0).optional(),
      customData: z.record(z.unknown()).optional(),
    })).min(1).max(20),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  // Delete existing lots for this requirement
  await db.delete(requirementLotsTable).where(eq(requirementLotsTable.requirementId, reqId));

  const created = await db.insert(requirementLotsTable).values(
    parsed.data.lots.map(l => ({
      requirementId: reqId,
      lotNumber: l.lotNumber,
      title: l.title,
      description: l.description,
      city: l.city,
      pincode: l.pincode,
      maxBudget: l.maxBudget ? String(l.maxBudget) : null,
      customData: l.customData ?? {},
    }))
  ).returning();

  // Update requirement
  await db.update(requirementsTable).set({ isMultiLot: true, lotCount: created.length }).where(eq(requirementsTable.id, reqId));

  res.status(201).json(created.map(l => ({ ...l, maxBudget: Number(l.maxBudget ?? 0), createdAt: l.createdAt.toISOString() })));
});

/**
 * GET /auctions/:requirementId/live-stream
 * Server-Sent Events (SSE) live ticker for real-time bid updates and auction countdown.
 */
router.get("/auctions/:requirementId/live-stream", async (req, res): Promise<void> => {
  const reqId = String(req.params.requirementId);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  res.write(`event: connected\ndata: ${JSON.stringify({ requirementId: reqId, status: "live", timestamp: new Date().toISOString() })}\n\n`);

  try {
    const liveBids = await db
      .select({
        id: bidsTable.id,
        amount: bidsTable.bidAmount,
        status: bidsTable.status,
        createdAt: bidsTable.createdAt,
      })
      .from(bidsTable)
      .where(eq(bidsTable.requirementId, reqId))
      .orderBy(sql`${bidsTable.createdAt} DESC`)
      .limit(10);

    res.write(`event: bids_snapshot\ndata: ${JSON.stringify({ bids: liveBids })}\n\n`);
  } catch (e: any) {
    res.write(`event: error\ndata: ${JSON.stringify({ message: e.message })}\n\n`);
  }

  const heartbeat = setInterval(() => {
    res.write(`event: heartbeat\ndata: ${JSON.stringify({ time: Date.now() })}\n\n`);
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    res.end();
  });
});

export default router;
