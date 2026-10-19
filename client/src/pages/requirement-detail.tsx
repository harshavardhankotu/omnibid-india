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
import { useI18n } from "@/lib/i18n";
import { calculateEscrowBreakdown, validateGSTIN } from "@/lib/gstin-tds";
import { RazorpayCheckoutModal } from "@/components/razorpay-checkout-modal";
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
  Smartphone,
  Sparkles,
  Star,
  Trophy,
  User,
  UserCheck,
  Users,
  Zap,
} from "lucide-react";

interface ContextualOffer {
  id: string;
  title: string;
  partner_name: string;
  target_url: string;
  commission_type: string;
  cpc_or_cpa_inr: string;
  badge_text?: string;
  cta_text?: string;
}

type SortBy = "lowest_price" | "highest_rating" | "fastest_start";

export default function RequirementDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { t, language } = useI18n();
  const [showLockL1Modal, setShowLockL1Modal] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>("lowest_price");
  const [disputeBid, setDisputeBid] = useState<Bid | null>(null);
  const [disputeTitle, setDisputeTitle] = useState("");
  const [disputeDesc, setDisputeDesc] = useState("");
  const [smartMatchData, setSmartMatchData] = useState<{ recommendedBidId: string | null; justification: string | null } | null>(null);
  const [isSmartMatching, setIsSmartMatching] = useState(false);

  const [leadUnlockedData, setLeadUnlockedData] = useState<{
    unlocked: boolean;
    isRealVerifiedTender?: boolean;
    externalSourceUrl?: string | null;
    issuingAuthority?: string | null;
    emdAmountInr?: number | null;
    boqSummary?: string | null;
    buyerContact?: { phone: string; email: string; name: string };
  } | null>(null);

  const [checkoutModalConfig, setCheckoutModalConfig] = useState<{
    isOpen: boolean;
    type: "lead_unlock" | "pro_subscription" | "escrow_deposit";
    requirementId?: string;
    bidId?: string;
    bidAmount?: number;
    sellerGstinOrPan?: string;
    requirementTitle?: string;
  }>({
    isOpen: false,
    type: "lead_unlock",
  });

  const fetchLeadUnlockStatus = async () => {
    if (!id) return;
    const token = localStorage.getItem("omnibid_token");
    try {
      const res = await fetch(`/api/payments/lead-unlocked/${id}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (res.ok) {
        const data = await res.json();
        setLeadUnlockedData(data);
      }
    } catch (e) {
      console.error("Failed to fetch lead unlock status:", e);
    }
  };

  useEffect(() => {
    fetchLeadUnlockStatus();
  }, [id, user]);

  const { data: req, isLoading } = useGetRequirement(id, {
    query: {
      queryKey: getGetRequirementQueryKey(id),
      refetchInterval: (query: { state: { data: unknown } }): number | false => {
        const d = query.state.data as { status?: string } | undefined;
        return d?.status === "open" ? 20000 : false;
      },
    },
  });

  const [affiliateOffers, setAffiliateOffers] = useState<ContextualOffer[]>([]);
  const [isLoadingOffers, setIsLoadingOffers] = useState(false);

  useEffect(() => {
    if (!id || !req) return;
    const fetchOffers = async () => {
      setIsLoadingOffers(true);
      try {
        const cat = (req as any)?.category || (req as any)?.sector || "";
        const ttl = req?.title || "";
        const res = await fetch(
          `/api/affiliate/contextual?category=${encodeURIComponent(cat)}&title=${encodeURIComponent(ttl)}`
        );
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setAffiliateOffers(data);
          }
        }
      } catch (e) {
        console.error("Failed to fetch contextual affiliate offers:", e);
      } finally {
        setIsLoadingOffers(false);
      }
    };
    fetchOffers();
  }, [id, req?.title, (req as any)?.category, (req as any)?.sector]);

  const topLoanOffer =
    affiliateOffers.find(
      (o) =>
        o.partner_name?.toLowerCase().includes("lendingkart") ||
        o.partner_name?.toLowerCase().includes("shriram") ||
        o.title?.toLowerCase().includes("loan") ||
        o.title?.toLowerCase().includes("capital")
    ) || affiliateOffers[0];

  const topLoanOfferId = topLoanOffer?.id || "00000000-0000-0000-0000-000000000001";

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

  const l1Bid = req?.bids && req.bids.length > 0 ? [...req.bids].sort((a, b) => a.bidAmount - b.bidAmount)[0] : null;
  const l1Gross = l1Bid ? l1Bid.bidAmount : 0;
  const contractorGstin = (l1Bid as any)?.providerGstin || (l1Bid as any)?.gstNumber || "36ABCDE1234F1Z5";
  const gstinValidation = validateGSTIN(contractorGstin);
  const l1Breakdown = calculateEscrowBreakdown({
    grossAmountInr: l1Gross,
    gstinOrPan: contractorGstin,
  });
  const l1Fee = l1Breakdown.platformFeeInr;
  const l1Tds = l1Breakdown.tdsInr;
  const l1Net = l1Breakdown.netSettlementInr;

  const getWhatsAppBroadcastText = () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const warRoomUrl = `${origin}/auction/${id}`;
    const affiliateUrl = `${origin}/api/affiliate/r/${topLoanOfferId}?reqId=${id}&ch=whatsapp&lang=${language}`;

    if (language === "hi") {
      return (
        `⚡ *ऑम्नीबिड इंडिया - नया टेंडर अलर्ट*\n\n` +
        `📋 *काम / टेंडर*: ${req?.title}\n` +
        `📍 *स्थान*: ${req?.city || "पूरे भारत में"}, ${req?.state || ""}\n` +
        `💰 *अधिकतम बजट*: ₹${Number(req?.maxBudget || 0).toLocaleString("en-IN")}\n` +
        `🛡️ *एस्क्रो सुरक्षा*: 100% सुरक्षित भुगतान गारंटी\n\n` +
        `⚡ *लाइव रिवर्स ऑक्शन वॉर रूम में बोली लगाएं*:\n${warRoomUrl}\n\n` +
        `💼 *इस टेंडर हेतु वर्किंग कैपिटल / मटेरियल लोन (₹50 लाख तक)*:\n${affiliateUrl}`
      );
    }

    if (language === "te") {
      return (
        `⚡ *ఓమ్నీబిడ్ ఇండియా - కొత్త టెండర్ ప్రకటన*\n\n` +
        `📋 *పని / అవసరం*: ${req?.title}\n` +
        `📍 *ప్రాంతం*: ${req?.city || "ఆల్ ఇండియా"}, ${req?.state || ""}\n` +
        `💰 *గరిష్ట బడ్జెట్*: ₹${Number(req?.maxBudget || 0).toLocaleString("en-IN")}\n` +
        `🛡️ *భద్రత*: 100% ఎస్క్రో పేమెంట్ రక్షణ\n\n` +
        `⚡ *లైవ్ రివర్స్ వేలంలో పాల్గొనండి*:\n${warRoomUrl}\n\n` +
        `💼 *వర్కింగ్ క్యాపిటల్ & మెటీరియల్ లోన్ (₹50 లక్షల వరకు)*:\n${affiliateUrl}`
      );
    }

    return (
      `⚡ *NEW PROCUREMENT REQUIREMENT ON OMNIBID INDIA*\n\n` +
      `📋 *Title*: ${req?.title}\n` +
      `📍 *Location*: ${req?.city || "Pan India"}, ${req?.state || ""}\n` +
      `💰 *Budget*: ₹${Number(req?.maxBudget || 0).toLocaleString("en-IN")}\n` +
      `🛡️ *Security*: 100% Escrow Protected by OmniBid\n\n` +
      `⚡ *Live Reverse Auction & L1 War Room*:\n${warRoomUrl}\n\n` +
      `💼 *Need Working Capital for this job? Instant loan up to ₹50L*:\n${affiliateUrl}`
    );
  };

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

  const schemaJsonLd = {
    "@context": "https://schema.org",
    "@type": "Tender",
    name: req.title,
    description: req.description,
    price: req.maxBudget,
    priceCurrency: "INR",
    validThrough: req.auctionEndsAt,
    areaServed: {
      "@type": "AdministrativeArea",
      name: req.city,
      postalCode: req.pincode || undefined,
    },
    seller: {
      "@type": "Organization",
      name: "OmniBid India",
    },
  };

  return (
    <Layout>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaJsonLd) }}
      />
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

            {/* Direct Buyer Contact Unlock Box / Button for Non-Owners */}
            {!isOwner && (
              leadUnlockedData?.unlocked && leadUnlockedData.buyerContact ? (
                <div className="mt-3 p-3.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 dark:bg-emerald-950/20 text-left space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {leadUnlockedData.isRealVerifiedTender ? "Official Public Tender & Contact Unlocked" : "Direct Buyer Contact Unlocked"}
                    </span>
                    <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-medium">
                      {leadUnlockedData.isRealVerifiedTender ? "CPPP / GeM Verified" : "Verified Lead"}
                    </Badge>
                  </div>
                  {leadUnlockedData.isRealVerifiedTender && leadUnlockedData.externalSourceUrl && (
                    <div className="p-3 rounded-lg border border-blue-500/30 bg-blue-500/10 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-foreground flex items-center gap-1">
                          🏛️ {leadUnlockedData.issuingAuthority || "Public Procurement Authority"}
                        </span>
                        {leadUnlockedData.emdAmountInr ? (
                          <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                            EMD (2%): ₹{leadUnlockedData.emdAmountInr.toLocaleString("en-IN")}
                          </span>
                        ) : null}
                      </div>
                      {leadUnlockedData.boqSummary && (
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          {leadUnlockedData.boqSummary}
                        </p>
                      )}
                      <a
                        href={leadUnlockedData.externalSourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-1.5 w-full py-1.5 px-3 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-sm transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> Open Official Verified Government Tender Portal
                      </a>
                    </div>
                  )}
                  <div className="text-sm font-semibold text-foreground">{leadUnlockedData.buyerContact.name}</div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <p>📞 Phone: <span className="font-semibold text-foreground">{leadUnlockedData.buyerContact.phone}</span></p>
                    <p>✉️ Email: <span className="font-semibold text-foreground">{leadUnlockedData.buyerContact.email}</span></p>
                  </div>
                  <a
                    href={`https://wa.me/91${leadUnlockedData.buyerContact.phone.replace(/[^0-9]/g, "").slice(-10)}?text=${encodeURIComponent(
                      `Hi ${leadUnlockedData.buyerContact.name}, I found your requirement "${req.title}" on OmniBid India and would like to discuss fulfillment.`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full inline-flex items-center justify-center rounded-md text-xs font-semibold py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors"
                    data-testid="link-whatsapp-direct"
                  >
                    <MessageSquare className="h-3.5 w-3.5 mr-1.5" /> Chat on WhatsApp Directly
                  </a>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full mt-3 font-semibold border-blue-500/40 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 flex items-center justify-center gap-1.5 shadow-sm"
                  onClick={() =>
                    setCheckoutModalConfig({
                      isOpen: true,
                      type: "lead_unlock",
                      requirementId: id,
                      requirementTitle: req.title,
                    })
                  }
                  data-testid="button-unlock-buyer-contact"
                >
                  <Smartphone className="h-4 w-4 text-blue-500" />
                  {req.customData?.isRealVerifiedTender || leadUnlockedData?.isRealVerifiedTender
                    ? "🏛️ Unlock Verified Tender & Contact (₹99 via UPI)"
                    : "Unlock Direct Buyer Contact (₹99 via UPI)"}
                </Button>
              )
            )}

            {/* Fund Escrow & Award L1 Bid with Dynamic Financial Breakdown for Buyer */}
            {isOwner && l1Bid && ["open", "accepted"].includes(req.status) && (
              <div className="mt-3 p-3.5 rounded-xl border border-emerald-500/40 bg-emerald-500/5 dark:bg-emerald-950/20 text-left space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <Trophy className="h-3.5 w-3.5" /> L1 Lowest Bid: ₹{l1Gross.toLocaleString("en-IN")}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{l1Bid.providerName}</span>
                </div>

                {/* Dynamic financial breakdown */}
                <div className="text-xs space-y-1 bg-background/80 p-2.5 rounded-lg border border-border">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Gross Bid:</span>
                    <span className="font-medium text-foreground">₹{l1Gross.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>{t("platform_fee")}:</span>
                    <span className="font-medium text-foreground">₹{l1Fee.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>{t("tds_deduction")} {l1Gross > 30000 ? "(1% / 2%)" : "(Exempt)"}:</span>
                    <span className="font-medium text-amber-600 dark:text-amber-400">
                      -₹{l1Tds.toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div className="border-t border-border pt-1 flex justify-between font-bold text-emerald-600 dark:text-emerald-400">
                    <span>{t("net_payout")}:</span>
                    <span>₹{l1Net.toLocaleString("en-IN")}</span>
                  </div>
                </div>

                <Button
                  className="w-full font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-1.5 shadow-sm"
                  onClick={() => setShowLockL1Modal(true)}
                  data-testid="button-fund-escrow-l1"
                >
                  <Lock className="h-4 w-4" />
                  Lock L1 &amp; Fund Escrow
                </Button>
              </div>
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

            {/* Multilingual 1-Click WhatsApp Broadcast Generator */}
            <a
              href={`https://api.whatsapp.com/send?text=${encodeURIComponent(getWhatsAppBroadcastText())}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full mt-2 inline-flex items-center justify-center rounded-md text-sm font-semibold transition-colors bg-green-600 hover:bg-green-700 text-white h-9 px-4 py-2 shadow-sm"
              title="Share deal directly to contractor and vendor WhatsApp groups"
              data-testid="button-broadcast-whatsapp"
            >
              <MessageSquare className="h-4 w-4 mr-1.5" />
              {language === "hi"
                ? "ठेकेदार व्हाट्सएप ग्रुप में शेयर करें"
                : language === "te"
                ? "కాంట్రాక్టర్ వాట్సాప్ గ్రూపులకు షేర్ చేయండి"
                : "Broadcast to Contractor WhatsApp Groups"}
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

        {/* Sponsored Material & Working Capital Partners */}
        <Card className="border-amber-300/60 bg-gradient-to-br from-amber-50/40 via-card to-card dark:from-amber-950/15 dark:border-amber-800/40 shadow-xs">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Sparkles className="h-4 w-4 fill-amber-500" />
                </span>
                <CardTitle className="text-base font-bold tracking-tight">
                  Sponsored Material &amp; Working Capital Partners
                </CardTitle>
              </div>
              <Badge variant="outline" className="text-[11px] font-semibold border-amber-500/40 text-amber-700 dark:text-amber-400">
                Verified Partners
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Pre-approved credit lines and direct mill raw materials for contractors bidding on this job.
            </p>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {isLoadingOffers && affiliateOffers.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground animate-pulse">
                Matching verified institutional financing &amp; raw material partners...
              </div>
            ) : affiliateOffers.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">
                No sponsored partners matched for this sector.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {affiliateOffers.slice(0, 4).map((offer) => (
                  <div
                    key={offer.id}
                    className="flex flex-col justify-between p-3 rounded-lg border border-border/70 bg-card hover:border-amber-500/50 hover:shadow-xs transition-all"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1.5">
                        <span className="text-[11px] font-bold text-primary uppercase tracking-wide truncate max-w-[140px]">
                          {offer.partner_name}
                        </span>
                        <Badge
                          variant="secondary"
                          className="text-[10px] px-1.5 py-0 h-4 bg-amber-500/15 text-amber-700 dark:text-amber-300 border-none font-medium whitespace-nowrap"
                        >
                          {offer.badge_text || "Instant Approval"}
                        </Badge>
                      </div>
                      <h4 className="text-xs font-semibold text-foreground line-clamp-2 mb-2 leading-snug">
                        {offer.title}
                      </h4>
                    </div>

                    <a
                      href={`/api/affiliate/r/${offer.id}?reqId=${id}&ch=web_auction`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full inline-flex items-center justify-center rounded-md text-xs font-semibold py-1.5 px-2.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30 transition-colors"
                      data-testid={`link-affiliate-${offer.id}`}
                    >
                      <span>{offer.cta_text || "Apply / Check Rates"}</span>
                      <ExternalLink className="h-3 w-3 ml-1.5" />
                    </a>
                  </div>
                ))}
              </div>
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
                    <div className="flex gap-2 mt-3">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => handleAcceptBid(bid.id)}
                        disabled={acceptBidMutation.isPending}
                        data-testid={`button-accept-bid-${bid.id}`}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                        Accept Bid
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                        onClick={() =>
                          setCheckoutModalConfig({
                            isOpen: true,
                            type: "escrow_deposit",
                            requirementId: id,
                            bidId: bid.id,
                            bidAmount: bid.bidAmount,
                            requirementTitle: req.title,
                          })
                        }
                        data-testid={`button-fund-escrow-${bid.id}`}
                      >
                        <Shield className="h-3.5 w-3.5 mr-1.5" />
                        Fund Escrow
                      </Button>
                    </div>
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

      {/* Buyer Escrow & PO Modal: Lock L1 & Fund Escrow */}
      <Dialog open={showLockL1Modal} onOpenChange={setShowLockL1Modal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Shield className="h-5 w-5 text-emerald-600" />
              Lock L1 Tender &amp; Fund Escrow
            </DialogTitle>
          </DialogHeader>

          {l1Bid && (
            <div className="space-y-4 text-xs sm:text-sm">
              <p className="text-muted-foreground text-xs">
                Statutory procurement award under CPWD / GeM L1 guidelines and Income Tax Act 1961 (Section 194C).
              </p>

              {/* L1 Contractor & GSTIN verification status */}
              <div className="p-3.5 rounded-xl border border-border bg-muted/40 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-foreground text-sm flex items-center gap-1.5">
                    <Trophy className="h-4 w-4 text-amber-500" />
                    L1 Contractor: {l1Bid.providerName}
                  </span>
                  <Badge className="bg-emerald-600 text-white text-[10px]">
                    L1 Award Candidate
                  </Badge>
                </div>

                <div className="p-2 rounded-lg bg-background/90 border border-border text-xs">
                  {gstinValidation.isValid ? (
                    <div className="text-emerald-700 dark:text-emerald-400 font-medium flex items-center gap-1.5 flex-wrap">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span>
                        ✓ Valid GSTIN: <strong>{contractorGstin}</strong> • {gstinValidation.stateName} • {gstinValidation.entityType} ({gstinValidation.tdsRate * 100}% TDS)
                      </span>
                    </div>
                  ) : (
                    <div className="text-amber-700 dark:text-amber-400 font-medium flex items-center gap-1.5 flex-wrap">
                      <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                      <span>
                        GSTIN / PAN: <strong>{contractorGstin || "Unregistered Contractor"}</strong> • Standard Sec 194C TDS (2%)
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Itemized Financial Breakdown */}
              <div className="p-3.5 rounded-xl border border-border bg-background space-y-2.5">
                <div className="font-bold text-xs uppercase tracking-wider text-muted-foreground">
                  Itemized Financial Settlement (Section 194C &amp; Rule 46)
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Gross Contract Value:</span>
                    <span className="font-bold text-foreground">
                      ₹{l1Breakdown.grossAmountInr.toLocaleString("en-IN")}
                    </span>
                  </div>

                  <div className="flex justify-between text-muted-foreground">
                    <span>OmniBid Escrow Fee (2% Platform Retainer):</span>
                    <span className="font-semibold text-foreground">
                      ₹{l1Breakdown.platformFeeInr.toLocaleString("en-IN")}
                    </span>
                  </div>

                  <div className="flex justify-between text-muted-foreground">
                    <span>
                      Section 194C TDS Deduction {l1Breakdown.tdsRate > 0 ? `(${l1Breakdown.tdsRate * 100}%)` : "(Exempt under ₹30,000 threshold)"}:
                    </span>
                    <span className="font-semibold text-amber-600 dark:text-amber-400">
                      -₹{l1Breakdown.tdsInr.toLocaleString("en-IN")}
                    </span>
                  </div>

                  <div className="border-t border-border pt-2 flex justify-between font-bold text-sm text-emerald-600 dark:text-emerald-400">
                    <span>Net Contractor Disbursement:</span>
                    <span>₹{l1Breakdown.netSettlementInr.toLocaleString("en-IN")}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex flex-col sm:flex-row gap-2 mt-2">
            <Button
              type="button"
              variant="outline"
              className="text-xs h-9 border-primary/40 text-primary hover:bg-primary/5 flex items-center gap-1.5"
              onClick={() => window.open(`/api/auctions/${id}/purchase-order`, "_blank")}
              data-testid="button-download-po-modal"
            >
              <FileText className="h-4 w-4" />
              Download Official PO &amp; TDS Certificate
            </Button>

            <Button
              type="button"
              className="text-xs h-9 font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 shadow-sm"
              onClick={() => {
                setShowLockL1Modal(false);
                setCheckoutModalConfig({
                  isOpen: true,
                  type: "escrow_deposit",
                  requirementId: id,
                  bidId: l1Bid?.id,
                  bidAmount: l1Bid?.bidAmount,
                  sellerGstinOrPan: contractorGstin,
                  requirementTitle: req?.title,
                });
              }}
              data-testid="button-fund-razorpay-modal"
            >
              <Shield className="h-4 w-4" />
              Fund via Razorpay UPI / Escrow
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RazorpayCheckoutModal
        isOpen={checkoutModalConfig.isOpen}
        onClose={() => setCheckoutModalConfig((prev) => ({ ...prev, isOpen: false }))}
        type={checkoutModalConfig.type}
        requirementId={checkoutModalConfig.requirementId}
        bidId={checkoutModalConfig.bidId}
        bidAmount={checkoutModalConfig.bidAmount}
        sellerGstinOrPan={checkoutModalConfig.sellerGstinOrPan}
        requirementTitle={checkoutModalConfig.requirementTitle}
        onSuccess={() => {
          fetchLeadUnlockStatus();
          if (id) {
            qc.invalidateQueries({ queryKey: getGetRequirementQueryKey(id) });
            qc.invalidateQueries({ queryKey: getGetRequirementStatsQueryKey(id) });
          }
        }}
      />
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
