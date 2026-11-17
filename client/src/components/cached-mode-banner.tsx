import { DatabaseBackup, RefreshCw, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface CachedModeBannerProps {
  isCachedMode: boolean;
  isOffline: boolean;
  hasSnapshot: boolean;
  lastSyncedAt: string | null;
  isFetching?: boolean;
  onRetrySync?: () => void;
}

export function CachedModeBanner({
  isCachedMode,
  isOffline,
  hasSnapshot,
  lastSyncedAt,
  isFetching = false,
  onRetrySync,
}: CachedModeBannerProps) {
  if (!isCachedMode) return null;

  const formattedTime = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm"
      role="status"
      aria-live="polite"
      data-testid="banner-cached-mode"
    >
      <div className="flex items-start sm:items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0 text-amber-700 dark:text-amber-300">
          {isOffline ? <WifiOff className="h-4 w-4" /> : <DatabaseBackup className="h-4 w-4" />}
        </div>
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className="bg-amber-600 hover:bg-amber-600 text-white text-[10px] font-semibold uppercase tracking-wider px-2 py-0">
              Cached Mode
            </Badge>
            <span className="font-semibold text-amber-900 dark:text-amber-200 text-xs sm:text-sm">
              {isOffline ? "You are offline" : "Using cached dashboard state"}
            </span>
            {formattedTime && (
              <span className="text-xs text-amber-800/80 dark:text-amber-300/80" data-testid="text-cached-timestamp">
                • Last fetched {formattedTime}
              </span>
            )}
          </div>
          <p className="text-xs text-amber-800/85 dark:text-amber-300/80">
            {hasSnapshot
              ? "Showing the last fetched dashboard snapshot from PWA cache. Write actions stay paused until you reconnect."
              : "No cached dashboard snapshot has been saved yet. Connect once to sync your dashboard for offline viewing."}
          </p>
        </div>
      </div>

      {onRetrySync && (
        <Button
          size="sm"
          variant="outline"
          onClick={onRetrySync}
          disabled={isOffline || isFetching}
          className="shrink-0 h-8 border-amber-500/40 text-amber-900 dark:text-amber-200 hover:bg-amber-500/20"
          data-testid="button-retry-sync"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
          {isOffline ? "Waiting for network" : isFetching ? "Syncing..." : "Sync Live"}
        </Button>
      )}
    </div>
  );
}
