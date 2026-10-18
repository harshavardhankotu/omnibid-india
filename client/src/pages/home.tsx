import { useState } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/layout";
import { RequirementCard } from "@/components/requirement-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useListCategories, useListRequirements } from "@omnibid/api-client-react";
import { getCategoryIcon } from "@/lib/category-icons";
import { useAuth } from "@/lib/auth";
import {
  ArrowRight,
  ChevronRight,
  Gavel,
  Search,
  Shield,
  TrendingDown,
  Zap,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";

export default function Home() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { t } = useI18n();
  const [search, setSearch] = useState("");

  const { data: categories } = useListCategories();
  const { data: feedData, isLoading: feedLoading } = useListRequirements({ limit: 8 });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setLocation(`/requirements?search=${encodeURIComponent(search)}`);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="bg-gradient-to-br from-primary via-primary/95 to-primary/80 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
          <div className="flex items-center gap-2 mb-4">
            <Gavel className="h-8 w-8 text-amber-300" />
            <span className="text-2xl font-bold tracking-tight">OmniBid India</span>
            <Badge variant="outline" className="border-white/30 text-white text-[10px] ml-2 font-mono">
              BHARAT B2B ESCROW
            </Badge>
          </div>
          <h1 className="text-3xl md:text-5xl font-bold leading-tight mb-3">
            Post your problem.
            <br />
            <span className="text-amber-300">Watch prices drop.</span>
          </h1>
          <p className="text-white/90 text-base md:text-lg mb-6 max-w-xl">
            {t("tagline")} — verified providers compete for your business with milestone-backed escrow protection.
          </p>

          <form onSubmit={handleSearch} className="flex gap-2 max-w-lg">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/60" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="What do you need help with? (e.g. Civil Works, Steel Beams, IT Services)"
                className="pl-9 bg-white/10 border-white/20 text-white placeholder:text-white/60 focus-visible:ring-white/40"
                data-testid="input-search"
              />
            </div>
            <Button type="submit" variant="secondary" className="font-semibold shadow-md" data-testid="button-search">
              Search
            </Button>
          </form>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8 pt-6 border-t border-white/15 text-xs text-white/90">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-emerald-300 shrink-0" />
              <span>Prices fall as providers compete</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-amber-300 shrink-0" />
              <span>100% Escrow & GST Rule 46</span>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-cyan-300 shrink-0" />
              <span>Live Reverse Auction Ticker</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-purple-300 shrink-0" />
              <span>DigiLocker & KYC Verified</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Categories */}
        <section className="mb-10">
          <h2 className="text-lg font-bold mb-4">Browse by Category</h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-3">
            {categories?.map((cat) => {
              const Icon = getCategoryIcon(cat.iconName);
              return (
                <button
                  key={cat.id}
                  onClick={() => setLocation(`/requirements?categoryId=${cat.id}`)}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-primary/5 transition-all group"
                  data-testid={`button-category-${cat.slug}`}
                >
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <span className="text-xs font-medium text-center leading-tight">{cat.name}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Live Feed */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold">Live Requirements</h2>
              <Badge variant="secondary" className="text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block mr-1 animate-pulse" />
                Live
              </Badge>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setLocation("/requirements")} data-testid="button-view-all">
              View all <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>

          {feedLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-32 rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {feedData?.requirements?.map((req) => (
                <RequirementCard key={req.id} requirement={req} />
              ))}
            </div>
          )}

          {!feedLoading && (!feedData?.requirements?.length) && (
            <div className="text-center py-12 text-muted-foreground">
              <Gavel className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No open requirements yet</p>
              <p className="text-sm mt-1">Be the first to post a problem</p>
              <Button className="mt-4" onClick={() => setLocation(user ? "/requirements/new" : "/register")} data-testid="button-post-first">
                Post a Problem
              </Button>
            </div>
          )}
        </section>

        {/* How it works */}
        <section className="rounded-2xl bg-card border border-border p-6 md:p-8">
          <h2 className="text-lg font-bold mb-6 text-center">How OmniBid Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { step: "1", title: "Post Your Problem", desc: "Describe what you need with your budget and deadline. Takes 2 minutes." },
              { step: "2", title: "Providers Compete", desc: "Verified service providers bid to win your project. Prices go DOWN as they compete." },
              { step: "3", title: "Pick the Best Bid", desc: "Choose by price, rating, or speed. Accept the winner and get connected instantly." },
            ].map((item) => (
              <div key={item.step} className="flex flex-col items-center text-center">
                <div className="w-10 h-10 rounded-full bg-primary text-white font-bold text-lg flex items-center justify-center mb-3">
                  {item.step}
                </div>
                <h3 className="font-semibold mb-1">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
          {!user && (
            <div className="flex justify-center mt-6">
              <Button onClick={() => setLocation("/register")} className="font-semibold" data-testid="button-get-started">
                Get Started Free <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
