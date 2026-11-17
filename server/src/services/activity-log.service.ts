import { eq, asc } from "drizzle-orm";
import {
  db,
  requirementsTable,
  bidsTable,
  negotiationsTable,
  paymentsTable,
  disputesTable,
  usersTable,
} from "@omnibid/db";

export type RequirementActivityCategory = "bids" | "status" | "negotiations";

export interface RequirementActivityEvent {
  id: string;
  requirementId: string;
  category: RequirementActivityCategory;
  type: string;
  title: string;
  description: string;
  actorName?: string | null;
  actorRole?: string | null;
  amountInr?: number | null;
  statusFrom?: string | null;
  statusTo?: string | null;
  timestamp: string;
}

/**
 * Runtime audit event buffer indexed by requirementId so mutations like
 * bid withdrawals, anti-sniping deadline extensions, status transitions, and
 * negotiations retain exact transition timestamps alongside database entities.
 */
const runtimeActivityMap = new Map<string, RequirementActivityEvent[]>();

export function recordRequirementActivity(
  event: Omit<RequirementActivityEvent, "id" | "timestamp"> & {
    id?: string;
    timestamp?: string;
  }
): RequirementActivityEvent {
  const entry: RequirementActivityEvent = {
    id: event.id || `act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    requirementId: event.requirementId,
    category: event.category,
    type: event.type,
    title: event.title,
    description: event.description,
    actorName: event.actorName ?? null,
    actorRole: event.actorRole ?? null,
    amountInr: event.amountInr ?? null,
    statusFrom: event.statusFrom ?? null,
    statusTo: event.statusTo ?? null,
    timestamp: event.timestamp ?? new Date().toISOString(),
  };

  const existing = runtimeActivityMap.get(event.requirementId) ?? [];
  if (!existing.some((e) => e.id === entry.id)) {
    existing.push(entry);
    runtimeActivityMap.set(event.requirementId, existing);
  }
  return entry;
}

export async function getRequirementActivityLog(
  requirementId: string,
  viewer?: { userId?: string; role?: string; email?: string }
): Promise<RequirementActivityEvent[] | null> {
  const [requirement] = await db
    .select()
    .from(requirementsTable)
    .where(eq(requirementsTable.id, requirementId));

  if (!requirement) {
    return null;
  }

  const userNameCache = new Map<string, string>();
  const getUserName = async (userId: string): Promise<string> => {
    if (!userId) return "Unknown";
    const cached = userNameCache.get(userId);
    if (cached) return cached;
    const [u] = await db
      .select({ name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    const resolved = u?.name ?? "Unknown";
    userNameCache.set(userId, resolved);
    return resolved;
  };

  const buyerName = await getUserName(requirement.buyerId);
  const events: RequirementActivityEvent[] = [];
  const runtimeEvents = runtimeActivityMap.get(requirementId) ?? [];
  const runtimeIds = new Set(runtimeEvents.map((e) => e.id));

  // 1. Requirement Created
  events.push({
    id: `req-created-${requirement.id}`,
    requirementId,
    category: "status",
    type: "requirement_created",
    title: "Requirement Published",
    description: `Auction opened with a max budget of ₹${Number(requirement.maxBudget).toLocaleString("en-IN")} (${requirement.deadlineHours}h window).`,
    actorName: buyerName,
    actorRole: "Buyer",
    amountInr: Number(requirement.maxBudget),
    statusFrom: null,
    statusTo: "open",
    timestamp: requirement.createdAt.toISOString(),
  });

  // 2. Bids & Bid State Shifts
  const bids = await db
    .select()
    .from(bidsTable)
    .where(eq(bidsTable.requirementId, requirementId))
    .orderBy(asc(bidsTable.createdAt));

  const isTwoEnvelope = requirement.bidType === "two_envelope";
  const isAdminViewer =
    viewer?.role === "admin" || !!viewer?.email?.endsWith("@omnibid.admin");

  let runningLowest: number | null = null;

  for (const b of bids) {
    const providerName = await getUserName(b.providerId);
    const isMyBid = viewer?.userId === b.providerId;
    const isApproved = b.status === "envelope_a_approved" || b.status === "accepted";
    const hideFinancial = isTwoEnvelope && !isMyBid && !isApproved && !isAdminViewer;
    const numericBid = Number(b.bidAmount);

    const syntheticBidId = `bid-placed-${b.id}`;
    if (!runtimeIds.has(syntheticBidId)) {
      let capturedL1 = false;
      if (!hideFinancial && (b.status === "active" || isApproved) && numericBid > 0) {
        if (runningLowest === null || numericBid < runningLowest) {
          runningLowest = numericBid;
          capturedL1 = true;
        }
      }

      events.push({
        id: syntheticBidId,
        requirementId,
        category: "bids",
        type: capturedL1 ? "bid_l1_captured" : "bid_placed",
        title: hideFinancial
          ? "Technical Bid Submitted (Envelope A)"
          : capturedL1
          ? "New L1 Lowest Bid Placed"
          : "Bid Submitted",
        description: hideFinancial
          ? `Technical proposal uploaded (${b.estimatedCompletion}). Financial quote remains sealed pending review.`
          : `Quoted ₹${numericBid.toLocaleString("en-IN")} · Est. completion: ${b.estimatedCompletion}${
              capturedL1 ? " — captured L1 lowest position" : ""
            }.`,
        actorName: providerName,
        actorRole: "Contractor",
        amountInr: hideFinancial ? null : numericBid,
        statusFrom: null,
        statusTo: b.status,
        timestamp: b.createdAt.toISOString(),
      });
    }

    if (
      b.status === "envelope_a_approved" &&
      !runtimeIds.has(`bid-env-approved-${b.id}`)
    ) {
      events.push({
        id: `bid-env-approved-${b.id}`,
        requirementId,
        category: "status",
        type: "envelope_a_approved",
        title: "Technical Bid Approved & Price Revealed",
        description: `${providerName}'s Envelope A technical portfolio was approved by the buyer.`,
        actorName: buyerName,
        actorRole: "Buyer",
        amountInr: numericBid,
        statusFrom: "envelope_a_pending",
        statusTo: "envelope_a_approved",
        timestamp: new Date(b.createdAt.getTime() + 1000).toISOString(),
      });
    }

    if (b.status === "withdrawn" && !runtimeIds.has(`bid-withdrawn-${b.id}`)) {
      events.push({
        id: `bid-withdrawn-${b.id}`,
        requirementId,
        category: "bids",
        type: "bid_withdrawn",
        title: "Bid Withdrawn",
        description: `${providerName} withdrew their bid from this auction.`,
        actorName: providerName,
        actorRole: "Contractor",
        amountInr: hideFinancial ? null : numericBid,
        statusFrom: "active",
        statusTo: "withdrawn",
        timestamp: new Date(b.createdAt.getTime() + 1000).toISOString(),
      });
    }

    if (b.status === "accepted" && !runtimeIds.has(`bid-accepted-${b.id}`)) {
      events.push({
        id: `bid-accepted-${b.id}`,
        requirementId,
        category: "status",
        type: "bid_accepted",
        title: "Winning Bid Awarded",
        description: `${buyerName} accepted ${providerName}'s bid of ₹${numericBid.toLocaleString("en-IN")}.`,
        actorName: buyerName,
        actorRole: "Buyer",
        amountInr: numericBid,
        statusFrom: "open",
        statusTo: "accepted",
        timestamp: new Date(b.createdAt.getTime() + 2000).toISOString(),
      });
    }
  }

  // 3. Negotiations (Bhaav-Taav messages & counter-offers)
  const negotiations = await db
    .select()
    .from(negotiationsTable)
    .where(eq(negotiationsTable.requirementId, requirementId));

  for (const neg of negotiations) {
    const negProviderName = await getUserName(neg.providerId);
    const canSeeDetails =
      viewer?.userId === neg.buyerId ||
      viewer?.userId === neg.providerId ||
      isAdminViewer;

    const messages = Array.isArray(neg.messages)
      ? (neg.messages as Array<{
          id?: string;
          senderId?: string;
          senderRole?: string;
          text?: string;
          isCounterOffer?: boolean;
          counterAmount?: number | null;
          sentAt?: string;
          isSystem?: boolean;
        }>)
      : [];

    if (messages.length === 0) {
      events.push({
        id: `neg-created-${neg.id}`,
        requirementId,
        category: "negotiations",
        type: "negotiation_started",
        title: "Negotiation Room Opened",
        description: canSeeDetails
          ? `Bhaav-Taav negotiation room opened with ${negProviderName}.`
          : "Buyer and shortlisted contractor opened a negotiation room.",
        actorName: buyerName,
        actorRole: "Buyer",
        timestamp: neg.createdAt.toISOString(),
      });
      continue;
    }

    for (let idx = 0; idx < messages.length; idx++) {
      const m = messages[idx];
      const msgId = m.id || `${neg.id}-${idx}`;
      const synthId = `neg-msg-${msgId}`;
      if (runtimeIds.has(synthId)) continue;

      const senderIsBuyer = m.senderRole === "buyer";
      const actorName = canSeeDetails
        ? senderIsBuyer
          ? buyerName
          : negProviderName
        : senderIsBuyer
        ? "Buyer"
        : "Shortlisted Contractor";

      const isCounter = !!m.isCounterOffer && m.counterAmount != null;
      const isSystem = !!m.isSystem;

      events.push({
        id: synthId,
        requirementId,
        category: "negotiations",
        type: isCounter
          ? "negotiation_counter_offer"
          : isSystem
          ? "negotiation_response"
          : "negotiation_message",
        title: isCounter
          ? canSeeDetails
            ? `Counter-Offer Proposed: ₹${Number(m.counterAmount).toLocaleString("en-IN")}`
            : "Counter-Offer Proposed"
          : isSystem
          ? "Negotiation Offer Update"
          : "Negotiation Message",
        description: canSeeDetails
          ? m.text || "Negotiation update logged."
          : isCounter
          ? "A counter-offer was exchanged in the Bhaav-Taav negotiation room."
          : "Parties exchanged a message in the negotiation room.",
        actorName,
        actorRole: senderIsBuyer ? "Buyer" : "Contractor",
        amountInr: canSeeDetails && m.counterAmount != null ? Number(m.counterAmount) : null,
        statusFrom: isCounter ? "open" : null,
        statusTo: isCounter ? "pending" : isSystem ? neg.counterOfferStatus : null,
        timestamp: m.sentAt || neg.lastActivityAt.toISOString(),
      });
    }
  }

  // 4. Escrow Payments
  const payments = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.requirementId, requirementId));

  for (const pay of payments) {
    events.push({
      id: `payment-${pay.id}`,
      requirementId,
      category: "status",
      type: "escrow_funded",
      title: `Escrow ${pay.escrowStatus === "released" ? "Released" : "Initialized"}`,
      description: `Escrow contract value ₹${Number(pay.totalAmount).toLocaleString("en-IN")} (${pay.milestonesCompleted}/${pay.totalMilestones} milestones completed, status: ${pay.escrowStatus}).`,
      actorName: buyerName,
      actorRole: "Escrow",
      amountInr: Number(pay.totalAmount),
      statusFrom: "accepted",
      statusTo: pay.escrowStatus,
      timestamp: pay.createdAt.toISOString(),
    });
  }

  // 5. Disputes
  const disputes = await db
    .select()
    .from(disputesTable)
    .where(eq(disputesTable.requirementId, requirementId));

  for (const d of disputes) {
    const raisedByName = await getUserName(d.raisedById);
    events.push({
      id: `dispute-${d.id}`,
      requirementId,
      category: "status",
      type: "dispute_raised",
      title: `Dispute Raised: ${d.title}`,
      description: d.description,
      actorName: raisedByName,
      actorRole: "Participant",
      statusFrom: requirement.status,
      statusTo: d.status,
      timestamp: d.createdAt.toISOString(),
    });

    if (d.resolvedAt) {
      events.push({
        id: `dispute-resolved-${d.id}`,
        requirementId,
        category: "status",
        type: "dispute_resolved",
        title: "Dispute Resolved",
        description: d.resolutionNote || `Resolution: ${d.resolution ?? "closed"}`,
        actorName: "OmniBid Resolution",
        actorRole: "Arbitration",
        statusFrom: "open",
        statusTo: "resolved",
        timestamp: d.resolvedAt.toISOString(),
      });
    }
  }

  // 6. Auction Deadline Passed
  const endsAtMs = new Date(requirement.auctionEndsAt).getTime();
  if (
    !Number.isNaN(endsAtMs) &&
    endsAtMs <= Date.now() &&
    (requirement.status === "open" || requirement.status === "expired")
  ) {
    events.push({
      id: `auction-ended-${requirement.id}`,
      requirementId,
      category: "status",
      type: "auction_ended",
      title: "Bidding Window Closed",
      description: "The scheduled reverse auction deadline passed and bidding closed.",
      actorName: "Auction Timer",
      actorRole: "System",
      statusFrom: "open",
      statusTo: "expired",
      timestamp: requirement.auctionEndsAt.toISOString(),
    });
  }

  // Merge runtime recorded events (enforcing participant privacy for negotiations)
  const canSeeAnyNegotiation =
    isAdminViewer ||
    (!!viewer?.userId &&
      (viewer.userId === requirement.buyerId ||
        negotiations.some((n) => n.providerId === viewer.userId)));

  for (const rt of runtimeEvents) {
    if (rt.category === "negotiations" && !canSeeAnyNegotiation) {
      events.push({
        ...rt,
        title:
          rt.type === "negotiation_counter_offer"
            ? "Counter-Offer Proposed"
            : rt.type === "counter_offer_accepted"
            ? "Counter-Offer Accepted"
            : rt.type === "counter_offer_declined"
            ? "Counter-Offer Declined"
            : "Negotiation Message",
        description:
          rt.type === "negotiation_counter_offer" ||
          rt.type === "counter_offer_accepted" ||
          rt.type === "counter_offer_declined"
            ? "A counter-offer update occurred in the Bhaav-Taav negotiation room."
            : "Parties exchanged a message in the negotiation room.",
        actorName: rt.actorRole === "Buyer" ? "Buyer" : "Shortlisted Contractor",
        amountInr: null,
      });
      continue;
    }
    events.push(rt);
  }

  // Deduplicate by id and sort newest first by default
  const deduped = Array.from(new Map(events.map((e) => [e.id, e])).values());
  deduped.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return deduped;
}
