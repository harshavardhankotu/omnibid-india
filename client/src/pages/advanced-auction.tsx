import { useState, useEffect } from "react";
import Layout from "@/components/layout";
import { useAuth } from "@/lib/auth";
import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { calculateEscrowBreakdown } from "@/lib/gstin-tds";
import {
  Layers, Lock, RotateCcw, CheckCircle2, AlertTriangle,
  Plus, Trash2, Trophy, BarChart3, Users, Gavel,
  Radio, Activity, Zap, TrendingDown, Sparkles, ExternalLink,
  WifiOff, Clock,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
function authFetch(path: string, opts: RequestInit = {}) {
  const token = localStorage.getItem("omnibid_token");
  return fetch(`${BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...opts.headers },
  });
}

const AUCTION_TYPES = [
  {
    value: "standard",
    label: "Standard Reverse Auction",
    icon: Gavel,
    desc: "All verified providers can bid. Prices go down as competition increases.",
    roles: ["retail_buyer", "enterprise_buyer", "buyer", "both"],
  },
  {
    value: "limited",
    label: "Limited Reverse Auction",
    icon: Users,
    desc: "Only pre-qualified, empanelled vendors can participate. Requires compliance checks.",
    roles: ["enterprise_buyer"],
  },
  {
    value: "sealed",
    label: "Sealed Bid Auction",
    icon: Lock,
    desc: "Financial offers are hidden until the reveal event. Perfect for confidential procurement.",
    roles: ["enterprise_buyer", "retail_buyer"],
  },
  {
    value: "multi_round",
    label: "Multi-Round Bidding",
    icon: RotateCcw,
    desc: "Up to 5 rounds: qualify → revised pricing → final offer. Best for large enterprise contracts.",
    roles: ["enterprise_buyer"],
  },
  {
    value: "multi_lot",
    label: "Multi-Lot Auction",
    icon: Layers,
    desc: "One requirement split into multiple lots/sites/regions. Lots can be awarded separately.",
    roles: ["enterprise_buyer"],
  },
];

const RANKING_MODES = [
  { value: "balanced", label: "Balanced", desc: "Equal weight across all factors" },
  { value: "lowest_cost", label: "Lowest Cost", desc: "Price is the primary criterion" },
  { value: "best_compliance", label: "Best Compliance", desc: "KYC, GST, insurance first" },
  { value: "fastest_start", label: "Fastest Start", desc: "Prioritise providers who can start immediately" },
];

interface Lot { lotNumber: number; title: string; description: string; city: string; maxBudget: string }

interface LeaderboardEntry {
  rank: "L1" | "L2" | "L3" | string;
  bidId: string;
  providerId: string;
  providerName: string;
  providerTrustScore?: number;
  providerIsVerified?: boolean;
  providerCity?: string | null;
  hasGstin?: boolean;
  bidAmount: number;
  createdAt: string;
}

interface OfflineBidItem {
  id: string;
  requirementId: string;
  bidAmount: number;
  message?: string;
  queuedAt: number;
}

export default function AdvancedAuction() {
  const { requirementId } = useParams<{ requirementId: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const isEnterprise = ["enterprise_buyer"].includes(user?.role ?? "");
  const isBuyer = ["buyer", "both", "retail_buyer", "enterprise_buyer"].includes(user?.role ?? "");
  const isProvider = ["provider", "both", "solo_provider", "agency_provider"].includes(user?.role ?? "");

  const [auctionType, setAuctionType] = useState("standard");
  const [maxRounds, setMaxRounds] = useState(2);
  const [rankingMode, setRankingMode] = useState("balanced");
  const [vendorQualRequired, setVendorQualRequired] = useState(false);
  const [qualifiedIds, setQualifiedIds] = useState("");
  const [sealedRevealAt, setSealedRevealAt] = useState("");
  const [lots, setLots] = useState<Lot[]>([{ lotNumber: 1, title: "", description: "", city: "", maxBudget: "" }]);
  const [activeTab, setActiveTab] = useState<"config" | "lots" | "vendor-ranking" | "rounds" | "live-stream">(
    isBuyer ? "config" : "live-stream"
  );
  const [liveBids, setLiveBids] = useState<Array<{ id: string; amount: number; status: string; createdAt: string }>>([]);
  const [streamConnected, setStreamConnected] = useState(false);
  const [lastHeartbeat, setLastHeartbeat] = useState<string>("");
  const [activeCreditTickerIndex, setActiveCreditTickerIndex] = useState(0);

  // Anti-Sniping & Leaderboard Snapshot Sync state
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [totalBidsCount, setTotalBidsCount] = useState<number>(0);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [isAuctionExtended, setIsAuctionExtended] = useState<boolean>(false);
  const [extensionNotice, setExtensionNotice] = useState<string | null>(null);

  // Offline Bid Queue state
  const [isOffline, setIsOffline] = useState<boolean>(typeof navigator !== "undefined" ? !navigator.onLine : false);
  const [offlineQueueCount, setOfflineQueueCount] = useState<number>(0);

  // Quick Bid state
  const [quickBidAmount, setQuickBidAmount] = useState<number>(0);

  const creditOffers = [
    {
      id: "00000000-0000-0000-0000-000000000001",
      partner: "Lendingkart Finance",
      title: "MSME Working Capital Loan up to ₹50L",
      badge: "Instant Approval • ₹0 Fee",
      cta: "Check Credit Line",
    },
    {
      id: "00000000-0000-0000-0000-000000000002",
      partner: "JSW One MSME",
      title: "Direct Mill Pricing on TMT Rebars & Steel",
      badge: "Save 8-12% on Materials",
      cta: "Get Mill Rate Quote",
    },
    {
      id: "00000000-0000-0000-0000-000000000004",
      partner: "Shriram Finance",
      title: "Commercial Equipment & Tipper Financing",
      badge: "Lowest EMI 8.5%",
      cta: "Check Vehicle Eligibility",
    },
    {
      id: "00000000-0000-0000-0000-000000000005",
      partner: "myBillBook (FloBiz)",
      title: "Contractor GST Invoicing & E-Way Software",
      badge: "Govt GST Certified",
      cta: "Start Free Trial",
    },
  ];

  // Helper: Offline bid queue storage
  const getOfflineQueue = (): OfflineBidItem[] => {
    try {
      return JSON.parse(localStorage.getItem("omnibid_offline_bid_queue") || "[]");
    } catch {
      return [];
    }
  };

  const flushOfflineBids = async () => {
    const queue = getOfflineQueue();
    if (queue.length === 0) return;
    const remaining: OfflineBidItem[] = [];
    let synced = 0;
    for (const item of queue) {
      try {
        const res = await authFetch(`/api/requirements/${item.requirementId}/bids`, {
          method: "POST",
          body: JSON.stringify({
            bidAmount: item.bidAmount,
            message: item.message || "Offline auto-synced bid",
          }),
        });
        if (res.ok) {
          synced++;
        } else {
          remaining.push(item);
        }
      } catch {
        remaining.push(item);
      }
    }
    localStorage.setItem("omnibid_offline_bid_queue", JSON.stringify(remaining));
    setOfflineQueueCount(remaining.length);
    if (synced > 0) {
      toast({
        title: "✅ Connection Restored!",
        description: `Successfully auto-submitted ${synced} queued bid(s) to the server.`,
      });
      qc.invalidateQueries({ queryKey: ["auction-config", requirementId] });
      qc.invalidateQueries({ queryKey: ["requirement", requirementId] });
    }
  };

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      flushOfflineBids();
    };
    const handleOffline = () => {
      setIsOffline(true);
      toast({
        title: "⚠️ Offline Mode Activated",
        description: "Bids placed now will be queued locally and submitted automatically on reconnection.",
        className: "border-amber-500 bg-amber-50 dark:bg-amber-950 text-amber-900 dark:text-amber-100",
      });
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    setOfflineQueueCount(getOfflineQueue().length);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [requirementId]);

  // Remaining seconds countdown timer
  useEffect(() => {
    if (remainingSeconds === null || remainingSeconds <= 0) return;
    const interval = setInterval(() => {
      setRemainingSeconds((prev) => (prev && prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [remainingSeconds]);

  // Real-time SSE Live Stream Connection
  useEffect(() => {
    if (!requirementId) return;

    const eventSource = new EventSource(`${BASE}/api/auctions/${requirementId}/live-stream`);

    eventSource.addEventListener("connected", () => {
      setStreamConnected(true);
    });

    eventSource.addEventListener("SNAPSHOT_SYNC", (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data);
        if (parsed.leaderboard) setLeaderboard(parsed.leaderboard);
        if (parsed.totalBids !== undefined) setTotalBidsCount(parsed.totalBids);
        if (parsed.remainingSeconds !== undefined) setRemainingSeconds(parsed.remainingSeconds);
        if (parsed.extended !== undefined) setIsAuctionExtended(Boolean(parsed.extended));
      } catch (err) {
        console.error("Failed to parse SNAPSHOT_SYNC", err);
      }
    });

    eventSource.addEventListener("AUCTION_EXTENDED", (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data);
        setIsAuctionExtended(true);
        setExtensionNotice("⚡ Anti-Sniping Protection: Auction extended by +120s due to last-minute L1 bid!");
        if (parsed.remainingSeconds !== undefined) {
          setRemainingSeconds(parsed.remainingSeconds);
        } else {
          setRemainingSeconds((prev) => (prev ?? 0) + 120);
        }
        toast({
          title: "⚡ Anti-Sniping Protection Triggered!",
          description: "Auction extended by +120s due to last-minute L1 bid!",
          className: "border-amber-500 bg-amber-50 dark:bg-amber-950 text-amber-900 dark:text-amber-100",
        });
      } catch (err) {
        console.error("Failed to parse AUCTION_EXTENDED", err);
      }
    });

    eventSource.addEventListener("bids_snapshot", (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data);
        if (parsed.bids) setLiveBids(parsed.bids);
      } catch (err) {
        console.error("Failed to parse bids snapshot", err);
      }
    });

    eventSource.addEventListener("heartbeat", () => {
      setLastHeartbeat(new Date().toLocaleTimeString());
    });

    eventSource.onerror = () => {
      setStreamConnected(false);
    };

    return () => {
      eventSource.close();
      setStreamConnected(false);
    };
  }, [requirementId]);

  const { data: config, isLoading: loadConfig } = useQuery({
    queryKey: ["auction-config", requirementId],
    queryFn: () => authFetch(`/api/auctions/${requirementId}/config`).then(r => r.json()),
    enabled: !!requirementId,
  });

  const { data: reqDetail } = useQuery({
    queryKey: ["requirement-detail-auction", requirementId],
    queryFn: () => authFetch(`/api/requirements/${requirementId}`).then(r => r.json()),
    enabled: !!requirementId,
  });

  const { data: existingLots } = useQuery({
    queryKey: ["auction-lots", requirementId],
    queryFn: () => authFetch(`/api/auctions/${requirementId}/lots`).then(r => r.json()),
    enabled: !!requirementId,
  });

  const { data: ranking, isLoading: loadRanking } = useQuery({
    queryKey: ["vendor-ranking", requirementId, rankingMode],
    queryFn: () => authFetch(`/api/market/vendor-ranking/${requirementId}?mode=${rankingMode}`).then(r => r.json()),
    enabled: !!requirementId && activeTab === "vendor-ranking",
  });

  // Runner-up monetization queries
  const { data: contextualOffersData } = useQuery({
    queryKey: ["affiliate-contextual-auction", requirementId],
    queryFn: () => authFetch(`/api/affiliate/contextual?reqId=${requirementId}`).then(r => r.json()),
    enabled: !!requirementId,
  });

  const { data: similarAuctionsData } = useQuery({
    queryKey: ["similar-open-auctions", requirementId],
    queryFn: () => authFetch(`/api/requirements?limit=5`).then(r => r.json()),
  });

  const saveConfig = useMutation({
    mutationFn: () =>
      authFetch(`/api/auctions/${requirementId}/config`, {
        method: "POST",
        body: JSON.stringify({
          auctionType,
          maxRounds,
          lotCount: auctionType === "multi_lot" ? lots.length : 1,
          vendorQualificationRequired: vendorQualRequired,
          qualifiedVendorIds: qualifiedIds.split(",").map(s => s.trim()).filter(Boolean),
          sealedRevealAt: sealedRevealAt || undefined,
          rankingMode,
        }),
      }).then(async r => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Failed");
        return d;
      }),
    onSuccess: () => {
      toast({ title: "Auction config saved" });
      qc.invalidateQueries({ queryKey: ["auction-config", requirementId] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const saveLots = useMutation({
    mutationFn: () =>
      authFetch(`/api/auctions/${requirementId}/lots`, {
        method: "POST",
        body: JSON.stringify({
          lots: lots.map(l => ({
            ...l,
            maxBudget: l.maxBudget ? Number(l.maxBudget) : undefined,
          })),
        }),
      }).then(async r => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Failed");
        return d;
      }),
    onSuccess: () => {
      toast({ title: "Lots saved successfully" });
      qc.invalidateQueries({ queryKey: ["auction-lots", requirementId] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const advanceRound = useMutation({
    mutationFn: (shortlistedBidIds: string[]) =>
      authFetch(`/api/auctions/${requirementId}/advance-round`, {
        method: "POST",
        body: JSON.stringify({ shortlistedBidIds }),
      }).then(async r => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Failed");
        return d;
      }),
    onSuccess: (d) => {
      toast({ title: "Round Advanced", description: d.message });
      qc.invalidateQueries({ queryKey: ["auction-config", requirementId] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const revealSealed = useMutation({
    mutationFn: () =>
      authFetch(`/api/auctions/${requirementId}/reveal`, { method: "POST" }).then(async r => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Failed");
        return d;
      }),
    onSuccess: (d) => {
      toast({ title: "Sealed Bids Revealed!", description: `${d.bids?.length ?? 0} bids revealed. Lowest: ₹${d.lowestBid?.toLocaleString("en-IN") ?? "N/A"}` });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const simulateLiveWarMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch(`/api/auctions/${requirementId}/simulate-activity`, {
        method: "POST",
        body: JSON.stringify({ forceAntiSniping: true }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to simulate bidding war");
      return d;
    },
    onSuccess: () => {
      toast({
        title: "⚡ Live Bidding War Simulated",
        description: "⚡ Live Bidding War Simulated: 3 competitive bids placed! Watch L1 flip and Anti-Sniping timer trigger.",
      });
      qc.invalidateQueries({ queryKey: ["/api/requirements", requirementId] });
      qc.invalidateQueries({ queryKey: ["auction-leaderboard", requirementId] });
    },
    onError: (e: Error) => toast({ title: "Simulation Error", description: e.message, variant: "destructive" }),
  });

  // Bid placement handler with offline queue support
  const handlePlaceBid = async (amount: number, messageText?: string) => {
    if (!amount || amount <= 0) {
      toast({ title: "Invalid Bid", description: "Please specify a positive bid amount", variant: "destructive" });
      return;
    }

    if (!navigator.onLine) {
      const queue = getOfflineQueue();
      queue.push({
        id: `offline_${Date.now()}`,
        requirementId: requirementId!,
        bidAmount: amount,
        message: messageText || "Queued offline bid",
        queuedAt: Date.now(),
      });
      localStorage.setItem("omnibid_offline_bid_queue", JSON.stringify(queue));
      setOfflineQueueCount(queue.length);
      toast({
        title: "⚠️ You are offline",
        description: "Bid queued safely on device and will auto-submit upon reconnection.",
        className: "border-amber-500 bg-amber-50 dark:bg-amber-950 text-amber-900 dark:text-amber-100",
      });
      return;
    }

    try {
      const res = await authFetch(`/api/requirements/${requirementId}/bids`, {
        method: "POST",
        body: JSON.stringify({
          bidAmount: amount,
          message: messageText || "Competitive L1 reverse auction quote",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to place bid");
      }
      toast({
        title: "Bid Submitted Successfully!",
        description: `Your bid of ₹${amount.toLocaleString("en-IN")} is live on the board.`,
        className: "border-green-500 bg-green-50 dark:bg-green-950 text-green-900 dark:text-green-100",
      });
      qc.invalidateQueries({ queryKey: ["auction-config", requirementId] });
      qc.invalidateQueries({ queryKey: ["requirement-detail-auction", requirementId] });
    } catch (e: any) {
      toast({
        title: "Failed to Submit Bid",
        description: e.message || "Could not place bid",
        variant: "destructive",
      });
    }
  };

  if (!user) {
    return <Layout><div className="py-24 text-center text-muted-foreground">Please log in to access the auction war room.</div></Layout>;
  }
  if (!requirementId) {
    return <Layout><div className="py-24 text-center text-muted-foreground">No requirement selected.</div></Layout>;
  }

  // Active L1 calculation
  const currentL1Amount =
    leaderboard.length > 0
      ? leaderboard[0].bidAmount
      : liveBids.length > 0
      ? liveBids[0].amount
      : reqDetail?.maxBudget ?? 100000;

  // Set default quick-bid amount if unset
  const activeBidTarget = quickBidAmount > 0 ? quickBidAmount : Math.max(1, currentL1Amount - 500);

  // Micro-calculator breakdown
  const microBreakdown = calculateEscrowBreakdown({
    grossAmountInr: activeBidTarget,
    gstinOrPan: (user as any)?.gstNumber || null,
  });

  // Runner-Up check
  const userBidInLeaderboard = leaderboard.find((b) => b.providerId === user?.id);
  const isRunnerUp = userBidInLeaderboard ? userBidInLeaderboard.rank !== "L1" : isProvider;

  // Contextual offers list
  const featuredOffers = Array.isArray(contextualOffersData) && contextualOffersData.length > 0
    ? contextualOffersData
    : creditOffers;

  // Similar open auctions list
  const similarAuctions = (Array.isArray(similarAuctionsData) ? similarAuctionsData : [])
    .filter((a: any) => a.id !== requirementId && a.status === "open")
    .slice(0, 3);

  const visibleTypes = AUCTION_TYPES.filter(t => t.roles.includes(user.role));
  const tabs = [
    ...(isBuyer ? [{ id: "config", label: "Auction Type" }] : []),
    { id: "live-stream", label: "🔴 Live Reverse Auction & War Room" },
    ...(isBuyer && isEnterprise ? [{ id: "lots", label: "Multi-Lot" }, { id: "rounds", label: "Rounds" }] : []),
    ...(isBuyer ? [{ id: "vendor-ranking", label: "AI Vendor Ranking" }] : []),
  ] as { id: typeof activeTab; label: string }[];

  const labelColors: Record<string, string> = {
    "Best Price": "bg-green-100 text-green-700",
    "Trusted Choice": "bg-blue-100 text-blue-700",
    "Fastest Available": "bg-purple-100 text-purple-700",
    "Nearby Best Match": "bg-orange-100 text-orange-700",
    "Lowest Cost": "bg-green-100 text-green-700",
    "Compliance Champion": "bg-indigo-100 text-indigo-700",
    "Fastest Mobilization": "bg-purple-100 text-purple-700",
    "Balanced Recommendation": "bg-blue-100 text-blue-700",
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6 pb-40">
        {/* Header section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Gavel className="h-6 w-6 text-primary" />
              {isBuyer ? "Advanced Reverse Auction & War Room" : "Live Reverse Auction Bidding Arena"}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {reqDetail?.title || "Real-time competitive pricing platform"}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              onClick={() => simulateLiveWarMutation.mutate()}
              disabled={simulateLiveWarMutation.isPending}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs h-8 shadow-sm flex items-center gap-1.5"
              data-testid="simulate-live-bidding-war-button"
            >
              <Zap className={`h-3.5 w-3.5 ${simulateLiveWarMutation.isPending ? "animate-spin" : ""}`} />
              ⚡ Simulate Live Bidding War
            </Button>
            {config && !loadConfig && (
              <Badge variant="outline" className="text-xs capitalize">{config.auctionType || "reverse"}</Badge>
            )}
            {isOffline && (
              <Badge variant="destructive" className="text-xs flex items-center gap-1">
                <WifiOff className="h-3.5 w-3.5" /> Offline Mode
              </Badge>
            )}
          </div>
        </div>

        {/* Offline Banner Notification */}
        {isOffline && (
          <div className="p-3.5 rounded-xl border border-amber-500/50 bg-amber-500/10 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 flex items-center justify-between text-xs sm:text-sm font-medium shadow-xs">
            <div className="flex items-center gap-2">
              <WifiOff className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>
                ⚠️ You are offline. Bids will be queued safely on this device and auto-submit upon reconnection.
              </span>
            </div>
            {offlineQueueCount > 0 && (
              <Badge className="bg-amber-600 text-white font-bold ml-2">
                {offlineQueueCount} Queued
              </Badge>
            )}
          </div>
        )}

        {/* Anti-Sniping Alert Banner */}
        {isAuctionExtended && (
          <div className="p-4 rounded-xl border border-amber-500/60 bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-transparent dark:from-amber-950/40 text-amber-900 dark:text-amber-100 flex items-center gap-3 shadow-md animate-pulse">
            <div className="p-2 rounded-full bg-amber-500 text-white shrink-0">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <div className="font-bold text-sm">
                ⚡ Anti-Sniping Protection Active!
              </div>
              <p className="text-xs text-amber-800 dark:text-amber-200 mt-0.5">
                {extensionNotice || "Auction extended by +120s due to last-minute L1 bid to ensure fair competition."}
              </p>
            </div>
          </div>
        )}

        {/* Tab bar */}
        <div className="flex border-b overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === t.id ? "border-primary text-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Config tab (Buyer only) */}
        {activeTab === "config" && isBuyer && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              {visibleTypes.map(t => {
                const Icon = t.icon;
                const selected = auctionType === t.value;
                return (
                  <button
                    key={t.value}
                    onClick={() => setAuctionType(t.value)}
                    className={`text-left border rounded-xl p-4 transition-all ${selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-muted-foreground/30"}`}
                  >
                    <div className="flex items-start gap-3">
                      <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${selected ? "text-primary" : "text-muted-foreground"}`} />
                      <div>
                        <p className={`font-medium text-sm ${selected ? "text-primary" : ""}`}>{t.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{t.desc}</p>
                        {!t.roles.includes(user.role) && (
                          <p className="text-xs text-orange-600 mt-1">Requires Enterprise Buyer role</p>
                        )}
                      </div>
                      {selected && <CheckCircle2 className="h-4 w-4 text-primary ml-auto shrink-0" />}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Multi-round config */}
            {auctionType === "multi_round" && isEnterprise && (
              <Card>
                <CardHeader><CardTitle className="text-sm">Round Configuration</CardTitle></CardHeader>
                <CardContent>
                  <Label className="text-xs">Number of Rounds (max 5)</Label>
                  <Input type="number" min={2} max={5} value={maxRounds} onChange={e => setMaxRounds(Number(e.target.value))} className="mt-1 w-24" />
                  <p className="text-xs text-muted-foreground mt-2">Round 1: Qualification → Round 2: Revised pricing → Final Round: Best offer</p>
                </CardContent>
              </Card>
            )}

            {/* Sealed bid reveal time */}
            {auctionType === "sealed" && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2"><Lock className="h-4 w-4" />Reveal Schedule</CardTitle>
                </CardHeader>
                <CardContent>
                  <Label className="text-xs">Reveal Date &amp; Time</Label>
                  <Input type="datetime-local" value={sealedRevealAt} onChange={e => setSealedRevealAt(e.target.value)} className="mt-1" />
                  <p className="text-xs text-muted-foreground mt-1">All bids remain hidden until this date. You can also reveal manually.</p>
                  <Button size="sm" variant="outline" className="mt-2" onClick={() => revealSealed.mutate()} disabled={revealSealed.isPending}>
                    <Lock className="h-4 w-4 mr-1" />
                    {revealSealed.isPending ? "Revealing..." : "Reveal Now"}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Vendor qualification */}
            {isEnterprise && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" />Vendor Qualification</CardTitle>
                  <CardDescription>Restrict participation to pre-approved vendors only</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Switch checked={vendorQualRequired} onCheckedChange={setVendorQualRequired} />
                    <Label className="text-sm">Require vendor qualification</Label>
                  </div>
                  {vendorQualRequired && (
                    <div>
                      <Label className="text-xs">Approved Vendor IDs (comma-separated UUIDs)</Label>
                      <Input value={qualifiedIds} onChange={e => setQualifiedIds(e.target.value)} placeholder="uuid1, uuid2, ..." className="mt-1 font-mono text-xs" />
                      <p className="text-xs text-muted-foreground mt-1">Leave empty to allow all empanelled vendors from your Approved Vendor List</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Ranking mode */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4" />AI Ranking Mode</CardTitle>
                <CardDescription>How vendors should be ranked for this auction</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2">
                  {RANKING_MODES.map(m => (
                    <button
                      key={m.value}
                      onClick={() => setRankingMode(m.value)}
                      className={`text-left p-3 rounded-lg border text-sm transition-all ${rankingMode === m.value ? "border-primary bg-primary/5" : "hover:border-muted-foreground/30"}`}
                    >
                      <p className="font-medium">{m.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{m.desc}</p>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Button onClick={() => saveConfig.mutate()} disabled={saveConfig.isPending} className="w-full">
              {saveConfig.isPending ? "Saving..." : "Save Auction Configuration"}
            </Button>
          </div>
        )}

        {/* Live War Room & Ticker tab */}
        {activeTab === "live-stream" && (
          <div className="space-y-4">
            {/* Real-time Status Card */}
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="relative flex items-center justify-center">
                    <span className={`inline-block w-3 h-3 rounded-full ${streamConnected ? "bg-green-500 animate-ping" : "bg-red-500"}`} />
                    <span className={`absolute inline-block w-2 h-2 rounded-full ${streamConnected ? "bg-green-600" : "bg-red-600"}`} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm flex items-center gap-1.5">
                      <Radio className="h-4 w-4 text-primary" />
                      {streamConnected ? "Live Reverse Auction SSE Feed Active" : "Connecting to Auction Feed..."}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {streamConnected ? `Heartbeat active (${lastHeartbeat || "just now"}) • Instant L1 refresh` : "Connecting to low-latency auction ticker..."}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => simulateLiveWarMutation.mutate()}
                    disabled={simulateLiveWarMutation.isPending}
                    className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40 font-bold text-xs h-7 flex items-center gap-1 shadow-xs"
                    data-testid="simulate-live-bidding-war-status-button"
                  >
                    <Zap className={`h-3 w-3 ${simulateLiveWarMutation.isPending ? "animate-spin" : ""}`} />
                    ⚡ Simulate Live Bidding War
                  </Button>
                  {remainingSeconds !== null && (
                    <Badge variant="outline" className="text-xs font-mono font-bold px-2.5 py-1 border-primary/40 bg-background flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-primary" />
                      <span>
                        {remainingSeconds > 0
                          ? `${Math.floor(remainingSeconds / 60)}m ${remainingSeconds % 60}s`
                          : "Auction Closed"}
                      </span>
                    </Badge>
                  )}
                  <Badge variant={streamConnected ? "default" : "secondary"} className="text-xs">
                    {streamConnected ? "LIVE TICKER" : "DISCONNECTED"}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Interactive Ticker Banner: Working Capital & Raw Material Credit */}
            <Card className="border-amber-400/40 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent dark:from-amber-950/30 overflow-hidden shadow-xs">
              <CardContent className="p-3 sm:p-4">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0">
                      <Sparkles className="h-4 w-4 fill-amber-500" />
                    </span>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider border-amber-500/50 text-amber-700 dark:text-amber-300 bg-amber-500/10 px-1.5 py-0">
                          ⚡ Working Capital &amp; Raw Material Credit
                        </Badge>
                        <span className="text-xs font-bold text-foreground">
                          {creditOffers[activeCreditTickerIndex].partner}:
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {creditOffers[activeCreditTickerIndex].title}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          {creditOffers[activeCreditTickerIndex].badge}
                        </span>
                        <span className="text-[10px] text-muted-foreground">• Backed by OmniBid Institutional Partner Network</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-end">
                    <div className="flex items-center gap-1">
                      {creditOffers.map((_, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setActiveCreditTickerIndex(idx)}
                          className={`h-1.5 rounded-full transition-all ${activeCreditTickerIndex === idx ? "w-5 bg-amber-500" : "w-1.5 bg-muted-foreground/30"}`}
                          title={`Switch to offer ${idx + 1}`}
                          data-testid={`button-ticker-dot-${idx}`}
                        />
                      ))}
                    </div>

                    <a
                      href={`/api/affiliate/r/${creditOffers[activeCreditTickerIndex].id}?reqId=${requirementId || ""}&ch=web_auction&campaign=war_room_ticker`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center rounded-md text-xs font-semibold px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white transition-colors shadow-xs ml-2 whitespace-nowrap"
                      data-testid="link-warroom-affiliate-credit"
                    >
                      <span>{creditOffers[activeCreditTickerIndex].cta}</span>
                      <ExternalLink className="h-3 w-3 ml-1.5" />
                    </a>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card>
                <CardContent className="p-4 text-center">
                  <span className="text-xs text-muted-foreground uppercase font-medium">Leading L1 Quote</span>
                  <div className="text-xl font-bold text-green-600 mt-1" data-testid="metric-current-l1">
                    ₹{currentL1Amount.toLocaleString("en-IN")}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 text-center">
                  <span className="text-xs text-muted-foreground uppercase font-medium">Total Bids</span>
                  <div className="text-xl font-bold mt-1" data-testid="metric-total-bids">
                    {totalBidsCount || liveBids.length}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 text-center">
                  <span className="text-xs text-muted-foreground uppercase font-medium">Time Left</span>
                  <div className="text-xl font-bold font-mono text-primary mt-1">
                    {remainingSeconds !== null
                      ? remainingSeconds > 0
                        ? `${Math.floor(remainingSeconds / 60)}m ${remainingSeconds % 60}s`
                        : "Closed"
                      : "--:--"}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 text-center">
                  <span className="text-xs text-muted-foreground uppercase font-medium">Protocol</span>
                  <div className="text-sm font-semibold text-primary mt-1 flex items-center justify-center gap-1">
                    <Zap className="h-3.5 w-3.5 text-amber-500" />
                    GeM / CPWD L1
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Snapshot Sync Leaderboard (L1, L2, L3) */}
            {leaderboard.length > 0 && (
              <Card className="border-border/80">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <Trophy className="h-4 w-4 text-amber-500" />
                      Live Reverse Auction Leaderboard (Snapshot Sync)
                    </CardTitle>
                    <Badge variant="outline" className="text-[10px] font-mono">
                      Real-time SSE
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left" data-testid="table-auction-leaderboard">
                      <thead className="bg-muted/50 border-y border-border/70 text-muted-foreground font-semibold">
                        <tr>
                          <th className="py-2.5 px-3">Rank</th>
                          <th className="py-2.5 px-3">Contractor</th>
                          <th className="py-2.5 px-3">Trust &amp; GST</th>
                          <th className="py-2.5 px-3 text-right">Bid Amount (₹)</th>
                          <th className="py-2.5 px-3 text-right">Vs L1</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {leaderboard.map((entry, idx) => {
                          const isL1 = entry.rank === "L1" || idx === 0;
                          const isL2 = entry.rank === "L2" || idx === 1;
                          const isL3 = entry.rank === "L3" || idx === 2;
                          const diff = entry.bidAmount - currentL1Amount;

                          return (
                            <tr
                              key={entry.bidId || idx}
                              className={`transition-colors ${
                                isL1
                                  ? "bg-green-50/60 dark:bg-green-950/20 font-medium"
                                  : isL2
                                  ? "bg-blue-50/40 dark:bg-blue-950/10"
                                  : "hover:bg-muted/30"
                              }`}
                            >
                              <td className="py-2.5 px-3">
                                <span
                                  className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                    isL1
                                      ? "bg-green-600 text-white"
                                      : isL2
                                      ? "bg-blue-600 text-white"
                                      : isL3
                                      ? "bg-amber-600 text-white"
                                      : "bg-muted text-muted-foreground"
                                  }`}
                                >
                                  {entry.rank}
                                </span>
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="font-semibold text-foreground flex items-center gap-1.5">
                                  <span>{entry.providerName}</span>
                                  {entry.providerIsVerified && (
                                    <span title="Verified Contractor">
                                      <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                  {entry.providerCity || "Pan India"}
                                </div>
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="flex items-center gap-1.5">
                                  <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-mono">
                                    Trust: {entry.providerTrustScore ?? 80}/100
                                  </Badge>
                                  {entry.hasGstin && (
                                    <Badge variant="secondary" className="text-[10px] py-0 px-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                                      GST Valid
                                    </Badge>
                                  )}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-right font-extrabold text-foreground">
                                ₹{entry.bidAmount.toLocaleString("en-IN")}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono text-[11px]">
                                {isL1 ? (
                                  <span className="text-green-600 font-bold">Leading L1</span>
                                ) : (
                                  <span className="text-amber-600 dark:text-amber-400">
                                    +₹{diff.toLocaleString("en-IN")}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Live Bids Feed */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" />
                    Live Reverse Auction Stream
                  </span>
                  <span className="text-xs text-muted-foreground font-normal">Auto-updates on price drops</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Providers compete dynamically. In accordance with Indian procurement norms, the lowest verified compliant offer holds L1 rank.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {liveBids.length === 0 ? (
                  <div className="py-10 text-center text-muted-foreground text-sm">
                    <TrendingDown className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                    No bids recorded in this session yet. Waiting for incoming provider submissions...
                  </div>
                ) : (
                  liveBids.map((bid, index) => {
                    const isL1 = index === 0;
                    const isL2 = index === 1;
                    const isL3 = index === 2;
                    return (
                      <div
                        key={bid.id}
                        className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                          isL1
                            ? "border-green-300 bg-green-50/50 dark:bg-green-950/20 shadow-xs"
                            : isL2
                            ? "border-blue-200 bg-blue-50/30 dark:bg-blue-950/10"
                            : "border-border/60 bg-card"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-bold ${
                              isL1
                                ? "bg-green-600 text-white"
                                : isL2
                                ? "bg-blue-600 text-white"
                                : isL3
                                ? "bg-amber-600 text-white"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {isL1 ? "L1 LEADER" : isL2 ? "L2" : isL3 ? "L3" : `L${index + 1}`}
                          </span>
                          <div>
                            <div className="text-xs font-mono text-muted-foreground">
                              Bid #{bid.id.slice(0, 8)}...
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {new Date(bid.createdAt).toLocaleTimeString()}
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className={`font-bold text-sm ${isL1 ? "text-green-600" : "text-foreground"}`}>
                            ₹{Number(bid.amount).toLocaleString("en-IN")}
                          </div>
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {bid.status}
                          </Badge>
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            {/* L2–L10 Runner-Up Monetization Loop */}
            {isRunnerUp && (
              <Card className="border-amber-400/50 bg-gradient-to-br from-amber-500/10 via-card to-card dark:from-amber-950/20 shadow-md">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="p-1.5 rounded-lg bg-amber-500/20 text-amber-700 dark:text-amber-300">
                        <Trophy className="h-5 w-5" />
                      </span>
                      <div>
                        <CardTitle className="text-base font-bold text-foreground">
                          🎯 Beat L1 Next Time: Instant Material &amp; Working Capital Partners
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Lower your procurement cost by 8-12% and secure zero-collateral working capital to submit winning bids.
                        </CardDescription>
                      </div>
                    </div>
                    <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300 text-xs">
                      Exclusive Contractor Pricing
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 pt-0">
                  {/* 2 Contextual Partner Offers */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {featuredOffers.slice(0, 2).map((offer: any) => (
                      <div
                        key={offer.id}
                        className="p-3.5 rounded-xl border border-border bg-card/80 hover:border-amber-500/40 transition-all flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold text-primary uppercase tracking-wide">
                              {offer.partner_name || offer.partner}
                            </span>
                            <Badge variant="secondary" className="text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-300">
                              {offer.badge_text || offer.badge || "Verified Partner"}
                            </Badge>
                          </div>
                          <h4 className="text-xs font-semibold text-foreground mb-2">
                            {offer.title}
                          </h4>
                        </div>
                        <a
                          href={`/api/affiliate/r/${offer.id}?reqId=${requirementId}&ch=web_auction`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center rounded-md text-xs font-bold py-1.5 px-3 bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition-colors"
                          data-testid={`link-runner-up-partner-${offer.id}`}
                        >
                          <span>{offer.cta_text || offer.cta || "Check Credit & Rates"}</span>
                          <ExternalLink className="h-3 w-3 ml-1.5" />
                        </a>
                      </div>
                    ))}
                  </div>

                  {/* 3 Similar Open Auctions Ready for Bidding */}
                  {similarAuctions.length > 0 && (
                    <div>
                      <div className="text-xs font-bold text-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Activity className="h-3.5 w-3.5 text-primary" />
                        3 Similar Open Auctions Ready for Bidding
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        {similarAuctions.map((sim: any) => (
                          <div
                            key={sim.id}
                            className="p-3 rounded-lg border border-border bg-muted/30 hover:border-primary/50 transition-all flex flex-col justify-between"
                          >
                            <div>
                              <h5 className="text-xs font-semibold text-foreground truncate mb-1">
                                {sim.title}
                              </h5>
                              <div className="text-[11px] text-muted-foreground flex items-center justify-between">
                                <span>{sim.city || "Pan India"}</span>
                                <span className="font-bold text-foreground">₹{Number(sim.maxBudget || 0).toLocaleString("en-IN")}</span>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full mt-2 text-xs h-7 border-primary/30 text-primary hover:bg-primary/5"
                              onClick={() => {
                                window.location.href = `/auction/${sim.id}`;
                              }}
                            >
                              Bid Now
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Multi-lot tab */}
        {activeTab === "lots" && isBuyer && isEnterprise && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Define each lot — location, budget, and scope</p>
              <Button size="sm" variant="outline" onClick={() => setLots([...lots, { lotNumber: lots.length + 1, title: "", description: "", city: "", maxBudget: "" }])}>
                <Plus className="h-4 w-4 mr-1" />Add Lot
              </Button>
            </div>

            {lots.map((lot, i) => (
              <Card key={i}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">Lot {lot.lotNumber}</CardTitle>
                    {lots.length > 1 && (
                      <Button size="sm" variant="ghost" className="h-7 text-destructive hover:text-destructive" onClick={() => setLots(lots.filter((_, j) => j !== i))}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label className="text-xs">Lot Title *</Label>
                    <Input value={lot.title} onChange={e => setLots(lots.map((l, j) => j === i ? { ...l, title: e.target.value } : l))} placeholder="e.g. North Zone - Delhi NCR" className="mt-1" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">City</Label>
                      <Input value={lot.city} onChange={e => setLots(lots.map((l, j) => j === i ? { ...l, city: e.target.value } : l))} placeholder="e.g. New Delhi" className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs">Max Budget (₹)</Label>
                      <Input type="number" value={lot.maxBudget} onChange={e => setLots(lots.map((l, j) => j === i ? { ...l, maxBudget: e.target.value } : l))} placeholder="e.g. 150000" className="mt-1" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Description</Label>
                    <Input value={lot.description} onChange={e => setLots(lots.map((l, j) => j === i ? { ...l, description: e.target.value } : l))} placeholder="Scope of work for this lot" className="mt-1" />
                  </div>
                </CardContent>
              </Card>
            ))}

            {existingLots?.length > 0 && (
              <div className="border rounded-xl p-4 bg-muted/20">
                <p className="text-xs font-medium text-muted-foreground mb-2">Saved lots ({existingLots.length})</p>
                {(existingLots as Array<{ lotNumber: number; title: string; city: string; maxBudget: number; status: string }>).map(l => (
                  <div key={l.lotNumber} className="flex items-center justify-between py-1 text-sm">
                    <span>Lot {l.lotNumber}: {l.title}</span>
                    <div className="flex items-center gap-2 text-muted-foreground text-xs">
                      {l.city && <span>{l.city}</span>}
                      {l.maxBudget > 0 && <span>₹{l.maxBudget.toLocaleString("en-IN")}</span>}
                      <Badge variant="outline" className="text-xs">{l.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Button onClick={() => saveLots.mutate()} disabled={saveLots.isPending || lots.some(l => !l.title)} className="w-full">
              {saveLots.isPending ? "Saving..." : `Save ${lots.length} Lots`}
            </Button>
          </div>
        )}

        {/* Rounds management tab */}
        {activeTab === "rounds" && isBuyer && isEnterprise && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Round Status</CardTitle>
                <CardDescription>Current: Round {config?.currentRound ?? 1} of {config?.maxRounds ?? 1}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  {Array.from({ length: config?.maxRounds ?? 1 }, (_, i) => (
                    <div key={i} className={`flex-1 text-center py-3 rounded-lg border text-sm font-medium ${i + 1 === (config?.currentRound ?? 1) ? "border-primary bg-primary/10 text-primary" : i + 1 < (config?.currentRound ?? 1) ? "border-green-300 bg-green-50 text-green-700" : "border-muted text-muted-foreground"}`}>
                      <div className="text-xs opacity-70">{i + 1 < (config?.currentRound ?? 1) ? "✓ Done" : i + 1 === (config?.currentRound ?? 1) ? "Active" : "Pending"}</div>
                      Round {i + 1}
                    </div>
                  ))}
                </div>

                {config?.currentRound < config?.maxRounds ? (
                  <div className="space-y-3">
                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                      <p className="text-xs text-amber-700">Advancing the round will reject all bids from Round {config?.currentRound} that are not shortlisted. This cannot be undone.</p>
                    </div>
                    <Button onClick={() => advanceRound.mutate([])} disabled={advanceRound.isPending} variant="outline" className="w-full">
                      <RotateCcw className="h-4 w-4 mr-1" />
                      {advanceRound.isPending ? "Advancing..." : `Advance to Round ${(config?.currentRound ?? 0) + 1}`}
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-green-600 bg-green-50 border border-green-200 rounded-lg p-3">
                    <Trophy className="h-4 w-4" />
                    <p className="text-sm font-medium">Final round — accept the best bid to complete the auction.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* AI Vendor Ranking tab */}
        {activeTab === "vendor-ranking" && isBuyer && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Select value={rankingMode} onValueChange={setRankingMode}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RANKING_MODES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">Ranking updates automatically</span>
            </div>

            {loadRanking ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-24 bg-muted/40 rounded-xl animate-pulse" />)}
              </div>
            ) : !ranking?.vendors?.length ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <BarChart3 className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">No bids yet. Vendor ranking will appear once providers submit bids.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {(ranking.vendors as Array<{ rank: number; name: string; city: string; bidAmount: number; label: string; rankingScore: number; omniScore: number; isVerified: boolean; avgRating: number; completedJobs: number; scoreBreakdown: Record<string, number>; fraudScore: number }>).map(v => (
                  <Card key={v.rank} className={v.rank === 1 ? "border-amber-300 bg-amber-50/30" : ""}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${v.rank === 1 ? "bg-amber-400 text-white" : v.rank === 2 ? "bg-gray-300 text-gray-700" : v.rank === 3 ? "bg-orange-300 text-white" : "bg-muted text-muted-foreground"}`}>
                            {v.rank === 1 ? <Trophy className="h-4 w-4" /> : v.rank}
                          </div>
                          <div>
                            <p className="font-medium text-sm">{v.name}</p>
                            <p className="text-xs text-muted-foreground">{v.city} · {v.completedJobs} completed jobs · ⭐ {v.avgRating}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-sm">₹{v.bidAmount.toLocaleString("en-IN")}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${labelColors[v.label] ?? "bg-gray-100 text-gray-700"}`}>{v.label}</span>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-3 sm:grid-cols-6 gap-2">
                        {Object.entries(v.scoreBreakdown).map(([key, val]) => (
                          <div key={key} className="text-center">
                            <div className="text-xs font-medium">{val}</div>
                            <div className="text-[10px] text-muted-foreground capitalize">{key.replace("Score", "")}</div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          {v.isVerified ? <CheckCircle2 className="h-3 w-3 text-green-600" /> : <AlertTriangle className="h-3 w-3 text-orange-500" />}
                          {v.isVerified ? "Verified" : "Not verified"}
                        </span>
                        <span>OmniScore: {v.omniScore}</span>
                        <span>Fraud risk: {v.fraudScore < 30 ? "low" : v.fraudScore < 60 ? "medium" : "high"}</span>
                        <span>AI Score: {v.rankingScore}/100</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Contractor Thumb-First Sticky Bid Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-t border-border p-3 sm:p-4 shadow-2xl">
        <div className="max-w-4xl mx-auto space-y-2">
          {/* Micro Calculator Badge */}
          <div className="flex items-center justify-between flex-wrap gap-2 text-[11px] bg-muted/80 px-3 py-1.5 rounded-lg border border-border">
            <div className="flex items-center gap-1 font-mono text-muted-foreground flex-wrap">
              <span>Gross: <strong className="text-foreground">₹{microBreakdown.grossAmountInr.toLocaleString("en-IN")}</strong></span>
              <span>•</span>
              <span>OmniBid 2% Fee: <strong className="text-foreground">₹{microBreakdown.platformFeeInr.toLocaleString("en-IN")}</strong></span>
              <span>•</span>
              <span>Sec 194C TDS {microBreakdown.tdsRate > 0 ? `(${microBreakdown.tdsRate * 100}%)` : "(Exempt)"}: <strong className="text-amber-600 dark:text-amber-400">₹{microBreakdown.tdsInr.toLocaleString("en-IN")}</strong></span>
              <span>•</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">Net in Hand: ₹{microBreakdown.netSettlementInr.toLocaleString("en-IN")}</span>
            </div>
            {isOffline && (
              <Badge variant="outline" className="text-[10px] bg-amber-500/10 border-amber-500/50 text-amber-700 dark:text-amber-300">
                ⚠️ Offline Mode ({offlineQueueCount} queued)
              </Badge>
            )}
          </div>

          {/* Controls Row */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="text-left shrink-0">
                <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Current L1</div>
                <div className="text-sm sm:text-base font-extrabold text-green-600" data-testid="bar-current-l1">
                  ₹{currentL1Amount.toLocaleString("en-IN")}
                </div>
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto py-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setQuickBidAmount(Math.max(1, currentL1Amount - 500))}
                  className="text-xs h-8 px-2 font-semibold hover:border-primary shrink-0"
                  data-testid="button-quickbid-500"
                >
                  -₹500
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setQuickBidAmount(Math.max(1, Math.round(currentL1Amount * 0.99)))}
                  className="text-xs h-8 px-2 font-semibold hover:border-primary shrink-0 text-emerald-600 dark:text-emerald-400"
                  data-testid="button-quickbid-1pct"
                >
                  -1% (Instant L1)
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setQuickBidAmount(Math.max(1, Math.round(currentL1Amount * 0.98)))}
                  className="text-xs h-8 px-2 font-semibold hover:border-primary shrink-0 text-blue-600 dark:text-blue-400"
                  data-testid="button-quickbid-2pct"
                >
                  -2% (Decisive L1)
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <div className="relative w-32 sm:w-36">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-bold">₹</span>
                <Input
                  type="number"
                  value={quickBidAmount || ""}
                  onChange={(e) => setQuickBidAmount(Number(e.target.value))}
                  placeholder="Amount"
                  className="pl-6 h-9 text-xs sm:text-sm font-bold font-mono"
                  data-testid="input-quickbid-amount"
                />
              </div>
              <Button
                type="button"
                onClick={() => handlePlaceBid(quickBidAmount || Math.max(1, currentL1Amount - 500))}
                className="h-9 text-xs sm:text-sm font-bold bg-green-600 hover:bg-green-700 text-white shadow-md shrink-0 px-4"
                data-testid="button-submit-thumb-bid"
              >
                <Gavel className="h-4 w-4 mr-1.5" />
                Place Bid
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
