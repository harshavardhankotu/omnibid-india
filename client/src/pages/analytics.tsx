import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Layout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, FunnelChart, Funnel, LabelList,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from "recharts";
import {
  TrendingUp, Users, ClipboardList, Gavel, CreditCard,
  AlertTriangle, Star, Trophy, ArrowUpRight, Building2,
  MapPin, RefreshCw,
} from "lucide-react";

const TOKEN_KEY = "omnibid_token";
function authFetch(path: string) {
  const token = localStorage.getItem(TOKEN_KEY);
  return fetch(`/api${path}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
}

function StatCard({ label, value, sub, icon, trend }: { label: string; value: string | number; sub?: string; icon: React.ReactNode; trend?: number }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
            {icon}
          </div>
        </div>
        {trend !== undefined && (
          <div className={`mt-2 text-xs flex items-center gap-1 ${trend >= 0 ? "text-green-600" : "text-red-500"}`}>
            <ArrowUpRight className={`h-3 w-3 ${trend < 0 ? "rotate-180" : ""}`} />
            {Math.abs(trend)}% from last month
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const PIE_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6", "#14b8a6", "#f97316"];

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="h-48 flex flex-col items-center justify-center text-muted-foreground text-sm gap-2">
      <TrendingUp className="h-8 w-8 opacity-30" />
      <span>No {label} data yet — start using the platform to see insights</span>
    </div>
  );
}

function BuyerDashboard({ data }: { data: Record<string, unknown> }) {
  const summary = (data.summary ?? {}) as Record<string, number>;
  const categoryBreakdown = (data.categoryBreakdown ?? []) as { category: string; count: number; avgBudget: number }[];
  const recentReqs = (data.recentRequirements ?? []) as { id: string; title: string; status: string; bidCount: number; maxBudget: number }[];

  const STATUS_COLOR: Record<string, string> = {
    open: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
    accepted: "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300",
    in_progress: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-300",
    completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
    expired: "bg-muted text-muted-foreground",
    disputed: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Requirements" value={summary.totalRequirements ?? 0} icon={<ClipboardList className="h-4 w-4" />} sub={`${summary.openRequirements ?? 0} open`} />
        <StatCard label="Total Bids Received" value={summary.totalBidsReceived ?? 0} icon={<Gavel className="h-4 w-4" />} sub={`Avg ₹${Math.round(summary.avgBidAmount ?? 0).toLocaleString("en-IN")}`} />
        <StatCard label="Total Spend" value={`₹${(summary.totalSpend ?? 0).toLocaleString("en-IN")}`} icon={<CreditCard className="h-4 w-4" />} sub={`${summary.completedRequirements ?? 0} completed`} />
        <StatCard label="Disputes Filed" value={summary.disputes ?? 0} icon={<AlertTriangle className="h-4 w-4" />} sub={summary.disputes === 0 ? "Clean record!" : "Raised by you"} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Requirements by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={categoryBreakdown} margin={{ left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.12} />
                  <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => [v, "Requirements"]} />
                  <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart label="category" />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Avg Budget by Category (₹)</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={categoryBreakdown} margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.12} />
                  <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => [`₹${v.toLocaleString("en-IN")}`, "Avg Budget"]} />
                  <Bar dataKey="avgBudget" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart label="budget" />}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Recent Requirements (Last 30 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          {recentReqs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No recent requirements. <a href="/requirements/new" className="text-primary underline">Post one now →</a></p>
          ) : (
            <div className="space-y-2">
              {recentReqs.map(r => (
                <div key={r.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/30 transition-colors">
                  <div>
                    <p className="text-sm font-medium line-clamp-1">{r.title}</p>
                    <p className="text-xs text-muted-foreground">{r.bidCount} bids · ₹{Number(r.maxBudget).toLocaleString("en-IN")} budget</p>
                  </div>
                  <Badge className={`text-xs ${STATUS_COLOR[r.status] ?? ""}`}>{r.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ProviderDashboard({ data }: { data: Record<string, unknown> }) {
  const summary = (data.summary ?? {}) as Record<string, number>;
  const recentBids = (data.recentBids ?? []) as { id: string; requirementTitle: string; bidAmount: number; status: string }[];
  const omniScore = data.omniScore as number ?? 0;
  const trustScore = data.trustScore as number ?? 0;

  const omniColor = omniScore >= 700 ? "text-emerald-600" : omniScore >= 400 ? "text-blue-600" : "text-orange-500";
  const BID_STATUS_COLOR: Record<string, string> = {
    active: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
    accepted: "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300",
    rejected: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
    withdrawn: "bg-muted text-muted-foreground",
    envelope_a_pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-300",
    envelope_a_approved: "bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300",
  };

  const winRateData = [
    { name: "Won", value: summary.acceptedBids ?? 0 },
    { name: "Active", value: summary.activeBids ?? 0 },
    { name: "Lost/Withdrawn", value: (summary.totalBids ?? 0) - (summary.acceptedBids ?? 0) - (summary.activeBids ?? 0) },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Bids" value={summary.totalBids ?? 0} icon={<Gavel className="h-4 w-4" />} sub={`${summary.weeklyBids ?? 0} this week`} />
        <StatCard label="Win Rate" value={`${summary.winRate ?? 0}%`} icon={<Trophy className="h-4 w-4" />} sub={`${summary.acceptedBids ?? 0} won`} />
        <StatCard label="Total Earned" value={`₹${(summary.totalEarned ?? 0).toLocaleString("en-IN")}`} icon={<CreditCard className="h-4 w-4" />} sub={`₹${(summary.inEscrow ?? 0).toLocaleString("en-IN")} in escrow`} />
        <StatCard label="Avg Rating" value={summary.avgRating ? Number(summary.avgRating).toFixed(1) : "—"} icon={<Star className="h-4 w-4" />} sub={`${summary.reviewCount ?? 0} reviews`} />
      </div>

      {/* OmniScore card */}
      <Card className="bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-100">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">OmniScore™</p>
              <p className={`text-4xl font-bold mt-1 ${omniColor}`}>{omniScore}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {omniScore >= 700 ? "🏆 Elite Provider" : omniScore >= 400 ? "⭐ Rising Provider" : "🌱 Building Trust"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Trust Score</p>
              <p className="text-2xl font-bold text-blue-600 mt-1">{trustScore}</p>
              <p className="text-xs text-muted-foreground mt-1">Platform score</p>
            </div>
          </div>
          <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all" style={{ width: `${Math.min(omniScore / 10, 100)}%` }} />
          </div>
          <p className="text-xs text-muted-foreground mt-1">{omniScore}/1000 — win more bids to increase your score</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Bid Outcome Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {winRateData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={winRateData} cx="50%" cy="50%" outerRadius={75} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                    {winRateData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : <EmptyChart label="bid outcome" />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Recent Bids (Last 30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            {recentBids.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No recent bids. <a href="/requirements" className="text-primary underline">Browse requirements →</a></p>
            ) : (
              <div className="space-y-2">
                {recentBids.slice(0, 5).map(b => (
                  <div key={b.id} className="flex items-center justify-between p-2.5 rounded-lg border hover:bg-muted/30 transition-colors">
                    <div>
                      <p className="text-sm font-medium line-clamp-1">{b.requirementTitle}</p>
                      <p className="text-xs text-muted-foreground">₹{Number(b.bidAmount).toLocaleString("en-IN")}</p>
                    </div>
                    <Badge className={`text-xs ${BID_STATUS_COLOR[b.status] ?? ""}`}>{b.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function FunnelSection() {
  const { data: funnelData, isLoading } = useQuery<{ stage: string; count: number }[]>({
    queryKey: ["/analytics/funnel"],
    queryFn: async () => {
      const res = await authFetch("/analytics/funnel");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const colors = ["#6366f1", "#8b5cf6", "#a78bfa", "#10b981", "#14b8a6", "#06b6d4"];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Platform Conversion Funnel (Last 30 Days)</CardTitle>
        <CardDescription className="text-xs">From signup → work completed</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-48 w-full" /> : funnelData && funnelData.length > 0 ? (
          <div className="space-y-2">
            {funnelData.map((stage, i) => {
              const max = funnelData[0]?.count ?? 1;
              const pct = max > 0 ? Math.round((stage.count / max) * 100) : 0;
              return (
                <div key={stage.stage}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">{stage.stage}</span>
                    <span className="font-semibold">{stage.count} <span className="text-muted-foreground font-normal">({pct}%)</span></span>
                  </div>
                  <div className="h-7 rounded-md overflow-hidden bg-muted">
                    <div className="h-full rounded-md flex items-center px-2 text-xs text-white font-medium transition-all"
                      style={{ width: `${Math.max(pct, 5)}%`, backgroundColor: colors[i % colors.length] }}>
                      {pct > 20 ? stage.stage : ""}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : <EmptyChart label="funnel" />}
      </CardContent>
    </Card>
  );
}

function AdminDashboard() {
  const { data, isLoading } = useQuery<Record<string, unknown>>({
    queryKey: ["/analytics/admin"],
    queryFn: async () => {
      const res = await authFetch("/analytics/admin");
      if (!res.ok) throw new Error("Admin only");
      return res.json();
    },
  });

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" /></div>;
  if (!data) return <div className="text-center py-8 text-muted-foreground">Admin access only (trustScore ≥ 100)</div>;

  const users = data.users as Record<string, number> ?? {};
  const reqs = data.requirements as Record<string, number> ?? {};
  const bids = data.bids as Record<string, number> ?? {};
  const payments = data.payments as Record<string, number> ?? {};
  const disputes = data.disputes as Record<string, number> ?? {};
  const topSectors = (data.sectorActivity ?? data.topSectors ?? []) as { name?: string; categoryName?: string; count?: number; requirementCount?: number; floor?: number; priceFloor?: number }[];
  const topCities = (data.cityActivity ?? data.topCities ?? []) as { city: string; count: number }[];

  const sectorData = topSectors.slice(0, 8).map(s => ({ name: s.name ?? s.categoryName ?? "", count: Number(s.count ?? s.requirementCount ?? 0), floor: Number(s.floor ?? s.priceFloor ?? 0) }));
  const cityData = topCities.slice(0, 8).map(c => ({ city: c.city ?? "Unknown", count: Number(c.count) }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Users" value={users.total ?? 0} icon={<Users className="h-4 w-4" />} sub={`${users.newThisMonth ?? 0} this month`} />
        <StatCard label="Requirements" value={reqs.total ?? 0} icon={<ClipboardList className="h-4 w-4" />} sub={`${reqs.open ?? 0} open · ${reqs.completed ?? 0} done`} />
        <StatCard label="Platform Revenue" value={`₹${(payments.revenue ?? 0).toLocaleString("en-IN")}`} icon={<TrendingUp className="h-4 w-4" />} sub={`₹${(payments.volume ?? 0).toLocaleString("en-IN")} GMV`} />
        <StatCard label="Open Disputes" value={disputes.open ?? 0} icon={<AlertTriangle className="h-4 w-4" />} sub={`${disputes.total ?? 0} total`} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Verified Providers" value={users.verified ?? 0} icon={<Shield className="h-4 w-4" />} sub={`${users.providers ?? 0} total providers`} />
        <StatCard label="Total Bids" value={bids.total ?? 0} icon={<Gavel className="h-4 w-4" />} sub={`${bids.thisMonth ?? 0} this month`} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Top Sectors by Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {sectorData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={sectorData} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.12} />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={100} />
                  <Tooltip formatter={(v: number) => [v, "Requirements"]} />
                  <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart label="sector" />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Top Cities by Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {cityData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={cityData} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.12} />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="city" type="category" tick={{ fontSize: 10 }} width={80} />
                  <Tooltip formatter={(v: number) => [v, "Requirements"]} />
                  <Bar dataKey="count" fill="#10b981" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart label="city" />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Missing shield import fix
function Shield({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.955 11.955 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>;
}

export default function Analytics() {
  const { user } = useAuth();
  const [tab, setTab] = useState("overview");

  const isProvider = user?.role && ["provider", "both", "solo_provider", "agency_provider"].includes(user.role);
  const isBuyer = user?.role && ["buyer", "both", "retail_buyer", "enterprise_buyer"].includes(user.role);
  const isAdmin = (user?.trustScore ?? 0) >= 100 || user?.email?.endsWith?.("@omnibid.admin");

  const { data: dashData, isLoading: dashLoading, refetch } = useQuery<Record<string, unknown>>({
    queryKey: ["/analytics/dashboard"],
    queryFn: async () => {
      const res = await authFetch("/analytics/dashboard");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!user,
  });

  if (!user) {
    return (
      <Layout>
        <div className="text-center py-16 text-muted-foreground">Please log in to view analytics.</div>
      </Layout>
    );
  }

  const ROLE_LABEL: Record<string, string> = {
    retail_buyer: "Retail Buyer", enterprise_buyer: "Enterprise Buyer",
    solo_provider: "Solo Provider", agency_provider: "Agency Provider",
    buyer: "Buyer", provider: "Provider", both: "Both",
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Analytics</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Insights for your <Badge variant="secondary" className="text-xs">{ROLE_LABEL[user.role ?? ""] ?? user.role}</Badge> account
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="funnel">Funnel</TabsTrigger>
            {isAdmin && <TabsTrigger value="admin">Admin View</TabsTrigger>}
          </TabsList>

          <TabsContent value="overview" className="mt-6">
            {dashLoading ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[0,1,2,3].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
                </div>
                <Skeleton className="h-64 rounded-xl" />
              </div>
            ) : dashData ? (
              isBuyer ? <BuyerDashboard data={dashData} /> : isProvider ? <ProviderDashboard data={dashData} /> : (
                <div className="text-center py-8 text-muted-foreground">Dashboard not available for your role.</div>
              )
            ) : (
              <div className="text-center py-8 text-muted-foreground">Failed to load dashboard. Try refreshing.</div>
            )}
          </TabsContent>

          <TabsContent value="funnel" className="mt-6">
            <FunnelSection />
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Key Metrics Dictionary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    {[
                      ["Win Rate", "Bids accepted / Total bids submitted"],
                      ["Time-to-First-Bid", "Avg time from requirement posted to first bid"],
                      ["Escrow Success Rate", "% of payments released without dispute"],
                      ["OmniScore™", "Composite trust score (0–1000) based on wins, ratings, compliance"],
                      ["Repeat Usage Rate", "% of buyers who post >1 requirement"],
                      ["GMV", "Gross Merchandise Value — total escrow processed"],
                    ].map(([k, v]) => (
                      <div key={k} className="py-1.5 border-b last:border-0">
                        <p className="font-medium text-xs">{k}</p>
                        <p className="text-xs text-muted-foreground">{v}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Tracked Events</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xs text-muted-foreground space-y-1.5 columns-2">
                    {["signup_started","signup_completed","requirement_submitted","requirement_abandoned","bid_submitted","bid_accepted","negotiation_started","payment_initiated","payment_completed","escrow_released","workproof_uploaded","dispute_raised","referral_sent","referral_converted","whatsapp_bid_received","repeat_requirement_used","enterprise_rfp_created"].map(e => (
                      <div key={e} className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded break-all">{e}</div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {isAdmin && (
            <TabsContent value="admin" className="mt-6">
              <AdminDashboard />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </Layout>
  );
}
