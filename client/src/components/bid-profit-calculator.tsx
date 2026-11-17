import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { calculateEscrowBreakdown } from "@/lib/gstin-tds";
import { Calculator, IndianRupee, Info } from "lucide-react";

interface BidProfitCalculatorProps {
  bidAmount: number;
  maxBudget?: number | null;
  isHighlighted: boolean;
  defaultEntityKind?: "individual" | "company";
}

function formatInr(amount: number): string {
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString("en-IN", {
    minimumFractionDigits: Number.isInteger(abs) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return amount < 0 ? `-₹${formatted}` : `₹${formatted}`;
}

export function BidProfitCalculator({
  bidAmount,
  maxBudget,
  isHighlighted,
  defaultEntityKind = "individual",
}: BidProfitCalculatorProps) {
  const [entityKind, setEntityKind] = useState<"individual" | "company">(defaultEntityKind);
  const [estimatedCostInput, setEstimatedCostInput] = useState<string>("");

  const safeBid = Math.max(0, Number.isFinite(bidAmount) ? bidAmount : 0);
  const parsedCost = estimatedCostInput.trim() === "" ? 0 : Number(estimatedCostInput);
  const safeCost = Math.max(0, Number.isFinite(parsedCost) ? parsedCost : 0);
  const featuredBidFee = isHighlighted ? 50 : 0;

  const breakdown = useMemo(
    () =>
      calculateEscrowBreakdown({
        grossAmountInr: safeBid,
        gstinOrPan: entityKind === "individual" ? "AAAPA1234A" : "AAACA1234A",
      }),
    [safeBid, entityKind]
  );

  const netEscrowPayout = breakdown.netSettlementInr;
  const totalProfit = Math.round((netEscrowPayout - featuredBidFee - safeCost) * 100) / 100;
  const profitMarginPct = safeBid > 0 ? (totalProfit / safeBid) * 100 : 0;
  const budgetSharePct = maxBudget && maxBudget > 0 && safeBid > 0 ? (safeBid / maxBudget) * 100 : null;
  const isTdsExempt = safeBid <= 30000;

  return (
    <Card className="border-border" data-testid="card-profit-calculator">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Calculator className="h-4 w-4 text-primary" />
              Profit & Escrow Payout Estimator
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Client-side estimate based on OmniBid&apos;s 2% escrow fee and Sec. 194C TDS. Not shared with the buyer.
            </p>
          </div>

          <div
            className="inline-flex items-center gap-1 p-1 rounded-lg bg-muted"
            role="group"
            aria-label="Tax entity type for TDS rate"
          >
            <button
              type="button"
              onClick={() => setEntityKind("individual")}
              data-testid="button-entity-individual"
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                entityKind === "individual"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Individual (1% TDS)
            </button>
            <button
              type="button"
              onClick={() => setEntityKind("company")}
              data-testid="button-entity-company"
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                entityKind === "company"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Company (2% TDS)
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="estimated-execution-cost" className="text-xs font-medium">
            Estimated Execution Cost (optional — materials, labor, travel)
          </Label>
          <div className="relative">
            <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              id="estimated-execution-cost"
              type="number"
              min={0}
              step="1"
              inputMode="numeric"
              className="pl-8 tabular-nums"
              placeholder="0"
              value={estimatedCostInput}
              onChange={(e) => setEstimatedCostInput(e.target.value)}
              data-testid="input-estimated-cost"
            />
          </div>
        </div>

        <div className="border-t border-border pt-3 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Quoted Bid Price</span>
            <span className="font-medium tabular-nums text-foreground" data-testid="text-gross-bid">
              {formatInr(safeBid)}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Standard Escrow Fee (2%)</span>
            <span className="font-medium tabular-nums text-muted-foreground" data-testid="text-platform-fee">
              -{formatInr(breakdown.platformFeeInr)}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground inline-flex items-center gap-1">
              <span>
                Section 194C TDS (
                {isTdsExempt ? "0% exempt ≤ ₹30,000" : `${(breakdown.tdsRate * 100).toFixed(0)}%`})
              </span>
            </span>
            <span className="font-medium tabular-nums text-muted-foreground" data-testid="text-tds-amount">
              {breakdown.tdsInr > 0 ? `-${formatInr(breakdown.tdsInr)}` : "₹0"}
            </span>
          </div>

          {featuredBidFee > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Featured Bid Boost</span>
              <span className="font-medium tabular-nums text-amber-600 dark:text-amber-400" data-testid="text-featured-fee">
                -{formatInr(featuredBidFee)}
              </span>
            </div>
          )}

          {safeCost > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Estimated Execution Cost</span>
              <span className="font-medium tabular-nums text-muted-foreground" data-testid="text-execution-cost">
                -{formatInr(safeCost)}
              </span>
            </div>
          )}
        </div>

        <div className="border-t border-border pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-lg bg-muted/50 px-3.5 py-2.5">
            <div className="text-[11px] text-muted-foreground">Net Escrow Payout</div>
            <div
              className="text-base font-semibold tabular-nums text-foreground mt-0.5"
              data-testid="text-net-payout"
            >
              {formatInr(netEscrowPayout)}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Released on job completion
            </div>
          </div>

          <div className="rounded-lg bg-muted/50 px-3.5 py-2.5">
            <div className="text-[11px] text-muted-foreground">
              {safeCost > 0 ? "Estimated Net Profit" : "Estimated Take-Home"}
            </div>
            <div
              className={`text-base font-bold tabular-nums mt-0.5 ${
                totalProfit > 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : totalProfit < 0
                  ? "text-destructive"
                  : "text-foreground"
              }`}
              data-testid="text-estimated-profit"
            >
              {formatInr(totalProfit)}
            </div>
            <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5" data-testid="text-profit-margin">
              {safeBid > 0 ? `${profitMarginPct.toFixed(1)}% of bid quote` : "Enter a bid amount"}
              {budgetSharePct !== null ? ` · ${budgetSharePct.toFixed(0)}% of max budget` : ""}
            </div>
          </div>
        </div>

        {safeBid > 0 && totalProfit < 0 && (
          <p className="text-xs text-destructive flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5 shrink-0" />
            Estimated costs and fees exceed this bid price by {formatInr(Math.abs(totalProfit))}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
