import { Router, type IRouter } from "express";
import { eq, and, desc, asc, avg, count, min } from "drizzle-orm";
import { db, bidsTable, requirementsTable, usersTable, categoriesTable, reviewsTable, providerSubscriptionsTable } from "@omnibid/db";
import { CreateBidBody, ListBidsQueryParams } from "@omnibid/api-zod";
import { requireAuth, requireCompliance } from "../middlewares/auth";
import { notifyUser } from "../lib/notifications";
import { broadcastAuctionEvent, extendedAuctions } from "./auction.js";
import { notifyOutbid } from "../services/push-notification.service.js";
import { broadcastDeal } from "../services/auto-broadcaster.js";
import { SEEDED_AFFILIATE_OFFERS } from "./affiliate.js";

const router: IRouter = Router();

async function formatBid(b: typeof bidsTable.$inferSelect) {
  const [provider] = await db.select().from(usersTable).where(eq(usersTable.id, b.providerId));
  const [reviewStats] = await db.select({ avg: avg(reviewsTable.rating), count: count() }).from(reviewsTable).where(eq(reviewsTable.revieweeId, b.providerId));
  const [sub] = await db.select().from(providerSubscriptionsTable).where(eq(providerSubscriptionsTable.providerId, b.providerId));
  return {
    id: b.id,
    requirementId: b.requirementId,
    providerId: b.providerId,
    bidAmount: Number(b.bidAmount),
    message: b.message,
    proofOfWork: b.proofOfWork,
    portfolioUrl: b.portfolioUrl,
    estimatedCompletion: b.estimatedCompletion,
    executorType: b.executorType,
    subcontractorName: b.subcontractorName,
    envelopeAUrl: b.envelopeAUrl,
    crewSizeOffered: b.crewSizeOffered,
    isBackhaul: b.isBackhaul,
    bidSource: b.bidSource,
    status: b.status,
    isHighlighted: b.isHighlighted,
    providerName: provider?.name ?? "Unknown",
    providerCity: provider?.city ?? null,
    providerTrustScore: provider?.trustScore ?? 0,
    providerIsVerified: provider?.isVerified ?? false,
    providerAvgRating: reviewStats?.avg ? Number(reviewStats.avg) : null,
    providerReviewCount: Number(reviewStats?.count ?? 0),
    providerSubscriptionPlan: sub?.plan ?? null,
    createdAt: b.createdAt.toISOString(),
  };
}

router.get("/requirements/:requirementId/bids", async (req, res): Promise<void> => {
  const requirementId = Array.isArray(req.params.requirementId) ? req.params.requirementId[0] : req.params.requirementId;
  const params = ListBidsQueryParams.safeParse(req.query);
  const sortBy = params.success ? params.data.sortBy : undefined;

  const bids = await db.select().from(bidsTable).where(eq(bidsTable.requirementId, requirementId)).orderBy(desc(bidsTable.isHighlighted));

  const formatted = await Promise.all(bids.map(formatBid));

  if (sortBy === "lowest_price") formatted.sort((a, b) => a.bidAmount - b.bidAmount);
  else if (sortBy === "highest_rating") formatted.sort((a, b) => (b.providerAvgRating ?? 0) - (a.providerAvgRating ?? 0));
  else if (sortBy === "fastest_start") formatted.sort(() => 0);

  formatted.sort((a, b) => (b.isHighlighted ? 1 : 0) - (a.isHighlighted ? 1 : 0));
  res.json(formatted);
});

router.post("/requirements/:requirementId/bids", requireAuth, requireCompliance, async (req, res): Promise<void> => {
  const requirementId = Array.isArray(req.params.requirementId) ? req.params.requirementId[0] : req.params.requirementId;
  const parsed = CreateBidBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [requirement] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, requirementId));
  if (!requirement || requirement.status !== "open") { res.status(400).json({ error: "Requirement not open" }); return; }

  // Duplicate bid check to prevent multiple active bids from same provider
  const [existingBid] = await db
    .select()
    .from(bidsTable)
    .where(
      and(
        eq(bidsTable.requirementId, requirementId),
        eq(bidsTable.providerId, req.user!.userId),
        eq(bidsTable.status, "active")
      )
    );
  if (existingBid) {
    res.status(400).json({ error: "You have already placed an active bid on this requirement." });
    return;
  }

  // Price floor check
  const [category] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, requirement.categoryId));
  if (category?.minBidFloor && parsed.data.bidAmount < Number(category.minBidFloor)) {
    res.status(400).json({ error: `Bid amount is below the minimum floor of ₹${category.minBidFloor} for ${category.name}` });
    return;
  }

  const [sub] = await db.select().from(providerSubscriptionsTable).where(eq(providerSubscriptionsTable.providerId, req.user!.userId));
  if (sub && sub.bidsRemaining <= 0 && sub.plan === "free") {
    res.status(403).json({ error: "No bids remaining on free plan. Please upgrade." });
    return;
  }

  // New Provider Boost: auto-highlight first 10 bids
  const [allBidsByProvider] = await db.select({ count: count() }).from(bidsTable).where(eq(bidsTable.providerId, req.user!.userId));
  const isNewProvider = Number(allBidsByProvider?.count ?? 0) < 10;
  const shouldHighlight = parsed.data.isHighlighted || isNewProvider;

  // For two_envelope requirements, initial status is envelope_a_pending if envelopeAUrl provided
  const isTwoEnvelope = requirement.bidType === "two_envelope";
  const hasEnvA = !!(parsed.data as { envelopeAUrl?: string }).envelopeAUrl;
  const bidStatus = isTwoEnvelope ? (hasEnvA ? "envelope_a_pending" : "active") : "active";

  // Check current L1 bid prior to inserting the new bid
  const [previousL1] = await db
    .select({
      id: bidsTable.id,
      providerId: bidsTable.providerId,
      bidAmount: bidsTable.bidAmount,
    })
    .from(bidsTable)
    .where(and(eq(bidsTable.requirementId, requirementId), eq(bidsTable.status, "active")))
    .orderBy(asc(bidsTable.bidAmount))
    .limit(1);

  const [bid] = await db.insert(bidsTable).values({
    requirementId,
    providerId: req.user!.userId,
    bidAmount: String(parsed.data.bidAmount),
    message: parsed.data.message,
    proofOfWork: parsed.data.proofOfWork ?? null,
    portfolioUrl: parsed.data.portfolioUrl ?? null,
    estimatedCompletion: parsed.data.estimatedCompletion,
    executorType: (parsed.data.executorType as "self" | "partial") ?? "self",
    subcontractorName: parsed.data.subcontractorName ?? null,
    envelopeAUrl: (parsed.data as { envelopeAUrl?: string }).envelopeAUrl ?? null,
    crewSizeOffered: (parsed.data as { crewSizeOffered?: number }).crewSizeOffered ?? null,
    isBackhaul: (parsed.data as { isBackhaul?: boolean }).isBackhaul ?? false,
    bidSource: (parsed.data as { bidSource?: string }).bidSource ?? "web",
    isHighlighted: shouldHighlight,
    status: bidStatus as "active" | "envelope_a_pending",
  }).returning();

  if (sub && sub.plan === "free") {
    await db.update(providerSubscriptionsTable).set({ bidsRemaining: sub.bidsRemaining - 1 }).where(eq(providerSubscriptionsTable.id, sub.id));
  }

  // Check if this new bid captures L1 position
  const newBidAmount = parsed.data.bidAmount;
  const isNewL1 = !previousL1 || newBidAmount < Number(previousL1.bidAmount);

  if (isNewL1) {
    // 1. Anti-Sniping Timer Extension:
    // When a new L1 bid arrives within 120 seconds of auctionEndsAt:
    const now = Date.now();
    const endsAtMs = new Date(requirement.auctionEndsAt).getTime();
    const remainingSeconds = Math.floor((endsAtMs - now) / 1000);

    if (remainingSeconds <= 120) {
      const newEndsAt = new Date(now + 120 * 1000);
      await db
        .update(requirementsTable)
        .set({ auctionEndsAt: newEndsAt })
        .where(eq(requirementsTable.id, requirementId));

      extendedAuctions.add(requirementId);

      // Emit AUCTION_EXTENDED event via SSE stream
      broadcastAuctionEvent(requirementId, "AUCTION_EXTENDED", {
        requirementId,
        newAuctionEndsAt: newEndsAt.toISOString(),
        remainingSeconds: 120,
        extendedBySeconds: 120,
        triggeredByBidId: bid.id,
        newL1Amount: newBidAmount,
        reason: "Anti-sniping auto extension triggered within final 120 seconds",
        timestamp: new Date().toISOString(),
      });
    }

    // 2. Trigger notifyOutbid to the previously leading contractor
    if (previousL1 && previousL1.providerId !== req.user!.userId) {
      notifyOutbid(
        requirementId,
        previousL1.providerId,
        newBidAmount,
        requirement.title
      ).catch((err) => console.warn("[Bids] Failed to send outbid notification:", err));
    }

    // 3. Emit real-time L1 update via SSE
    broadcastAuctionEvent(requirementId, "NEW_L1_BID", {
      requirementId,
      bidId: bid.id,
      amount: newBidAmount,
      providerId: req.user!.userId,
      timestamp: new Date().toISOString(),
    });

    // 4. Trigger non-blocking multi-lingual deal broadcast to Telegram
    const matchedOffer = SEEDED_AFFILIATE_OFFERS.find((o) => o.active) || SEEDED_AFFILIATE_OFFERS[0];
    broadcastDeal(requirement, bid, matchedOffer).catch((err) =>
      console.warn("[Bids] Failed to broadcast deal to Telegram:", err)
    );
  }

  await notifyUser(requirement.buyerId, "new_bid", `New bid received for "${requirement.title}"`, { requirementId, bidId: bid.id });

  res.status(201).json(await formatBid(bid));
});

router.post("/bids/:id/approve-envelope-a", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [bid] = await db.select().from(bidsTable).where(eq(bidsTable.id, id));
  if (!bid) { res.status(404).json({ error: "Bid not found" }); return; }

  const [requirement] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, bid.requirementId));
  if (!requirement) { res.status(404).json({ error: "Requirement not found" }); return; }
  if (requirement.buyerId !== req.user!.userId) { res.status(403).json({ error: "Forbidden" }); return; }

  const [updated] = await db.update(bidsTable)
    .set({ status: "envelope_a_approved" })
    .where(eq(bidsTable.id, id))
    .returning();

  await notifyUser(bid.providerId, "envelope_approved", `Your technical bid for "${requirement.title}" was approved! Your financial amount is now visible.`, { requirementId: bid.requirementId, bidId: id });

  res.json(await formatBid(updated));
});

router.post("/bids/:id/withdraw", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [bid] = await db.select().from(bidsTable).where(eq(bidsTable.id, id));
  if (!bid) { res.status(404).json({ error: "Bid not found" }); return; }
  if (bid.providerId !== req.user!.userId) { res.status(403).json({ error: "Forbidden" }); return; }
  const [updated] = await db.update(bidsTable).set({ status: "withdrawn" }).where(eq(bidsTable.id, id)).returning();
  res.json(await formatBid(updated));
});

router.get("/bids/my", requireAuth, async (req, res): Promise<void> => {
  const bids = await db.select().from(bidsTable).where(eq(bidsTable.providerId, req.user!.userId)).orderBy(desc(bidsTable.createdAt));

  const results = await Promise.all(bids.map(async (b) => {
    const [req2] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, b.requirementId));
    const [cat] = req2 ? await db.select().from(categoriesTable).where(eq(categoriesTable.id, req2.categoryId)) : [null];
    const [buyer] = req2 ? await db.select().from(usersTable).where(eq(usersTable.id, req2.buyerId)) : [null];
    const [bidStats] = req2 ? await db.select({ count: count(), minBid: min(bidsTable.bidAmount) }).from(bidsTable).where(eq(bidsTable.requirementId, req2.id)) : [null];

    const formattedBid = await formatBid(b);
    return {
      ...formattedBid,
      requirement: req2 && cat && buyer ? {
        id: req2.id,
        buyerId: req2.buyerId,
        categoryId: req2.categoryId,
        categoryName: cat.name,
        categorySlug: cat.slug,
        categoryIconName: cat.iconName,
        title: req2.title,
        description: req2.description,
        customData: req2.customData,
        city: req2.city,
        state: req2.state,
        pincode: req2.pincode,
        maxBudget: Number(req2.maxBudget),
        deadlineHours: req2.deadlineHours,
        auctionEndsAt: req2.auctionEndsAt.toISOString(),
        status: req2.status,
        bidType: req2.bidType,
        isMegaProject: req2.isMegaProject,
        isSyndicate: req2.isSyndicate,
        jugaadMode: req2.jugaadMode,
        attachmentUrl: req2.attachmentUrl,
        winningBidId: req2.winningBidId,
        isHighTicket: req2.isHighTicket,
        isRecurring: req2.isRecurring,
        bidCount: Number(bidStats?.count ?? 0),
        lowestBid: bidStats?.minBid ? Number(bidStats.minBid) : null,
        buyerName: buyer.name,
        createdAt: req2.createdAt.toISOString(),
      } : null,
    };
  }));

  res.json(results);
});

export default router;
