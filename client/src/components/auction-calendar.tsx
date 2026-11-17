import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  Calendar as CalendarIcon,
  CalendarPlus,
  Clock,
  Download,
  ExternalLink,
  IndianRupee,
  MapPin,
  PlayCircle,
  X,
} from "lucide-react";
import { useListRequirements, type Requirement } from "@omnibid/api-client-react";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  buildGoogleCalendarUrl,
  downloadIcsFile,
  generateIcsContent,
  type CalendarSyncEvent,
} from "@/lib/calendar-ics";

type EventFilter = "all" | "deadline" | "start";
type ScopeFilter = "all" | "mine";

interface AuctionCalendarProps {
  requirements?: Requirement[];
  roleLabel: "buyer" | "provider";
  isLoading?: boolean;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

interface AgendaEvent extends CalendarSyncEvent {
  categoryName: string;
  city: string;
  maxBudget: number;
  lowestBid: number | null;
  bidCount: number;
  isPast: boolean;
}

export function AuctionCalendar({
  requirements: personalRequirements = [],
  roleLabel,
  isLoading: personalLoading = false,
}: AuctionCalendarProps) {
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [eventFilter, setEventFilter] = useState<EventFilter>("all");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>(
    personalRequirements.length > 0 ? "mine" : "all"
  );

  const { data: openFeedData, isLoading: feedLoading } = useListRequirements({
    status: "open",
    limit: 30,
  });

  const hasPersonal = personalRequirements.length > 0;
  const effectiveScope: ScopeFilter =
    scopeFilter === "mine" && hasPersonal ? "mine" : "all";

  const sourceRequirements = useMemo(() => {
    const map = new Map<string, Requirement>();
    if (effectiveScope === "mine") {
      for (const r of personalRequirements) {
        map.set(r.id, r);
      }
    } else {
      for (const r of openFeedData?.requirements ?? []) {
        map.set(r.id, r);
      }
      for (const r of personalRequirements) {
        if (!map.has(r.id)) {
          map.set(r.id, r);
        }
      }
    }
    return Array.from(map.values());
  }, [effectiveScope, openFeedData?.requirements, personalRequirements]);

  const allEvents = useMemo<AgendaEvent[]>(() => {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "https://omnibid.in";
    const nowMs = Date.now();
    const list: AgendaEvent[] = [];

    for (const req of sourceRequirements) {
      const startTs = new Date(req.createdAt);
      const endTs = new Date(req.auctionEndsAt);
      const location = `${req.city}${req.state ? `, ${req.state}` : ""}`;
      const url = `${origin}/requirements/${req.id}`;
      const baseDescription = `${req.categoryName} · Max Budget: ₹${req.maxBudget.toLocaleString("en-IN")} · ${req.bidCount} bids`;

      if (!Number.isNaN(startTs.getTime())) {
        const startEnd = new Date(startTs.getTime() + 30 * 60 * 1000);
        list.push({
          id: `start-${req.id}`,
          requirementId: req.id,
          kind: "start",
          title: req.title,
          description: `Auction Start Time — ${baseDescription}`,
          location,
          startDate: startTs,
          endDate: startEnd,
          url,
          categoryName: req.categoryName,
          city: req.city,
          maxBudget: req.maxBudget,
          lowestBid: req.lowestBid ?? null,
          bidCount: req.bidCount,
          isPast: startTs.getTime() < nowMs - 24 * 60 * 60 * 1000,
        });
      }

      if (!Number.isNaN(endTs.getTime())) {
        const deadlineEnd = new Date(endTs.getTime() + 30 * 60 * 1000);
        list.push({
          id: `deadline-${req.id}`,
          requirementId: req.id,
          kind: "deadline",
          title: req.title,
          description: `Bidding Deadline — ${baseDescription}`,
          location,
          startDate: endTs,
          endDate: deadlineEnd,
          url,
          categoryName: req.categoryName,
          city: req.city,
          maxBudget: req.maxBudget,
          lowestBid: req.lowestBid ?? null,
          bidCount: req.bidCount,
          isPast: endTs.getTime() < nowMs,
        });
      }
    }

    return list.sort((a, b) => {
      if (a.isPast !== b.isPast) return a.isPast ? 1 : -1;
      return a.startDate.getTime() - b.startDate.getTime();
    });
  }, [sourceRequirements]);

  const typeFilteredEvents = useMemo(() => {
    if (eventFilter === "all") return allEvents;
    return allEvents.filter((ev) => ev.kind === eventFilter);
  }, [allEvents, eventFilter]);

  const visibleEvents = useMemo(() => {
    if (!selectedDate) {
      return typeFilteredEvents.filter((ev) => !ev.isPast);
    }
    return typeFilteredEvents.filter((ev) => isSameDay(ev.startDate, selectedDate));
  }, [selectedDate, typeFilteredEvents]);

  const deadlineDates = useMemo(
    () => typeFilteredEvents.filter((e) => e.kind === "deadline").map((e) => e.startDate),
    [typeFilteredEvents]
  );

  const startDates = useMemo(
    () => typeFilteredEvents.filter((e) => e.kind === "start").map((e) => e.startDate),
    [typeFilteredEvents]
  );

  const handleDownloadSingle = (ev: AgendaEvent) => {
    const ics = generateIcsContent([ev]);
    const slug = ev.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 36);
    downloadIcsFile(`omnibid-${ev.kind}-${slug || ev.requirementId}.ics`, ics);
    toast({
      title: "Calendar event downloaded",
      description: `Open the .ics file to add "${ev.title}" (${ev.kind === "deadline" ? "Deadline" : "Start Time"}) to your device calendar.`,
    });
  };

  const handleSyncAll = () => {
    const eventsToSync = visibleEvents.length > 0 ? visibleEvents : typeFilteredEvents;
    if (eventsToSync.length === 0) {
      toast({
        title: "No events to sync",
        description: "Switch filters or check back when upcoming auctions are scheduled.",
      });
      return;
    }
    const ics = generateIcsContent(eventsToSync);
    downloadIcsFile("omnibid-auction-calendar.ics", ics);
    toast({
      title: `Exported ${eventsToSync.length} calendar ${eventsToSync.length === 1 ? "event" : "events"}`,
      description: "Import omnibid-auction-calendar.ics on Apple, Google, or Outlook Calendar to sync deadlines and start times.",
    });
  };

  const loading = personalLoading || (effectiveScope === "all" && feedLoading);

  return (
    <Card data-testid="section-auction-calendar">
      <CardHeader className="pb-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-primary" />
              <span>Auction Calendar</span>
              <span className="text-xs font-normal text-muted-foreground tabular-nums">
                ({visibleEvents.length} {selectedDate ? "on selected day" : "upcoming"})
              </span>
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Track auction start times and bidding deadlines, and export `.ics` reminders directly to your device calendar.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {hasPersonal && (
              <div
                className="inline-flex items-center gap-1 p-0.5 rounded-lg bg-muted/70 border border-border"
                role="tablist"
                aria-label="Calendar requirement scope"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={effectiveScope === "mine"}
                  onClick={() => setScopeFilter("mine")}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    effectiveScope === "mine"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid="calendar-scope-mine"
                >
                  {roleLabel === "buyer" ? "My Auctions" : "My Bids"}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={effectiveScope === "all"}
                  onClick={() => setScopeFilter("all")}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    effectiveScope === "all"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid="calendar-scope-all"
                >
                  All Live
                </button>
              </div>
            )}

            <div
              className="inline-flex items-center gap-1 p-0.5 rounded-lg bg-muted/70 border border-border"
              role="tablist"
              aria-label="Filter event type"
            >
              {(
                [
                  { value: "all", label: "All" },
                  { value: "deadline", label: "Deadlines" },
                  { value: "start", label: "Starts" },
                ] as const
              ).map((tab) => {
                const active = eventFilter === tab.value;
                return (
                  <button
                    key={tab.value}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setEventFilter(tab.value)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    data-testid={`calendar-filter-${tab.value}`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleSyncAll}
              disabled={loading || typeFilteredEvents.length === 0}
              className="h-8 px-3 text-xs font-semibold whitespace-nowrap shrink-0"
              data-testid="button-sync-all-calendar"
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Sync All (.ics)
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <Skeleton className="lg:col-span-5 h-72 rounded-xl" />
            <div className="lg:col-span-7 space-y-2.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Month Grid */}
            <div className="lg:col-span-5 flex flex-col items-center rounded-xl border border-border bg-muted/20 p-3">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => setSelectedDate(d)}
                modifiers={{
                  deadline: deadlineDates,
                  start: startDates,
                }}
                modifiersClassNames={{
                  deadline:
                    "font-semibold ring-1 ring-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-300 rounded-md",
                  start:
                    "font-semibold ring-1 ring-primary/50 bg-primary/10 text-primary rounded-md",
                }}
                className="p-1"
              />

              <div className="w-full pt-2.5 mt-2 border-t border-border flex items-center justify-between text-xs text-muted-foreground px-1">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs ring-1 ring-primary/50 bg-primary/15 inline-block" />
                    Start Time
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs ring-1 ring-amber-500/60 bg-amber-500/15 inline-block" />
                    Deadline
                  </span>
                </div>
                {selectedDate && (
                  <button
                    type="button"
                    onClick={() => setSelectedDate(undefined)}
                    className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
                    data-testid="button-clear-date-filter"
                  >
                    <X className="h-3 w-3" />
                    Show all
                  </button>
                )}
              </div>
            </div>

            {/* Upcoming / Day Agenda */}
            <div className="lg:col-span-7">
              {selectedDate && (
                <div className="flex items-center justify-between mb-2.5 px-1">
                  <span className="text-xs font-semibold text-foreground">
                    Events on{" "}
                    {selectedDate.toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedDate(undefined)}
                    className="text-xs text-primary hover:underline"
                  >
                    View all upcoming
                  </button>
                </div>
              )}

              {visibleEvents.length === 0 ? (
                <div
                  className="text-center py-10 px-4 rounded-xl border border-dashed border-border"
                  data-testid="empty-auction-calendar"
                >
                  <CalendarIcon className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                  <p className="text-sm font-medium text-foreground">
                    {selectedDate
                      ? "No auction events scheduled on this date"
                      : "No upcoming auction events"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {selectedDate
                      ? "Select a highlighted date on the calendar or reset the filter to inspect upcoming deadlines."
                      : "New auction start times and deadlines will appear here automatically."}
                  </p>
                  {selectedDate && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3 text-xs"
                      onClick={() => setSelectedDate(undefined)}
                    >
                      Show Upcoming Events
                    </Button>
                  )}
                </div>
              ) : (
                <div
                  className="divide-y divide-border rounded-xl border border-border bg-background/60 dark:bg-background/30 max-h-[360px] overflow-y-auto px-4"
                  data-testid="list-auction-calendar-events"
                >
                  {visibleEvents.slice(0, 20).map((ev) => {
                    const isDeadline = ev.kind === "deadline";
                    return (
                      <div
                        key={ev.id}
                        className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                        data-testid={`calendar-event-${ev.id}`}
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2 text-xs flex-wrap">
                            <span
                              className={`inline-flex items-center gap-1 font-semibold ${
                                isDeadline
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-primary"
                              }`}
                            >
                              {isDeadline ? (
                                <Clock className="h-3 w-3" />
                              ) : (
                                <PlayCircle className="h-3 w-3" />
                              )}
                              {isDeadline ? "Deadline" : "Start Time"}
                            </span>
                            <span aria-hidden="true" className="text-muted-foreground">
                              ·
                            </span>
                            <span className="font-medium text-foreground tabular-nums">
                              {ev.startDate.toLocaleString("en-IN", {
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            <span aria-hidden="true" className="text-muted-foreground">
                              ·
                            </span>
                            <span className="text-muted-foreground truncate">
                              {ev.categoryName}
                            </span>
                          </div>

                          <Link
                            href={`/requirements/${ev.requirementId}`}
                            className="block text-sm font-semibold text-foreground hover:text-primary hover:underline truncate"
                          >
                            {ev.title}
                          </Link>

                          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {ev.city}
                            </span>
                            <span className="inline-flex items-center gap-0.5 tabular-nums font-medium text-foreground/80">
                              <IndianRupee className="h-3 w-3" />
                              {ev.maxBudget.toLocaleString("en-IN")}
                            </span>
                            {ev.lowestBid != null && (
                              <span className="text-emerald-600 dark:text-emerald-400 font-medium tabular-nums">
                                L1: ₹{ev.lowestBid.toLocaleString("en-IN")}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleDownloadSingle(ev)}
                            className="h-8 px-2.5 text-xs whitespace-nowrap shrink-0"
                            title="Download .ics file to sync with your device calendar"
                            data-testid={`button-sync-event-${ev.id}`}
                          >
                            <CalendarPlus className="h-3.5 w-3.5 mr-1" />
                            Add (.ics)
                          </Button>
                          <a
                            href={buildGoogleCalendarUrl(ev)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center h-8 px-2.5 rounded-md border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors whitespace-nowrap shrink-0"
                            title="Add event directly in Google Calendar"
                            data-testid={`link-gcal-${ev.id}`}
                          >
                            Google Cal
                            <ExternalLink className="h-3 w-3 ml-1" />
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
