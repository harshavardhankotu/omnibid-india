import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellRing, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useServiceWorkerPWA } from "@/hooks/use-pwa";

interface RequirementSubscriptionStatus {
  requirementId: string;
  subscribed: boolean;
  subscriberCount: number;
  userBestBid: number | null;
  overallLowestBid: number | null;
  currentBestBid: number | null;
}

interface RequirementSubscribeButtonProps {
  requirementId: string;
  requirementTitle: string;
  isAuctionOpen: boolean;
  lowestBid?: number | null;
}

export function RequirementSubscribeButton({
  requirementId,
  requirementTitle,
  isAuctionOpen,
  lowestBid,
}: RequirementSubscribeButtonProps) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { enablePushNotifications } = useServiceWorkerPWA();

  const queryKey = ["requirement-subscription", requirementId, user?.id ?? "anon"];

  const { data: status, isLoading } = useQuery<RequirementSubscriptionStatus>({
    queryKey,
    queryFn: async () => {
      const token = localStorage.getItem("omnibid_token");
      const res = await fetch(`/api/requirements/${requirementId}/subscribe`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) {
        throw new Error("Failed to load subscription status");
      }
      return res.json();
    },
    enabled: !!requirementId,
  });

  const subscribeMutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem("omnibid_token");
      const res = await fetch(`/api/requirements/${requirementId}/subscribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to subscribe to requirement alerts");
      }
      return res.json() as Promise<RequirementSubscriptionStatus>;
    },
    onSuccess: (data) => {
      qc.setQueryData(queryKey, data);
      const benchmark = data.currentBestBid ?? lowestBid ?? null;
      const benchmarkText = benchmark
        ? ` below ₹${benchmark.toLocaleString("en-IN")}`
        : "";
      toast({
        title: "Subscribed to lower-bid alerts",
        description: `You'll receive a push notification whenever a new bid${benchmarkText} is placed on "${requirementTitle}".`,
      });
    },
    onError: (err: unknown) => {
      toast({
        title: "Could not subscribe",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    },
  });

  const unsubscribeMutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem("omnibid_token");
      const res = await fetch(`/api/requirements/${requirementId}/subscribe`, {
        method: "DELETE",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to unsubscribe");
      }
      return res.json() as Promise<RequirementSubscriptionStatus>;
    },
    onSuccess: (data) => {
      qc.setQueryData(queryKey, (prev: RequirementSubscriptionStatus | undefined) => ({
        requirementId,
        subscribed: false,
        subscriberCount: data.subscriberCount,
        userBestBid: prev?.userBestBid ?? null,
        overallLowestBid: prev?.overallLowestBid ?? null,
        currentBestBid: prev?.currentBestBid ?? null,
      }));
      toast({
        title: "Unsubscribed",
        description: `Lower-bid push alerts turned off for "${requirementTitle}".`,
      });
    },
    onError: (err: unknown) => {
      toast({
        title: "Could not unsubscribe",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    },
  });

  const isSubscribed = !!status?.subscribed;
  const subscriberCount = status?.subscriberCount ?? 0;
  const benchmarkBid = status?.currentBestBid ?? lowestBid ?? null;
  const isBusy = subscribeMutation.isPending || unsubscribeMutation.isPending;

  if (!isAuctionOpen && !isSubscribed) {
    return null;
  }

  const handleToggle = async () => {
    if (!user) {
      toast({
        title: "Login required",
        description: "Sign in to subscribe and receive lower-bid push notifications.",
      });
      setLocation("/login");
      return;
    }

    if (isSubscribed) {
      unsubscribeMutation.mutate();
      return;
    }

    // Request browser Web Push permission & register Service Worker push subscription cleanly
    const pushResult = await enablePushNotifications(user.id).catch(() => ({
      ok: false,
      error: undefined,
    }));

    subscribeMutation.mutate(undefined, {
      onSuccess: () => {
        if (!pushResult.ok && typeof Notification !== "undefined" && Notification.permission === "denied") {
          toast({
            title: "In-app alerts active (browser push blocked)",
            description:
              "Lower-bid alerts are saved in your account, though browser notifications are currently blocked in settings.",
          });
        }
      },
    });
  };

  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center">
      <Button
        type="button"
        variant={isSubscribed ? "default" : "outline"}
        className={`font-semibold transition-colors ${
          isSubscribed
            ? "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600"
            : "border-primary/40 text-primary hover:bg-primary/10"
        }`}
        onClick={handleToggle}
        disabled={isLoading || isBusy}
        title={
          isSubscribed
            ? "Click to stop receiving lower-bid push alerts"
            : benchmarkBid
            ? `Get push alerts when a bid is placed below ₹${benchmarkBid.toLocaleString("en-IN")}`
            : "Get push alerts when a new lower bid is placed"
        }
        data-testid="button-subscribe-requirement"
      >
        {isBusy ? (
          <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
        ) : isSubscribed ? (
          <BellRing className="h-4 w-4 mr-1.5" />
        ) : (
          <Bell className="h-4 w-4 mr-1.5" />
        )}
        <span>{isSubscribed ? "Subscribed" : "Subscribe"}</span>
        {subscriberCount > 0 && (
          <Badge
            variant="secondary"
            className={`ml-1.5 px-1.5 py-0 h-4 text-[10px] tabular-nums ${
              isSubscribed
                ? "bg-white/20 text-white border-none"
                : "bg-primary/10 text-primary border-none"
            }`}
            data-testid="badge-subscriber-count"
          >
            {subscriberCount}
          </Badge>
        )}
      </Button>
      {isSubscribed && benchmarkBid && (
        <span
          className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium px-1"
          data-testid="text-subscribe-benchmark"
        >
          Alerting below ₹{benchmarkBid.toLocaleString("en-IN")}
        </span>
      )}
    </div>
  );
}
