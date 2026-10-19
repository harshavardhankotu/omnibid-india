import { Router, type IRouter, type Response } from "express";
import { eq, and, sql, asc } from "drizzle-orm";
import {
  db, usersTable, requirementsTable, bidsTable,
  auctionConfigsTable, requirementLotsTable, categoriesTable,
} from "@omnibid/db";
import { requireAuth } from "../middlewares/auth";
import { z } from "zod";
import { calculateEscrowBreakdown, validateGSTIN } from "../lib/gstin-tds.js";
import { simulateLiveBidding } from "../services/autonomous-engine.js";

// Active SSE client registry for real-time auction broadcasts
type SseClient = {
  res: Response;
  requirementId: string;
};
const activeSseClients = new Set<SseClient>();

// Set of auction requirement IDs where anti-sniping extension has fired
export const extendedAuctions = new Set<string>();

/**
 * Broadcasts an event to all connected SSE clients for a requirement
 */
export function broadcastAuctionEvent(requirementId: string, eventName: string, data: any): void {
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of activeSseClients) {
    if (client.requirementId === requirementId) {
      try {
        client.res.write(payload);
      } catch (err) {
        // Socket closed
      }
    }
  }
}

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
 * Immediately emits SNAPSHOT_SYNC containing leaderboard, totalBids, remainingSeconds, extended, currentL1.
 */
router.get("/auctions/:requirementId/live-stream", async (req, res): Promise<void> => {
  const reqId = String(req.params.requirementId);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  res.write(`event: connected\ndata: ${JSON.stringify({ requirementId: reqId, status: "live", timestamp: new Date().toISOString() })}\n\n`);

  // Register client for live broadcasts
  const client: SseClient = { res, requirementId: reqId };
  activeSseClients.add(client);

  try {
    // 1. Fetch requirement to determine auction countdown and status
    const [reqRecord] = await db
      .select()
      .from(requirementsTable)
      .where(eq(requirementsTable.id, reqId));

    const auctionEndsAtDate = reqRecord?.auctionEndsAt
      ? new Date(reqRecord.auctionEndsAt)
      : new Date(Date.now() + 3600 * 1000);

    const remainingSeconds = Math.max(
      0,
      Math.floor((auctionEndsAtDate.getTime() - Date.now()) / 1000)
    );
    const isExtended = extendedAuctions.has(reqId);

    // 2. Fetch active bids ordered by bid amount ascending (lowest price first for reverse auction)
    const activeBids = await db
      .select({
        id: bidsTable.id,
        providerId: bidsTable.providerId,
        bidAmount: bidsTable.bidAmount,
        status: bidsTable.status,
        isHighlighted: bidsTable.isHighlighted,
        createdAt: bidsTable.createdAt,
      })
      .from(bidsTable)
      .where(and(eq(bidsTable.requirementId, reqId), sql`${bidsTable.status} not in ('withdrawn', 'rejected')`))
      .orderBy(sql`${bidsTable.bidAmount} ASC`);

    const totalBids = activeBids.length;
    const top3 = activeBids.slice(0, 3);

    // 3. Assemble Leaderboard (L1, L2, L3) with provider trust score & verified status
    const leaderboard = await Promise.all(
      top3.map(async (b, index) => {
        const [provider] = await db
          .select({
            id: usersTable.id,
            name: usersTable.name,
            trustScore: usersTable.trustScore,
            isVerified: usersTable.isVerified,
            city: usersTable.city,
            gstNumber: usersTable.gstNumber,
          })
          .from(usersTable)
          .where(eq(usersTable.id, b.providerId));

        return {
          rank: `L${index + 1}` as "L1" | "L2" | "L3",
          bidId: b.id,
          providerId: b.providerId,
          providerName: provider?.name ?? "Verified Contractor",
          providerTrustScore: provider?.trustScore ?? 0,
          providerIsVerified: provider?.isVerified ?? false,
          providerCity: provider?.city ?? null,
          hasGstin: !!provider?.gstNumber,
          bidAmount: Number(b.bidAmount),
          createdAt: b.createdAt.toISOString(),
        };
      })
    );

    const currentL1 = leaderboard.length > 0 ? leaderboard[0].bidAmount : null;

    // 4. Immediately emit event: SNAPSHOT_SYNC
    const snapshotPayload = {
      leaderboard,
      totalBids,
      remainingSeconds,
      extended: isExtended,
      currentL1,
      timestamp: new Date().toISOString(),
    };

    res.write(`event: SNAPSHOT_SYNC\ndata: ${JSON.stringify(snapshotPayload)}\n\n`);

    // Backwards-compatible bids_snapshot
    res.write(`event: bids_snapshot\ndata: ${JSON.stringify({ bids: activeBids.slice(0, 10) })}\n\n`);
  } catch (e: any) {
    res.write(`event: error\ndata: ${JSON.stringify({ message: e.message })}\n\n`);
  }

  const heartbeat = setInterval(() => {
    try {
      res.write(`event: heartbeat\ndata: ${JSON.stringify({ time: Date.now() })}\n\n`);
    } catch {
      clearInterval(heartbeat);
      activeSseClients.delete(client);
    }
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    activeSseClients.delete(client);
    res.end();
  });
});

/**
 * GET /auctions/:requirementId/purchase-order
 * Generates an official Government-compliant GST Purchase Order & Section 194C TDS Certificate
 * with printable CSS (@media print), Form 16A and Rule 46 references.
 */
router.get("/auctions/:requirementId/purchase-order", async (req, res): Promise<void> => {
  const reqId = String(req.params.requirementId);

  try {
    const [requirement] = await db
      .select()
      .from(requirementsTable)
      .where(eq(requirementsTable.id, reqId));

    if (!requirement) {
      res.status(404).json({ error: "Requirement not found" });
      return;
    }

    const [buyer] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, requirement.buyerId));

    // Fetch winning bid, or current L1 bid as winning tender
    let winningBid: typeof bidsTable.$inferSelect | undefined;
    if (requirement.winningBidId) {
      const [b] = await db.select().from(bidsTable).where(eq(bidsTable.id, requirement.winningBidId));
      winningBid = b;
    }
    if (!winningBid) {
      const [l1] = await db
        .select()
        .from(bidsTable)
        .where(and(eq(bidsTable.requirementId, reqId), sql`${bidsTable.status} not in ('withdrawn', 'rejected')`))
        .orderBy(asc(bidsTable.bidAmount))
        .limit(1);
      winningBid = l1;
    }

    let contractor: typeof usersTable.$inferSelect | undefined;
    if (winningBid) {
      const [c] = await db.select().from(usersTable).where(eq(usersTable.id, winningBid.providerId));
      contractor = c;
    }

    const grossAmount = winningBid ? Number(winningBid.bidAmount) : Number(requirement.maxBudget);
    const contractorGstin = contractor?.gstNumber || null;

    // Calculate GST & Sec 194C TDS
    const breakdown = calculateEscrowBreakdown({
      grossAmountInr: grossAmount,
      gstinOrPan: contractorGstin,
    });

    const buyerGstValid = buyer?.gstNumber ? validateGSTIN(buyer.gstNumber).isValid : false;
    const poNumber = `OB-PO-${requirement.id.substring(0, 8).toUpperCase()}-${new Date().getFullYear()}`;
    const poDate = new Date().toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GST Purchase Order & TDS Certificate - ${poNumber}</title>
  <style>
    :root {
      --primary: #0f766e;
      --primary-dark: #115e59;
      --secondary: #0f172a;
      --border: #cbd5e1;
      --bg-light: #f8fafc;
      --text: #1e293b;
      --text-muted: #64748b;
      --success: #15803d;
      --amber: #b45309;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif;
      color: var(--text);
      background-color: #f1f5f9;
      padding: 30px 15px;
      line-height: 1.5;
    }
    .document-card {
      max-width: 900px;
      margin: 0 auto;
      background: #ffffff;
      padding: 40px;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
      border: 1px solid var(--border);
    }
    .no-print-toolbar {
      max-width: 900px;
      margin: 0 auto 20px auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .btn-print {
      background: var(--primary);
      color: #fff;
      border: none;
      padding: 10px 24px;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
      font-size: 15px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      transition: background 0.2s;
    }
    .btn-print:hover { background: var(--primary-dark); }
    .gov-header {
      border-bottom: 2px solid var(--secondary);
      padding-bottom: 16px;
      margin-bottom: 24px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .gov-title h1 {
      font-size: 22px;
      color: var(--secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }
    .gov-title h2 {
      font-size: 13px;
      color: var(--primary);
      font-weight: 600;
      text-transform: uppercase;
    }
    .gov-statute-tags {
      display: flex;
      gap: 8px;
      margin-top: 8px;
      flex-wrap: wrap;
    }
    .tag {
      background: #e2e8f0;
      color: #334155;
      font-size: 11px;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: 4px;
      border: 1px solid #cbd5e1;
    }
    .tag-gov {
      background: #ecfdf5;
      color: #065f46;
      border-color: #a7f3d0;
    }
    .po-meta {
      text-align: right;
      font-size: 13px;
    }
    .po-meta strong { color: var(--secondary); font-size: 15px; }
    .two-col-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-bottom: 28px;
    }
    .party-card {
      background: var(--bg-light);
      border: 1px solid var(--border);
      padding: 18px;
      border-radius: 6px;
    }
    .party-title {
      font-size: 12px;
      text-transform: uppercase;
      font-weight: 700;
      color: var(--primary);
      margin-bottom: 10px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 6px;
      letter-spacing: 0.5px;
    }
    .party-name { font-size: 16px; font-weight: 700; color: var(--secondary); margin-bottom: 4px; }
    .party-detail { font-size: 13px; color: var(--text-muted); margin-bottom: 3px; }
    .gstin-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      margin-top: 8px;
      background: #e0f2fe;
      color: #0369a1;
      border: 1px solid #bae6fd;
    }
    .gstin-verified {
      background: #dcfce7;
      color: var(--success);
      border-color: #86efac;
    }
    .scope-box {
      margin-bottom: 28px;
      border: 1px solid var(--border);
      border-radius: 6px;
      overflow: hidden;
    }
    .scope-header {
      background: #f1f5f9;
      padding: 10px 16px;
      font-weight: 700;
      font-size: 13px;
      text-transform: uppercase;
      color: var(--secondary);
      border-bottom: 1px solid var(--border);
    }
    .scope-content { padding: 14px 16px; font-size: 14px; }
    .breakdown-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 28px;
      font-size: 14px;
    }
    .breakdown-table th {
      background: var(--secondary);
      color: #fff;
      text-align: left;
      padding: 10px 14px;
      font-weight: 600;
      font-size: 13px;
    }
    .breakdown-table td {
      padding: 12px 14px;
      border-bottom: 1px solid var(--border);
    }
    .breakdown-table tr:last-child td {
      border-bottom: 2px solid var(--secondary);
    }
    .breakdown-table .amount-col { text-align: right; font-family: 'Courier New', Courier, monospace; font-weight: 600; }
    .total-row {
      background: #f8fafc;
      font-weight: 700;
    }
    .total-row td { color: var(--primary); font-size: 16px; }
    .compliance-notice {
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 6px;
      padding: 14px;
      font-size: 12px;
      color: #92400e;
      margin-bottom: 30px;
      line-height: 1.6;
    }
    .signature-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 20px;
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px dashed var(--border);
    }
    .sig-box {
      text-align: center;
      padding: 10px;
    }
    .sig-line {
      height: 48px;
      border-bottom: 1px solid #475569;
      margin-bottom: 8px;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      font-size: 11px;
      color: var(--text-muted);
      font-style: italic;
    }
    .sig-title { font-size: 12px; font-weight: 600; color: var(--secondary); }
    .sig-sub { font-size: 11px; color: var(--text-muted); }
    .watermark {
      text-align: center;
      margin-top: 24px;
      font-size: 11px;
      color: #94a3b8;
      letter-spacing: 0.5px;
    }

    @media print {
      body {
        background: #fff;
        padding: 0;
      }
      .no-print, .no-print-toolbar {
        display: none !important;
      }
      .document-card {
        box-shadow: none;
        border: none;
        padding: 0;
        max-width: 100%;
      }
      @page {
        margin: 15mm;
        size: A4 portrait;
      }
      .party-card, .scope-box, .compliance-notice {
        break-inside: avoid;
      }
      .breakdown-table th {
        background-color: #0f172a !important;
        color: #ffffff !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>
  <div class="no-print-toolbar">
    <div style="font-size: 14px; color: #475569;">
      <strong>OmniBid India</strong> • Statutory Reverse Auction Escrow Document
    </div>
    <button class="btn-print" onclick="window.print()">
      🖨️ Print / Save as PDF
    </button>
  </div>

  <div class="document-card">
    <div class="gov-header">
      <div class="gov-title">
        <h1>Tax Invoice & Purchase Order</h1>
        <h2>Government of India Compliance Verification</h2>
        <div class="gov-statute-tags">
          <span class="tag tag-gov">Rule 46 CGST Rules 2017</span>
          <span class="tag tag-gov">Section 194C Income Tax Act 1961</span>
          <span class="tag">Form No. 16A TDS Certificate Ref</span>
          <span class="tag">OmniBid Tripartite Escrow</span>
        </div>
      </div>
      <div class="po-meta">
        <div>PO Number: <strong>${poNumber}</strong></div>
        <div>Date of Issuance: <strong>${poDate}</strong></div>
        <div style="margin-top: 4px; color: var(--text-muted);">Auction ID: ${requirement.id.substring(0, 13)}...</div>
      </div>
    </div>

    <div class="two-col-grid">
      <div class="party-card">
        <div class="party-title">Buyer (Employer / Deductor)</div>
        <div class="party-name">${buyer?.name || "Corporate Buyer"}</div>
        <div class="party-detail">Email: ${buyer?.email || "N/A"}</div>
        <div class="party-detail">Phone: ${buyer?.phone || "N/A"}</div>
        <div class="party-detail">Location: ${[buyer?.city, buyer?.state].filter(Boolean).join(", ") || requirement.city + ", " + requirement.state}</div>
        <div class="gstin-badge ${buyerGstValid ? "gstin-verified" : ""}">
          GSTIN: ${buyer?.gstNumber || "Unregistered / Consumer"} ${buyerGstValid ? "✔ Valid Mod-36" : ""}
        </div>
      </div>

      <div class="party-card">
        <div class="party-title">Contractor (Vendor / Deductee)</div>
        <div class="party-name">${contractor?.name || "Winning L1 Bidder"}</div>
        <div class="party-detail">Email: ${contractor?.email || "N/A"}</div>
        <div class="party-detail">Legal Entity Type: <strong>${breakdown.entityType}</strong></div>
        <div class="party-detail">Location: ${[contractor?.city, contractor?.state].filter(Boolean).join(", ") || breakdown.stateName}</div>
        <div class="gstin-badge ${breakdown.validGstin ? "gstin-verified" : ""}">
          GSTIN: ${contractorGstin || "Under Verification"} ${breakdown.validGstin ? "✔ Valid Mod-36 Verified" : ""}
        </div>
        ${breakdown.pan ? `<div class="party-detail" style="margin-top: 4px;">Embedded PAN: <strong>${breakdown.pan}</strong></div>` : ""}
      </div>
    </div>

    <div class="scope-box">
      <div class="scope-header">Scope of Commercial Works Contract / Tender BOQ</div>
      <div class="scope-content">
        <div style="font-weight: 600; font-size: 15px; margin-bottom: 4px; color: var(--secondary);">
          ${requirement.title}
        </div>
        <div style="color: var(--text-muted); font-size: 13px; margin-bottom: 6px;">
          ${requirement.description}
        </div>
        <div style="display: flex; gap: 20px; font-size: 13px; color: var(--text);">
          <div>📍 Site: <strong>${requirement.city}, ${requirement.state} ${requirement.pincode ? `(${requirement.pincode})` : ""}</strong></div>
          <div>⏱️ Turnaround: <strong>${requirement.deadlineHours} Hours</strong></div>
          <div>🔒 Settlement: <strong>OmniBid Milestone Escrow</strong></div>
        </div>
      </div>
    </div>

    <table class="breakdown-table">
      <thead>
        <tr>
          <th>Particulars & Statutory Assessment</th>
          <th style="width: 140px;">Statutory Rate</th>
          <th class="amount-col" style="width: 180px;">Amount (INR)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <strong>Gross Contract / L1 Winning Bid Value</strong><br>
            <span style="font-size: 12px; color: var(--text-muted);">Agreed works contract procurement ceiling value via reverse bidding</span>
          </td>
          <td>Agreed L1</td>
          <td class="amount-col">₹${breakdown.grossAmountInr.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
        </tr>
        <tr>
          <td>
            <strong>OmniBid B2B Escrow & Platform Fee</strong><br>
            <span style="font-size: 12px; color: var(--text-muted);">Take-rate for escrow custodian, inspection gate, and dispute mediation</span>
          </td>
          <td>2.00%</td>
          <td class="amount-col">- ₹${breakdown.platformFeeInr.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
        </tr>
        <tr>
          <td>
            <strong>Section 194C TDS (Tax Deducted at Source)</strong><br>
            <span style="font-size: 12px; color: var(--text-muted);">
              ${breakdown.grossAmountInr <= 30000
                ? "Statutory single contract exemption applied (Gross amount ≤ ₹30,000 threshold)"
                : `Deducted under Sec 194C of Income Tax Act 1961 for ${breakdown.entityType}`}
            </span>
          </td>
          <td>${(breakdown.tdsRate * 100).toFixed(2)}%</td>
          <td class="amount-col">- ₹${breakdown.tdsInr.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
        </tr>
        <tr class="total-row">
          <td>
            <strong>Net Contractor Disbursement Settlement</strong><br>
            <span style="font-size: 12px; color: var(--primary);">Net amount scheduled for escrow release upon milestone inspection sign-off</span>
          </td>
          <td>Net Payout</td>
          <td class="amount-col">₹${breakdown.netSettlementInr.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
        </tr>
      </tbody>
    </table>

    <div class="compliance-notice">
      <strong>Statutory Tax Deduction & Escrow Note:</strong><br>
      • TDS under Section 194C of the Income Tax Act, 1961 is deducted at source at ${(breakdown.tdsRate * 100).toFixed(0)}% (${breakdown.entityType}) where the contract value exceeds ₹30,000.<br>
      • Form 16A quarterly TDS Certificate will be issued to PAN <strong>${breakdown.pan || "N/A"}</strong> by the deductor within 15 days of filing Form 26Q.<br>
      • In accordance with Rule 46 of CGST Rules, 2017, this document constitutes a legally binding purchase order and escrow payment instruction.
    </div>

    <div class="signature-grid">
      <div class="sig-box">
        <div class="sig-line">Digitally Authenticated</div>
        <div class="sig-title">${buyer?.name || "Buyer Authorized Rep"}</div>
        <div class="sig-sub">Employer / Deductor Signatory</div>
      </div>
      <div class="sig-box">
        <div class="sig-line">Digitally Verified via PAN</div>
        <div class="sig-title">${contractor?.name || "Contractor Authorized Rep"}</div>
        <div class="sig-sub">Contractor / Deductee Signatory</div>
      </div>
      <div class="sig-box">
        <div class="sig-line" style="color: var(--primary); font-weight: 700;">OMNIBID VERIFIED SEAL</div>
        <div class="sig-title">OmniBid India Trust & Escrow</div>
        <div class="sig-sub">Automated Escrow Custodian</div>
      </div>
    </div>

    <div class="watermark">
      Generated automatically by OmniBid India Core Engine • Security Hash: ${requirement.id.replace(/-/g, "").substring(0, 24).toUpperCase()} • Form No. 16A & Rule 46 CGST
    </div>
  </div>
</body>
</html>`;

    if (req.query.format === "json" || req.headers.accept?.includes("application/json")) {
      res.json({
        success: true,
        poNumber,
        poDate,
        requirement: {
          id: requirement.id,
          title: requirement.title,
          city: requirement.city,
          state: requirement.state,
          maxBudget: Number(requirement.maxBudget),
        },
        buyer: buyer ? { id: buyer.id, name: buyer.name, email: buyer.email, gstNumber: buyer.gstNumber } : null,
        contractor: contractor ? { id: contractor.id, name: contractor.name, email: contractor.email, gstNumber: contractor.gstNumber } : null,
        breakdown,
        html,
      });
      return;
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (error: any) {
    console.error("Error generating purchase order:", error);
    res.status(500).json({ error: error.message || "Failed to generate purchase order" });
  }
});

/**
 * POST /auctions/:requirementId/simulate-activity
 * Triggers realistic live bidding war simulation in the War Room with 3 regional contractors,
 * anti-sniping extension, VAPID outbid notifications, and real-time SSE broadcasts.
 */
router.post("/auctions/:requirementId/simulate-activity", async (req, res): Promise<void> => {
  try {
    const requirementId = String(req.params.requirementId);
    const result = await simulateLiveBidding(requirementId, req.body);
    res.json({ success: true, ...result });
  } catch (error: any) {
    console.error("Error simulating live auction bidding war:", error);
    res.status(500).json({ success: false, error: error.message || "Failed to simulate bidding activity" });
  }
});

// Also bind /auction/:requirementId/simulate-activity for singular route compatibility
router.post("/auction/:requirementId/simulate-activity", async (req, res): Promise<void> => {
  try {
    const requirementId = String(req.params.requirementId);
    const result = await simulateLiveBidding(requirementId, req.body);
    res.json({ success: true, ...result });
  } catch (error: any) {
    console.error("Error simulating live auction bidding war:", error);
    res.status(500).json({ success: false, error: error.message || "Failed to simulate bidding activity" });
  }
});

export default router;

