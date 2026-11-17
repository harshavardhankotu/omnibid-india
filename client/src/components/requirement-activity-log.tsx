import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  FileText,
  Gavel,
  History,
  Lock,
  MessageSquare,
  Shield,
  TrendingDown,
  Undo2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";

export type ActivityCategory = "all" | "bids" | "status" | "negotiations";

export interface RequirementActivityEvent {
  id: string;
  requirementId: string;
  category: "bids" | "status" | "negotiations";
  type: string;
  title: string;
  description: string;
  actorName?: string | null;
  actorRole?: string | null;
  amountInr?: number | null;
  statusFrom?: string | null;
  statusTo?: string | null;
  timestamp: string;
}

interface ActivityResponse {
  requirementId: string;
  events: RequirementActivityEvent[];
}

interface RequirementActivityLogProps {
  requirementId: string;
  isAuctionOpen: boolean;
}

function getEventIconAndTone(type: string) {
  switch (type) {
    case "bid_l1_captured":
      return {
        Icon: TrendingDown,
        tone: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
      };
    case "bid_placed":
      return {
        Icon: Gavel,
        tone: "text-primary bg-primary/10 border-primary/30",
      };
    case "bid_withdrawn":
      return {
        Icon: Undo2,
        tone: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30",
      };
    case "bid_accepted":
    case "counter_offer_accepted":
    case "envelope_a_approved":
    case "dispute_resolved":
      return {
        Icon: CheckCircle2,
        tone: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
      };
    case "negotiation_counter_offer":
    case "negotiation_message":
    case "negotiation_response":
    case "negotiation_started":
      return {
        Icon: MessageSquare,
        tone: "text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/30",
      };
    case "escrow_funded":
      return {
        Icon: Shield,
        tone: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
      };
    case "auction_extended":
    case "auction_ended":
      return {
        Icon: Clock,
        tone: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30",
      };
    case "dispute_raised":
    case "requirement_cancelled":
    case "counter_offer_declined":
      return {
        Icon: AlertCircle,
        tone: "text-destructive bg-destructive/10 border-destructive/30",
      };
    case "requirement_created":
      return {
        Icon: FileText,
        tone: "text-primary bg-primary/10 border-primary/30",
      };
    default:
      return {
        Icon: Lock,
        tone: "text-muted-foreground bg-muted border-border",
      };
  }
}

export function RequirementActivityLog({
  requirementId,
  isAuctionOpen,
}: RequirementActivityLogProps) {
  const { user } = useAuth();
  const [categoryFilter, setCategoryFilter] = useState<ActivityCategory>("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");

  const { data, isLoading } = useQuery<ActivityResponse>({
    queryKey: ["requirement-activity", requirementId, user?.id ?? "anon"],
    queryFn: async () => {
      const token = localStorage.getItem("omnibid_token");
      const res = await fetch(`/api/requirements/${requirementId}/activity`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) {
        throw new Error("Failed to load requirement activity log");
      }
      return res.json();
    },
    enabled: !!requirementId,
    refetchInterval: isAuctionOpen ? 20000 : false,
  });

  const events = data?.events ?? [];

  const filteredEvents = useMemo(() => {
    const base =
      categoryFilter === "all"
        ? events
        : events.filter((e) => e.category === categoryFilter);
    return [...base].sort((a, b) => {
      const diff =
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      return sortOrder === "newest" ? -diff : diff;
    });
  }, [events, categoryFilter, sortOrder]);

  return (
    <Card data-testid="section-activity-log">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4 text-primary" />
              <span>Activity Log</span>
              <span className="text-xs font-normal text-muted-foreground tabular-nums">
                ({events.length})
              </span>
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Chronological audit trail of bid updates, status shifts, and negotiation milestones.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div
              className="inline-flex items-center gap-1 p-0.5 rounded-lg bg-muted/70 border border-border"
              role="tablist"
              aria-label="Filter activity log"
            >
              {(
                [
                  { value: "all", label: "All" },
                  { value: "bids", label: "Bids" },
                  { value: "status", label: "Status" },
                  { value: "negotiations", label: "Negotiations" },
                ] as const
              ).map((tab) => {
                const active = categoryFilter === tab.value;
                return (
                  <button
                    key={tab.value}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setCategoryFilter(tab.value)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    data-testid={`activity-filter-${tab.value}`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setSortOrder((prev) => (prev === "newest" ? "oldest" : "newest"))
              }
              className="h-7 px-2.5 text-xs whitespace-nowrap shrink-0"
              data-testid="button-activity-sort"
            >
              <ArrowUpDown className="h-3 w-3 mr-1" />
              {sortOrder === "newest" ? "Newest" : "Oldest"}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <Skeleton key={idx} className="h-16 rounded-lg" />
            ))}
          </div>
        ) : filteredEvents.length === 0 ? (
          <div
            className="text-center py-8 text-muted-foreground border border-dashed border-border rounded-xl"
            data-testid="empty-activity-log"
          >
            <History className="h-7 w-7 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-medium text-foreground">
              No activity recorded in this category yet
            </p>
            {categoryFilter !== "all" && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2 text-xs"
                onClick={() => setCategoryFilter("all")}
              >
                Show all events ({events.length})
              </Button>
            )}
          </div>
        ) : (
          <ol
            className="relative ml-3.5 border-l border-border space-y-5 pl-6 py-1"
            data-testid="list-activity-log"
          >
            {filteredEvents.map((ev) => {
              const { Icon, tone } = getEventIconAndTone(ev.type);
              const formattedTime = new Date(ev.timestamp).toLocaleString("en-IN", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <li
                  key={ev.id}
                  className="relative"
                  data-testid={`activity-event-${ev.id}`}
                >
                  <span
                    className={`absolute -left-[37px] top-0.5 flex h-6 w-6 items-center justify-center rounded-full border ${tone}`}
                    aria-hidden="true"
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>

                  <div className="space-y-1">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="text-sm font-semibold text-foreground leading-snug">
                        {ev.title}
                      </div>
                      <time
                        dateTime={ev.timestamp}
                        className="text-xs text-muted-foreground tabular-nums shrink-0"
                      >
                        {formattedTime}
                      </time>
                    </div>

                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {ev.description}
                    </p>

                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap pt-0.5">
                      {ev.actorName && (
                        <span>
                          <span className="font-medium text-foreground/80">
                            {ev.actorName}
                          </span>
                          {ev.actorRole ? ` · ${ev.actorRole}` : ""}
                        </span>
                      )}
                      {ev.statusFrom && ev.statusTo && (
                        <>
                          {ev.actorName && <span aria-hidden="true">·</span>}
                          <span className="font-mono text-foreground/80">
                            {ev.statusFrom.replace("_", " ")} →{" "}
                            {ev.statusTo.replace("_", " ")}
                          </span>
                        </>
                      )}
                      {ev.amountInr != null && ev.amountInr > 0 && (
                        <>
                          {(ev.actorName || (ev.statusFrom && ev.statusTo)) && (
                            <span aria-hidden="true">·</span>
                          )}
                          <span className="font-semibold text-primary tabular-nums">
                            ₹{ev.amountInr.toLocaleString("en-IN")}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
