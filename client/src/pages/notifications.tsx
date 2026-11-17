import { useState } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useListNotifications, useMarkNotificationsRead, getListNotificationsQueryKey } from "@omnibid/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, BellRing, CheckCheck, Send } from "lucide-react";
import { useServiceWorkerPWA } from "@/hooks/use-pwa";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

const TYPE_LABELS: Record<string, string> = {
  new_bid: "New Bid",
  lower_bid_alert: "Lower Bid Alert",
  outbid: "Outbid Alert",
  bid_accepted: "Bid Accepted",
  bid_rejected: "Bid Rejected",
  requirement_expired: "Expired",
};

export default function Notifications() {
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const { permission, enablePushNotifications, sendTestSWNotification } = useServiceWorkerPWA();
  const [pushBusy, setPushBusy] = useState(false);

  const { data: notifications, isLoading } = useListNotifications();
  const markReadMutation = useMarkNotificationsRead();

  const unreadIds = notifications?.filter((n) => !n.isRead).map((n) => n.id) ?? [];

  const handleMarkAllRead = () => {
    if (!unreadIds.length) return;
    markReadMutation.mutate(
      { data: { ids: unreadIds } },
      { onSuccess: () => qc.invalidateQueries({ queryKey: getListNotificationsQueryKey() }) }
    );
  };

  const handleEnablePush = async () => {
    setPushBusy(true);
    try {
      const res = await enablePushNotifications(user?.id);
      if (res.ok) {
        toast({
          title: "Push alerts enabled",
          description: res.warning
            ? "Browser notifications enabled. Live VAPID push sync will activate when offline/network permits."
            : "You will receive real-time Service Worker deal and bid alerts.",
        });
      } else {
        toast({
          title: "Notifications blocked",
          description: res.error || "Please allow notifications in your browser settings.",
          variant: "destructive",
        });
      }
    } finally {
      setPushBusy(false);
    }
  };

  const handleTestNotification = async () => {
    setPushBusy(true);
    try {
      const res = await sendTestSWNotification();
      if (res.ok) {
        toast({
          title: "Test notification dispatched",
          description: "Service Worker triggered a native notification alert.",
        });
      } else {
        toast({
          title: "Cannot send test alert",
          description: res.error || "Permission is required to display notifications.",
          variant: "destructive",
        });
      }
    } finally {
      setPushBusy(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">Notifications</h1>
          {unreadIds.length > 0 && (
            <Button variant="ghost" size="sm" onClick={handleMarkAllRead} disabled={markReadMutation.isPending} data-testid="button-mark-all-read">
              <CheckCheck className="h-4 w-4 mr-1.5" />
              Mark all read
            </Button>
          )}
        </div>

        <div className="mb-5 rounded-xl border border-border bg-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <BellRing className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Browser &amp; Background Alerts</span>
              <Badge
                variant={permission === "granted" ? "default" : permission === "denied" ? "destructive" : "secondary"}
                className="text-[10px] capitalize"
                data-testid="badge-push-permission"
              >
                {permission}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Receive instant reverse-auction bid updates via the OmniBid Service Worker even when the tab is in the background.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {permission !== "granted" && (
              <Button
                size="sm"
                onClick={handleEnablePush}
                disabled={pushBusy || permission === "denied"}
                data-testid="button-enable-push"
              >
                <Bell className="h-3.5 w-3.5 mr-1.5" />
                Enable Alerts
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={handleTestNotification}
              disabled={pushBusy || permission === "denied"}
              data-testid="button-test-sw-notification"
            >
              <Send className="h-3.5 w-3.5 mr-1.5" />
              Test Alert
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : notifications?.length ? (
          <div className="space-y-2">
            {notifications.map((notif) => {
              const meta = (notif.metadata ?? {}) as { requirementId?: string; url?: string };
              const targetUrl =
                meta.url || (meta.requirementId ? `/requirements/${meta.requirementId}` : null);
              return (
                <div
                  key={notif.id}
                  onClick={() => targetUrl && setLocation(targetUrl)}
                  className={`p-4 rounded-xl border transition-colors ${
                    notif.isRead ? "border-border bg-background" : "border-primary/20 bg-primary/5"
                  } ${targetUrl ? "cursor-pointer hover:border-primary/40" : ""}`}
                  data-testid={`card-notification-${notif.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 flex-1">
                      <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${notif.isRead ? "bg-transparent" : "bg-primary"}`} />
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            {TYPE_LABELS[notif.type] ?? notif.type}
                          </Badge>
                        </div>
                        <p className="text-sm mt-1">{notif.message}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(notif.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16 text-muted-foreground">
            <Bell className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No notifications yet</p>
            <p className="text-sm mt-1">You'll see bid activity and updates here</p>
          </div>
        )}
      </div>
    </Layout>
  );
}
