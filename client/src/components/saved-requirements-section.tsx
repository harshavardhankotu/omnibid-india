import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowUpRight,
  Bookmark,
  BookmarkMinus,
  Clock,
  IndianRupee,
  MapPin,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Countdown } from "@/components/countdown";
import { useSavedRequirements } from "@/hooks/use-saved-requirements";

type SavedFilter = "all" | "open" | "closed";

export function SavedRequirementsSection() {
  const [, setLocation] = useLocation();
  const [filter, setFilter] = useState<SavedFilter>("all");
  const { savedRequirements, isLoading, isPending, toggleBookmark } = useSavedRequirements();

  const filteredRequirements = useMemo(() => {
    const now = Date.now();
    return savedRequirements.filter((item) => {
      const deadlinePassed =
        item.auctionEndsAt && new Date(item.auctionEndsAt).getTime() <= now;
      const isOpen = item.status === "open" && !deadlinePassed;
      if (filter === "open") return isOpen;
      if (filter === "closed") return !isOpen;
      return true;
    });
  }, [savedRequirements, filter]);

  return (
    <Card data-testid="section-saved-requirements">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <CardTitle className="text-base flex items-center gap-2">
              <Bookmark className="h-4 w-4 text-primary" />
              <span>Saved Requirements</span>
              <span className="text-xs font-normal text-muted-foreground tabular-nums">
                ({savedRequirements.length})
              </span>
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Requirements you have bookmarked to review, compare bids, or quote later.
            </p>
          </div>

          {savedRequirements.length > 0 && (
            <div
              className="inline-flex items-center gap-1 p-1 rounded-lg bg-muted/70 border border-border self-start sm:self-auto"
              role="tablist"
              aria-label="Filter saved requirements"
            >
              {(
                [
                  { value: "all", label: "All" },
                  { value: "open", label: "Open" },
                  { value: "closed", label: "Closed" },
                ] as const
              ).map((tab) => {
                const active = filter === tab.value;
                return (
                  <button
                    key={tab.value}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setFilter(tab.value)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    data-testid={`saved-filter-${tab.value}`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, idx) => (
              <Skeleton key={idx} className="h-24 rounded-lg" />
            ))}
          </div>
        ) : savedRequirements.length === 0 ? (
          <div
            className="text-center py-8 px-4 border border-dashed border-border rounded-xl"
            data-testid="empty-saved-requirements"
          >
            <Bookmark className="h-8 w-8 mx-auto mb-2.5 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground">No saved requirements yet</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              Bookmark open requirements while browsing so you can track budgets, deadlines, and L1 bids here.
            </p>
            <Button
              type="button"
              size="sm"
              className="mt-4 whitespace-nowrap shrink-0"
              onClick={() => setLocation("/requirements")}
              data-testid="button-browse-from-saved"
            >
              Browse Requirements
            </Button>
          </div>
        ) : filteredRequirements.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm font-medium">
              No {filter === "open" ? "open" : "closed"} saved requirements
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2 text-xs"
              onClick={() => setFilter("all")}
            >
              Show all saved ({savedRequirements.length})
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border" data-testid="list-saved-requirements">
            {filteredRequirements.map((req) => {
              const deadlinePassed =
                req.auctionEndsAt && new Date(req.auctionEndsAt).getTime() <= Date.now();
              const isOpen = req.status === "open" && !deadlinePassed;
              const savedDate = req.savedAt
                ? new Date(req.savedAt).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                  })
                : null;

              return (
                <div
                  key={req.id}
                  className="py-3.5 first:pt-1 last:pb-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  data-testid={`saved-requirement-row-${req.id}`}
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
                      <span className="font-medium text-foreground/80">{req.categoryName}</span>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {req.city}
                      </span>
                      {savedDate && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>Saved {savedDate}</span>
                        </>
                      )}
                    </div>

                    <Link
                      href={`/requirements/${req.id}`}
                      className="block font-semibold text-sm text-foreground hover:text-primary hover:underline truncate"
                      data-testid={`link-saved-requirement-${req.id}`}
                    >
                      {req.title}
                    </Link>

                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap pt-0.5">
                      <span className="inline-flex items-center gap-0.5 font-semibold text-foreground tabular-nums">
                        <IndianRupee className="h-3 w-3 text-primary" />
                        {req.maxBudget.toLocaleString("en-IN")} max
                      </span>
                      {req.lowestBid != null && (
                        <span className="font-medium text-emerald-600 dark:text-emerald-400 tabular-nums">
                          L1: ₹{req.lowestBid.toLocaleString("en-IN")}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <Users className="h-3 w-3" />
                        {req.bidCount} {req.bidCount === 1 ? "bid" : "bids"}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {isOpen ? (
                          <Countdown endsAt={req.auctionEndsAt} />
                        ) : (
                          <span className="capitalize">
                            {deadlinePassed && req.status === "open"
                              ? "Bidding Ended"
                              : req.status.replace("_", " ")}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 px-3 text-xs whitespace-nowrap shrink-0"
                      onClick={() => setLocation(`/requirements/${req.id}`)}
                      data-testid={`button-view-saved-${req.id}`}
                    >
                      View
                      <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isPending}
                      onClick={() => toggleBookmark(req.id, req.title)}
                      className="h-8 px-2.5 text-xs text-muted-foreground hover:text-destructive whitespace-nowrap shrink-0"
                      aria-label={`Remove ${req.title} from saved requirements`}
                      title="Remove from Saved Requirements"
                      data-testid={`button-remove-saved-${req.id}`}
                    >
                      <BookmarkMinus className="h-3.5 w-3.5 mr-1" />
                      Remove
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
