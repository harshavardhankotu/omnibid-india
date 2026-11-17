import { useQuery } from "@tanstack/react-query";
import Layout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DashboardSkeleton } from "@/components/loading-skeletons";
import { CachedModeBanner } from "@/components/cached-mode-banner";
import { useDashboardCache } from "@/hooks/use-dashboard-cache";
import { useAuth } from "@/lib/auth";
import { Link } from "wouter";
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  TrendingUp,
  AlertTriangle,
  Settings,
  Shield,
  Layers,
  MapPin,
  IndianRupee,
  Activity,
  ArrowRight,
  Database,
} from "lucide-react";

const TOKEN_KEY = "omnibid_token";

function authFetch(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  return fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
}

type FinancialsRow = {
  reporting_month: string;
  total_payments: string;
  gross_transaction_volume_gtv: string;
  total_platform_fees_collected: string;
  total_tds_withheld: string;
  total_net_provider_payouts: string;
};

type SectorAnalyticsRow = {
  sector_name: string;
  sector_slug: string;
  total_requirements: number;
  avg_min_bid_floor: string;
  avg_winning_bid_amount: string;
  bid_density: string;
};

type TrustDisputesRow = {
  sector_name: string;
  sector_slug: string;
  total_payments: number;
  total_disputes: number;
  dispute_rate: string;
  total_frozen_capital: string;
};

type AdminDashboardData = {
  financials: FinancialsRow[];
  sectorAnalytics: SectorAnalyticsRow[];
  trustDisputes: TrustDisputesRow[];
};

function StatCard({
  label,
  value,
  sub,
  icon,
  className = "",
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={`overflow-hidden border-border/60 transition-all duration-300 hover:shadow-lg hover:border-primary/20 ${className}`}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
            <p className="text-3xl font-bold mt-2 tracking-tight">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1.5 font-medium">{sub}</p>}
          </div>
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-inner">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard() {
  const { user } = useAuth();

  const isAdmin = (user?.trustScore ?? 0) >= 100 || user?.email?.endsWith?.("@omnibid.admin");

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery<AdminDashboardData>({
    queryKey: ["/analytics/admin-dashboard"],
    queryFn: async () => {
      const res = await authFetch("/analytics/admin-dashboard");
      if (!res.ok) throw new Error("Unauthorized access to admin dashboard");
      return res.json();
    },
    enabled: !!user && isAdmin,
  });

  const {
    effectiveData,
    isCachedMode,
    isOffline,
    lastSyncedAt,
    hasSnapshot,
    isLoadingEffective,
    retrySync,
  } = useDashboardCache({
    cacheKey: "admin-analytics",
    apiPath: "/api/analytics/admin-dashboard",
    userId: user?.id,
    data,
    isLoading,
    isError,
    isFetching,
    refetch,
  });

  if (!user) {
    return (
      <Layout>
        <div className="text-center py-16 text-muted-foreground">Please log in to proceed.</div>
      </Layout>
    );
  }

  if (!isAdmin) {
    return (
      <Layout>
        <div className="text-center py-16 max-w-md mx-auto space-y-4">
          <Shield className="h-14 w-14 text-red-500 mx-auto animate-pulse" />
          <h2 className="text-2xl font-bold tracking-tight">Access Denied</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Your account does not possess sufficient administrator security clearance (trust_score ≥ 100).
          </p>
          <div className="p-3 bg-muted rounded-xl text-xs text-muted-foreground border border-border/50">
            Demo Tip: Visit the QA page to instantly escalate your account privileges.
          </div>
        </div>
      </Layout>
    );
  }

  // Pre-calculate aggregates
  const totalGtv = effectiveData?.financials.reduce((acc, f) => acc + Number(f.gross_transaction_volume_gtv), 0) ?? 0;
  const totalRevenue = effectiveData?.financials.reduce((acc, f) => acc + Number(f.total_platform_fees_collected), 0) ?? 0;
  
  const totalFrozen = effectiveData?.trustDisputes.reduce((acc, t) => acc + Number(t.total_frozen_capital), 0) ?? 0;
  
  const totalPayments = effectiveData?.trustDisputes.reduce((acc, t) => acc + Number(t.total_payments), 0) ?? 0;
  const totalDisputes = effectiveData?.trustDisputes.reduce((acc, t) => acc + Number(t.total_disputes), 0) ?? 0;
  const overallDisputeRate = totalPayments > 0 ? (totalDisputes / totalPayments) * 100 : 0;

  // Format chart data
  const gtvChartData = [...(effectiveData?.financials ?? [])]
    .reverse()
    .map(f => ({
      month: new Date(f.reporting_month).toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
      GTV: Math.round(Number(f.gross_transaction_volume_gtv) / 100000), // convert to Lakhs
      Revenue: Math.round(Number(f.total_platform_fees_collected) / 100000) // convert to Lakhs
    }));

  const sectorChartData = (effectiveData?.sectorAnalytics ?? [])
    .map(s => ({
      sector: s.sector_name.split(" & ")[0],
      "Bid Density": parseFloat(s.bid_density)
    }));

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Page Title & Navigation Banner */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/50 pb-5">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-violet-600/10 flex items-center justify-center shadow-sm">
              <Activity className="h-5 w-5 text-violet-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Admin Analytics Dashboard</h1>
              <p className="text-muted-foreground text-sm">Real-time analytical visualizations via live SQL views</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/admin">
              <a className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary transition-colors border border-border/80 rounded-lg px-3 py-1.5 bg-background">
                <Settings className="h-3.5 w-3.5" />
                Control Panel
                <ArrowRight className="h-3 w-3" />
              </a>
            </Link>
            <Badge className={`${isCachedMode ? "bg-amber-600 hover:bg-amber-700" : "bg-violet-600 hover:bg-violet-700"} text-white font-medium px-2.5 py-0.5 shadow-sm shadow-violet-500/15`}>
              {isCachedMode ? "Cached Snapshot" : "✨ SQL Live"}
            </Badge>
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

        {isLoadingEffective ? (
          <DashboardSkeleton variant="admin" />
        ) : (error && !effectiveData) || !effectiveData ? (
          <Card className="border-red-200 bg-red-50/20 dark:bg-red-950/10">
            <CardContent className="p-6 text-center text-red-600 dark:text-red-400">
              <AlertTriangle className="h-10 w-10 mx-auto mb-2" />
              <p className="font-semibold">Failed to fetch database views</p>
              <p className="text-xs text-muted-foreground mt-1">Make sure you have provisioned and executed `drizzle/migrations/analytics_views.sql` against the Supabase database.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* KPI Cards Section */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                label="Total Platform GTV"
                value={`₹${(totalGtv).toLocaleString("en-IN")}`}
                sub="Platform aggregate value"
                icon={<TrendingUp className="h-4.5 w-4.5" />}
              />
              <StatCard
                label="Escrow Frozen Capital"
                value={`₹${(totalFrozen).toLocaleString("en-IN")}`}
                sub="Funds locked in disputes"
                icon={<LockIcon className="h-4.5 w-4.5 text-violet-600" />}
                className="ring-2 ring-violet-500/20 border-violet-500/30 bg-violet-500/[0.02]"
              />
              <StatCard
                label="Dispute Frequency"
                value={`${overallDisputeRate.toFixed(2)}%`}
                sub={`${totalDisputes} active/total disputes`}
                icon={<AlertTriangle className="h-4.5 w-4.5 text-red-500" />}
              />
              <StatCard
                label="Platform Revenue (2%)"
                value={`₹${(totalRevenue).toLocaleString("en-IN")}`}
                sub="Success fees collected"
                icon={<IndianRupee className="h-4.5 w-4.5 text-green-500" />}
              />
            </div>

            {/* Visual Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Financial GTV Line-Bar Chart */}
              <Card className="border-border/60 shadow-sm">
                <CardHeader className="pb-3 border-b border-border/40">
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-violet-600" />
                    Gross Transaction Volume & Revenue Over Time
                  </CardTitle>
                  <CardDescription className="text-xs">Month-by-month GTV and platform commission (in Lakhs ₹)</CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsBarChart data={gtvChartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                        <XAxis dataKey="month" fontSize={11} tickLine={false} />
                        <YAxis fontSize={11} tickLine={false} label={{ value: "Lakhs (₹)", angle: -90, position: "insideLeft", offset: 10, fontSize: 10 }} />
                        <Tooltip formatter={(value) => [`₹${value} Lakhs`]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="GTV" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={45} />
                        <Bar dataKey="Revenue" fill="hsl(var(--violet-600, 262.1 83.3% 57.8%))" radius={[4, 4, 0, 0]} maxBarSize={45} />
                      </RechartsBarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Sector Bid Density Chart */}
              <Card className="border-border/60 shadow-sm">
                <CardHeader className="pb-3 border-b border-border/40">
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <Layers className="h-4 w-4 text-violet-600" />
                    Bidding Activity: Sector Bid Density
                  </CardTitle>
                  <CardDescription className="text-xs">Average number of bids received per requirement across sectors</CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsBarChart data={sectorChartData} margin={{ top: 5, right: 10, left: -25, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                        <XAxis dataKey="sector" fontSize={10} tickLine={false} />
                        <YAxis fontSize={11} tickLine={false} label={{ value: "Bids / Listing", angle: -90, position: "insideLeft", offset: 10, fontSize: 10 }} />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                        <Bar dataKey="Bid Density" fill="hsl(262.1 83.3% 57.8%)" radius={[4, 4, 0, 0]} maxBarSize={45} />
                      </RechartsBarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Raw SQL Views Data Audit Tables */}
            <div className="space-y-6 pt-2">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-semibold tracking-tight text-lg">Live PostgreSQL Transformation Views (Power BI Feed Audit)</h3>
              </div>

              {/* Sector Performance Table */}
              <Card className="border-border/60">
                <CardHeader className="pb-3 border-b border-border/40">
                  <CardTitle className="text-sm font-bold flex items-center gap-1.5">
                    <Layers className="h-4 w-4 text-violet-600" />
                    Sector KPI Performance Matrix (`vw_sector_analytics`)
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                  <table className="w-full text-sm border-collapse text-left">
                    <thead>
                      <tr className="border-b bg-muted/40 font-medium text-xs text-muted-foreground uppercase tracking-wider">
                        <th className="p-3.5 pl-6">Sector Name</th>
                        <th className="p-3.5">Listing Volume</th>
                        <th className="p-3.5">Avg Price Floor</th>
                        <th className="p-3.5">Avg Winning Bid</th>
                        <th className="p-3.5 pr-6">Bid Density</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {effectiveData.sectorAnalytics.map((s, idx) => (
                        <tr key={s.sector_slug ?? idx} className="hover:bg-muted/10 transition-colors">
                          <td className="p-3.5 pl-6 font-semibold">{s.sector_name}</td>
                          <td className="p-3.5 font-medium">{s.total_requirements} projects</td>
                          <td className="p-3.5">₹{Number(s.avg_min_bid_floor).toLocaleString("en-IN")}</td>
                          <td className="p-3.5 font-semibold text-green-600">₹{Number(s.avg_winning_bid_amount).toLocaleString("en-IN")}</td>
                          <td className="p-3.5 pr-6 font-bold text-violet-600">{Number(s.bid_density).toFixed(2)} bids/listing</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              {/* Trust & Dispute Health Table */}
              <Card className="border-border/60">
                <CardHeader className="pb-3 border-b border-border/40">
                  <CardTitle className="text-sm font-bold flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                    Escrow Trust & Dispute Health Ledger (`vw_trust_and_disputes`)
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                  <table className="w-full text-sm border-collapse text-left">
                    <thead>
                      <tr className="border-b bg-muted/40 font-medium text-xs text-muted-foreground uppercase tracking-wider">
                        <th className="p-3.5 pl-6">Sector Name</th>
                        <th className="p-3.5">Total Payments</th>
                        <th className="p-3.5">Total Disputes</th>
                        <th className="p-3.5">Dispute Rate</th>
                        <th className="p-3.5 pr-6">Total Frozen Capital</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {effectiveData.trustDisputes.map((t, idx) => (
                        <tr key={t.sector_slug ?? idx} className="hover:bg-muted/10 transition-colors">
                          <td className="p-3.5 pl-6 font-semibold">{t.sector_name}</td>
                          <td className="p-3.5 font-medium">{t.total_payments} payments</td>
                          <td className="p-3.5 text-red-500 font-semibold">{t.total_disputes} disputes</td>
                          <td className={`p-3.5 font-bold ${Number(t.dispute_rate) > 0.05 ? "text-red-500" : "text-muted-foreground"}`}>
                            {(Number(t.dispute_rate) * 100).toFixed(2)}%
                          </td>
                          <td className="p-3.5 pr-6 font-bold text-violet-600 bg-violet-500/[0.01]">
                            ₹{Number(t.total_frozen_capital).toLocaleString("en-IN")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
