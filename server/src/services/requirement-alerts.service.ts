import { notifyUser } from "../lib/notifications.js";
import { sendWebPush } from "./push-notification.service.js";

/**
 * In-memory requirement watchlists indexed by requirementId -> Set of userIds.
 * Mirrors push-notification.service.ts so subscriptions work cleanly across
 * both PostgreSQL and resilient mock-db modes without schema drift.
 */
const requirementWatchersMap = new Map<string, Set<string>>();

export function subscribeToRequirement(requirementId: string, userId: string): boolean {
  if (!requirementId || !userId) return false;
  let watchers = requirementWatchersMap.get(requirementId);
  if (!watchers) {
    watchers = new Set<string>();
    requirementWatchersMap.set(requirementId, watchers);
  }
  watchers.add(userId);
  return true;
}

export function unsubscribeFromRequirement(requirementId: string, userId: string): boolean {
  const watchers = requirementWatchersMap.get(requirementId);
  if (!watchers) return false;
  const removed = watchers.delete(userId);
  if (watchers.size === 0) {
    requirementWatchersMap.delete(requirementId);
  }
  return removed;
}

export function isUserSubscribedToRequirement(requirementId: string, userId: string): boolean {
  return requirementWatchersMap.get(requirementId)?.has(userId) ?? false;
}

export function getRequirementSubscribers(requirementId: string): string[] {
  return Array.from(requirementWatchersMap.get(requirementId) ?? []);
}

export function getRequirementSubscriberCount(requirementId: string): number {
  return requirementWatchersMap.get(requirementId)?.size ?? 0;
}

export interface ExistingBidSnapshot {
  id: string;
  providerId: string;
  bidAmount: string | number;
  status: string;
}

export async function dispatchLowerBidAlertsForRequirement(params: {
  requirementId: string;
  requirementTitle: string;
  newBidId: string;
  newBidAmount: number;
  bidderId: string;
  previousL1Amount: number | null;
  existingBids: ExistingBidSnapshot[];
}): Promise<{ notifiedUserIds: string[] }> {
  const {
    requirementId,
    requirementTitle,
    newBidId,
    newBidAmount,
    bidderId,
    previousL1Amount,
    existingBids,
  } = params;

  if (!Number.isFinite(newBidAmount) || newBidAmount <= 0) {
    return { notifiedUserIds: [] };
  }

  const subscribers = getRequirementSubscribers(requirementId);
  if (subscribers.length === 0) {
    return { notifiedUserIds: [] };
  }

  const notifiedUserIds: string[] = [];
  const targetUrl = `/requirements/${requirementId}`;
  const formattedNewBid = newBidAmount.toLocaleString("en-IN");

  for (const subscriberId of subscribers) {
    if (!subscriberId || subscriberId === bidderId) {
      continue;
    }

    const userBids = existingBids.filter(
      (b) =>
        b.providerId === subscriberId &&
        (b.status === "active" || b.status === "envelope_a_approved") &&
        Number(b.bidAmount) > 0
    );

    const userBestBid =
      userBids.length > 0
        ? Math.min(...userBids.map((b) => Number(b.bidAmount)))
        : null;

    const benchmark = userBestBid !== null ? userBestBid : previousL1Amount;
    const isLowerThanBenchmark = benchmark === null || newBidAmount < benchmark;

    if (!isLowerThanBenchmark) {
      continue;
    }

    const message =
      userBestBid !== null
        ? `Lower bid placed on "${requirementTitle}": ₹${formattedNewBid} beats your current best bid of ₹${userBestBid.toLocaleString("en-IN")}.`
        : benchmark !== null
        ? `New lowest bid of ₹${formattedNewBid} placed on "${requirementTitle}" (down from ₹${benchmark.toLocaleString("en-IN")}).`
        : `New bid of ₹${formattedNewBid} placed on "${requirementTitle}".`;

    const pushPayload = {
      title: "Lower Bid Alert — OmniBid India",
      body: message,
      url: targetUrl,
      tag: `lower-bid-${requirementId}`,
      requirementId,
      bidId: newBidId,
      newBidAmount,
      previousBestAmount: benchmark,
    };

    try {
      await sendWebPush(subscriberId, pushPayload);
    } catch (err) {
      console.warn("[RequirementAlerts] Failed to send Web Push alert:", err);
    }

    try {
      await notifyUser(subscriberId, "lower_bid_alert", message, {
        requirementId,
        bidId: newBidId,
        newBidAmount,
        previousBestAmount: benchmark,
        url: targetUrl,
      });
      notifiedUserIds.push(subscriberId);
    } catch (err) {
      console.warn("[RequirementAlerts] Failed to persist lower_bid_alert notification:", err);
    }
  }

  return { notifiedUserIds };
}
