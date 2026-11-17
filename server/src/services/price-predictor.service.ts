import { ne } from "drizzle-orm";
import {
  db,
  categoriesTable,
  requirementsTable,
  bidsTable,
} from "@omnibid/db";

export interface PricePredictorInput {
  categoryId?: string;
  city?: string;
  state?: string;
  deadlineHours?: number;
  currentBudget?: number;
  isSyndicate?: boolean;
  isMegaProject?: boolean;
}

export interface ComparableAuction {
  id: string;
  title: string;
  categoryName: string;
  city: string;
  status: string;
  maxBudget: number;
  lowestBid: number | null;
  bidCount: number;
  discountPct: number | null;
}

export interface MarketPricePrediction {
  categoryId: string | null;
  categoryName: string | null;
  city: string | null;
  scope:
    | "category_city"
    | "category"
    | "category_budget_baseline"
    | "platform_baseline";
  confidence: "high" | "moderate" | "baseline";
  targetRange: {
    low: number;
    ideal: number;
    high: number;
    recommendedCeiling: number;
  };
  currentBudgetAnalysis: {
    enteredBudget: number;
    expectedL1Low: number;
    expectedL1High: number;
    status: "below_floor" | "below_market" | "competitive" | "generous";
    headline: string;
    detail: string;
  } | null;
  historicalStats: {
    sampleAuctions: number;
    sampleBids: number;
    platformBidsAnalyzed: number;
    avgBidsPerAuction: number;
    avgDiscountPct: number;
    historicalMinBid: number | null;
    historicalMedianBid: number | null;
    historicalMaxBid: number | null;
    categoryFloor: number;
  };
  adjustmentFactors: Array<{
    label: string;
    impactPct: number;
  }>;
  comparableAuctions: ComparableAuction[];
}

function roundToProcurementStep(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 500;
  if (value < 10_000) return Math.max(100, Math.round(value / 100) * 100);
  if (value < 100_000) return Math.round(value / 500) * 500;
  if (value < 1_000_000) return Math.round(value / 1000) * 1000;
  return Math.round(value / 5000) * 5000;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

export async function predictMarketPrice(
  input: PricePredictorInput
): Promise<MarketPricePrediction> {
  const categories: Array<typeof categoriesTable.$inferSelect> = await db
    .select()
    .from(categoriesTable);
  const categoryMap = new Map<string, typeof categoriesTable.$inferSelect>(
    categories.map((c) => [c.id, c])
  );
  const selectedCategory = input.categoryId
    ? categoryMap.get(input.categoryId) ?? null
    : null;

  const requirements = await db
    .select()
    .from(requirementsTable)
    .where(ne(requirementsTable.status, "cancelled"));

  const allBids = await db
    .select()
    .from(bidsTable)
    .where(ne(bidsTable.status, "withdrawn"));

  // Group eligible bids by requirement (skipping unapproved sealed Envelope A bids)
  const reqTypeMap = new Map(
    requirements.map((r) => [r.id, r.bidType])
  );
  const bidsByReq = new Map<string, number[]>();
  const acceptedBidByReq = new Map<string, number>();

  for (const b of allBids) {
    const bidAmt = Number(b.bidAmount);
    if (!Number.isFinite(bidAmt) || bidAmt <= 0) continue;
    const isTwoEnvelope = reqTypeMap.get(b.requirementId) === "two_envelope";
    if (isTwoEnvelope && b.status === "envelope_a_pending") continue;

    const arr = bidsByReq.get(b.requirementId) ?? [];
    arr.push(bidAmt);
    bidsByReq.set(b.requirementId, arr);

    if (b.status === "accepted") {
      acceptedBidByReq.set(b.requirementId, bidAmt);
    }
  }

  interface ReqSummary {
    id: string;
    title: string;
    categoryId: string;
    categoryName: string;
    city: string;
    state: string;
    status: string;
    maxBudget: number;
    bids: number[];
    lowestBid: number | null;
    acceptedBid: number | null;
    discountPct: number | null;
  }

  const summaries: ReqSummary[] = requirements.map((r) => {
    const bids = (bidsByReq.get(r.id) ?? []).slice().sort((a, b) => a - b);
    const maxBudget = Number(r.maxBudget);
    const lowestBid = bids.length > 0 ? bids[0] : null;
    const acceptedBid = acceptedBidByReq.get(r.id) ?? null;
    const refBid = acceptedBid ?? lowestBid;
    const discountPct =
      refBid !== null && maxBudget > 0
        ? Math.max(0, Math.min(60, Math.round(((maxBudget - refBid) / maxBudget) * 100)))
        : null;

    return {
      id: r.id,
      title: r.title,
      categoryId: r.categoryId,
      categoryName: categoryMap.get(r.categoryId)?.name ?? "General",
      city: r.city,
      state: r.state,
      status: r.status,
      maxBudget,
      bids,
      lowestBid,
      acceptedBid,
      discountPct,
    };
  });

  // Compute platform-wide empirical discount ratio across all auctions with bids
  const allWithBids = summaries.filter((s) => s.bids.length > 0);
  const platformTotalBids = allWithBids.reduce((sum, s) => sum + s.bids.length, 0);
  const platformDiscounts = allWithBids
    .map((s) => s.discountPct)
    .filter((d): d is number => d !== null);
  const platformAvgDiscountPct =
    platformDiscounts.length > 0
      ? Math.round(
          platformDiscounts.reduce((a, b) => a + b, 0) / platformDiscounts.length
        )
      : 12;

  const normalizedCity = (input.city ?? "").trim().toLowerCase();

  // Hierarchical cohort selection
  const categoryAll = selectedCategory
    ? summaries.filter((s) => s.categoryId === selectedCategory.id)
    : summaries;
  const categoryWithBids = categoryAll.filter((s) => s.bids.length > 0);
  const cityWithBids =
    normalizedCity.length >= 2
      ? categoryWithBids.filter((s) => {
          const c = s.city.toLowerCase();
          return c === normalizedCity || c.includes(normalizedCity) || normalizedCity.includes(c);
        })
      : [];

  let scope: MarketPricePrediction["scope"] = "platform_baseline";
  let confidence: MarketPricePrediction["confidence"] = "baseline";
  let cohort: ReqSummary[] = [];

  if (selectedCategory && cityWithBids.length >= 2) {
    scope = "category_city";
    confidence = "high";
    cohort = cityWithBids;
  } else if (selectedCategory && categoryWithBids.length >= 2) {
    scope = "category";
    confidence = "high";
    cohort = categoryWithBids;
  } else if (selectedCategory && categoryWithBids.length === 1) {
    scope = "category";
    confidence = "moderate";
    cohort = categoryWithBids;
  } else if (selectedCategory && categoryAll.length >= 1) {
    scope = "category_budget_baseline";
    confidence = "moderate";
    cohort = categoryAll;
  } else {
    scope = "platform_baseline";
    confidence = allWithBids.length >= 3 ? "moderate" : "baseline";
    cohort = allWithBids;
  }

  const cohortDiscounts = cohort
    .map((s) => s.discountPct)
    .filter((d): d is number => d !== null);
  const avgDiscountPct =
    cohortDiscounts.length > 0
      ? Math.round(
          cohortDiscounts.reduce((a, b) => a + b, 0) / cohortDiscounts.length
        )
      : platformAvgDiscountPct;

  const cohortBids = cohort
    .flatMap((s) => s.bids)
    .sort((a, b) => a - b);
  const cohortL1s = cohort
    .map((s) => s.acceptedBid ?? s.lowestBid)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);

  const categoryFloor = Math.max(
    100,
    Number(selectedCategory?.minBidFloor ?? 500)
  );

  // Determine baseline clearing quantiles
  let baseLow: number;
  let baseIdeal: number;
  let baseHigh: number;

  if (cohortL1s.length >= 2) {
    const p25 = quantile(cohortBids, 0.25);
    const p50 = quantile(cohortL1s, 0.5);
    const p75 = quantile(cohortBids, 0.75);
    baseLow = Math.max(categoryFloor, Math.min(p25, p50 * 0.92));
    baseIdeal = Math.max(categoryFloor, p50);
    baseHigh = Math.max(baseIdeal * 1.06, p75);
  } else if (cohortL1s.length === 1) {
    const anchor = cohortL1s[0];
    baseLow = Math.max(categoryFloor, anchor * 0.88);
    baseIdeal = Math.max(categoryFloor, anchor);
    baseHigh = Math.max(baseIdeal, anchor * 1.1);
  } else if (cohort.length >= 1) {
    // Category has historical posted ceilings but no bids yet -> apply platform discount curve
    const budgets = cohort.map((s) => s.maxBudget).sort((a, b) => a - b);
    const medianBudget = quantile(budgets, 0.5);
    const discountFactor = 1 - Math.max(8, avgDiscountPct) / 100;
    baseIdeal = Math.max(categoryFloor, medianBudget * discountFactor);
    baseLow = Math.max(categoryFloor, baseIdeal * 0.86);
    baseHigh = Math.max(baseIdeal, baseIdeal * 1.1);
  } else {
    // Category has no historical auctions yet -> anchor around floor or buyer's draft budget
    const anchorBudget =
      input.currentBudget && input.currentBudget >= categoryFloor
        ? input.currentBudget
        : categoryFloor * 3;
    const discountFactor = 1 - Math.max(8, avgDiscountPct) / 100;
    baseIdeal = Math.max(categoryFloor, anchorBudget * discountFactor);
    baseLow = Math.max(categoryFloor, baseIdeal * 0.85);
    baseHigh = Math.max(baseIdeal, anchorBudget * 0.95);
  }

  // Contextual adjustments (auction duration, group buy, mega project)
  const deadlineHours = Number(input.deadlineHours ?? 24);
  const adjustmentFactors: MarketPricePrediction["adjustmentFactors"] = [
    {
      label: "Historical L1 reverse-auction drop",
      impactPct: -avgDiscountPct,
    },
  ];

  let multiplier = 1;
  if (deadlineHours > 0 && deadlineHours <= 6) {
    multiplier += 0.05;
    adjustmentFactors.push({
      label: `Urgent ${deadlineHours}h window premium`,
      impactPct: 5,
    });
  } else if (deadlineHours >= 48) {
    multiplier -= 0.03;
    adjustmentFactors.push({
      label: `${deadlineHours}h quoting window competition`,
      impactPct: -3,
    });
  }

  if (input.isSyndicate) {
    multiplier -= 0.06;
    adjustmentFactors.push({
      label: "Society Syndicate bulk leverage",
      impactPct: -6,
    });
  }

  if (input.isMegaProject) {
    multiplier += 0.04;
    adjustmentFactors.push({
      label: "Mega Project multi-package margin",
      impactPct: 4,
    });
  }

  const targetLow = Math.max(
    categoryFloor,
    roundToProcurementStep(baseLow * multiplier)
  );
  const targetIdeal = Math.max(
    targetLow,
    roundToProcurementStep(baseIdeal * multiplier)
  );
  const targetHigh = Math.max(
    targetIdeal,
    roundToProcurementStep(baseHigh * multiplier)
  );

  // Recommended max ceiling sits comfortably above targetHigh by expected L1 discount margin
  const headroomRatio = 1 + Math.min(0.22, Math.max(0.08, avgDiscountPct / 100));
  const recommendedCeiling = Math.max(
    targetHigh,
    roundToProcurementStep(targetHigh * headroomRatio)
  );

  // Current budget evaluation
  let currentBudgetAnalysis: MarketPricePrediction["currentBudgetAnalysis"] = null;
  if (
    typeof input.currentBudget === "number" &&
    Number.isFinite(input.currentBudget) &&
    input.currentBudget > 0
  ) {
    const entered = input.currentBudget;
    const expectedL1Low = Math.max(
      categoryFloor,
      roundToProcurementStep(entered * (1 - Math.min(0.28, (avgDiscountPct + 5) / 100)))
    );
    const expectedL1High = Math.max(
      expectedL1Low,
      roundToProcurementStep(entered * (1 - Math.max(0.04, (avgDiscountPct - 4) / 100)))
    );

    let status: NonNullable<
      MarketPricePrediction["currentBudgetAnalysis"]
    >["status"];
    let headline: string;
    let detail: string;

    if (entered < categoryFloor) {
      status = "below_floor";
      headline = "Below category price floor";
      detail = `Current ceiling is below ${selectedCategory?.name ?? "this category"}'s ₹${categoryFloor.toLocaleString("en-IN")} minimum floor. Raise your budget to allow bids.`;
    } else if (entered < targetLow) {
      status = "below_market";
      headline = "Tight vs. historical clearing prices";
      detail = `Historical ${selectedCategory?.name ?? "market"} bids typically settle around ₹${targetLow.toLocaleString("en-IN")}–₹${targetHigh.toLocaleString("en-IN")}. Smaller or scoped-down jobs may still attract bids, or apply ₹${recommendedCeiling.toLocaleString("en-IN")} for broader vendor turnout.`;
    } else if (entered <= recommendedCeiling * 1.15) {
      status = "competitive";
      headline = "In the competitive sweet spot";
      detail = `Well aligned with historical ${selectedCategory?.name ?? "market"} ceilings. Expect L1 bids to converge around ₹${expectedL1Low.toLocaleString("en-IN")}–₹${expectedL1High.toLocaleString("en-IN")}.`;
    } else {
      status = "generous";
      headline = "Above typical historical ceiling";
      detail = `Your ceiling exceeds most historical ${selectedCategory?.name ?? "market"} clearing quotes. Lowering your ceiling closer to ₹${recommendedCeiling.toLocaleString("en-IN")} can anchor sharper opening bids.`;
    }

    currentBudgetAnalysis = {
      enteredBudget: entered,
      expectedL1Low,
      expectedL1High,
      status,
      headline,
      detail,
    };
  }

  const cohortSampleBids = cohort.reduce((sum, s) => sum + s.bids.length, 0);
  const avgBidsPerAuction =
    cohort.length > 0
      ? Number((cohortSampleBids / cohort.length).toFixed(1))
      : allWithBids.length > 0
      ? Number((platformTotalBids / allWithBids.length).toFixed(1))
      : 0;

  const comparableAuctions: ComparableAuction[] = (cohort.length > 0 ? cohort : allWithBids)
    .slice(0, 3)
    .map((s) => ({
      id: s.id,
      title: s.title,
      categoryName: s.categoryName,
      city: s.city,
      status: s.status,
      maxBudget: s.maxBudget,
      lowestBid: s.acceptedBid ?? s.lowestBid,
      bidCount: s.bids.length,
      discountPct: s.discountPct,
    }));

  return {
    categoryId: selectedCategory?.id ?? null,
    categoryName: selectedCategory?.name ?? null,
    city: input.city?.trim() ? input.city.trim() : null,
    scope,
    confidence,
    targetRange: {
      low: targetLow,
      ideal: targetIdeal,
      high: targetHigh,
      recommendedCeiling,
    },
    currentBudgetAnalysis,
    historicalStats: {
      sampleAuctions: cohort.length,
      sampleBids: cohortSampleBids,
      platformBidsAnalyzed: platformTotalBids,
      avgBidsPerAuction,
      avgDiscountPct,
      historicalMinBid: cohortBids.length > 0 ? cohortBids[0] : null,
      historicalMedianBid:
        cohortL1s.length > 0
          ? Math.round(quantile(cohortL1s, 0.5))
          : cohortBids.length > 0
          ? Math.round(quantile(cohortBids, 0.5))
          : null,
      historicalMaxBid:
        cohortBids.length > 0 ? cohortBids[cohortBids.length - 1] : null,
      categoryFloor,
    },
    adjustmentFactors,
    comparableAuctions,
  };
}
