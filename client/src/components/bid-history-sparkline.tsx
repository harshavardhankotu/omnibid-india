import { useMemo } from "react";
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  YAxis,
} from "recharts";
import type { Bid } from "@omnibid/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowDownRight, IndianRupee, TrendingDown } from "lucide-react";

interface BidHistorySparklineProps {
  bids: Bid[];
  maxBudget: number;
  requirementStatus?: string;
}

interface SparklinePoint {
  step: number;
  label: string;
  providerName: string;
  bidAmount: number;
  runningLow: number;
  timestamp: string;
}

function formatShortTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function BidHistorySparkline({
  bids,
  maxBudget,
  requirementStatus,
}: BidHistorySparklineProps) {
  const revealedBids = useMemo(
    () =>
      [...bids]
        .filter((b) => typeof b.bidAmount === "number" && b.bidAmount > 0)
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        ),
    [bids]
  );

  const points: SparklinePoint[] = useMemo(() => {
    let bestSoFar = Infinity;
    return revealedBids.map((bid, idx) => {
      bestSoFar = Math.min(bestSoFar, bid.bidAmount);
      return {
        step: idx + 1,
        label: `Bid #${idx + 1}`,
        providerName: bid.providerName,
        bidAmount: bid.bidAmount,
        runningLow: bestSoFar,
        timestamp: formatShortTime(bid.createdAt),
      };
    });
  }, [revealedBids]);

  if (bids.length === 0) return null;

  if (points.length < 2) {
    return (
      <Card className="border-border/80 bg-card/80" data-testid="card-bid-history-sparkline">
        <CardContent className="py-3 px-4 flex items-center justify-between gap-2 text-xs text-muted-foreground flex-wrap">
          <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
            <TrendingDown className="h-3.5 w-3.5 text-emerald-600" />
            Bid Price Trend
          </span>
          <span>
            {points.length === 1
              ? `Opening quote at ₹${points[0].bidAmount.toLocaleString("en-IN")} — awaiting more bids to chart the downward trend.`
              : "Financial bids are sealed pending technical (Envelope A) review."}
          </span>
        </CardContent>
      </Card>
    );
  }

  const openingBid = points[0].bidAmount;
  const currentLowest = points[points.length - 1].runningLow;
  const dropFromOpening = Math.max(0, openingBid - currentLowest);
  const dropPct = openingBid > 0 ? (dropFromOpening / openingBid) * 100 : 0;
  const savingsVsBudget = Math.max(0, maxBudget - currentLowest);
  const savingsPct = maxBudget > 0 ? (savingsVsBudget / maxBudget) * 100 : 0;

  const minVal = Math.min(...points.map((p) => p.runningLow));
  const maxVal = Math.max(...points.map((p) => p.runningLow));
  const range = maxVal - minVal;
  const pad = range > 0 ? Math.round(range * 0.18) : Math.max(1000, Math.round(minVal * 0.05));

  return (
    <Card className="border-emerald-500/25 bg-card shadow-xs" data-testid="card-bid-history-sparkline">
      <CardHeader className="pb-2 pt-4 px-4 sm:px-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <TrendingDown className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <CardTitle className="text-sm font-bold">
                Reverse Auction Bid Trend
              </CardTitle>
              {dropFromOpening > 0 ? (
                <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-[10px] px-1.5 py-0 font-semibold">
                  <ArrowDownRight className="h-3 w-3 mr-0.5" />
                  -{dropPct.toFixed(1)}% drop
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {requirementStatus === "completed" ? "Final L1" : "Live L1"}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Chronological L1 lowest-bid progression across {points.length} bids
            </p>
          </div>

          <div className="flex items-center gap-4 text-right">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Opening</div>
              <div className="text-xs font-semibold text-foreground/80">
                ₹{openingBid.toLocaleString("en-IN")}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Current L1</div>
              <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 flex items-center justify-end gap-0.5" data-testid="text-sparkline-l1">
                <IndianRupee className="h-3 w-3" />
                {currentLowest.toLocaleString("en-IN")}
              </div>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 sm:px-5 pb-4 pt-1 space-y-2">
        <div className="h-28 w-full" data-testid="chart-bid-sparkline">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
              <defs>
                <linearGradient id="omnibidBidSparklineGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <YAxis hide domain={[Math.max(0, minVal - pad), maxVal + pad]} />
              <ReferenceLine
                y={openingBid}
                stroke="currentColor"
                strokeOpacity={0.18}
                strokeDasharray="3 3"
              />
              <Tooltip
                cursor={{ stroke: "#10b981", strokeWidth: 1, strokeDasharray: "3 3" }}
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const item = payload[0].payload as SparklinePoint;
                  return (
                    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md space-y-1">
                      <div className="flex items-center justify-between gap-3 font-semibold text-foreground">
                        <span>{item.label}</span>
                        <span className="text-emerald-600 dark:text-emerald-400">
                          L1: ₹{item.runningLow.toLocaleString("en-IN")}
                        </span>
                      </div>
                      <div className="text-muted-foreground">{item.providerName}</div>
                      <div className="text-muted-foreground">
                        Quote: <span className="font-medium text-foreground">₹{item.bidAmount.toLocaleString("en-IN")}</span>
                      </div>
                      {item.timestamp && (
                        <div className="text-[10px] text-muted-foreground/80">{item.timestamp}</div>
                      )}
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="runningLow"
                stroke="#10b981"
                strokeWidth={2.25}
                fill="url(#omnibidBidSparklineGradient)"
                dot={{ r: 3.5, fill: "#10b981", strokeWidth: 1.5, stroke: "#ffffff" }}
                activeDot={{ r: 5, fill: "#059669", stroke: "#ffffff", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="flex items-center justify-between text-[11px] text-muted-foreground border-t border-border/60 pt-2 flex-wrap gap-2">
          <span>Started: {points[0].timestamp || "Initial bid"}</span>
          {savingsVsBudget > 0 && (
            <span className="font-medium text-emerald-700 dark:text-emerald-400">
              ₹{savingsVsBudget.toLocaleString("en-IN")} saved vs max budget ({savingsPct.toFixed(1)}%)
            </span>
          )}
          <span>Latest: {points[points.length - 1].timestamp || "Recent bid"}</span>
        </div>
      </CardContent>
    </Card>
  );
}
