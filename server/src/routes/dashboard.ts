import { Router, type IRouter } from "express";
import { eq, and, count, sum, desc } from "drizzle-orm";
import { db, requirementsTable, bidsTable, categoriesTable, usersTable, providerSubscriptionsTable } from "@omnibid/db";
import { requireAuth } from "../middlewares/auth";
import { min } from "drizzle-orm";

const router: IRouter = Router();

router.get("/dashboard/buyer", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.userId;

  const [openCount] = await db.select({ count: count() }).from(requirementsTable).where(and(eq(requirementsTable.buyerId, userId), eq(requirementsTable.status, "open")));
  const [acceptedCount] = await db.select({ count: count() }).from(requirementsTable).where(and(eq(requirementsTable.buyerId, userId), eq(requirementsTable.status, "accepted")));
  const [completedCount] = await db.select({ count: count() }).from(requirementsTable).where(and(eq(requirementsTable.buyerId, userId), eq(requirementsTable.status, "completed")));

  const recent = await db.select().from(requirementsTable).where(eq(requirementsTable.buyerId, userId)).orderBy(desc(requirementsTable.createdAt)).limit(20);

  const recentWithMeta = await Promise.all(recent.map(async (r) => {
    const [cat] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, r.categoryId));
    const [buyer] = await db.select().from(usersTable).where(eq(usersTable.id, r.buyerId));
    const [bidStats] = await db.select({ count: count(), minBid: min(bidsTable.bidAmount) }).from(bidsTable).where(eq(bidsTable.requirementId, r.id));
    const [latestBid] = await db
      .select({ createdAt: bidsTable.createdAt })
      .from(bidsTable)
      .where(eq(bidsTable.requirementId, r.id))
      .orderBy(desc(bidsTable.createdAt))
      .limit(1);

    return {
      id: r.id, buyerId: r.buyerId, categoryId: r.categoryId,
      categoryName: cat?.name ?? "", categorySlug: cat?.slug ?? "", categoryIconName: cat?.iconName ?? "",
      title: r.title, description: r.description, customData: r.customData,
      city: r.city, state: r.state, pincode: r.pincode, maxBudget: Number(r.maxBudget),
      deadlineHours: r.deadlineHours, auctionEndsAt: r.auctionEndsAt.toISOString(), status: r.status,
      attachmentUrl: r.attachmentUrl, winningBidId: r.winningBidId, isHighTicket: r.isHighTicket,
      bidCount: Number(bidStats?.count ?? 0), lowestBid: bidStats?.minBid ? Number(bidStats.minBid) : null,
      latestBidAt: latestBid?.createdAt ? latestBid.createdAt.toISOString() : null,
      buyerName: buyer?.name ?? "", createdAt: r.createdAt.toISOString(),
    };
  }));

  res.json({
    openRequirements: Number(openCount?.count ?? 0),
    acceptedRequirements: Number(acceptedCount?.count ?? 0),
    completedRequirements: Number(completedCount?.count ?? 0),
    totalSpent: 0,
    recentRequirements: recentWithMeta,
  });
});

router.get("/dashboard/provider", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.userId;

  const [activeCount] = await db.select({ count: count() }).from(bidsTable).where(and(eq(bidsTable.providerId, userId), eq(bidsTable.status, "active")));
  const [wonCount] = await db.select({ count: count() }).from(bidsTable).where(and(eq(bidsTable.providerId, userId), eq(bidsTable.status, "accepted")));
  const [totalBids] = await db.select({ count: count() }).from(bidsTable).where(eq(bidsTable.providerId, userId));

  const winRate = Number(totalBids?.count ?? 0) > 0 ? (Number(wonCount?.count ?? 0) / Number(totalBids?.count ?? 0)) * 100 : 0;

  const [sub] = await db.select().from(providerSubscriptionsTable).where(eq(providerSubscriptionsTable.providerId, userId));

  const recentBids = await db.select().from(bidsTable).where(eq(bidsTable.providerId, userId)).orderBy(desc(bidsTable.createdAt)).limit(20);

  const recentWithReq = await Promise.all(recentBids.map(async (b) => {
    const [req2] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, b.requirementId));
    const [cat] = req2 ? await db.select().from(categoriesTable).where(eq(categoriesTable.id, req2.categoryId)) : [null];
    const [buyer] = req2 ? await db.select().from(usersTable).where(eq(usersTable.id, req2.buyerId)) : [null];
    const [bidStats] = req2 ? await db.select({ count: count(), minBid: min(bidsTable.bidAmount) }).from(bidsTable).where(eq(bidsTable.requirementId, req2.id)) : [null];
    return {
      id: b.id, requirementId: b.requirementId, providerId: b.providerId,
      bidAmount: Number(b.bidAmount), message: b.message, proofOfWork: b.proofOfWork,
      portfolioUrl: b.portfolioUrl, estimatedCompletion: b.estimatedCompletion,
      status: b.status, isHighlighted: b.isHighlighted,
      providerName: "", providerCity: null, providerTrustScore: 0, providerIsVerified: false,
      providerAvgRating: null, providerReviewCount: 0, providerSubscriptionPlan: sub?.plan ?? null,
      createdAt: b.createdAt.toISOString(),
      requirement: req2 && cat && buyer ? {
        id: req2.id, buyerId: req2.buyerId, categoryId: req2.categoryId,
        categoryName: cat.name, categorySlug: cat.slug, categoryIconName: cat.iconName,
        title: req2.title, description: req2.description, customData: req2.customData,
        city: req2.city, state: req2.state, pincode: req2.pincode, maxBudget: Number(req2.maxBudget),
        deadlineHours: req2.deadlineHours, auctionEndsAt: req2.auctionEndsAt.toISOString(),
        status: req2.status, attachmentUrl: req2.attachmentUrl, winningBidId: req2.winningBidId,
        isHighTicket: req2.isHighTicket, bidCount: Number(bidStats?.count ?? 0),
        lowestBid: bidStats?.minBid ? Number(bidStats.minBid) : null,
        buyerName: buyer.name, createdAt: req2.createdAt.toISOString(),
      } : null,
    };
  }));

  const cats = await db.select().from(categoriesTable);
  const categoryBreakdown = await Promise.all(cats.map(async (cat) => {
    const reqsInCat = await db.select().from(requirementsTable).where(eq(requirementsTable.categoryId, cat.id));
    const reqIds = reqsInCat.map((r) => r.id);
    let bidCount = 0;
    let wonBids = 0;
    for (const reqId of reqIds) {
      const [bc] = await db.select({ count: count() }).from(bidsTable).where(and(eq(bidsTable.requirementId, reqId), eq(bidsTable.providerId, userId)));
      const [wc] = await db.select({ count: count() }).from(bidsTable).where(and(eq(bidsTable.requirementId, reqId), eq(bidsTable.providerId, userId), eq(bidsTable.status, "accepted")));
      bidCount += Number(bc?.count ?? 0);
      wonBids += Number(wc?.count ?? 0);
    }
    return { categoryName: cat.name, bidCount, wonCount: wonBids };
  }));

  res.json({
    activeBids: Number(activeCount?.count ?? 0),
    wonBids: Number(wonCount?.count ?? 0),
    totalEarned: 0,
    winRate: Math.round(winRate),
    bidsRemaining: sub?.bidsRemaining ?? 0,
    subscriptionPlan: sub?.plan ?? "free",
    recentBids: recentWithReq,
    categoryBreakdown: categoryBreakdown.filter((c) => c.bidCount > 0),
  });
});

export default router;
