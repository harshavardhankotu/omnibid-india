import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDownRight,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Info,
  TrendingDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

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

interface MarketPricePredictorProps {
  categoryId: string;
  city: string;
  state: string;
  deadlineHours: number;
  maxBudget: number;
  isSyndicate: boolean;
  isMegaProject: boolean;
  onApplyBudget: (amount: number) => void;
  onInteract?: () => void;
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

function formatInr(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return "—";
  }
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function getScopeLabel(scope: MarketPricePrediction["scope"], city: string | null): string {
  switch (scope) {
    case "category_city":
      return city ? `${city} local bids` : "Local category bids";
    case "category":
      return "Category historical bids";
    case "category_budget_baseline":
      return "Category budgets + L1 curve";
    case "platform_baseline":
      return "Marketplace L1 baseline";
  }
}

function getConfidenceText(confidence: MarketPricePrediction["confidence"]): string {
  switch (confidence) {
    case "high":
      return "High confidence";
    case "moderate":
      return "Moderate confidence";
    case "baseline":
      return "Baseline estimate";
  }
}

export function MarketPricePredictor({
  categoryId,
  city,
  state,
  deadlineHours,
  maxBudget,
  isSyndicate,
  isMegaProject,
  onApplyBudget,
  onInteract,
}: MarketPricePredictorProps) {
  const [showComps, setShowComps] = useState(false);

  const debouncedCity = useDebouncedValue(city.trim(), 280);
  const debouncedState = useDebouncedValue(state.trim(), 280);
  const debouncedBudget = useDebouncedValue(maxBudget, 220);

  const queryParams = new URLSearchParams();
  if (categoryId) queryParams.set("categoryId", categoryId);
  if (debouncedCity) queryParams.set("city", debouncedCity);
  if (debouncedState) queryParams.set("state", debouncedState);
  queryParams.set("deadlineHours", String(deadlineHours || 24));
  if (debouncedBudget > 0) queryParams.set("currentBudget", String(debouncedBudget));
  queryParams.set("isSyndicate", String(isSyndicate));
  queryParams.set("isMegaProject", String(isMegaProject));

  const { data, isLoading, isError, refetch } = useQuery<MarketPricePrediction>({
    queryKey: [
      "market-price-predictor",
      categoryId,
      debouncedCity,
      debouncedState,
      deadlineHours,
      debouncedBudget,
      isSyndicate,
      isMegaProject,
    ],
    queryFn: async () => {
      const token =
        typeof window !== "undefined" ? localStorage.getItem("omnibid_token") : null;
      const res = await fetch(`/api/market/price-predictor?${queryParams.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) {
        throw new Error("Failed to calculate target price prediction");
      }
      return res.json();
    },
    placeholderData: (prev) => prev,
    staleTime: 15_000,
  });

  const handleApplyCeiling = () => {
    if (!data) return;
    onInteract?.();
    onApplyBudget(data.targetRange.recommendedCeiling);
  };

  const handleApplyIdeal = () => {
    if (!data) return;
    onInteract?.();
    onApplyBudget(data.targetRange.ideal);
  };

  const renderStatusIcon = (
    status: NonNullable<MarketPricePrediction["currentBudgetAnalysis"]>["status"]
  ) => {
    switch (status) {
      case "competitive":
        return <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />;
      case "below_floor":
        return <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />;
      case "below_market":
        return <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />;
      case "generous":
        return <TrendingDown className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />;
    }
  };

  const renderStatusColor = (
    status: NonNullable<MarketPricePrediction["currentBudgetAnalysis"]>["status"]
  ) => {
    switch (status) {
      case "competitive":
        return "text-emerald-700 dark:text-emerald-300";
      case "below_floor":
        return "text-destructive";
      case "below_market":
        return "text-amber-700 dark:text-amber-300";
      case "generous":
        return "text-blue-700 dark:text-blue-300";
    }
  };

  // Compute range bar geometry
  const rangeBar = (() => {
    if (!data) return null;
    const { low, ideal, high, recommendedCeiling } = data.targetRange;
    const minScale = Math.min(data.historicalStats.categoryFloor, low, maxBudget || low) * 0.75;
    const maxScale = Math.max(recommendedCeiling * 1.15, maxBudget * 1.08, high * 1.25, minScale + 1000);
    const span = Math.max(1, maxScale - minScale);
    const pct = (v: number) => Math.max(0, Math.min(100, ((v - minScale) / span) * 100));

    return {
      lowPct: pct(low),
      highPct: pct(high),
      idealPct: pct(ideal),
      ceilingPct: pct(recommendedCeiling),
      currentPct: pct(maxBudget),
    };
  })();

  const isCeilingApplied = data ? maxBudget === data.targetRange.recommendedCeiling : false;
  const isIdealApplied = data ? maxBudget === data.targetRange.ideal : false;

  return (
    <Card
      className="border-border"
      onMouseDown={onInteract}
      onFocusCapture={onInteract}
      data-testid="card-market-price-predictor"
    >
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary shrink-0" />
              Market Price Predictor
            </CardTitle>
            {data ? (
              <div
                className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground tabular-nums"
                data-testid="text-predictor-meta"
              >
                <span>{data.categoryName ?? "All categories"}</span>
                <span aria-hidden="true">·</span>
                <span>{getScopeLabel(data.scope, data.city)}</span>
                <span aria-hidden="true">·</span>
                <span>{getConfidenceText(data.confidence)}</span>
                <span aria-hidden="true">·</span>
                <span>
                  {data.historicalStats.sampleAuctions} auctions ({data.historicalStats.platformBidsAnalyzed} bids analyzed)
                </span>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Uses historical reverse-auction bids to recommend a realistic target range.
              </p>
            )}
          </div>

          {!categoryId && (
            <span className="text-xs text-amber-700 dark:text-amber-300 font-medium inline-flex items-center gap-1">
              <Info className="h-3.5 w-3.5 shrink-0" />
              Select a category above for sector-specific pricing
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        {isLoading && !data ? (
          <div className="space-y-3" data-testid="skeleton-market-predictor">
            <div className="grid grid-cols-3 gap-3">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : isError ? (
          <div className="flex items-center justify-between gap-3 py-3 text-xs text-muted-foreground border-t border-border/60">
            <span>Unable to load historical bid benchmarks right now.</span>
            <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : data ? (
          <>
            {/* Target Price Trio (single-elevation hairline-divided metrics) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 border-y border-border/70 divide-y sm:divide-y-0 sm:divide-x divide-border/70">
              <div className="py-3 sm:pr-4">
                <div className="text-[11px] font-medium text-muted-foreground">Target L1 Range</div>
                <div
                  className="text-base font-bold text-foreground tabular-nums mt-0.5"
                  data-testid="text-predictor-range"
                >
                  {formatInr(data.targetRange.low)} – {formatInr(data.targetRange.high)}
                </div>
                <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                  Expected winning quote band
                </div>
              </div>

              <div className="py-3 sm:px-4">
                <div className="text-[11px] font-medium text-muted-foreground">Optimal Target Price</div>
                <div
                  className="text-base font-bold text-emerald-700 dark:text-emerald-400 tabular-nums mt-0.5"
                  data-testid="text-predictor-ideal"
                >
                  {formatInr(data.targetRange.ideal)}
                </div>
                <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                  Avg {data.historicalStats.avgDiscountPct}% below ceiling
                </div>
              </div>

              <div className="py-3 sm:pl-4">
                <div className="text-[11px] font-medium text-muted-foreground">Recommended Max Budget</div>
                <div
                  className="text-base font-bold text-primary tabular-nums mt-0.5"
                  data-testid="text-predictor-ceiling"
                >
                  {formatInr(data.targetRange.recommendedCeiling)}
                </div>
                <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                  Attracts ~{data.historicalStats.avgBidsPerAuction || 2} bids/auction
                </div>
              </div>
            </div>

            {/* Visual Target Band + Current Budget Marker */}
            {rangeBar && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
                  <span>Floor: {formatInr(data.historicalStats.categoryFloor)}</span>
                  <span>Your Draft Budget: {formatInr(maxBudget)}</span>
                </div>
                <div className="relative h-2.5 w-full rounded-full bg-muted overflow-visible">
                  {/* Optimal Target Price Band */}
                  <div
                    className="absolute top-0 bottom-0 rounded-full bg-emerald-500/35 dark:bg-emerald-400/35"
                    style={{
                      left: `${rangeBar.lowPct}%`,
                      width: `${Math.max(4, rangeBar.highPct - rangeBar.lowPct)}%`,
                    }}
                    title={`Target range: ${formatInr(data.targetRange.low)} – ${formatInr(data.targetRange.high)}`}
                  />
                  {/* Ideal Midpoint Dot */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-1 rounded-full bg-emerald-600 dark:bg-emerald-400"
                    style={{ left: `${rangeBar.idealPct}%` }}
                    title={`Optimal target price: ${formatInr(data.targetRange.ideal)}`}
                  />
                  {/* Current Budget Thumb */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-4 w-4 rounded-full border-2 border-background bg-primary shadow-sm transition-all duration-150"
                    style={{ left: `${rangeBar.currentPct}%` }}
                    title={`Your max budget: ${formatInr(maxBudget)}`}
                  />
                </div>
              </div>
            )}

            {/* One-Click Apply Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleApplyCeiling}
                  variant={isCeilingApplied ? "secondary" : "default"}
                  className="whitespace-nowrap shrink-0"
                  data-testid="button-apply-recommended-ceiling"
                >
                  {isCeilingApplied ? (
                    <>
                      <Check className="h-3.5 w-3.5 mr-1.5" />
                      Ceiling Applied ({formatInr(data.targetRange.recommendedCeiling)})
                    </>
                  ) : (
                    <>Apply {formatInr(data.targetRange.recommendedCeiling)} Ceiling</>
                  )}
                </Button>

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleApplyIdeal}
                  disabled={isIdealApplied}
                  className="whitespace-nowrap shrink-0"
                  data-testid="button-apply-target-ideal"
                >
                  {isIdealApplied
                    ? `Target Applied (${formatInr(data.targetRange.ideal)})`
                    : `Use ${formatInr(data.targetRange.ideal)} Target`}
                </Button>
              </div>

              <button
                type="button"
                onClick={() => setShowComps((prev) => !prev)}
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap shrink-0"
                data-testid="button-toggle-historical-comps"
              >
                {showComps ? "Hide" : "View"} {data.comparableAuctions.length} historical comps
                {showComps ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
            </div>

            {/* Live Budget Diagnosis */}
            {data.currentBudgetAnalysis && (
              <div
                className="flex items-start gap-2.5 pt-3 border-t border-border/60 text-xs"
                data-testid="box-budget-diagnosis"
              >
                {renderStatusIcon(data.currentBudgetAnalysis.status)}
                <div className="space-y-0.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className={`font-semibold ${renderStatusColor(data.currentBudgetAnalysis.status)}`}>
                      {data.currentBudgetAnalysis.headline}
                    </span>
                    <span aria-hidden="true" className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground tabular-nums">
                      Expected L1 clearing: {formatInr(data.currentBudgetAnalysis.expectedL1Low)} –{" "}
                      {formatInr(data.currentBudgetAnalysis.expectedL1High)}
                    </span>
                  </div>
                  <p className="text-muted-foreground leading-relaxed">
                    {data.currentBudgetAnalysis.detail}
                  </p>
                </div>
              </div>
            )}

            {/* Pricing Drivers (unboxed inline metadata) */}
            {data.adjustmentFactors.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground pt-1 tabular-nums">
                <span className="font-medium text-foreground/80">Drivers:</span>
                {data.adjustmentFactors.map((f, idx) => (
                  <span key={f.label} className="inline-flex items-center gap-1">
                    {idx > 0 && <span aria-hidden="true">·</span>}
                    <span>
                      {f.label} ({f.impactPct > 0 ? `+${f.impactPct}%` : `${f.impactPct}%`})
                    </span>
                  </span>
                ))}
              </div>
            )}

            {/* Historical Comps Table */}
            {showComps && (
              <div
                className="pt-3 border-t border-border/60 space-y-2"
                data-testid="list-historical-comps"
              >
                <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                  <span>Recent Historical Reference Auctions</span>
                  {data.historicalStats.historicalMedianBid !== null && (
                    <span className="tabular-nums">
                      Median L1: {formatInr(data.historicalStats.historicalMedianBid)}
                    </span>
                  )}
                </div>

                {data.comparableAuctions.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">
                    No closed or bidded auctions in this category yet—using platform-wide reverse auction discount curves.
                  </p>
                ) : (
                  <div className="divide-y divide-border/60">
                    {data.comparableAuctions.map((comp) => (
                      <div
                        key={comp.id}
                        className="py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate">{comp.title}</p>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground tabular-nums">
                            <span>{comp.categoryName}</span>
                            <span aria-hidden="true">·</span>
                            <span>{comp.city}</span>
                            <span aria-hidden="true">·</span>
                            <span>{comp.bidCount} {comp.bidCount === 1 ? "bid" : "bids"}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0 tabular-nums">
                          <div className="text-right">
                            <div className="font-semibold text-foreground">
                              {comp.lowestBid ? formatInr(comp.lowestBid) : formatInr(comp.maxBudget)}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              Ceiling {formatInr(comp.maxBudget)}
                            </div>
                          </div>
                          {comp.discountPct !== null && (
                            <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                              <ArrowDownRight className="h-3 w-3" />
                              {comp.discountPct}%
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
