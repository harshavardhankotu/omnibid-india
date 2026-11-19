import { useState } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/layout";
import { RequirementCard } from "@/components/requirement-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RequirementsListSkeleton } from "@/components/loading-skeletons";
import { useListCategories, useListRequirements } from "@omnibid/api-client-react";
import { useAuth } from "@/lib/auth";
import { PlusCircle, Search, SlidersHorizontal } from "lucide-react";

export default function Requirements() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [categoryId, setCategoryId] = useState<string>("all");
  const [city, setCity] = useState("");
  const [search, setSearch] = useState("");

  const { data: categories } = useListCategories();
  const { data, isLoading } = useListRequirements({
    categoryId: categoryId !== "all" ? categoryId : undefined,
    city: city || undefined,
    limit: 30,
  });

  const categoryList = Array.isArray(categories) ? categories : [];
  const requirements = Array.isArray(data?.requirements) ? data.requirements : [];
  const filtered = search
    ? requirements.filter(
        (r) =>
          r.title.toLowerCase().includes(search.toLowerCase()) ||
          r.description.toLowerCase().includes(search.toLowerCase())
      )
    : requirements;

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Open Requirements</h1>
            <p className="text-sm text-muted-foreground">
              {data?.total ?? 0} active {data?.total === 1 ? "requirement" : "requirements"} waiting for bids
            </p>
          </div>
          {user && (["buyer", "both", "retail_buyer", "enterprise_buyer"].includes(user.role)) && (
            <Button onClick={() => setLocation("/requirements/new")} data-testid="button-post-problem">
              <PlusCircle className="h-4 w-4 mr-1.5" />
              Post Problem
            </Button>
          )}
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search requirements..."
              className="pl-8 h-9 text-sm"
              data-testid="input-search"
            />
          </div>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="w-44 h-9 text-sm" data-testid="select-category">
              <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categoryList.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="City..."
            className="w-36 h-9 text-sm"
            data-testid="input-city"
          />
        </div>

        {isLoading ? (
          <RequirementsListSkeleton count={8} columns={2} />
        ) : filtered.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filtered.map((req) => (
              <RequirementCard key={req.id} requirement={req} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 text-muted-foreground">
            <Search className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No requirements found</p>
            <p className="text-sm mt-1">Try changing the filters</p>
          </div>
        )}
      </div>
    </Layout>
  );
}
