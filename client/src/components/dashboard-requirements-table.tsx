import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ExternalLink,
  Share2,
} from "lucide-react";
import type { Bid, Requirement } from "@omnibid/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type DashboardSortColumn = "bidDate" | "deadline" | "budget";
export type SortDirection = "asc" | "desc";

export type BuyerDashboardRequirement = Requirement & {
  latestBidAt?: string | null;
};

export interface ProviderDashboardBid extends Bid {
  requirement?: Requirement | null;
}

const DEFAULT_SORT_DIRECTION: Record<DashboardSortColumn, SortDirection> = {
  bidDate: "desc",
  deadline: "asc",
  budget: "desc",
};

const SORT_LABELS: Record<
  DashboardSortColumn,
  { label: string; ascLabel: string; descLabel: string }
> = {
  bidDate: {
    label: "Bid Date",
    ascLabel: "Oldest first",
    descLabel: "Newest first",
  },
  deadline: {
    label: "Deadline",
    ascLabel: "Soonest first",
    descLabel: "Latest first",
  },
  budget: {
    label: "Budget",
    ascLabel: "Lowest first",
    descLabel: "Highest first",
  },
};

function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTimeShort(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDeadlineCountdown(iso: string | null | undefined): {
  label: string;
  isUrgent: boolean;
  isEnded: boolean;
} {
  if (!iso) return { label: "No deadline", isUrgent: false, isEnded: false };
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return { label: "—", isUrgent: false, isEnded: false };
  if (ms <= 0) return { label: "Bidding ended", isUrgent: false, isEnded: true };
  const totalHours = Math.floor(ms / (1000 * 60 * 60));
  const mins = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (totalHours >= 24) {
    const days = Math.floor(totalHours / 24);
    const remHours = totalHours % 24;
    return {
      label: `${days}d ${remHours}h left`,
      isUrgent: false,
      isEnded: false,
    };
  }
  return {
    label: `${totalHours}h ${mins}m left`,
    isUrgent: totalHours < 6,
    isEnded: false,
  };
}

function formatStatusLabel(status: string): { text: string; toneClass: string } {
  switch (status) {
    case "open":
      return {
        text: "Open",
        toneClass: "text-blue-700 dark:text-blue-400",
      };
    case "active":
      return {
        text: "Active",
        toneClass: "text-blue-700 dark:text-blue-400",
      };
    case "accepted":
      return {
        text: "Awarded",
        toneClass: "text-emerald-700 dark:text-emerald-400",
      };
    case "completed":
      return {
        text: "Completed",
        toneClass: "text-emerald-700 dark:text-emerald-400",
      };
    case "in_progress":
      return {
        text: "In Progress",
        toneClass: "text-amber-700 dark:text-amber-400",
      };
    case "disputed":
      return {
        text: "Disputed",
        toneClass: "text-destructive",
      };
    case "withdrawn":
      return {
        text: "Withdrawn",
        toneClass: "text-muted-foreground",
      };
    case "rejected":
      return {
        text: "Not Awarded",
        toneClass: "text-muted-foreground",
      };
    case "expired":
    case "cancelled":
      return {
        text: status === "expired" ? "Expired" : "Cancelled",
        toneClass: "text-muted-foreground",
      };
    default:
      return {
        text: status.replace(/_/g, " "),
        toneClass: "text-muted-foreground",
      };
  }
}

function compareTimestampNullable(
  aIso: string | null | undefined,
  bIso: string | null | undefined,
  direction: SortDirection
): number {
  const aMs = aIso ? new Date(aIso).getTime() : Number.NaN;
  const bMs = bIso ? new Date(bIso).getTime() : Number.NaN;
  const aValid = Number.isFinite(aMs);
  const bValid = Number.isFinite(bMs);

  // Keep rows missing a bid/deadline timestamp consistently at the bottom
  if (!aValid && !bValid) return 0;
  if (!aValid) return 1;
  if (!bValid) return -1;

  return direction === "asc" ? aMs - bMs : bMs - aMs;
}

interface SortableColumnHeadProps {
  column: DashboardSortColumn;
  label: string;
  activeColumn: DashboardSortColumn;
  direction: SortDirection;
  onSort: (col: DashboardSortColumn) => void;
  align?: "left" | "right";
}

function SortableColumnHead({
  column,
  label,
  activeColumn,
  direction,
  onSort,
  align = "left",
}: SortableColumnHeadProps) {
  const isActive = activeColumn === column;
  const ariaSort = isActive
    ? direction === "asc"
      ? "ascending"
      : "descending"
    : "none";

  return (
    <TableHead
      aria-sort={ariaSort}
      className={align === "right" ? "text-right" : "text-left"}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`inline-flex items-center gap-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 rounded px-1.5 py-1 -mx-1.5 hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          align === "right" ? "ml-auto" : ""
        } ${isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        data-testid={`sort-col-${column}`}
      >
        <span>{label}</span>
        {isActive ? (
          direction === "asc" ? (
            <ArrowUp className="h-3.5 w-3.5 text-primary shrink-0" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5 text-primary shrink-0" />
          )
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 opacity-55 shrink-0" />
        )}
      </button>
    </TableHead>
  );
}

interface BuyerRequirementsTableProps {
  requirements: BuyerDashboardRequirement[];
  sharedProjectId: string | null;
  onShareProject: (req: BuyerDashboardRequirement) => void;
}

export function BuyerRequirementsTable({
  requirements,
  sharedProjectId,
  onShareProject,
}: BuyerRequirementsTableProps) {
  const [sortCol, setSortCol] = useState<DashboardSortColumn>("bidDate");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");

  const handleSort = (col: DashboardSortColumn) => {
    if (sortCol === col) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir(DEFAULT_SORT_DIRECTION[col]);
    }
  };

  const sortedRows = useMemo(() => {
    const items = [...requirements];
    items.sort((a, b) => {
      if (sortCol === "bidDate") {
        // Prefer latestBidAt; if neither has a bid yet, break ties by createdAt
        const cmp = compareTimestampNullable(
          a.latestBidAt,
          b.latestBidAt,
          sortDir
        );
        if (cmp !== 0) return cmp;
        return compareTimestampNullable(a.createdAt, b.createdAt, sortDir);
      }
      if (sortCol === "deadline") {
        return compareTimestampNullable(
          a.auctionEndsAt,
          b.auctionEndsAt,
          sortDir
        );
      }
      // budget
      const diff = Number(a.maxBudget) - Number(b.maxBudget);
      return sortDir === "asc" ? diff : -diff;
    });
    return items;
  }, [requirements, sortCol, sortDir]);

  const sortSummary = `${SORT_LABELS[sortCol].label} (${
    sortDir === "asc"
      ? SORT_LABELS[sortCol].ascLabel
      : SORT_LABELS[sortCol].descLabel
  })`;

  return (
    <div className="space-y-2.5" data-testid="buyer-requirements-table-wrapper">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span data-testid="text-buyer-sort-status">
          Showing {sortedRows.length}{" "}
          {sortedRows.length === 1 ? "requirement" : "requirements"} · Sorted by{" "}
          <span className="font-medium text-foreground">{sortSummary}</span>
        </span>
        <span className="text-[11px]">Click Bid Date, Deadline, or Budget to sort</span>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <Table data-testid="table-buyer-requirements">
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="min-w-[220px] text-xs font-semibold">
                Requirement
              </TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">
                Status
              </TableHead>
              <TableHead className="text-right text-xs font-semibold whitespace-nowrap">
                Bids / L1
              </TableHead>
              <SortableColumnHead
                column="bidDate"
                label="Bid Date"
                activeColumn={sortCol}
                direction={sortDir}
                onSort={handleSort}
              />
              <SortableColumnHead
                column="deadline"
                label="Deadline"
                activeColumn={sortCol}
                direction={sortDir}
                onSort={handleSort}
              />
              <SortableColumnHead
                column="budget"
                label="Budget"
                activeColumn={sortCol}
                direction={sortDir}
                onSort={handleSort}
                align="right"
              />
              <TableHead className="text-right text-xs font-semibold whitespace-nowrap">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.map((req) => {
              const statusInfo = formatStatusLabel(req.status);
              const deadlineInfo = formatDeadlineCountdown(req.auctionEndsAt);
              return (
                <TableRow
                  key={req.id}
                  data-testid={`row-buyer-requirement-${req.id}`}
                >
                  <TableCell className="py-3 max-w-[300px]">
                    <Link
                      href={`/requirements/${req.id}`}
                      className="font-medium text-sm text-foreground hover:text-primary hover:underline line-clamp-1"
                    >
                      {req.title}
                    </Link>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5 truncate">
                      <span>{req.categoryName}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {req.city}
                        {req.state ? `, ${req.state}` : ""}
                      </span>
                    </div>
                  </TableCell>

                  <TableCell className="py-3 whitespace-nowrap">
                    <span className={`text-xs font-semibold ${statusInfo.toneClass}`}>
                      {statusInfo.text}
                    </span>
                  </TableCell>

                  <TableCell className="py-3 text-right tabular-nums whitespace-nowrap">
                    <div className="text-xs font-medium text-foreground">
                      {req.bidCount} {req.bidCount === 1 ? "bid" : "bids"}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {req.lowestBid != null
                        ? `L1 ₹${req.lowestBid.toLocaleString("en-IN")}`
                        : "Awaiting L1"}
                    </div>
                  </TableCell>

                  <TableCell className="py-3 tabular-nums whitespace-nowrap">
                    <div className="text-xs font-medium text-foreground">
                      {req.latestBidAt
                        ? formatDateShort(req.latestBidAt)
                        : "No bids yet"}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {req.latestBidAt
                        ? formatTimeShort(req.latestBidAt)
                        : `Posted ${formatDateShort(req.createdAt)}`}
                    </div>
                  </TableCell>

                  <TableCell className="py-3 tabular-nums whitespace-nowrap">
                    <div className="text-xs font-medium text-foreground">
                      {formatDateShort(req.auctionEndsAt)}
                    </div>
                    <div
                      className={`text-[11px] ${
                        deadlineInfo.isEnded
                          ? "text-muted-foreground"
                          : deadlineInfo.isUrgent
                          ? "text-amber-600 dark:text-amber-400 font-medium"
                          : "text-muted-foreground"
                      }`}
                    >
                      {deadlineInfo.label}
                    </div>
                  </TableCell>

                  <TableCell className="py-3 text-right tabular-nums whitespace-nowrap">
                    <span className="text-sm font-semibold text-foreground">
                      ₹{Number(req.maxBudget).toLocaleString("en-IN")}
                    </span>
                  </TableCell>

                  <TableCell className="py-3 text-right whitespace-nowrap">
                    <div className="inline-flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onShareProject(req)}
                        className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground whitespace-nowrap shrink-0"
                        data-testid={`button-share-project-${req.id}`}
                      >
                        {sharedProjectId === req.id ? (
                          <>
                            <Check className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Share2 className="h-3.5 w-3.5 mr-1" />
                            Share
                          </>
                        )}
                      </Button>
                      <Link
                        href={`/requirements/${req.id}`}
                        className="inline-flex items-center justify-center h-8 px-2 rounded-md text-xs font-medium text-primary hover:bg-muted transition-colors whitespace-nowrap shrink-0"
                        title="View requirement details"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

interface ProviderRequirementsTableProps {
  bids: ProviderDashboardBid[];
  sharedBidId: string | null;
  onShareProjectBid: (bid: ProviderDashboardBid) => void;
}

export function ProviderRequirementsTable({
  bids,
  sharedBidId,
  onShareProjectBid,
}: ProviderRequirementsTableProps) {
  const [sortCol, setSortCol] = useState<DashboardSortColumn>("bidDate");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");

  const handleSort = (col: DashboardSortColumn) => {
    if (sortCol === col) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir(DEFAULT_SORT_DIRECTION[col]);
    }
  };

  const sortedBids = useMemo(() => {
    const items = [...bids];
    items.sort((a, b) => {
      if (sortCol === "bidDate") {
        return compareTimestampNullable(a.createdAt, b.createdAt, sortDir);
      }
      if (sortCol === "deadline") {
        return compareTimestampNullable(
          a.requirement?.auctionEndsAt,
          b.requirement?.auctionEndsAt,
          sortDir
        );
      }
      // budget
      const aBudget = a.requirement?.maxBudget ?? a.bidAmount ?? 0;
      const bBudget = b.requirement?.maxBudget ?? b.bidAmount ?? 0;
      const diff = Number(aBudget) - Number(bBudget);
      return sortDir === "asc" ? diff : -diff;
    });
    return items;
  }, [bids, sortCol, sortDir]);

  const sortSummary = `${SORT_LABELS[sortCol].label} (${
    sortDir === "asc"
      ? SORT_LABELS[sortCol].ascLabel
      : SORT_LABELS[sortCol].descLabel
  })`;

  return (
    <div className="space-y-2.5" data-testid="provider-requirements-table-wrapper">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span data-testid="text-provider-sort-status">
          Showing {sortedBids.length}{" "}
          {sortedBids.length === 1 ? "bid requirement" : "bid requirements"} ·
          Sorted by{" "}
          <span className="font-medium text-foreground">{sortSummary}</span>
        </span>
        <span className="text-[11px]">Click Bid Date, Deadline, or Budget to sort</span>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <Table data-testid="table-provider-requirements">
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="min-w-[220px] text-xs font-semibold">
                Requirement
              </TableHead>
              <TableHead className="text-xs font-semibold whitespace-nowrap">
                Bid Status
              </TableHead>
              <TableHead className="text-right text-xs font-semibold whitespace-nowrap">
                Your Bid
              </TableHead>
              <SortableColumnHead
                column="bidDate"
                label="Bid Date"
                activeColumn={sortCol}
                direction={sortDir}
                onSort={handleSort}
              />
              <SortableColumnHead
                column="deadline"
                label="Deadline"
                activeColumn={sortCol}
                direction={sortDir}
                onSort={handleSort}
              />
              <SortableColumnHead
                column="budget"
                label="Budget"
                activeColumn={sortCol}
                direction={sortDir}
                onSort={handleSort}
                align="right"
              />
              <TableHead className="text-right text-xs font-semibold whitespace-nowrap">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedBids.map((bid) => {
              const statusInfo = formatStatusLabel(bid.status);
              const deadlineInfo = formatDeadlineCountdown(
                bid.requirement?.auctionEndsAt
              );
              const isLeading =
                bid.requirement?.lowestBid != null &&
                Number(bid.bidAmount) <= Number(bid.requirement.lowestBid);

              return (
                <TableRow
                  key={bid.id}
                  data-testid={`card-bid-${bid.id}`}
                >
                  <TableCell className="py-3 max-w-[300px]">
                    <Link
                      href={`/requirements/${bid.requirementId}`}
                      className="font-medium text-sm text-foreground hover:text-primary hover:underline line-clamp-1"
                    >
                      {bid.requirement?.title ?? "Procurement Requirement"}
                    </Link>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5 truncate">
                      <span>{bid.requirement?.categoryName ?? "General"}</span>
                      {bid.requirement?.city && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{bid.requirement.city}</span>
                        </>
                      )}
                    </div>
                  </TableCell>

                  <TableCell className="py-3 whitespace-nowrap">
                    <span className={`text-xs font-semibold ${statusInfo.toneClass}`}>
                      {statusInfo.text}
                    </span>
                  </TableCell>

                  <TableCell className="py-3 text-right tabular-nums whitespace-nowrap">
                    <div className="text-sm font-semibold text-primary">
                      ₹{Number(bid.bidAmount).toLocaleString("en-IN")}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {isLeading ? "L1 Leading" : bid.estimatedCompletion}
                    </div>
                  </TableCell>

                  <TableCell className="py-3 tabular-nums whitespace-nowrap">
                    <div className="text-xs font-medium text-foreground">
                      {formatDateShort(bid.createdAt)}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {formatTimeShort(bid.createdAt)}
                    </div>
                  </TableCell>

                  <TableCell className="py-3 tabular-nums whitespace-nowrap">
                    <div className="text-xs font-medium text-foreground">
                      {formatDateShort(bid.requirement?.auctionEndsAt)}
                    </div>
                    <div
                      className={`text-[11px] ${
                        deadlineInfo.isEnded
                          ? "text-muted-foreground"
                          : deadlineInfo.isUrgent
                          ? "text-amber-600 dark:text-amber-400 font-medium"
                          : "text-muted-foreground"
                      }`}
                    >
                      {deadlineInfo.label}
                    </div>
                  </TableCell>

                  <TableCell className="py-3 text-right tabular-nums whitespace-nowrap">
                    <span className="text-sm font-semibold text-foreground">
                      {bid.requirement?.maxBudget != null
                        ? `₹${Number(bid.requirement.maxBudget).toLocaleString("en-IN")}`
                        : "—"}
                    </span>
                  </TableCell>

                  <TableCell className="py-3 text-right whitespace-nowrap">
                    <div className="inline-flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onShareProjectBid(bid)}
                        className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground whitespace-nowrap shrink-0"
                        title="Share this project bid summary"
                        data-testid={`button-share-project-${bid.requirementId}`}
                      >
                        {sharedBidId === bid.id ? (
                          <>
                            <Check className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Share2 className="h-3.5 w-3.5 mr-1" />
                            Share
                          </>
                        )}
                      </Button>
                      <Link
                        href={`/requirements/${bid.requirementId}`}
                        className="inline-flex items-center justify-center h-8 px-2 rounded-md text-xs font-medium text-primary hover:bg-muted transition-colors whitespace-nowrap shrink-0"
                        title="View requirement details"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
