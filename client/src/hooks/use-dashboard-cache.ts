import { useCallback, useEffect, useMemo, useState } from "react";
import { useOnlineStatus } from "@/hooks/use-pwa";

const STORAGE_PREFIX = "omnibid_pwa_dashboard_snapshot:";
const SW_DASHBOARD_CACHE = "omnibid-dashboard-v1";

interface DashboardSnapshot<T> {
  data: T;
  cachedAt: string;
}

function buildStorageKey(cacheKey: string, userId?: string | number | null): string {
  return `${STORAGE_PREFIX}${cacheKey}:${userId ?? "anon"}`;
}

function readSnapshot<T>(storageKey: string): DashboardSnapshot<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DashboardSnapshot<T>;
    if (parsed && typeof parsed === "object" && "data" in parsed && typeof parsed.cachedAt === "string") {
      return parsed;
    }
  } catch {
    // Ignore corrupted storage entries
  }
  return null;
}

function writeSnapshot<T>(storageKey: string, snapshot: DashboardSnapshot<T>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(snapshot));
  } catch {
    // Ignore storage quota errors gracefully
  }
}

export function clearDashboardSnapshots(): void {
  if (typeof window === "undefined") return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX)) {
        keysToRemove.push(k);
      }
    }
    for (const k of keysToRemove) {
      window.localStorage.removeItem(k);
    }
    if ("caches" in window) {
      void window.caches.delete(SW_DASHBOARD_CACHE);
    }
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.controller?.postMessage({ type: "CLEAR_DASHBOARD_CACHE" });
    }
  } catch {
    // Ignore cleanup errors
  }
}

interface UseDashboardCacheOptions<T> {
  cacheKey: string;
  apiPath?: string;
  userId?: string | number | null;
  data: T | undefined;
  isLoading: boolean;
  isError?: boolean;
  isFetching?: boolean;
  refetch?: () => unknown;
}

export function useDashboardCache<T>({
  cacheKey,
  apiPath,
  userId,
  data,
  isLoading,
  isError = false,
  isFetching = false,
  refetch,
}: UseDashboardCacheOptions<T>) {
  const isOnline = useOnlineStatus();
  const storageKey = useMemo(() => buildStorageKey(cacheKey, userId), [cacheKey, userId]);

  const [snapshot, setSnapshot] = useState<DashboardSnapshot<T> | null>(() => readSnapshot<T>(storageKey));
  const [swServedCache, setSwServedCache] = useState(false);
  const [swCachedAt, setSwCachedAt] = useState<string | null>(null);

  // Sync snapshot state if user/storageKey changes
  useEffect(() => {
    setSnapshot(readSnapshot<T>(storageKey));
  }, [storageKey]);

  // Listen for Service Worker fallback cache telemetry messages
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "SW_CACHED_RESPONSE") {
        if (!apiPath || event.data?.path === apiPath) {
          setSwServedCache(true);
          if (typeof event.data?.cachedAt === "string") {
            setSwCachedAt(event.data.cachedAt);
          }
        }
      }
    };

    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () => navigator.serviceWorker.removeEventListener("message", handleMessage);
  }, [apiPath]);

  // If no localStorage snapshot exists yet and we are offline, hydrate from the PWA Service Worker CacheStorage
  useEffect(() => {
    if (typeof window === "undefined" || !apiPath || !("caches" in window)) return;
    if (data !== undefined || snapshot !== null) return;

    let cancelled = false;
    (async () => {
      try {
        const cache = await window.caches.open(SW_DASHBOARD_CACHE);
        const matched = await cache.match(apiPath);
        if (!matched || cancelled) return;
        const json = (await matched.json()) as T;
        const cachedAt = matched.headers.get("date") || new Date().toISOString();
        if (!cancelled && json) {
          const hydrated: DashboardSnapshot<T> = { data: json, cachedAt };
          setSnapshot(hydrated);
          writeSnapshot(storageKey, hydrated);
        }
      } catch {
        // Cache API unavailable or empty
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiPath, data, snapshot, storageKey]);

  // Persist fresh live data whenever online and query resolves cleanly
  useEffect(() => {
    if (data !== undefined && isOnline && !swServedCache) {
      const next: DashboardSnapshot<T> = {
        data,
        cachedAt: new Date().toISOString(),
      };
      setSnapshot(next);
      writeSnapshot(storageKey, next);
    }
  }, [data, isOnline, swServedCache, storageKey]);

  // Reset SW-cached flag and refresh once connection returns
  useEffect(() => {
    if (isOnline && swServedCache) {
      setSwServedCache(false);
      refetch?.();
    }
  }, [isOnline, swServedCache, refetch]);

  const retrySync = useCallback(() => {
    if (!isOnline) return;
    setSwServedCache(false);
    void refetch?.();
  }, [isOnline, refetch]);

  const effectiveData = data ?? snapshot?.data;
  const isOffline = !isOnline;
  const isCachedMode = isOffline || swServedCache || (isError && snapshot !== null);
  const lastSyncedAt = snapshot?.cachedAt ?? swCachedAt ?? null;
  const hasSnapshot = effectiveData !== undefined;
  const isLoadingEffective = isLoading && !hasSnapshot;

  return {
    effectiveData,
    isCachedMode,
    isOffline,
    isFetching,
    lastSyncedAt,
    hasSnapshot,
    isLoadingEffective,
    retrySync,
  };
}
