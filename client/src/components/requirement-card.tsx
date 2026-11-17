import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Countdown } from "@/components/countdown";
import { Bookmark, BookmarkCheck, Flame, IndianRupee, MapPin, Users, Zap } from "lucide-react";
import { getCategoryIcon } from "@/lib/category-icons";
import { useSavedRequirements } from "@/hooks/use-saved-requirements";
import type { Requirement } from "@omnibid/api-client-react";

interface RequirementCardProps {
  requirement: Requirement;
}

export function RequirementCard({ requirement: r }: RequirementCardProps) {
  const Icon = getCategoryIcon(r.categoryIconName);
  const isBidWar = r.bidCount >= 5;
  const { isSaved, toggleBookmark } = useSavedRequirements();
  const bookmarked = isSaved(r.id);

  return (
    <Link href={`/requirements/${r.id}`}>
      <Card
        className="hover:shadow-md transition-all cursor-pointer border border-border hover:border-primary/30 group"
        data-testid={`card-requirement-${r.id}`}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {r.categoryName}
                  </Badge>
                  {r.isHighTicket && (
                    <Badge className="text-[10px] px-1.5 py-0 bg-amber-500 text-white">
                      High Value
                    </Badge>
                  )}
                  {isBidWar && (
                    <span className="flex items-center gap-0.5 text-[10px] text-orange-500 font-semibold">
                      <Flame className="h-3 w-3" />
                      Bid War
                    </span>
                  )}
                </div>
                <p className="font-semibold text-sm mt-0.5 truncate group-hover:text-primary transition-colors">
                  {r.title}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2 flex-shrink-0">
              <div className="text-right">
                <div className="flex items-center justify-end gap-0.5 text-primary font-bold">
                  <IndianRupee className="h-3.5 w-3.5" />
                  <span className="text-base tabular-nums">{r.maxBudget.toLocaleString("en-IN")}</span>
                </div>
                <div className="text-[10px] text-muted-foreground">max budget</div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleBookmark(r.id, r.title);
                }}
                aria-label={bookmarked ? `Remove ${r.title} from saved requirements` : `Save ${r.title} for later`}
                aria-pressed={bookmarked}
                title={bookmarked ? "Saved for later (click to remove)" : "Save requirement for later"}
                data-testid={`button-bookmark-${r.id}`}
                className={`p-1.5 rounded-md border transition-colors ${
                  bookmarked
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {bookmarked ? (
                  <BookmarkCheck className="h-4 w-4" />
                ) : (
                  <Bookmark className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{r.description}</p>

          <div className="flex items-center justify-between mt-3 pt-2 border-t border-border">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {r.city}
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {r.bidCount} {r.bidCount === 1 ? "bid" : "bids"}
              </span>
              {r.lowestBid && (
                <span className="flex items-center gap-0.5 text-green-600 font-medium">
                  <Zap className="h-3 w-3" />
                  Low: ₹{r.lowestBid.toLocaleString("en-IN")}
                </span>
              )}
            </div>
            <div className="text-right">
              {r.status === "open" ? (
                <Countdown endsAt={r.auctionEndsAt} />
              ) : (
                <Badge variant={r.status === "accepted" ? "default" : "secondary"} className="text-[10px]">
                  {r.status}
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
