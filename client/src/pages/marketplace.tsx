import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Filter, ShieldCheck, Clock, ArrowRight, Briefcase } from "lucide-react";

interface RequirementItem {
  id: string;
  title: string;
  sector: "IT" | "Construction" | "Logistics" | "Legal";
  budget: string | number;
  timeline: string;
  status: string;
  customData?: Record<string, any>;
  bidsCount?: number;
  createdAt: string;
}

export default function MarketplacePage() {
  const [selectedSector, setSelectedSector] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [maxBudget, setMaxBudget] = useState<number>(2000000);

  const { data: requirements = [], isLoading } = useQuery<RequirementItem[]>({
    queryKey: ["/api/requirements"],
  });

  const filteredRequirements = requirements.filter((item) => {
    const matchesSector = selectedSector === "all" || item.sector?.toLowerCase() === selectedSector.toLowerCase();
    const matchesSearch =
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      JSON.stringify(item.customData || {}).toLowerCase().includes(searchQuery.toLowerCase());
    const budgetNum = typeof item.budget === "string" ? parseFloat(item.budget) : item.budget;
    const matchesBudget = !budgetNum || budgetNum <= maxBudget;
    return matchesSector && matchesSearch && matchesBudget;
  });

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
              🇮🇳 Pan-India Live Marketplace
            </Badge>
            <Badge variant="secondary" className="text-xs">
              Zero-Trust Escrow Protected
            </Badge>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
            B2B Contract & Procurement Marketplace
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Browse verified commercial contracts across IT, Civil Works, Freight Logistics, and Legal retainers.
          </p>
        </div>

        {/* Sector Tabs */}
        <Tabs defaultValue="all" value={selectedSector} onValueChange={setSelectedSector} className="mb-6">
          <TabsList className="grid grid-cols-5 w-full max-w-2xl bg-muted/80 p-1">
            <TabsTrigger value="all">All Sectors</TabsTrigger>
            <TabsTrigger value="IT">IT & Tech</TabsTrigger>
            <TabsTrigger value="Construction">Civil Works</TabsTrigger>
            <TabsTrigger value="Logistics">Logistics</TabsTrigger>
            <TabsTrigger value="Legal">Legal</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Filters & Search Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 bg-card border rounded-xl p-4 shadow-sm">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by keywords, tech stack, concrete grade..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Filter className="h-3 w-3" /> Max Budget Filter:</span>
              <span className="font-semibold text-foreground">₹{maxBudget.toLocaleString("en-IN")}</span>
            </div>
            <Slider
              min={50000}
              max={5000000}
              step={50000}
              value={[maxBudget]}
              onValueChange={(val) => setMaxBudget(val[0])}
            />
          </div>

          <div className="flex items-center justify-end">
            <span className="text-xs text-muted-foreground">
              Showing <strong>{filteredRequirements.length}</strong> active contracts
            </span>
          </div>
        </div>

        {/* Requirements Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-64 rounded-xl bg-muted animate-pulse border" />
            ))}
          </div>
        ) : filteredRequirements.length === 0 ? (
          <div className="text-center py-16 border rounded-xl bg-card">
            <Briefcase className="mx-auto h-12 w-12 text-muted-foreground opacity-50 mb-3" />
            <h3 className="text-lg font-medium text-foreground">No matching contracts found</h3>
            <p className="text-sm text-muted-foreground mt-1">Try adjusting your sector filter or increasing budget range.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredRequirements.map((req) => (
              <Card key={req.id} className="hover:shadow-md transition-shadow border flex flex-col justify-between">
                <CardHeader>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <Badge variant="outline" className="font-medium text-xs">
                      {req.sector}
                    </Badge>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {req.timeline}
                    </span>
                  </div>
                  <CardTitle className="text-base font-bold line-clamp-2 hover:text-primary transition-colors">
                    {req.title}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Status: <span className="capitalize font-semibold text-foreground">{req.status}</span>
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Dynamic JSONB Spec Preview */}
                  {req.customData && Object.keys(req.customData).length > 0 && (
                    <div className="bg-muted/50 rounded-lg p-2.5 text-xs space-y-1">
                      <div className="font-semibold text-muted-foreground flex items-center gap-1">
                        <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Sector Constraints:
                      </div>
                      {Object.entries(req.customData).slice(0, 2).map(([k, v]) => (
                        <div key={k} className="text-foreground truncate">
                          <span className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}:</span>{" "}
                          {Array.isArray(v) ? v.join(", ") : String(v)}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="pt-2 border-t flex items-center justify-between">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Target Budget</div>
                      <div className="text-lg font-extrabold text-foreground">
                        ₹{parseFloat(String(req.budget || "0")).toLocaleString("en-IN")}
                      </div>
                    </div>
                    <Link href={`/requirements/${req.id}`}>
                      <Button size="sm" className="gap-1 shadow-sm">
                        View & Bid <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
