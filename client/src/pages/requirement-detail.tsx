// @refresh reset
import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import Layout from "@/components/layout";
import { Countdown } from "@/components/countdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  useGetRequirement,
  getGetRequirementQueryKey,
  useAcceptBid,
  useGetRequirementStats,
  getGetRequirementStatsQueryKey,
  getListBidsQueryKey,
  useCreateDispute,
  getListDisputesQueryKey,
  useRepostRequirement,
  getListRequirementsQueryKey,
  useApproveEnvelopeA,
  type Bid,
} from "@omnibid/api-client-react";
import { useAuth } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { getCategoryIcon } from "@/lib/category-icons";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Flame,
  Gavel,
  IndianRupee,
  Lock,
  MapPin,
  MessageSquare,
  RefreshCw,
  Scale,
  Shield,
  Star,
  Trophy,
  User,
  UserCheck,
  Users,
  Zap,
} from "lucide-react";

type SortBy = "lowest_price" | "highest_rating" | "fastest_start";

export default function RequirementDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [sortBy, setSortBy] = useState<SortBy>("lowest_price");
  const [disputeBid, setDisputeBid] = useState<Bid | null>(null);
  const [disputeTitle, setDisputeTitle] = useState("");
  const [disputeDesc, setDisputeDesc] = useState("");
  const [smartMatchData, setSmartMatchData] = useState<{ recommendedBidId: string | null; justification: string | null } | null>(null);
  const [isSmartMatching, setIsSmartMatching] = useState(false);

  const { data: req, isLoading } = useGetRequirement(id, {
    query: {
      queryKey: getGetRequirementQueryKey(id),
      refetchInterval: (query: { state: { data: unknown } }): number | false => {
        const d = query.state.data as { status?: string } | undefined;
        return d?.status === "open" ? 20000 : false;
      },
    },
  });

  const { data: stats } = useGetRequirementStats(id, {
    query: {
      queryKey: getGetRequirementStatsQueryKey(id),
      enabled: !!id,
      refetchInterval: (query: { state: { data: unknown } }): number | false => {
        const d = query.state.data as { status?: string } | undefined;
        return d?.status === "open" ? 20000 : false;
      },
    },
  });

  // Real-time WebSocket subscription for live bids using Supabase Realtime
  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`live-bids-${id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "bids",
          filter: `requirement_id=eq.${id}`,
        },
        () => {
          // Instantly trigger React Query refetch to sync UI with database changes
          qc.invalidateQueries({ queryKey: getGetRequirementQueryKey(id) });
          qc.invalidateQueries({ queryKey: getGetRequirementStatsQueryKey(id) });
          
          toast({
            title: "New Live Bid!",
            description: "A new bid has just been placed in real-time.",
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, qc, toast]);

  const acceptBidMutation = useAcceptBid();
  const createDisputeMutation = useCreateDispute();
  const repostMutation = useRepostRequirement();
  const approveEnvelopeAMutation = useApproveEnvelopeA();

  const isOwner = user?.id === req?.buyerId;
  const isProvider =
    user?.role === "provider" ||
    user?.role === "both" ||
    user?.role === "solo_provider" ||
    user?.role === "agency_provider";
  const isBuyer =
    user?.role === "buyer" ||
    user?.role === "both" ||
    user?.role === "retail_buyer" ||
    user?.role === "enterprise_buyer";

  const canBid = isProvider && req?.status === "open" && !isOwner;
  const canRepost = isOwner && req && ["accepted", "in_progress", "completed", "expired", "cancelled"].includes(req.status);
  const isTwoEnvelope = req?.bidType === "two_envelope";

  // Top 3 bidders for Bhaav-Taav access
  const sortedBids = [...(req?.bids ?? [])].sort((a, b) => {
    if (a.isHighlighted && !b.isHighlighted) return -1;
    if (!a.isHighlighted && b.isHighlighted) return 1;
    if (sortBy === "lowest_price") return a.bidAmount - b.bidAmount;
    if (sortBy === "highest_rating") return (b.providerAvgRating ?? 0) - (a.providerAvgRating ?? 0);
    return 0;
  });

  const top3ProviderIds = new Set(
    [...(req?.bids ?? [])]
      .sort((a, b) => a.bidAmount - b.bidAmount)
      .slice(0, 3)
      .map((b) => b.providerId)
  );

  const myBidInTop3 = isProvider && !isOwner &&
    [...(req?.bids ?? [])].some((b) => b.providerId === user?.id && top3ProviderIds.has(b.providerId));

  const canNegotiate = req && ["accepted", "in_progress"].includes(req.status);

  const handleAcceptBid = (bidId: string) => {
    if (!id) return;
    acceptBidMutation.mutate(
      { id, data: { bidId } },
      {
        onSuccess: () => {
          toast({ title: "Bid accepted!", description: "The provider has been notified." });
          qc.invalidateQueries({ queryKey: getGetRequirementQueryKey(id) });
        },
        onError: () => toast({ title: "Error", description: "Failed to accept bid", variant: "destructive" }),
      }
    );
  };

  const handleApproveEnvelopeA = (bidId: string) => {
    approveEnvelopeAMutation.mutate(
      { id: bidId },
      {
        onSuccess: () => {
          toast({ title: "Technical bid approved!", description: "The provider's financial amount is now visible." });
          qc.invalidateQueries({ queryKey: getGetRequirementQueryKey(id) });
        },
        onError: () => toast({ title: "Error", description: "Failed to approve technical bid", variant: "destructive" }),
      }
    );
  };

  const handleRaiseDispute = () => {
    if (!disputeBid || !id || !disputeTitle.trim() || !disputeDesc.trim()) return;
    createDisputeMutation.mutate(
      { data: { requirementId: id, bidId: disputeBid.id, title: disputeTitle, description: disputeDesc } },
      {
        onSuccess: () => {
          toast({ title: "Dispute raised", description: "The provider has been notified and must respond within 7 days." });
          qc.invalidateQueries({ queryKey: getListDisputesQueryKey() });
          setDisputeBid(null);
          setDisputeTitle("");
          setDisputeDesc("");
          setLocation("/disputes");
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : "Failed to raise dispute";
          toast({ title: "Error", description: msg, variant: "destructive" });
        },
      }
    );
  };

  const handleRepost = () => {
    if (!id) return;
    repostMutation.mutate(
      { id },
      {
        onSuccess: (newReq) => {
          toast({ title: "Requirement reposted!", description: "A new auction is live." });
          qc.invalidateQueries({ queryKey: getListRequirementsQueryKey() });
          setLocation(`/requirements/${newReq.id}`);
        },
        onError: () => toast({ title: "Error", description: "Failed to repost", variant: "destructive" }),
      }
    );
  };

  const handleSmartMatch = async () => {
    if (!id) return;
    setIsSmartMatching(true);
    try {
      const token = localStorage.getItem("omnibid_token");
      const response = await fetch(`/api/requirements/${id}/smart-match`, {
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        }
      });
      if (response.ok) {
        const data = await response.json();
        setSmartMatchData(data);
        toast({
          title: "AI Smart Match Complete!",
          description: "We have highlighted the AI recommended bid on your bid board.",
        });
      } else {
        toast({
          title: "Smart Match Failed",
          description: "Could not evaluate bids using the AI recommendation engine.",
          variant: "destructive"
        });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to connect to the smart-match endpoint.",
        variant: "destructive"
      });
    } finally {
      setIsSmartMatching(false);
    }
  };

  const Icon = req ? getCategoryIcon(req.categoryIconName) : null;

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-4 max-w-3xl mx-auto">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </Layout>
    );
  }

  if (!req) {
    return (
      <Layout>
        <div className="text-center py-16 text-muted-foreground">
          <p className="font-medium">Requirement not found</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-4">
        {/* Header Card */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                {Icon && (
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Badge variant="secondary" className="text-xs">{req.categoryName}</Badge>
                    {req.isHighTicket && <Badge className="text-xs bg-amber-500 text-white">High Value</Badge>}
                    {req.isRecurring && <Badge variant="outline" className="text-xs border-blue-300 text-blue-600"><RefreshCw className="h-3 w-3 mr-1 inline" />Recurring</Badge>}
                    {isTwoEnvelope && (
                      <Badge variant="outline" className="text-xs border-violet-300 text-violet-600">
                        <FileText className="h-3 w-3 mr-1 inline" />Two-Envelope RFP
                      </Badge>
                    )}
                    {req.isMegaProject && (
                      <Badge className="text-xs bg-purple-600 text-white">Mega Project</Badge>
                    )}
                    {req.isSyndicate && (
                      <Badge className="text-xs bg-teal-600 text-white">
                        <Users className="h-3 w-3 mr-1 inline" />Syndicate
                      </Badge>
                    )}
                    <Badge variant={req.status === "open" ? "default" : req.status === "accepted" || req.status === "in_progress" ? "default" : "secondary"} className="text-xs capitalize">
                      {req.status.replace("_", " ")}
                    </Badge>
                    {stats?.isBidWar && (
                      <span className="flex items-center gap-1 text-xs text-orange-500 font-semibold animate-pulse">
                        <Flame className="h-3.5 w-3.5" />
                        Bid War!
                      </span>
                    )}
                  </div>
                  <h1 className="text-xl font-bold">{req.title}</h1>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                    <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{req.city}, {req.state}</span>
                    <span className="flex items-center gap-1"><User className="h-3 w-3" />{req.buyerName}</span>
                  </div>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="flex items-center justify-end gap-0.5 text-primary font-bold text-xl">
                  <IndianRupee className="h-4 w-4" />
                  {req.maxBudget.toLocaleString("en-IN")}
                </div>
                <div className="text-xs text-muted-foreground">max budget</div>
                {req.depositAmount && (
                  <div className={`text-xs mt-0.5 font-medium ${req.depositPaid ? "text-green-600" : "text-orange-500"}`}>
                    {req.depositPaid ? "✓ Deposit paid" : `⚠ ₹${req.depositAmount.toLocaleString("en-IN")} deposit req.`}
                  </div>
                )}
              </div>
            </div>

            {isTwoEnvelope && (
              <div className="mt-3 p-2.5 rounded-lg bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800 text-xs text-violet-700 dark:text-violet-400">
                <FileText className="h-3.5 w-3.5 inline mr-1.5" />
                <strong>Two-Envelope RFP:</strong> Providers submit a technical portfolio first. Buyer approves before financial bids are revealed.
              </div>
            )}

            <p className="text-sm text-foreground/80 mt-3 leading-relaxed">{req.description}</p>

            {req.status === "open" && (
              <div className="flex items-center gap-4 mt-4 p-3 rounded-lg bg-muted/50">
                <div>
                  <div className="text-xs text-muted-foreground">Closes in</div>
                  <Countdown endsAt={req.auctionEndsAt} large />
                </div>
                <Separator orientation="vertical" className="h-10" />
                <div>
                  <div className="text-xs text-muted-foreground">Total bids</div>
                  <div className="text-2xl font-bold">{req.bidCount}</div>
                </div>
                {stats?.lowestBid && (
                  <>
                    <Separator orientation="vertical" className="h-10" />
                    <div>
                      <div className="text-xs text-muted-foreground">Lowest bid</div>
                      <div className="text-2xl font-bold text-green-600">₹{stats.lowestBid.toLocaleString("en-IN")}</div>
                    </div>
                  </>
                )}
              </div>
            )}

            {canBid && (
              <Button
                className="w-full mt-3 font-semibold"
                onClick={() => setLocation(`/bid/new/${id}`)}
                data-testid="button-place-bid"
              >
                <Gavel className="h-4 w-4 mr-1.5" />
                {isTwoEnvelope ? "Submit Technical Bid (Envelope A)" : "Place Your Bid"}
              </Button>
            )}

            {isOwner && req.status === "open" && req.bids.length > 0 && (
              <Button
                className="w-full mt-3 font-semibold bg-violet-600 hover:bg-violet-700 text-white flex items-center justify-center gap-1.5"
                onClick={handleSmartMatch}
                disabled={isSmartMatching}
                data-testid="button-smart-match"
              >
                {isSmartMatching ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    AI is analyzing bids...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4" />
                    AI Smart Match Bids
                  </>
                )}
              </Button>
            )}

            {/* Bhaav-Taav negotiation room — buyer enters for top 3 bidders */}
            {isOwner && canNegotiate && req.winningBidId && (
              <Button
                variant="outline"
                className="w-full mt-2 border-primary/40 text-primary hover:bg-primary/5"
                onClick={() => {
                  const winBid = req.bids.find((b) => b.id === req.winningBidId);
                  if (winBid) setLocation(`/negotiate/${id}/${winBid.providerId}`);
                }}
                data-testid="button-negotiate"
              >
                <MessageSquare className="h-4 w-4 mr-1.5" />
                Enter Bhaav-Taav Negotiation Room
              </Button>
            )}

            {/* Provider enters negotiation if in top 3 */}
            {!isOwner && isProvider && myBidInTop3 && canNegotiate && (
              <Button
                variant="outline"
                className="w-full mt-2 border-primary/40 text-primary hover:bg-primary/5"
                onClick={() => setLocation(`/negotiate/${id}`)}
              >
                <MessageSquare className="h-4 w-4 mr-1.5" />
                Enter Bhaav-Taav Negotiation Room
              </Button>
            )}

            {/* Payment button */}
            {(isOwner || isProvider) && ["accepted", "in_progress"].includes(req.status) && (
              <Button
                variant={req.status === "in_progress" ? "outline" : "default"}
                className={`w-full mt-2 ${req.status === "accepted" ? "bg-green-600 hover:bg-green-700 text-white" : ""}`}
                onClick={() => setLocation(`/payment/${id}`)}
                data-testid="button-payment"
              >
                <IndianRupee className="h-4 w-4 mr-1.5" />
                {req.status === "in_progress" ? "View Escrow & Work Proofs" : "Initiate UPI Escrow Payment"}
              </Button>
            )}

            {canRepost && (
              <Button
                variant="outline"
                className="w-full mt-2 border-blue-300 text-blue-700 hover:bg-blue-50"
                onClick={handleRepost}
                disabled={repostMutation.isPending}
                data-testid="button-repost"
              >
                <RefreshCw className="h-4 w-4 mr-1.5" />
                {repostMutation.isPending ? "Reposting..." : "Repost this Requirement"}
              </Button>
            )}

            {/* WhatsApp Contractor Group Broadcast */}
            <a
              href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                `⚡ *NEW PROCUREMENT REQUIREMENT ON OMNIBID INDIA*\n\n` +
                `📋 *Title*: ${req.title}\n` +
                `📍 *Location*: ${req.city || "Pan India"}\n` +
                `💰 *Budget*: ₹${Number(req.maxBudget || 0).toLocaleString("en-IN")}\n` +
                `🛡️ *Security*: 100% Escrow Protected by OmniBid\n\n` +
                `Submit your reverse bid now:\n${typeof window !== "undefined" ? window.location.href : ""}`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full mt-2 inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors bg-green-600 hover:bg-green-700 text-white h-9 px-4 py-2"
              title="Share deal directly to contractor and vendor WhatsApp groups"
            >
              <MessageSquare className="h-4 w-4 mr-1.5" />
              Broadcast to Contractor WhatsApp Groups
            </a>

            {/* Live War Room Ticker Link */}
            <Button
              variant="outline"
              className="w-full mt-2 border-red-300 text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/20"
              onClick={() => setLocation(`/auction/${id}`)}
            >
              <Flame className="h-4 w-4 mr-1.5 text-red-500 animate-pulse" />
              Open Live Reverse Auction War Room
            </Button>

            {!user && (
              <Button className="w-full mt-3" onClick={() => setLocation("/login")} data-testid="button-login-to-bid">
                Login to Place a Bid
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Bids */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{req.bids.length} Bids Received</CardTitle>
              <Tabs value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
                <TabsList className="h-7 text-xs">
                  <TabsTrigger value="lowest_price" className="text-xs px-2">Lowest Price</TabsTrigger>
                  <TabsTrigger value="highest_rating" className="text-xs px-2">Top Rated</TabsTrigger>
                  <TabsTrigger value="fastest_start" className="text-xs px-2">Fastest</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {sortedBids.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No bids yet. Be the first to bid!</p>
              </div>
            )}
            {sortedBids.map((bid) => {
              const isEnvAPending = isTwoEnvelope && bid.status === "envelope_a_pending";
              const isEnvAApproved = isTwoEnvelope && bid.status === "envelope_a_approved";
              const showFinancial = !isTwoEnvelope || isEnvAApproved || bid.status === "accepted" || bid.status === "rejected" || !isOwner;

              return (
                <div
                  key={bid.id}
                  className={`rounded-xl border p-4 transition-all duration-300 ${
                    smartMatchData?.recommendedBidId === bid.id
                      ? "border-violet-500 bg-violet-50/50 dark:bg-violet-950/10 shadow-md shadow-violet-500/5 ring-1 ring-violet-500"
                      : bid.isHighlighted
                      ? "border-amber-400 bg-amber-50/50 dark:bg-amber-950/10"
                      : "border-border"
                  } ${bid.status === "accepted" ? "border-green-500 bg-green-50/50 dark:bg-green-950/10" : ""}`}
                  data-testid={`card-bid-${bid.id}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-sm">
                        {bid.providerName[0]}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-sm">{bid.providerName}</span>
                          {bid.providerIsVerified && <Shield className="h-3.5 w-3.5 text-primary" />}
                          {smartMatchData?.recommendedBidId === bid.id && (
                            <Badge className="text-[10px] bg-violet-600 text-white px-1.5 py-0 flex items-center gap-0.5">
                              ✨ AI Recommended
                            </Badge>
                          )}
                          {bid.isHighlighted && <Badge className="text-[10px] bg-amber-500 text-white px-1.5 py-0">Featured</Badge>}
                          {bid.status === "accepted" && <Badge className="text-[10px] bg-green-500 text-white px-1.5 py-0"><CheckCircle2 className="h-2.5 w-2.5 mr-0.5 inline" />Accepted</Badge>}
                          {isEnvAPending && <Badge className="text-[10px] bg-violet-500 text-white px-1.5 py-0"><Lock className="h-2.5 w-2.5 mr-0.5 inline" />Tech Review Pending</Badge>}
                          {isEnvAApproved && <Badge className="text-[10px] bg-violet-600 text-white px-1.5 py-0"><CheckCircle2 className="h-2.5 w-2.5 mr-0.5 inline" />Tech Approved</Badge>}
                          {bid.providerSubscriptionPlan && bid.providerSubscriptionPlan !== "free" && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">{bid.providerSubscriptionPlan}</Badge>
                          )}
                          {"executorType" in bid && bid.executorType === "self" ? (
                            <span title="Will personally execute the work" className="text-[10px] text-blue-600 flex items-center gap-0.5">
                              <UserCheck className="h-3 w-3" /> Self
                            </span>
                          ) : "executorType" in bid && bid.executorType === "partial" ? (
                            <span title="Partial sub-work declared" className="text-[10px] text-orange-500 flex items-center gap-0.5">
                              <Users className="h-3 w-3" /> Partial
                            </span>
                          ) : null}
                          {"isBackhaul" in bid && bid.isBackhaul && (
                            <Badge className="text-[10px] px-1.5 py-0 bg-teal-500 text-white">Cancellation Slot</Badge>
                          )}
                          <span className="text-[10px] text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0.5 rounded-full inline-flex items-center gap-1 font-medium" title="DigiLocker Identity & GST Verified">
                            <Shield className="h-2.5 w-2.5 text-emerald-600" />
                            DigiLocker Verified
                          </span>
                          {"crewSizeOffered" in bid && bid.crewSizeOffered && (bid.crewSizeOffered as number) > 1 && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                              <Users className="h-3 w-3" />{bid.crewSizeOffered as number} workers
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          {bid.providerAvgRating && (
                            <span className="flex items-center gap-0.5">
                              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                              {bid.providerAvgRating.toFixed(1)} ({bid.providerReviewCount})
                            </span>
                          )}
                          {bid.providerCity && <span><MapPin className="h-3 w-3 inline mr-0.5" />{bid.providerCity}</span>}
                          <span className="flex items-center gap-0.5"><Zap className="h-3 w-3" />{bid.estimatedCompletion}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {showFinancial ? (
                        <>
                          <div className="flex items-center justify-end gap-0.5 text-primary font-bold text-lg">
                            <IndianRupee className="h-3.5 w-3.5" />
                            {bid.bidAmount.toLocaleString("en-IN")}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {((bid.bidAmount / req.maxBudget) * 100).toFixed(0)}% of budget
                          </div>
                        </>
                      ) : (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 rounded-lg px-2 py-1.5">
                          <Lock className="h-3 w-3" />
                          Locked until approved
                        </div>
                      )}
                    </div>
                  </div>

                  <p className="text-sm mt-2 text-foreground/80">{bid.message}</p>

                  {smartMatchData?.recommendedBidId === bid.id && smartMatchData.justification && (
                    <div className="mt-3 p-3 rounded-lg bg-violet-100/50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-850 text-xs text-violet-800 dark:text-violet-300">
                      <Zap className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400 inline mr-1.5 align-middle animate-pulse" />
                      <strong className="align-middle text-violet-900 dark:text-violet-200">AI Recommended Match:</strong> <span className="align-middle">{smartMatchData.justification}</span>
                    </div>
                  )}

                  {/* Envelope A technical document */}
                  {"envelopeAUrl" in bid && bid.envelopeAUrl && (
                    <div className="mt-2 p-2.5 rounded-lg bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800">
                      <p className="text-xs text-violet-700 dark:text-violet-400 font-medium mb-1.5">
                        <FileText className="h-3 w-3 inline mr-1" />
                        Technical Portfolio (Envelope A)
                      </p>
                      <a
                        href={String(bid.envelopeAUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-violet-600 hover:underline flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" />
                        View technical document
                      </a>
                    </div>
                  )}

                  {"subcontractorName" in bid && bid.subcontractorName && (
                    <p className="text-xs mt-1.5 text-orange-600 bg-orange-50 dark:bg-orange-950/20 rounded-lg p-2">
                      <Users className="h-3 w-3 inline mr-1" />
                      Sub-specialist declared: {String(bid.subcontractorName)}
                    </p>
                  )}

                  {bid.proofOfWork && (
                    <p className="text-xs mt-1.5 text-muted-foreground bg-muted/50 rounded-lg p-2">
                      <Trophy className="h-3 w-3 inline mr-1" />
                      {bid.proofOfWork}
                    </p>
                  )}

                  {/* Approve Envelope A (technical review) */}
                  {isOwner && isTwoEnvelope && isEnvAPending && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-3 w-full border-violet-300 text-violet-700 hover:bg-violet-50 dark:hover:bg-violet-950/30"
                      onClick={() => handleApproveEnvelopeA(bid.id)}
                      disabled={approveEnvelopeAMutation.isPending}
                      data-testid={`button-approve-env-a-${bid.id}`}
                    >
                      <FileText className="h-3.5 w-3.5 mr-1.5" />
                      Approve Technical Bid — Reveal Price
                    </Button>
                  )}

                  {isOwner && req.status === "open" && (bid.status === "active" || bid.status === "envelope_a_approved") && (
                    <Button
                      size="sm"
                      className="mt-3 w-full"
                      onClick={() => handleAcceptBid(bid.id)}
                      disabled={acceptBidMutation.isPending}
                      data-testid={`button-accept-bid-${bid.id}`}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                      Accept this Bid
                    </Button>
                  )}

                  {/* Dispute button — buyer can raise dispute on accepted bid */}
                  {isOwner && bid.status === "accepted" && req.status !== "open" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 border-red-200 text-red-600 hover:bg-red-50"
                      onClick={() => setDisputeBid(bid)}
                      data-testid={`button-dispute-${bid.id}`}
                    >
                      <Scale className="h-3.5 w-3.5 mr-1.5" />
                      Raise a Dispute
                    </Button>
                  )}

                  {bid.status === "accepted" && bid.providerId && (
                    <div className="mt-3 p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
                      <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-2">Bid Accepted! Connect with the provider:</p>
                      <div className="flex flex-wrap gap-2">
                        <a
                          href={`https://wa.me/91?text=${encodeURIComponent(`Hi ${bid.providerName}, I accepted your OmniBid for "${req.title}". Let's connect!`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-700 dark:text-green-400 hover:underline"
                          data-testid="link-whatsapp"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Chat on WhatsApp
                        </a>
                        {isOwner && (
                          <button
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:underline"
                            onClick={() => setLocation(`/negotiate/${id}/${bid.providerId}`)}
                          >
                            <MessageSquare className="h-3 w-3" />
                            Bhaav-Taav Room
                          </button>
                        )}
                        {isOwner && (
                          <button
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                            onClick={() => setLocation(`/payment/${id}`)}
                          >
                            <IndianRupee className="h-3 w-3" />
                            Pay via Escrow
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Raise Dispute Dialog */}
      <Dialog open={!!disputeBid} onOpenChange={(o) => !o && setDisputeBid(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              Raise a Dispute
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              The provider will be notified and must respond within 7 days. Both parties then work to resolve.
            </p>
            <div>
              <Label htmlFor="dispute-title">Dispute title</Label>
              <Input
                id="dispute-title"
                className="mt-1.5"
                placeholder="e.g. Work was not completed as agreed"
                value={disputeTitle}
                onChange={(e) => setDisputeTitle(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="dispute-desc">Description</Label>
              <Textarea
                id="dispute-desc"
                className="mt-1.5"
                placeholder="Explain what went wrong in detail. Include dates, amounts, and what was agreed vs what was delivered..."
                rows={5}
                value={disputeDesc}
                onChange={(e) => setDisputeDesc(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisputeBid(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleRaiseDispute}
              disabled={disputeTitle.length < 5 || disputeDesc.length < 10 || createDisputeMutation.isPending}
            >
              Raise Dispute
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

function GavelIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 12-8.5 8.5c-.83.83-2.17.83-3 0 0 0 0 0 0 0a2.12 2.12 0 0 1 0-3L12 9" />
      <path d="M17.64 15 22 10.64" />
      <path d="m20.91 11.7-1.25-1.25c-.6-.6-.93-1.4-.93-2.25v-.86L16.01 4.6a5.56 5.56 0 0 0-3.94-1.64H9l.92.82A6.18 6.18 0 0 1 12 8.4v1.56l2 2h2.47l2.26 1.91" />
    </svg>
  );
}
