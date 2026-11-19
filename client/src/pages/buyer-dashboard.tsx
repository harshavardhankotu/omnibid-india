import { useState } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/layout";
import { BuyerRequirementsTable } from "@/components/dashboard-requirements-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardStatsSkeleton, RequirementsListSkeleton } from "@/components/loading-skeletons";
import { CachedModeBanner } from "@/components/cached-mode-banner";
import { AuctionCalendar } from "@/components/auction-calendar";
import { useDashboardCache } from "@/hooks/use-dashboard-cache";
import { useGetBuyerDashboard, type Requirement } from "@omnibid/api-client-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { shareWithWebShare } from "@/lib/web-share";
import { Check, CheckCircle, Clock, IndianRupee, PlusCircle, Share2, Wallet } from "lucide-react";

export default function BuyerDashboard() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [sharedDashboard, setSharedDashboard] = useState(false);
  const [sharedProjectId, setSharedProjectId] = useState<string | null>(null);
  const { data, isLoading, isError, isFetching, refetch } = useGetBuyerDashboard();

  const {
    effectiveData,
    isCachedMode,
    isOffline,
    lastSyncedAt,
    hasSnapshot,
    isLoadingEffective,
    retrySync,
  } = useDashboardCache({
    cacheKey: "buyer",
    apiPath: "/api/dashboard/buyer",
    userId: user?.id,
    data,
    isLoading,
    isError,
    isFetching,
    refetch,
  });

  const stats = [
    { label: "Open", value: effectiveData?.openRequirements ?? 0, icon: Clock, color: "text-blue-600" },
    { label: "Accepted", value: effectiveData?.acceptedRequirements ?? 0, icon: CheckCircle, color: "text-green-600" },
    { label: "Completed", value: effectiveData?.completedRequirements ?? 0, icon: Wallet, color: "text-purple-600" },
    { label: "Total Spent", value: effectiveData ? `₹${(effectiveData.totalSpent ?? 0).toLocaleString("en-IN")}` : "₹0", icon: IndianRupee, color: "text-amber-600" },
  ];

  const handleShareDashboard = async () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const openCount = effectiveData?.openRequirements ?? 0;
    const acceptedCount = effectiveData?.acceptedRequirements ?? 0;
    const completedCount = effectiveData?.completedRequirements ?? 0;
    const totalSpent = effectiveData?.totalSpent ?? 0;
    const recentTitles = (effectiveData?.recentRequirements ?? [])
      .slice(0, 3)
      .map((r) => `• ${r.title} (Max ₹${r.maxBudget.toLocaleString("en-IN")})`)
      .join("\n");

    const text =
      `Buyer Procurement Summary (${user?.name ?? "Buyer"}):\n` +
      `Open: ${openCount} · Accepted: ${acceptedCount} · Completed: ${completedCount} · Total Spent: ₹${totalSpent.toLocaleString("en-IN")}` +
      (recentTitles ? `\n\nActive Projects:\n${recentTitles}` : "");

    const result = await shareWithWebShare({
      title: `OmniBid Buyer Dashboard — ${user?.name ?? "Procurement"}`,
      text,
      url: `${origin}/dashboard/buyer`,
    });

    if (result.status === "shared") {
      toast({
        title: "Dashboard shared",
        description: "Your procurement dashboard summary was shared with stakeholders.",
      });
    } else if (result.status === "copied") {
      setSharedDashboard(true);
      window.setTimeout(() => setSharedDashboard(false), 2200);
      toast({
        title: "Dashboard summary copied",
        description: "Web Share is unavailable here, so the summary and link were copied to your clipboard.",
      });
    } else if (result.status === "fallback") {
      toast({
        title: "Buyer Dashboard Summary",
        description: `${origin}/dashboard/buyer`,
      });
    }
  };

  const handleShareProjectSummary = async (reqItem: Requirement) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const lowestText =
      reqItem.lowestBid != null
        ? ` · Lowest Bid (L1): ₹${reqItem.lowestBid.toLocaleString("en-IN")}`
        : "";
    const text =
      `Project Summary: ${reqItem.title}\n` +
      `Category: ${reqItem.categoryName} · Location: ${reqItem.city}${reqItem.state ? `, ${reqItem.state}` : ""}\n` +
      `Max Budget: ₹${reqItem.maxBudget.toLocaleString("en-IN")} · Bids: ${reqItem.bidCount}${lowestText} · Status: ${reqItem.status}`;

    const result = await shareWithWebShare({
      title: `${reqItem.title} — Project Summary`,
      text,
      url: `${origin}/requirements/${reqItem.id}`,
    });

    if (result.status === "shared") {
      toast({
        title: "Project summary shared",
        description: `"${reqItem.title}" was shared with external stakeholders.`,
      });
    } else if (result.status === "copied") {
      setSharedProjectId(reqItem.id);
      window.setTimeout(() => setSharedProjectId(null), 2200);
      toast({
        title: "Project summary copied",
        description: `"${reqItem.title}" summary and link copied to clipboard.`,
      });
    } else if (result.status === "fallback") {
      toast({
        title: reqItem.title,
        description: `${origin}/requirements/${reqItem.id}`,
      });
    }
  };

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">Buyer Dashboard</h1>
            <p className="text-sm text-muted-foreground">Welcome back, {user?.name?.split(" ")[0]}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              type="button"
              variant="outline"
              onClick={handleShareDashboard}
              className="whitespace-nowrap shrink-0"
              data-testid="button-share-buyer-dashboard"
            >
              {sharedDashboard ? (
                <>
                  <Check className="h-4 w-4 mr-1.5 text-emerald-600" />
                  Copied!
                </>
              ) : (
                <>
                  <Share2 className="h-4 w-4 mr-1.5" />
                  Share Summary
                </>
              )}
            </Button>
            <Button onClick={() => setLocation("/requirements/new")} disabled={isOffline} data-testid="button-post-problem">
              <PlusCircle className="h-4 w-4 mr-1.5" />
              Post Problem
            </Button>
          </div>
        </div>

        <CachedModeBanner
          isCachedMode={isCachedMode}
          isOffline={isOffline}
          hasSnapshot={hasSnapshot}
          lastSyncedAt={lastSyncedAt}
          isFetching={isFetching}
          onRetrySync={retrySync}
        />

        {/* Stats */}
        {isLoadingEffective ? (
          <DashboardStatsSkeleton count={4} columns={4} />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <Card key={stat.label}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">{stat.label}</p>
                        <p className="text-2xl font-bold mt-0.5">{stat.value}</p>
                      </div>
                      <Icon className={`h-5 w-5 ${stat.color}`} />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Recent Requirements */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Recent Requirements</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setLocation("/requirements?my=1")} data-testid="button-view-all">
                View all
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoadingEffective ? (
              <RequirementsListSkeleton count={3} columns={1} />
            ) : effectiveData?.recentRequirements?.length ? (
              <BuyerRequirementsTable
                requirements={effectiveData.recentRequirements}
                sharedProjectId={sharedProjectId}
                onShareProject={handleShareProjectSummary}
              />
            ) : (
              <div className="text-center py-10 text-muted-foreground">
                <PlusCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm font-medium">No requirements yet</p>
                <Button className="mt-3" size="sm" onClick={() => setLocation("/requirements/new")} disabled={isOffline} data-testid="button-post-first">
                  Post your first problem
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <AuctionCalendar
          requirements={effectiveData?.recentRequirements}
          roleLabel="buyer"
          isLoading={isLoadingEffective}
        />
      </div>
    </Layout>
  );
}
