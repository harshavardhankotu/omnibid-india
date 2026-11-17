import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, RefreshCw, Share, WifiOff, X } from "lucide-react";
import { useListNotifications } from "@omnibid/api-client-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useOnlineStatus, usePWAInstall, useServiceWorkerPWA } from "@/hooks/use-pwa";

export function PWAInstallButton() {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={install}
        className="h-8 px-2.5 text-xs font-semibold border-primary/30 text-primary hover:bg-primary/10 gap-1.5"
        data-testid="button-pwa-install"
      >
        <Download className="h-3.5 w-3.5" />
        <span className="hidden xl:inline">Install App</span>
      </Button>
    );
  }

  if (isIOS) {
    return (
      <>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowIOSGuide(true)}
          className="h-8 px-2.5 text-xs font-semibold gap-1.5"
          data-testid="button-pwa-ios-install"
        >
          <Download className="h-3.5 w-3.5" />
          <span className="hidden xl:inline">Install</span>
        </Button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-xl bg-card border border-border p-6 shadow-xl">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-base font-bold">Install OmniBid on iOS</h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                1. Tap the <Share className="inline h-3.5 w-3.5 mx-0.5 text-primary" /> <strong>Share</strong> button in Safari&apos;s toolbar.
                <br />
                2. Scroll down and tap <strong>Add to Home Screen</strong>.
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 w-full"
              >
                Got it
              </Button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white shadow-lg"
      role="status"
      aria-live="polite"
      data-testid="offline-indicator"
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" />
      <span>Offline Mode — Cached pages &amp; data are active</span>
    </div>
  );
}

export function SWStatusManager() {
  const { needRefresh, updateServiceWorker } = useServiceWorkerPWA();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "NOTIFICATION_CLICKED" && event.data?.url) {
        setLocation(event.data.url);
      }
    };
    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () => navigator.serviceWorker.removeEventListener("message", handleMessage);
  }, [setLocation]);

  if (!needRefresh) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-xl border border-primary/30 bg-card px-4 py-2.5 text-xs shadow-lg"
      role="status"
    >
      <span className="font-medium text-foreground">New version available</span>
      <Button size="sm" className="h-7 px-2.5 text-xs" onClick={updateServiceWorker}>
        <RefreshCw className="h-3 w-3 mr-1" />
        Update
      </Button>
    </div>
  );
}

export function SyncStatusNotifier() {
  const isOnline = useOnlineStatus();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const wasOfflineRef = useRef(!isOnline);
  const isSyncingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isOnline) {
      wasOfflineRef.current = true;
      return;
    }

    if (!wasOfflineRef.current || isSyncingRef.current) {
      return;
    }

    wasOfflineRef.current = false;
    isSyncingRef.current = true;

    const pausedCount = queryClient
      .getMutationCache()
      .getAll()
      .filter((mutation) => mutation.state.isPaused).length;

    const syncToast = toast({
      title: "Sync Status",
      description: (
        <span className="flex items-center gap-2 mt-0.5" data-testid="toast-sync-status">
          <RefreshCw className="h-4 w-4 shrink-0 animate-spin text-primary" />
          <span>
            {pausedCount > 0
              ? `Back online — pushing ${pausedCount} cached ${pausedCount === 1 ? "change" : "changes"} to the server...`
              : "Back online — cached changes are being pushed to the server..."}
          </span>
        </span>
      ),
      duration: 8000,
    });

    const syncChanges = async () => {
      try {
        await Promise.all([
          queryClient.resumePausedMutations(),
          queryClient.invalidateQueries(),
          new Promise((resolve) => setTimeout(resolve, 900)),
        ]);

        if (!mountedRef.current) return;

        syncToast.update({
          id: syncToast.id,
          title: "Sync Status — Synced",
          description: (
            <span className="flex items-center gap-2 mt-0.5" data-testid="toast-sync-status-complete">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>Cached changes pushed and live data synced with the server.</span>
            </span>
          ),
          duration: 4000,
        });
      } catch {
        if (!mountedRef.current) return;

        syncToast.update({
          id: syncToast.id,
          variant: "destructive",
          title: "Sync Status",
          description: "Connection restored, but some cached changes failed to push to the server.",
          duration: 5000,
        });
      } finally {
        isSyncingRef.current = false;
      }
    };

    void syncChanges();
  }, [isOnline, queryClient, toast]);

  return null;
}

export function PushNotificationBridge() {
  const { user } = useAuth();
  const { toast } = useToast();
  const seenIdsRef = useRef<Set<string>>(new Set());
  const initializedUserRef = useRef<string | null>(null);

  const { data: notifications } = useListNotifications({
    query: {
      enabled: !!user,
      queryKey: ["notifications"],
      refetchInterval: 10000,
    },
  });

  useEffect(() => {
    if (!user) {
      seenIdsRef.current.clear();
      initializedUserRef.current = null;
      return;
    }

    if (initializedUserRef.current !== user.id) {
      seenIdsRef.current.clear();
      if (notifications) {
        for (const n of notifications) {
          seenIdsRef.current.add(n.id);
        }
        initializedUserRef.current = user.id;
      }
      return;
    }

    if (!notifications || notifications.length === 0) return;

    const newLowerBidAlerts = notifications.filter(
      (n) =>
        !seenIdsRef.current.has(n.id) &&
        !n.isRead &&
        (n.type === "lower_bid_alert" || n.type === "outbid")
    );

    for (const n of notifications) {
      seenIdsRef.current.add(n.id);
    }

    if (newLowerBidAlerts.length === 0) return;

    const dispatchBrowserPush = async (title: string, body: string, url: string, tag: string) => {
      if (typeof Notification === "undefined" || Notification.permission !== "granted") {
        return;
      }
      try {
        if ("serviceWorker" in navigator) {
          const reg = await navigator.serviceWorker.ready;
          if (reg.active) {
            reg.active.postMessage({
              type: "SHOW_NOTIFICATION",
              payload: { title, body, url, tag },
            });
            return;
          }
          await reg.showNotification(title, {
            body,
            icon: "/pwa-192x192.png",
            badge: "/pwa-192x192.png",
            tag,
            data: { url },
          });
          return;
        }
        new Notification(title, { body, icon: "/pwa-192x192.png", tag });
      } catch {
        // Ignore browser notification permission/sandbox errors cleanly
      }
    };

    for (const notif of newLowerBidAlerts) {
      const meta = (notif.metadata ?? {}) as { requirementId?: string; url?: string };
      const targetUrl =
        meta.url || (meta.requirementId ? `/requirements/${meta.requirementId}` : "/notifications");
      const title = notif.type === "outbid" ? "Outbid Alert — OmniBid India" : "Lower Bid Alert — OmniBid India";

      toast({
        title,
        description: notif.message,
        duration: 7000,
      });

      void dispatchBrowserPush(title, notif.message, targetUrl, `alert-${notif.id}`);
    }
  }, [notifications, toast, user]);

  return null;
}
