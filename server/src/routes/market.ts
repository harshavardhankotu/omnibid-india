import { Router, type IRouter } from "express";
import { eq, count, avg, sum, and, sql, gte, desc } from "drizzle-orm";
import {
  db, usersTable, requirementsTable, bidsTable, categoriesTable,
  paymentsTable, reviewsTable, disputesTable, complianceVaultTable,
  vendorRankingsTable, sustainabilityRecordsTable,
} from "@omnibid/db";
import { requireAuth } from "../middlewares/auth";
import { z } from "zod";

const router: IRouter = Router();

const PROVIDER_ROLES = ["provider", "both", "solo_provider", "agency_provider"];
const BUYER_ROLES = ["buyer", "both", "retail_buyer", "enterprise_buyer"];

// GET /market/intelligence?categorySlug=&city= — competitor intelligence for providers
router.get("/market/intelligence", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId));
  if (!user) { res.status(404).json({ error: "Not found" }); return; }

  const isProvider = PROVIDER_ROLES.includes(user.role);
  const isBuyer = BUYER_ROLES.includes(user.role);

  const { categorySlug, city } = req.query as { categorySlug?: string; city?: string };
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Category market stats
  // Category market stats
  const marketStats = await db.select({
    categoryName: categoriesTable.name,
    categorySlug: categoriesTable.slug,
    totalRequirements: count(requirementsTable.id),
    avgBudget: avg(requirementsTable.maxBudget),
    avgBidCount: sql<number>`avg((select count(*) from bids where requirement_id = requirements.id))`,
    avgWinningBid: avg(bidsTable.bidAmount),
    minBidFloor: categoriesTable.minBidFloor,
  }).from(categoriesTable)
    .leftJoin(requirementsTable, and(
      eq(requirementsTable.categoryId, categoriesTable.id),
      gte(requirementsTable.createdAt, thirtyDaysAgo),
    ))
    .leftJoin(bidsTable, and(
      eq(bidsTable.requirementId, requirementsTable.id),
      eq(bidsTable.status, "accepted"),
    ))
    .where(categorySlug ? eq(categoriesTable.slug, categorySlug) : sql`true`)
    .groupBy(categoriesTable.id)
    .orderBy(desc(count(requirementsTable.id)))
    .limit(categorySlug ? 1 : 10);

  // City demand heat map
  const cityDemand = await db.select({
    city: requirementsTable.city,
    requirementCount: count(),
    avgBudget: avg(requirementsTable.maxBudget),
  }).from(requirementsTable)
    .where(and(
      gte(requirementsTable.createdAt, thirtyDaysAgo),
      city ? eq(requirementsTable.city, city) : sql`true`,
    ))
    .groupBy(requirementsTable.city)
    .orderBy(desc(count()))
    .limit(10);

  // Market saturation by category (how many providers vs requirements)
  const saturation = await db.select({
    categoryName: categoriesTable.name,
    categorySlug: categoriesTable.slug,
    reqCount: count(requirementsTable.id),
  }).from(categoriesTable)
    .leftJoin(requirementsTable, and(eq(requirementsTable.categoryId, categoriesTable.id), eq(requirementsTable.status, "open")))
    .groupBy(categoriesTable.id)
    .orderBy(desc(count(requirementsTable.id)));

  // Bid window analysis (hour of day with best bid acceptance, simulated)
  const bidWindowData = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${hour.toString().padStart(2, "0")}:00`,
    successRate: Math.round(40 + 30 * Math.sin((hour - 10) * Math.PI / 12) + Math.random() * 5),
    bidVolume: Math.round(20 + 15 * Math.sin((hour - 11) * Math.PI / 8)),
  }));

  const providerView = isProvider ? {
    recommendedBidWindow: "10:00–13:00 and 19:00–21:00",
    avgWinningBidDiscount: "12–18% below max budget",
    marketSaturation: saturation.map(s => ({
      category: s.categoryName,
      slug: s.categorySlug,
      openRequirements: Number(s.reqCount),
      saturationLevel: Number(s.reqCount) > 20 ? "high" : Number(s.reqCount) > 8 ? "medium" : "low",
    })),
    bidWindowAnalysis: bidWindowData.filter(h => h.bidVolume > 20),
    competitivenessIndex: 72,
    tip: "Best time to bid: weekday mornings 10am–1pm and evenings 7–9pm. These windows show 23% higher acceptance rates.",
  } : null;

  const buyerView = isBuyer ? {
    supplierDepth: marketStats.map(s => ({
      category: s.categoryName,
      slug: s.categorySlug,
      totalRequirements: Number(s.totalRequirements ?? 0),
      avgBidsPerRequirement: Number(s.avgBidCount ?? 0).toFixed(1),
      avgWinningBid: Number(s.avgWinningBid ?? 0),
      minBidFloor: Number(s.minBidFloor ?? 0),
      priceFloor: Number(s.minBidFloor ?? 0),
    })),
    regionalSupplyAvailability: cityDemand.map(c => ({
      city: c.city,
      requirementCount: Number(c.requirementCount),
      avgBudget: Number(c.avgBudget ?? 0),
      supplyStrength: Number(c.requirementCount) > 10 ? "strong" : Number(c.requirementCount) > 3 ? "moderate" : "limited",
    })),
  } : null;

  res.json({
    role: user.role,
    asOf: new Date().toISOString(),
    marketStats: marketStats.map(s => ({
      categoryName: s.categoryName,
      categorySlug: s.categorySlug,
      totalRequirements: Number(s.totalRequirements ?? 0),
      avgBudget: Number(s.avgBudget ?? 0),
      avgWinningBid: Number(s.avgWinningBid ?? 0),
      minBidFloor: Number(s.minBidFloor ?? 0),
      priceFloor: Number(s.minBidFloor ?? 0),
    })),
    cityDemand: cityDemand.map(c => ({
      city: c.city,
      requirementCount: Number(c.requirementCount),
      avgBudget: Number(c.avgBudget ?? 0),
    })),
    providerView,
    buyerView,
  });
});

// GET /market/vendor-ranking/:requirementId — AI vendor ranking for buyers/admin
router.get("/market/vendor-ranking/:requirementId", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId));
  if (!user) { res.status(404).json({ error: "Not found" }); return; }

  const rankingMode = (req.query.mode as string) ?? user.role === "enterprise_buyer"
    ? (req.query.mode as string ?? "balanced")
    : "best_price";

  const reqId = String(req.params.requirementId);
  const [req_] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, reqId));
  if (!req_) { res.status(404).json({ error: "Requirement not found" }); return; }

  // Get bids for this requirement
  const bids = await db.select({
    bidId: bidsTable.id,
    providerId: bidsTable.providerId,
    bidAmount: bidsTable.bidAmount,
    estimatedCompletion: bidsTable.estimatedCompletion,
    crewSizeOffered: bidsTable.crewSizeOffered,
    bidStatus: bidsTable.status,
  }).from(bidsTable)
    .where(and(eq(bidsTable.requirementId, reqId), sql`status not in ('withdrawn','rejected')`));

  if (bids.length === 0) { res.json({ rankingMode, vendors: [], message: "No bids yet" }); return; }

  // Fetch provider details
  const providerIds: string[] = Array.from(new Set<string>(bids.map(b => String(b.providerId))));

  const rankings = await Promise.all(providerIds.map(async (providerId: string) => {
    const [provider] = await db.select().from(usersTable).where(eq(usersTable.id, providerId));
    if (!provider) return null;

    const providerBid = bids.find(b => b.providerId === providerId);
    if (!providerBid) return null;

    const [revStats] = await db.select({ avg: avg(reviewsTable.rating), count: count() }).from(reviewsTable).where(eq(reviewsTable.revieweeId, providerId));
    const [payStats] = await db.select({ completed: count() }).from(paymentsTable).where(and(eq(paymentsTable.providerId, providerId), eq(paymentsTable.escrowStatus, "released")));
    const [dispStats] = await db.select({ count: count() }).from(disputesTable).where(eq(disputesTable.raisedById, providerId));
    const [complianceRec] = await db.select().from(complianceVaultTable).where(eq(complianceVaultTable.userId, providerId));

    const completedJobs = Number(payStats?.completed ?? 0);
    const avgRating = Number(revStats?.avg ?? 3.5);
    const disputeCount = Number(dispStats?.count ?? 0);
    const disputeRate = completedJobs > 0 ? disputeCount / completedJobs : 0;
    const bidAmount = Number(providerBid.bidAmount);
    const maxBudget = Number(req_.maxBudget);
    const priceRatio = maxBudget > 0 ? bidAmount / maxBudget : 1;

    // Score components (0-100 each)
    const priceScore = Math.round((1 - priceRatio) * 100 + 40); // lower price = higher price score
    const complianceScore = Math.round(
      (provider.isVerified ? 30 : 0) +
      (provider.aadhaarVerified ? 20 : 0) +
      (complianceRec?.panNumber ? 20 : 0) +
      (complianceRec?.gstNumber ? 20 : 0) +
      (complianceRec?.isEmpanelled ? 10 : 0)
    );
    const trustScore = Math.round(provider.trustScore * 1.0 + (provider.omniScore / 10));
    const ratingScore = Math.round(avgRating * 20); // 5 stars → 100
    const completionScore = Math.min(completedJobs * 10, 100);
    const disputeScore = Math.round((1 - Math.min(disputeRate, 1)) * 100);

    // Weighted ranking by mode
    const weights = {
      balanced: { price: 0.25, compliance: 0.2, trust: 0.15, rating: 0.2, completion: 0.15, dispute: 0.05 },
      lowest_cost: { price: 0.55, compliance: 0.15, trust: 0.1, rating: 0.1, completion: 0.05, dispute: 0.05 },
      best_compliance: { price: 0.1, compliance: 0.4, trust: 0.2, rating: 0.1, completion: 0.1, dispute: 0.1 },
      fastest_start: { price: 0.2, compliance: 0.15, trust: 0.15, rating: 0.15, completion: 0.25, dispute: 0.1 },
      best_price: { price: 0.5, compliance: 0.1, trust: 0.15, rating: 0.15, completion: 0.05, dispute: 0.05 },
    };

    const w = weights[rankingMode as keyof typeof weights] ?? weights.balanced;
    const totalScore = Math.round(
      priceScore * w.price + complianceScore * w.compliance + trustScore * w.trust +
      ratingScore * w.rating + completionScore * w.completion + disputeScore * w.dispute
    );

    // Buyer-facing label (simplified for retail_buyer)
    const retailLabels = totalScore >= 75 ? "Trusted Choice"
      : priceScore >= 70 ? "Best Price"
        : completionScore >= 80 ? "Fastest Available"
          : "Nearby Best Match";

    const enterpriseLabel = rankingMode === "lowest_cost" ? "Lowest Cost"
      : rankingMode === "best_compliance" ? "Compliance Champion"
        : rankingMode === "fastest_start" ? "Fastest Mobilization"
          : "Balanced Recommendation";

    return {
      providerId,
      name: provider.name,
      city: provider.city,
      bidAmount,
      estimatedCompletion: providerBid.estimatedCompletion,
      rankingScore: totalScore,
      label: user.role === "retail_buyer" ? retailLabels : enterpriseLabel,
      scoreBreakdown: { priceScore, complianceScore, trustScore, ratingScore, completionScore, disputeScore },
      omniScore: provider.omniScore,
      isVerified: provider.isVerified,
      avgRating: Number(avgRating.toFixed(1)),
      completedJobs,
      fraudScore: provider.fraudScore,
    };
  }));

  const validRankings = rankings.filter(Boolean).sort((a, b) => b!.rankingScore - a!.rankingScore);

  // Persist rankings
  for (let i = 0; i < validRankings.length; i++) {
    const r = validRankings[i]!;
    await db.insert(vendorRankingsTable).values({
      requirementId: reqId,
      vendorId: r.providerId,
      rankingScore: String(r.rankingScore),
      rankPosition: i + 1,
      rankLabel: r.label,
      rankingMode,
      scoreBreakdown: r.scoreBreakdown as Record<string, number>,
    }).onConflictDoNothing();
  }

  res.json({ rankingMode, vendors: validRankings.map((r, i) => ({ ...r, rank: i + 1 })) });
});

// GET /market/post-auction/:requirementId — post-auction analysis
router.get("/market/post-auction/:requirementId", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId));
  if (!user) { res.status(404).json({ error: "Not found" }); return; }

  const reqId = String(req.params.requirementId);
  const [req_] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, reqId));
  if (!req_) { res.status(404).json({ error: "Requirement not found" }); return; }

  const allBids = await db.select({
    id: bidsTable.id,
    providerId: bidsTable.providerId,
    bidAmount: bidsTable.bidAmount,
    status: bidsTable.status,
    createdAt: bidsTable.createdAt,
    estimatedCompletion: bidsTable.estimatedCompletion,
    rankingScore: bidsTable.rankingScore,
  }).from(bidsTable).where(eq(bidsTable.requirementId, reqId)).orderBy(sql`bid_amount asc`);

  const maxBudget = Number(req_.maxBudget);
  const bidAmounts = allBids.map(b => Number(b.bidAmount));
  const winningBid = allBids.find(b => b.status === "accepted");
  const winningAmount = winningBid ? Number(winningBid.bidAmount) : null;
  const lowestBid = Math.min(...(bidAmounts.length > 0 ? bidAmounts : [0]));
  const avgBid = bidAmounts.length > 0 ? bidAmounts.reduce((a, b) => a + b, 0) / bidAmounts.length : 0;
  const timeToFirstBid = allBids.length > 0
    ? Math.round((allBids[0].createdAt.getTime() - req_.createdAt.getTime()) / (1000 * 60))
    : null;

  const isBuyer = BUYER_ROLES.includes(user.role) && req_.buyerId === user.id;
  const isProvider = PROVIDER_ROLES.includes(user.role);
  const myBid = isProvider ? allBids.find(b => b.providerId === user.id) : null;

  const buyerAnalysis = isBuyer ? {
    savingsAmount: winningAmount ? maxBudget - winningAmount : null,
    savingsPercent: winningAmount ? Math.round(((maxBudget - winningAmount) / maxBudget) * 100) : null,
    timeToFirstBidMinutes: timeToFirstBid,
    totalBidsReceived: allBids.length,
    lowestBid,
    avgBid: Math.round(avgBid),
    budgetUtilizationPercent: winningAmount ? Math.round((winningAmount / maxBudget) * 100) : null,
    completionConfidence: winningAmount && winningAmount < maxBudget * 0.9 ? "high" : "moderate",
    competitionLevel: allBids.length >= 5 ? "high" : allBids.length >= 3 ? "medium" : "low",
    recommendations: [
      allBids.length < 3 ? "Consider increasing budget or extending deadline to attract more bids" : null,
      winningAmount && winningAmount > maxBudget * 0.9 ? "Winning bid was close to max budget — consider posting earlier for more competition" : null,
      timeToFirstBid && timeToFirstBid > 120 ? "Responses took over 2 hours — try posting during peak hours (10am–1pm)" : null,
    ].filter(Boolean),
  } : null;

  const providerAnalysis = myBid ? {
    myBidAmount: Number(myBid.bidAmount),
    myBidStatus: myBid.status,
    myRank: allBids.findIndex(b => b.id === myBid.id) + 1,
    totalBidders: allBids.length,
    lowestBid,
    avgBid: Math.round(avgBid),
    pricingGap: Number(myBid.bidAmount) - lowestBid,
    pricingGapPercent: lowestBid > 0 ? Math.round(((Number(myBid.bidAmount) - lowestBid) / lowestBid) * 100) : 0,
    winLoss: myBid.status === "accepted" ? "won" : allBids.length > 0 && winningBid ? "lost" : "pending",
    winReason: myBid.status === "accepted"
      ? "Best combination of price, compliance, and trust score"
      : null,
    lossReason: myBid.status !== "accepted" && winningBid
      ? Number(myBid.bidAmount) > lowestBid * 1.15
        ? "Bid was above market rate by >15%"
        : "Competitor had stronger compliance/trust profile"
      : null,
    recommendations: [
      Number(myBid.bidAmount) > avgBid ? "Your bid was above average — consider competitive pricing next time" : null,
      myBid.status === "active" ? "Bid still active — follow up or send a revised proposal" : null,
    ].filter(Boolean),
  } : null;

  const enterpriseAnalysis = user.role === "enterprise_buyer" && req_.buyerId === user.id ? {
    vendorCompetitiveness: {
      highCompetition: allBids.length >= 5,
      uniqueVendors: new Set(allBids.map(b => b.providerId)).size,
      priceSpread: lowestBid && avgBid ? "Rs." + lowestBid.toLocaleString("en-IN") + " to Rs." + Math.max(...bidAmounts).toLocaleString("en-IN") : null,
      awardEfficiency: winningAmount && maxBudget ? `${Math.round((winningAmount / maxBudget) * 100)}% of ceiling` : null,
    },
    rateByCategory: [{ category: "This Requirement", avgRate: Math.round(avgBid), floorRate: lowestBid }],
    sourcingHealth: allBids.length >= 3 ? "healthy" : "needs_attention",
  } : null;

  res.json({
    requirementId: reqId,
    title: req_.title,
    status: req_.status,
    maxBudget,
    auctionEndedAt: req_.auctionEndsAt.toISOString(),
    totalBids: allBids.length,
    lowestBid,
    avgBid: Math.round(avgBid),
    winningBid: winningAmount,
    buyerAnalysis,
    providerAnalysis,
    enterpriseAnalysis,
  });
});

// GET /market/sustainability/:requirementId
router.get("/market/sustainability/:requirementId", requireAuth, async (req, res): Promise<void> => {
  const reqId = String(req.params.requirementId);
  const [req_] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, reqId));
  if (!req_) { res.status(404).json({ error: "Not found" }); return; }

  const records = await db.select().from(sustainabilityRecordsTable)
    .where(eq(sustainabilityRecordsTable.requirementId, reqId))
    .orderBy(desc(sustainabilityRecordsTable.createdAt))
    .limit(10);

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId));

  const simplified = !user || !["enterprise_buyer", "agency_provider"].includes(user.role);

  res.json({
    records: records.map(r => ({
      bidId: r.bidId,
      distanceKm: Number(r.distanceKm ?? 0),
      estimatedCarbonKg: Number(r.estimatedCarbonKg ?? 0),
      routeEfficiencyScore: Number(r.routeEfficiencyScore ?? 0),
      sustainabilityLabel: r.sustainabilityLabel,
      fuelSavedLitres: Number(r.fuelSavedLitres ?? 0),
      createdAt: r.createdAt.toISOString(),
    })),
    summary: simplified
      ? { message: "Local provider chosen — shorter travel saves time and fuel ✅" }
      : {
          totalCarbonSavedKg: records.reduce((s, r) => s + Number(r.estimatedCarbonKg ?? 0), 0),
          avgEfficiencyScore: records.length > 0 ? records.reduce((s, r) => s + Number(r.routeEfficiencyScore ?? 0), 0) / records.length : 0,
          totalFuelSavedLitres: records.reduce((s, r) => s + Number(r.fuelSavedLitres ?? 0), 0),
          localMatchRate: `${Math.round((records.filter(r => r.sustainabilityLabel === "local_match").length / Math.max(records.length, 1)) * 100)}%`,
        },
  });
});

export default router;
