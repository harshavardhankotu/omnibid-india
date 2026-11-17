import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface StatCardSkeletonProps {
  className?: string;
  showSubtext?: boolean;
}

export function StatCardSkeleton({ className, showSubtext = false }: StatCardSkeletonProps) {
  return (
    <Card className={cn("overflow-hidden border-border/60", className)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2 flex-1">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-24" />
            {showSubtext && <Skeleton className="h-3 w-28" />}
          </div>
          <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
        </div>
      </CardContent>
    </Card>
  );
}

interface DashboardStatsSkeletonProps {
  count?: number;
  columns?: 2 | 3 | 4 | 6;
  showSubtext?: boolean;
  className?: string;
}

export function DashboardStatsSkeleton({
  count = 4,
  columns = 4,
  showSubtext = false,
  className,
}: DashboardStatsSkeletonProps) {
  const gridCols =
    columns === 6
      ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
      : columns === 3
        ? "grid-cols-1 sm:grid-cols-3"
        : columns === 2
          ? "grid-cols-1 sm:grid-cols-2"
          : "grid-cols-2 md:grid-cols-4";

  return (
    <div
      className={cn("grid gap-3", gridCols, className)}
      role="status"
      aria-busy="true"
      aria-label="Loading dashboard statistics"
    >
      {Array.from({ length: count }).map((_, i) => (
        <StatCardSkeleton key={i} showSubtext={showSubtext} />
      ))}
    </div>
  );
}

interface RequirementCardSkeletonProps {
  variant?: "compact" | "detailed";
  className?: string;
}

export function RequirementCardSkeleton({
  variant = "compact",
  className,
}: RequirementCardSkeletonProps) {
  return (
    <Card className={cn("border border-border overflow-hidden", className)}>
      <CardContent className={cn(variant === "detailed" ? "p-5 space-y-4" : "p-4")}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <Skeleton className="h-9 w-9 rounded-lg shrink-0" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Skeleton className="h-4 w-20 rounded-full" />
                <Skeleton className="h-4 w-16 rounded-full" />
              </div>
              <Skeleton className="h-4 w-4/5" />
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-2.5 w-14" />
          </div>
        </div>

        <div className="mt-3 space-y-1.5">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>

        {variant === "detailed" && (
          <div className="flex items-center gap-2 pt-1">
            <Skeleton className="h-5 w-20 rounded-md" />
            <Skeleton className="h-5 w-24 rounded-md" />
          </div>
        )}

        <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-border">
          <div className="flex items-center gap-3">
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-3.5 w-14" />
            <Skeleton className="h-3.5 w-20" />
          </div>
          <Skeleton className="h-4 w-16 rounded-full" />
        </div>
      </CardContent>
    </Card>
  );
}

interface RequirementsListSkeletonProps {
  count?: number;
  columns?: 1 | 2 | 3;
  variant?: "compact" | "detailed";
  className?: string;
}

export function RequirementsListSkeleton({
  count = 6,
  columns = 2,
  variant = "compact",
  className,
}: RequirementsListSkeletonProps) {
  const gridCols =
    columns === 1
      ? "grid-cols-1"
      : columns === 3
        ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
        : "grid-cols-1 md:grid-cols-2";

  return (
    <div
      className={cn("grid gap-3", gridCols, className)}
      role="status"
      aria-busy="true"
      aria-label="Loading requirements list"
    >
      {Array.from({ length: count }).map((_, i) => (
        <RequirementCardSkeleton key={i} variant={variant} />
      ))}
    </div>
  );
}

export function DashboardBidRowSkeleton() {
  return (
    <div className="p-3 rounded-lg border border-border space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <div className="flex items-center gap-3">
        <Skeleton className="h-3.5 w-20" />
        <Skeleton className="h-3.5 w-16" />
      </div>
    </div>
  );
}

interface DashboardPanelSkeletonProps {
  rows?: number;
  rowType?: "requirement" | "bid" | "category";
  showHeader?: boolean;
  className?: string;
}

export function DashboardPanelSkeleton({
  rows = 3,
  rowType = "requirement",
  showHeader = true,
  className,
}: DashboardPanelSkeletonProps) {
  return (
    <Card className={className} role="status" aria-busy="true" aria-label="Loading dashboard panel">
      {showHeader && (
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-16" />
          </div>
        </CardHeader>
      )}
      <CardContent className={cn(showHeader ? "pt-0" : "pt-4", "space-y-3")}>
        {Array.from({ length: rows }).map((_, i) => {
          if (rowType === "bid") return <DashboardBidRowSkeleton key={i} />;
          if (rowType === "category") {
            return (
              <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/40">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-16" />
              </div>
            );
          }
          return <RequirementCardSkeleton key={i} />;
        })}
      </CardContent>
    </Card>
  );
}

interface DashboardSkeletonProps {
  variant?: "buyer" | "provider" | "admin";
  className?: string;
}

export function DashboardSkeleton({ variant = "buyer", className }: DashboardSkeletonProps) {
  if (variant === "admin") {
    return (
      <div className={cn("space-y-6", className)} role="status" aria-busy="true" aria-label="Loading admin dashboard">
        <DashboardStatsSkeleton count={4} columns={4} showSubtext />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-3.5 w-60" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-64 w-full rounded-lg" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3.5 w-56" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-64 w-full rounded-lg" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (variant === "provider") {
    return (
      <div className={cn("space-y-5", className)} role="status" aria-busy="true" aria-label="Loading provider dashboard">
        <Card className="border-primary/15 bg-primary/5">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-8 w-24 rounded-md" />
            </div>
            <Skeleton className="h-1.5 w-full rounded-full" />
          </CardContent>
        </Card>
        <DashboardStatsSkeleton count={4} columns={4} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DashboardPanelSkeleton rows={3} rowType="bid" />
          <DashboardPanelSkeleton rows={4} rowType="category" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-5", className)} role="status" aria-busy="true" aria-label="Loading buyer dashboard">
      <DashboardStatsSkeleton count={4} columns={4} />
      <DashboardPanelSkeleton rows={3} rowType="requirement" />
    </div>
  );
}
