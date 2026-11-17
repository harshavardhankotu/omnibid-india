import { Router, type IRouter } from "express";
import { eq, and, desc, count, min, sql, ilike, or } from "drizzle-orm";
import { db, requirementsTable, categoriesTable, usersTable, bidsTable, reviewsTable, providerSubscriptionsTable, paymentsTable } from "@omnibid/db";
import { CreateRequirementBody, ListRequirementsQueryParams, AcceptBidBody } from "@omnibid/api-zod";
import { requireAuth, optionalAuth } from "../middlewares/auth";
import { notifyUser } from "../lib/notifications";
import {
  subscribeToRequirement,
  unsubscribeFromRequirement,
  isUserSubscribedToRequirement,
  getRequirementSubscriberCount,
} from "../services/requirement-alerts.service.js";
import {
  saveRequirementForUser,
  unsaveRequirementForUser,
  getSavedRequirementEntriesForUser,
} from "../services/saved-requirements.service.js";
import {
  getRequirementActivityLog,
  recordRequirementActivity,
} from "../services/activity-log.service.js";
import { avg } from "drizzle-orm";

const router: IRouter = Router();

function formatReq(r: typeof requirementsTable.$inferSelect, cat: typeof categoriesTable.$inferSelect, buyer: typeof usersTable.$inferSelect, bidCount: number, lowestBid: number | null) {
  return {
    id: r.id,
    buyerId: r.buyerId,
    categoryId: r.categoryId,
    categoryName: cat.name,
    categorySlug: cat.slug,
    categoryIconName: cat.iconName,
    title: r.title,
    description: r.description,
    customData: r.customData,
    city: r.city,
    state: r.state,
    pincode: r.pincode,
    maxBudget: Number(r.maxBudget),
    deadlineHours: r.deadlineHours,
    auctionEndsAt: r.auctionEndsAt.toISOString(),
    status: r.status,
    bidType: r.bidType,
    isMegaProject: r.isMegaProject,
    isSyndicate: r.isSyndicate,
    jugaadMode: r.jugaadMode,
    attachmentUrl: r.attachmentUrl,
    winningBidId: r.winningBidId,
    isHighTicket: r.isHighTicket,
    isRecurring: r.isRecurring,
    recurringInterval: r.recurringInterval,
    depositAmount: r.depositAmount ? Number(r.depositAmount) : null,
    depositPaid: r.depositPaid,
    bidCount,
    lowestBid,
    buyerName: buyer.name,
    createdAt: r.createdAt.toISOString(),
  };
}

router.get("/requirements", optionalAuth, async (req, res): Promise<void> => {
  const params = ListRequirementsQueryParams.safeParse(req.query);

  const conditions = [];
  if (params.success) {
    if (params.data.categoryId) conditions.push(eq(requirementsTable.categoryId, params.data.categoryId as string));
    if (params.data.city) conditions.push(eq(requirementsTable.city, params.data.city as string));
    if (params.data.status) conditions.push(eq(requirementsTable.status, params.data.status as "open" | "accepted" | "completed" | "expired" | "cancelled"));
    else conditions.push(eq(requirementsTable.status, "open"));
    const search = (params.data as { search?: string }).search;
    if (search) {
      conditions.push(or(
        ilike(requirementsTable.title, `%${search}%`),
        ilike(requirementsTable.description, `%${search}%`),
        ilike(requirementsTable.city, `%${search}%`)
      )!);
    }
  } else {
    conditions.push(eq(requirementsTable.status, "open"));
  }

  const limit = params.success && params.data.limit ? Number(params.data.limit) : 20;
  const offset = params.success && params.data.offset ? Number(params.data.offset) : 0;

  const rows = await db
    .select()
    .from(requirementsTable)
    .where(and(...conditions))
    .orderBy(desc(requirementsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db
    .select({ total: count() })
    .from(requirementsTable)
    .where(and(...conditions));

  const results = await Promise.all(rows.map(async (r) => {
    const [cat] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, r.categoryId));
    const [buyer] = await db.select().from(usersTable).where(eq(usersTable.id, r.buyerId));
    const [bidStats] = await db
      .select({ count: count(), minBid: min(bidsTable.bidAmount) })
      .from(bidsTable)
      .where(and(eq(bidsTable.requirementId, r.id), eq(bidsTable.status, "active")));

    return formatReq(r, cat, buyer, Number(bidStats?.count ?? 0), bidStats?.minBid ? Number(bidStats.minBid) : null);
  }));

  res.json({ requirements: results, total: Number(total) });
});

router.post("/requirements", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateRequirementBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { categoryId, title, description, customData, city, state, pincode, maxBudget, deadlineHours, attachmentUrl, isRecurring, recurringInterval } = parsed.data;
  const pd = parsed.data as { isMegaProject?: boolean; isSyndicate?: boolean; jugaadMode?: boolean };
  const auctionEndsAt = new Date(Date.now() + deadlineHours * 60 * 60 * 1000);
  const isHighTicket = maxBudget > 10000;
  const depositAmount = isHighTicket ? String(Math.round(maxBudget * 0.1)) : null;

  // Auto set two_envelope for high-budget enterprise requirements
  const [buyer] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId));
  const isEnterprise = buyer?.role === "enterprise_buyer";
  const bidType: "standard" | "two_envelope" = (isEnterprise && maxBudget >= 100000) ? "two_envelope" : "standard";

  const [requirement] = await db.insert(requirementsTable).values({
    buyerId: req.user!.userId,
    categoryId,
    title,
    description,
    customData: customData ?? null,
    city,
    state,
    pincode: pincode ?? null,
    maxBudget: String(maxBudget),
    deadlineHours,
    auctionEndsAt,
    isHighTicket,
    bidType,
    isMegaProject: pd.isMegaProject ?? false,
    isSyndicate: pd.isSyndicate ?? false,
    jugaadMode: pd.jugaadMode ?? false,
    isRecurring: isRecurring ?? false,
    recurringInterval: recurringInterval ?? null,
    depositAmount,
    attachmentUrl: attachmentUrl ?? null,
  }).returning();

  const [cat] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, categoryId));

  res.status(201).json(formatReq(requirement, cat, buyer, 0, null));
});

router.get("/requirements/my", requireAuth, async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(requirementsTable)
    .where(eq(requirementsTable.buyerId, req.user!.userId))
    .orderBy(desc(requirementsTable.createdAt));

  const results = await Promise.all(rows.map(async (r) => {
    const [cat] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, r.categoryId));
    const [buyer] = await db.select().from(usersTable).where(eq(usersTable.id, r.buyerId));
    const [bidStats] = await db
      .select({ count: count(), minBid: min(bidsTable.bidAmount) })
      .from(bidsTable)
      .where(eq(bidsTable.requirementId, r.id));
    return formatReq(r, cat, buyer, Number(bidStats?.count ?? 0), bidStats?.minBid ? Number(bidStats.minBid) : null);
  }));

  res.json(results);
});

router.get("/requirements/saved", requireAuth, async (req, res): Promise<void> => {
  const entries = getSavedRequirementEntriesForUser(req.user!.userId);
  if (entries.length === 0) {
    res.json({ requirements: [], savedIds: [] });
    return;
  }

  const hydrated = await Promise.all(
    entries.map(async ({ requirementId, savedAt }) => {
      const [r] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, requirementId));
      if (!r) return null;
      const [cat] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, r.categoryId));
      const [buyer] = await db.select().from(usersTable).where(eq(usersTable.id, r.buyerId));
      if (!cat || !buyer) return null;
      const [bidStats] = await db
        .select({ count: count(), minBid: min(bidsTable.bidAmount) })
        .from(bidsTable)
        .where(and(eq(bidsTable.requirementId, r.id), eq(bidsTable.status, "active")));
      return {
        ...formatReq(r, cat, buyer, Number(bidStats?.count ?? 0), bidStats?.minBid ? Number(bidStats.minBid) : null),
        savedAt,
      };
    })
  );

  const valid = hydrated.filter((item): item is NonNullable<typeof item> => item !== null);
  res.json({
    requirements: valid,
    savedIds: valid.map((item) => item.id),
  });
});

router.post("/requirements/:id/bookmark", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [requirement] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, id));
  if (!requirement) {
    res.status(404).json({ error: "Requirement not found" });
    return;
  }

  const result = saveRequirementForUser(req.user!.userId, id);
  res.status(201).json({
    requirementId: id,
    saved: true,
    savedAt: result.savedAt,
  });
});

router.delete("/requirements/:id/bookmark", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [requirement] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, id));
  if (!requirement) {
    res.status(404).json({ error: "Requirement not found" });
    return;
  }

  unsaveRequirementForUser(req.user!.userId, id);
  res.json({
    requirementId: id,
    saved: false,
  });
});

router.get("/requirements/stats/:id", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [stats] = await db
    .select({
      count: count(),
      minBid: min(bidsTable.bidAmount),
      maxBid: sql<string>`MAX(${bidsTable.bidAmount})`,
      avgBid: sql<string>`AVG(${bidsTable.bidAmount})`,
    })
    .from(bidsTable)
    .where(and(eq(bidsTable.requirementId, id), eq(bidsTable.status, "active")));

  const bidCount = Number(stats?.count ?? 0);

  res.json({
    requirementId: id,
    bidCount,
    lowestBid: stats?.minBid ? Number(stats.minBid) : null,
    highestBid: stats?.maxBid ? Number(stats.maxBid) : null,
    avgBid: stats?.avgBid ? Number(stats.avgBid) : null,
    isBidWar: bidCount >= 5,
  });
});

router.get("/requirements/:id/subscribe", optionalAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [requirement] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, id));
  if (!requirement) {
    res.status(404).json({ error: "Requirement not found" });
    return;
  }

  const allBids = await db.select().from(bidsTable).where(eq(bidsTable.requirementId, id));
  const activeAmounts = allBids
    .filter((b) => (b.status === "active" || b.status === "envelope_a_approved") && Number(b.bidAmount) > 0)
    .map((b) => Number(b.bidAmount));
  const overallLowestBid = activeAmounts.length > 0 ? Math.min(...activeAmounts) : null;

  const userAmounts = req.user
    ? allBids
        .filter(
          (b) =>
            b.providerId === req.user!.userId &&
            (b.status === "active" || b.status === "envelope_a_approved") &&
            Number(b.bidAmount) > 0
        )
        .map((b) => Number(b.bidAmount))
    : [];
  const userBestBid = userAmounts.length > 0 ? Math.min(...userAmounts) : null;

  res.json({
    requirementId: id,
    subscribed: req.user ? isUserSubscribedToRequirement(id, req.user.userId) : false,
    subscriberCount: getRequirementSubscriberCount(id),
    userBestBid,
    overallLowestBid,
    currentBestBid: userBestBid ?? overallLowestBid,
  });
});

router.post("/requirements/:id/subscribe", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [requirement] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, id));
  if (!requirement) {
    res.status(404).json({ error: "Requirement not found" });
    return;
  }

  subscribeToRequirement(id, req.user!.userId);

  const allBids = await db.select().from(bidsTable).where(eq(bidsTable.requirementId, id));
  const activeAmounts = allBids
    .filter((b) => (b.status === "active" || b.status === "envelope_a_approved") && Number(b.bidAmount) > 0)
    .map((b) => Number(b.bidAmount));
  const overallLowestBid = activeAmounts.length > 0 ? Math.min(...activeAmounts) : null;

  const userAmounts = allBids
    .filter(
      (b) =>
        b.providerId === req.user!.userId &&
        (b.status === "active" || b.status === "envelope_a_approved") &&
        Number(b.bidAmount) > 0
    )
    .map((b) => Number(b.bidAmount));
  const userBestBid = userAmounts.length > 0 ? Math.min(...userAmounts) : null;

  res.status(201).json({
    requirementId: id,
    subscribed: true,
    subscriberCount: getRequirementSubscriberCount(id),
    userBestBid,
    overallLowestBid,
    currentBestBid: userBestBid ?? overallLowestBid,
  });
});

router.delete("/requirements/:id/subscribe", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [requirement] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, id));
  if (!requirement) {
    res.status(404).json({ error: "Requirement not found" });
    return;
  }

  unsubscribeFromRequirement(id, req.user!.userId);

  res.json({
    requirementId: id,
    subscribed: false,
    subscriberCount: getRequirementSubscriberCount(id),
  });
});

router.get("/requirements/:id/activity", optionalAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const events = await getRequirementActivityLog(id, req.user);
  if (events === null) {
    res.status(404).json({ error: "Requirement not found" });
    return;
  }
  res.json({ requirementId: id, events });
});

router.get("/requirements/:id", optionalAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [requirement] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, id));
  if (!requirement) {
    res.status(404).json({ error: "Requirement not found" });
    return;
  }

  const [cat] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, requirement.categoryId));
  const [buyer] = await db.select().from(usersTable).where(eq(usersTable.id, requirement.buyerId));

  const bids = await db
    .select()
    .from(bidsTable)
    .where(eq(bidsTable.requirementId, id))
    .orderBy(desc(bidsTable.isHighlighted), bidsTable.bidAmount);

  const bidsWithProvider = await Promise.all(bids.map(async (b) => {
    const [provider] = await db.select().from(usersTable).where(eq(usersTable.id, b.providerId));
    const [reviewStats] = await db.select({ avg: avg(reviewsTable.rating), count: count() }).from(reviewsTable).where(eq(reviewsTable.revieweeId, b.providerId));
    const [sub] = await db.select().from(providerSubscriptionsTable).where(eq(providerSubscriptionsTable.providerId, b.providerId));
    const isTwoEnvelope = requirement.bidType === "two_envelope";
    const isMyBid = req.user?.userId === b.providerId;
    const isApproved = b.status === "envelope_a_approved" || b.status === "accepted";
    const isAdminUser = req.user?.role === "admin" || req.user?.email?.endsWith("@omnibid.admin");
    const bidAmount = (isTwoEnvelope && !isMyBid && !isApproved && !isAdminUser) ? 0 : Number(b.bidAmount);

    return {
      id: b.id,
      requirementId: b.requirementId,
      providerId: b.providerId,
      bidAmount,
      message: (isTwoEnvelope && !isMyBid && !isApproved && !isAdminUser) ? "Financial bid hidden until Envelope A approval" : b.message,
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
  }));

  const [bidStats] = await db
    .select({ count: count(), minBid: min(bidsTable.bidAmount) })
    .from(bidsTable)
    .where(and(eq(bidsTable.requirementId, id), eq(bidsTable.status, "active")));

  res.json({
    ...formatReq(requirement, cat, buyer, Number(bidStats?.count ?? 0), bidStats?.minBid ? Number(bidStats.minBid) : null),
    buyer: {
      id: buyer.id,
      name: buyer.name,
      email: buyer.email,
      phone: buyer.phone,
      role: buyer.role,
      city: buyer.city,
      state: buyer.state,
      pincode: buyer.pincode,
      avatarUrl: buyer.avatarUrl,
      trustScore: buyer.trustScore,
      isVerified: buyer.isVerified,
      aadhaarVerified: buyer.aadhaarVerified,
      createdAt: buyer.createdAt.toISOString(),
    },
    bids: bidsWithProvider,
    category: {
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      iconName: cat.iconName,
      description: cat.description,
      customFields: cat.customFields,
      minBidFloor: cat.minBidFloor ? Number(cat.minBidFloor) : null,
      priceFloor: cat.minBidFloor ? Number(cat.minBidFloor) : null,
    },
  });
});

router.post("/requirements/:id/cancel", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [requirement] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, id));
  if (!requirement) { res.status(404).json({ error: "Not found" }); return; }
  if (requirement.buyerId !== req.user!.userId) { res.status(403).json({ error: "Forbidden" }); return; }
  const prevStatus = requirement.status;
  const [updated] = await db.update(requirementsTable).set({ status: "cancelled" }).where(eq(requirementsTable.id, id)).returning();
  const [cat] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, updated.categoryId));
  const [buyer] = await db.select().from(usersTable).where(eq(usersTable.id, updated.buyerId));
  recordRequirementActivity({
    id: `req-cancelled-${id}-${Date.now()}`,
    requirementId: id,
    category: "status",
    type: "requirement_cancelled",
    title: "Requirement Cancelled",
    description: `${buyer?.name ?? "Buyer"} cancelled this procurement requirement.`,
    actorName: buyer?.name ?? "Buyer",
    actorRole: "Buyer",
    statusFrom: prevStatus,
    statusTo: "cancelled",
  });
  res.json(formatReq(updated, cat, buyer, 0, null));
});

router.post("/requirements/:id/accept-bid", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = AcceptBidBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [requirement] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, id));
  if (!requirement) { res.status(404).json({ error: "Not found" }); return; }
  if (requirement.buyerId !== req.user!.userId) { res.status(403).json({ error: "Forbidden" }); return; }

  const [bid] = await db.select().from(bidsTable).where(eq(bidsTable.id, parsed.data.bidId));
  if (!bid) { res.status(404).json({ error: "Bid not found" }); return; }

  // Check if a payment already exists
  const [existingPayment] = await db.select().from(paymentsTable).where(eq(paymentsTable.requirementId, id));

  const prevStatus = requirement.status;
  await db.update(bidsTable).set({ status: "accepted" }).where(eq(bidsTable.id, parsed.data.bidId));
  await db.update(bidsTable).set({ status: "rejected" }).where(and(eq(bidsTable.requirementId, id), sql`${bidsTable.id} != ${parsed.data.bidId}`));
  const [updated] = await db.update(requirementsTable)
    .set({ status: "accepted", winningBidId: parsed.data.bidId })
    .where(eq(requirementsTable.id, id))
    .returning();

  if (!existingPayment) {
    const totalAmount = Number(bid.bidAmount);
    const platformFeePercent = 2.0;
    const platformFeeAmount = Math.round(totalAmount * platformFeePercent / 100);
    const tdsAmount = totalAmount > 30000 ? Math.round(totalAmount * 0.02) : 0;
    const netToProvider = totalAmount - platformFeeAmount - tdsAmount;
    const mockTxnId = `UPI${Date.now().toString(36).toUpperCase()}`;

    await db.insert(paymentsTable).values({
      requirementId: id,
      bidId: parsed.data.bidId,
      buyerId: req.user!.userId,
      providerId: bid.providerId,
      totalAmount: String(totalAmount),
      platformFeePercent: String(platformFeePercent),
      platformFeeAmount: String(platformFeeAmount),
      tdsAmount: String(tdsAmount),
      netToProvider: String(netToProvider),
      mobilizationAdvancePct: 0,
      advanceReleased: false,
      escrowStatus: "held",
      upiTransactionId: mockTxnId,
      totalMilestones: 1,
    });
  }

  await notifyUser(bid.providerId, "bid_accepted", `Your bid for "${requirement.title}" was accepted! Contact the buyer to proceed.`, { requirementId: id, bidId: parsed.data.bidId });

  const [cat] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, updated.categoryId));
  const [buyer] = await db.select().from(usersTable).where(eq(usersTable.id, updated.buyerId));
  const [providerUser] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, bid.providerId));
  recordRequirementActivity({
    id: `bid-accepted-${bid.id}`,
    requirementId: id,
    category: "status",
    type: "bid_accepted",
    title: "Winning Bid Awarded",
    description: `${buyer?.name ?? "Buyer"} accepted ${providerUser?.name ?? "contractor"}'s bid of ₹${Number(bid.bidAmount).toLocaleString("en-IN")}.`,
    actorName: buyer?.name ?? "Buyer",
    actorRole: "Buyer",
    amountInr: Number(bid.bidAmount),
    statusFrom: prevStatus,
    statusTo: "accepted",
  });
  const [bidStats] = await db.select({ count: count(), minBid: min(bidsTable.bidAmount) }).from(bidsTable).where(eq(bidsTable.requirementId, id));
  res.json(formatReq(updated, cat, buyer, Number(bidStats?.count ?? 0), bidStats?.minBid ? Number(bidStats.minBid) : null));
});

router.get("/requirements/:id/smart-match", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [requirement] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, id));
  if (!requirement) {
    res.status(404).json({ error: "Requirement not found" });
    return;
  }

  const bids = await db
    .select()
    .from(bidsTable)
    .where(and(eq(bidsTable.requirementId, id), eq(bidsTable.status, "active")));

  if (bids.length === 0) {
    res.json({
      recommendedBidId: null,
      justification: "No active bids are currently placed on this requirement. Please wait for contractors to bid."
    });
    return;
  }

  // AI Matching Engine
  let recommendedBidId = bids[0].id;
  let justification = "This bid is recommended based on pricing efficiency and completion timeline.";

  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      const prompt = `You are the OmniBid Smart Match AI assistant.
Evaluate the following B2B requirement and its list of active bids.
Select the bid that offers the absolute best value considering:
1. Bid Amount vs Requirement Max Budget (Lower bid is generally better value, but must be realistic)
2. Estimated completion timeline
3. Alignment with the requirement's customData constraints (check if technology, skills, or scope match).

Requirement Title: ${requirement.title}
Description: ${requirement.description}
Max Budget: ₹${requirement.maxBudget}
Sector Custom Data Constraints: ${JSON.stringify(requirement.customData || {})}

Active Bids:
${bids.map((b, index) => `${index + 1}. Bid ID: ${b.id}
   Bidder ID: ${b.providerId}
   Amount: ₹${b.bidAmount}
   Completion: ${b.estimatedCompletion}
   Message: ${b.message}`).join("\n\n")}

Output format MUST be strictly a JSON object with EXACTLY the following structure (no extra formatting or markdown blocks outside the JSON):
{
  "recommendedBidId": "the_best_matching_bid_uuid",
  "justification": "A short, professional justification explaining why this bid is the best match."
}`;

      const apiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      if (apiResponse.ok) {
        const responseData = (await apiResponse.json()) as any;
        const textResponse = responseData?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (textResponse) {
          const parsedRes = JSON.parse(textResponse);
          if (parsedRes.recommendedBidId && bids.some(b => b.id === parsedRes.recommendedBidId)) {
            recommendedBidId = parsedRes.recommendedBidId;
            justification = parsedRes.justification;
          }
        }
      }
    } catch (err) {
      req.log?.error(err, "Gemini smart-match engine request failed");
    }
  } else {
    // Intelligent matching local fallback (fully deterministic)
    let bestScore = -Infinity;
    const maxBudget = Number(requirement.maxBudget);

    for (const b of bids) {
      const bidAmount = Number(b.bidAmount);
      
      // 1. Budget efficiency score (prefer bids close to or slightly below budget, penalize high over-budgets)
      let priceScore = 0;
      if (bidAmount <= maxBudget) {
        priceScore = 50 * (1 - bidAmount / maxBudget); // up to 50 points
      } else {
        priceScore = -30 * (bidAmount / maxBudget - 1); // negative score for over-budget
      }

      // 2. Timeline efficiency score (timelines like "14 days", "7 days" parsed for comparison)
      let days = 30;
      const match = b.estimatedCompletion.match(/(\d+)/);
      if (match) {
        days = parseInt(match[0], 10);
      }
      const timelineScore = Math.max(0, 30 - days); // up to 30 points (shorter is better)

      // 3. CustomData alignment (e.g. matching tech stacks or keywords between bid message and customData)
      let alignmentScore = 0;
      const customDataStr = JSON.stringify(requirement.customData || "").toLowerCase();
      const messageStr = b.message.toLowerCase();
      const keywords = ["react", "node", "typescript", "rcc", "freight", "cargo", "gst", "audit"];
      for (const kw of keywords) {
        if (customDataStr.includes(kw) && messageStr.includes(kw)) {
          alignmentScore += 10;
        }
      }

      const totalScore = priceScore + timelineScore + alignmentScore;
      if (totalScore > bestScore) {
        bestScore = totalScore;
        recommendedBidId = b.id;
        
        let reasoning = `This bid offers a competitive pricing of ₹${bidAmount} (budget: ₹${maxBudget}) and a reliable timeline of ${b.estimatedCompletion}.`;
        if (alignmentScore > 0) {
          reasoning += ` The contractor shows strong technical alignment with the sector's specific project constraints.`;
        }
        justification = reasoning;
      }
    }
  }

  res.json({ recommendedBidId, justification });
});

router.post("/requirements/:id/repost", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [requirement] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, id));
  if (!requirement) { res.status(404).json({ error: "Not found" }); return; }
  if (requirement.buyerId !== req.user!.userId) { res.status(403).json({ error: "Forbidden" }); return; }
  if (!["expired", "completed", "cancelled", "accepted"].includes(requirement.status)) {
    res.status(400).json({ error: "Can only repost completed, expired, accepted, or cancelled requirements" }); return;
  }

  const auctionEndsAt = new Date(Date.now() + requirement.deadlineHours * 60 * 60 * 1000);

  const [reposted] = await db.insert(requirementsTable).values({
    buyerId: requirement.buyerId,
    categoryId: requirement.categoryId,
    title: requirement.title,
    description: requirement.description,
    customData: requirement.customData as Record<string, unknown> | null,
    city: requirement.city,
    state: requirement.state,
    pincode: requirement.pincode,
    maxBudget: requirement.maxBudget,
    deadlineHours: requirement.deadlineHours,
    auctionEndsAt,
    isHighTicket: requirement.isHighTicket,
    isRecurring: requirement.isRecurring,
    recurringInterval: requirement.recurringInterval,
    depositAmount: requirement.depositAmount,
    attachmentUrl: requirement.attachmentUrl,
  }).returning();

  const [cat] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, reposted.categoryId));
  const [buyer] = await db.select().from(usersTable).where(eq(usersTable.id, reposted.buyerId));

  res.status(201).json(formatReq(reposted, cat, buyer, 0, null));
});

export default router;
