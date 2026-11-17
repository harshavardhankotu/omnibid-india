import { useState } from "react";
import Layout from "@/components/layout";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import {
  TrendingUp, MapPin, Clock, Target, Eye, Users, BarChart3, Lightbulb,
  Building2, AlertCircle,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
function authFetch(path: string) {
  const token = localStorage.getItem("omnibid_token");
  return fetch(`${BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
}

const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;

const CATEGORIES = [
  { slug: "home", name: "Home Services" }, { slug: "logistics", name: "Logistics" },
  { slug: "events", name: "Events" }, { slug: "tech", name: "Tech & IT" },
  { slug: "healthcare", name: "Healthcare" }, { slug: "education", name: "Education" },
  { slug: "construction", name: "Construction" }, { slug: "consulting", name: "Consulting" },
  { slug: "security", name: "Security" }, { slug: "hospitality", name: "Hospitality" },
];

const saturationColors: Record<string, string> = {
  high: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
  medium: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-300",
  low: "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300",
};

export default function MarketIntelligence() {
  const { user } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState("all");

  const isProvider = ["provider", "both", "solo_provider", "agency_provider"].includes(user?.role ?? "");
  const isBuyer = ["buyer", "both", "retail_buyer", "enterprise_buyer"].includes(user?.role ?? "");

  const { data, isLoading } = useQuery({
    queryKey: ["market-intelligence", selectedCategory],
    queryFn: () =>
      authFetch(`/api/market/intelligence${selectedCategory && selectedCategory !== "all" ? `?categorySlug=${selectedCategory}` : ""}`).then(r => r.json()),
    enabled: !!user,
  });

  if (!user) {
    return <Layout><div className="py-24 text-center text-muted-foreground">Please log in to view market intelligence.</div></Layout>;
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-primary" />
              Market Intelligence
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {isProvider ? "Competitor data · Winning bid ranges · Best bidding windows" : "Supplier depth · Regional availability · Category trends"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {CATEGORIES.map(c => <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Badge variant="outline" className="text-xs">{user.role}</Badge>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-48 bg-muted/40 rounded-xl animate-pulse" />)}
          </div>
        ) : (
          <>
            {/* Provider-specific insights */}
            {isProvider && data?.providerView && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Card className="border-blue-200 bg-blue-50/40 dark:border-blue-900 dark:bg-blue-950/20">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-blue-700 dark:text-blue-400 flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        Best Bid Window
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="font-semibold text-sm">{data.providerView.recommendedBidWindow}</p>
                      <p className="text-xs text-muted-foreground mt-1">Highest acceptance rate by time of day</p>
                    </CardContent>
                  </Card>

                  <Card className="border-green-200 bg-green-50/40 dark:border-green-900 dark:bg-green-950/20">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-green-700 dark:text-green-400 flex items-center gap-1">
                        <Target className="h-4 w-4" />
                        Winning Bid Range
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="font-semibold text-sm">{data.providerView.avgWinningBidDiscount}</p>
                      <p className="text-xs text-muted-foreground mt-1">vs. buyer's max budget</p>
                    </CardContent>
                  </Card>

                  <Card className="border-purple-200 bg-purple-50/40 dark:border-purple-900 dark:bg-purple-950/20">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-purple-700 dark:text-purple-400 flex items-center gap-1">
                        <TrendingUp className="h-4 w-4" />
                        Competitiveness Index
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="font-semibold text-2xl">{data.providerView.competitivenessIndex}<span className="text-sm text-muted-foreground">/100</span></p>
                      <p className="text-xs text-muted-foreground mt-1">Platform-wide provider density</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Tip banner */}
                <div className="bg-amber-50 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-start gap-3">
                  <Lightbulb className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800 dark:text-amber-200">{data.providerView.tip}</p>
                </div>

                {/* Market saturation by sector */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Eye className="h-4 w-4" />
                      Market Saturation by Sector
                    </CardTitle>
                    <CardDescription>Open requirements right now — low saturation = more opportunity</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {(data.providerView.marketSaturation as Array<{ category: string; slug: string; openRequirements: number; saturationLevel: string }>).slice(0, 8).map(s => (
                        <div key={s.slug} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/40 transition-colors">
                          <span className="text-sm font-medium">{s.category}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-sm text-muted-foreground">{s.openRequirements} open</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${saturationColors[s.saturationLevel]}`}>
                              {s.saturationLevel}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Bid window analysis chart */}
                {data.providerView.bidWindowAnalysis?.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Bid Success Rate by Hour
                      </CardTitle>
                      <CardDescription>Higher bars = more successful bid submissions</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={data.providerView.bidWindowAnalysis}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip formatter={(v: unknown) => [`${v}%`, "Success Rate"]} />
                          <Bar dataKey="successRate" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            {/* Buyer-specific insights */}
            {isBuyer && data?.buyerView && (
              <>
                {/* Supplier depth */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Supplier Depth by Category
                    </CardTitle>
                    <CardDescription>How competitive your categories are across the platform</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {data.buyerView.supplierDepth?.length > 0 ? (
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={data.buyerView.supplierDepth.slice(0, 8)}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis dataKey="slug" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip formatter={(v: unknown, name: string) => [name === "avgBidsPerRequirement" ? `${v} bids/req` : fmt(Number(v)), name === "avgBidsPerRequirement" ? "Avg Bids" : "Avg Budget"]} />
                          <Bar dataKey="avgWinningBid" fill="#10b981" name="avgWinningBid" radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-sm text-muted-foreground py-4 text-center">Post requirements to see supplier depth data</p>
                    )}
                  </CardContent>
                </Card>

                {/* Regional supply availability */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      Regional Supply Availability
                    </CardTitle>
                    <CardDescription>Cities with the most active requirements</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {(data.buyerView.regionalSupplyAvailability as Array<{ city: string; requirementCount: number; avgBudget: number; supplyStrength: string }>).map(c => (
                        <div key={c.city} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/40">
                          <div className="flex items-center gap-2">
                            <MapPin className="h-3 w-3 text-muted-foreground" />
                            <span className="text-sm font-medium">{c.city}</span>
                            <span className="text-xs text-muted-foreground">{c.requirementCount} requirements</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{fmt(c.avgBudget)} avg</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${saturationColors[c.supplyStrength === "strong" ? "low" : c.supplyStrength === "moderate" ? "medium" : "high"]}`}>
                              {c.supplyStrength}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Enterprise intel */}
                {user.role === "enterprise_buyer" && (
                  <Card className="border-purple-200">
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2 text-purple-700">
                        <Building2 className="h-4 w-4" />
                        Enterprise Intelligence
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                          <p className="text-2xl font-bold">{data.marketStats?.reduce((s: number, m: { totalRequirements: number }) => s + m.totalRequirements, 0) ?? 0}</p>
                          <p className="text-xs text-muted-foreground">Total active requirements (30d)</p>
                        </div>
                        <div>
                          <p className="text-2xl font-bold">{data.cityDemand?.length ?? 0}</p>
                          <p className="text-xs text-muted-foreground">Active cities</p>
                        </div>
                        <div>
                          <p className="text-2xl font-bold">{data.marketStats?.length ?? 0}</p>
                          <p className="text-xs text-muted-foreground">Categories tracked</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            {/* Market stats table — all roles */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Category Market Stats (Last 30 Days)</CardTitle>
              </CardHeader>
              <CardContent>
                {data?.marketStats?.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 font-medium text-muted-foreground">Category</th>
                          <th className="text-right py-2 font-medium text-muted-foreground">Requirements</th>
                          <th className="text-right py-2 font-medium text-muted-foreground">Avg Budget</th>
                          <th className="text-right py-2 font-medium text-muted-foreground">Avg Winning Bid</th>
                          <th className="text-right py-2 font-medium text-muted-foreground">Price Floor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(data.marketStats as Array<{ categoryName: string; categorySlug: string; totalRequirements: number; avgBudget: number; avgWinningBid: number; priceFloor: number }>).map((s) => (
                          <tr key={s.categorySlug} className="border-b hover:bg-muted/30 transition-colors">
                            <td className="py-2 font-medium">{s.categoryName}</td>
                            <td className="py-2 text-right">{s.totalRequirements}</td>
                            <td className="py-2 text-right">{fmt(s.avgBudget)}</td>
                            <td className="py-2 text-right text-green-600">{s.avgWinningBid ? fmt(s.avgWinningBid) : "—"}</td>
                            <td className="py-2 text-right text-muted-foreground">{fmt(s.priceFloor)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground py-4">
                    <AlertCircle className="h-4 w-4" />
                    <span className="text-sm">No market data available yet — activity will populate here once requirements are posted.</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Privacy notice */}
            <p className="text-xs text-muted-foreground text-center">
              Competitor intelligence shows aggregated market data only. No individual bid amounts, identities, or sealed bids are revealed.
            </p>
          </>
        )}
      </div>
    </Layout>
  );
}
