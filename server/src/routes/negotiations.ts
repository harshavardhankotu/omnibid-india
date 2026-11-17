import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, negotiationsTable, requirementsTable, usersTable } from "@omnibid/db";
import { requireAuth } from "../middlewares/auth";
import { recordRequirementActivity } from "../services/activity-log.service.js";
import { z } from "zod";

const router: IRouter = Router();

const SendMessageBody = z.object({
  text: z.string().min(1).max(1000),
  isCounterOffer: z.boolean().optional(),
  counterAmount: z.number().optional(),
});

const RespondOfferBody = z.object({
  action: z.enum(["accept", "decline"]),
});

async function getOrCreateNegotiation(requirementId: string, buyerId: string, providerId: string) {
  const [existing] = await db
    .select()
    .from(negotiationsTable)
    .where(
      and(
        eq(negotiationsTable.requirementId, requirementId),
        eq(negotiationsTable.buyerId, buyerId),
        eq(negotiationsTable.providerId, providerId)
      )
    );
  if (existing) return existing;

  const [created] = await db
    .insert(negotiationsTable)
    .values({ requirementId, buyerId, providerId })
    .returning();
  return created;
}

router.get("/requirements/:requirementId/negotiations", requireAuth, async (req, res): Promise<void> => {
  const requirementId = Array.isArray(req.params.requirementId)
    ? req.params.requirementId[0]
    : req.params.requirementId;
  const providerId = req.query.providerId as string | undefined;

  const [requirement] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, requirementId));
  if (!requirement) { res.status(404).json({ error: "Requirement not found" }); return; }

  const userId = req.user!.userId;
  const isBuyer = requirement.buyerId === userId;

  const buyerId = isBuyer ? userId : requirement.buyerId;
  const provId = isBuyer ? (providerId ?? "") : userId;

  if (!provId) { res.status(400).json({ error: "providerId required" }); return; }

  const neg = await getOrCreateNegotiation(requirementId, buyerId, provId);

  const [buyer] = await db.select().from(usersTable).where(eq(usersTable.id, neg.buyerId));
  const [provider] = await db.select().from(usersTable).where(eq(usersTable.id, neg.providerId));

  res.json({
    ...neg,
    messages: Array.isArray(neg.messages) ? neg.messages : [],
    buyerName: buyer?.name ?? "Unknown",
    providerName: provider?.name ?? "Unknown",
    lastActivityAt: neg.lastActivityAt.toISOString(),
    createdAt: neg.createdAt.toISOString(),
  });
});

router.post("/requirements/:requirementId/negotiations/message", requireAuth, async (req, res): Promise<void> => {
  const requirementId = Array.isArray(req.params.requirementId)
    ? req.params.requirementId[0]
    : req.params.requirementId;

  const parsed = SendMessageBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [requirement] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, requirementId));
  if (!requirement) { res.status(404).json({ error: "Requirement not found" }); return; }

  const userId = req.user!.userId;
  const isBuyer = requirement.buyerId === userId;
  const providerId = req.body.providerId as string | undefined;

  const buyerId = isBuyer ? userId : requirement.buyerId;
  const provId = isBuyer ? (providerId ?? "") : userId;

  if (!provId) { res.status(400).json({ error: "providerId required" }); return; }

  const neg = await getOrCreateNegotiation(requirementId, buyerId, provId);
  const currentMessages = Array.isArray(neg.messages) ? (neg.messages as unknown[]) : [];

  const newMessage = {
    id: crypto.randomUUID(),
    senderId: userId,
    senderRole: isBuyer ? "buyer" : "provider",
    text: parsed.data.text,
    isCounterOffer: parsed.data.isCounterOffer ?? false,
    counterAmount: parsed.data.counterAmount ?? null,
    sentAt: new Date().toISOString(),
  };

  const updatedMessages = [...currentMessages, newMessage];

  const updates: Partial<typeof negotiationsTable.$inferInsert> = {
    messages: updatedMessages,
    lastActivityAt: new Date(),
  };

  if (parsed.data.isCounterOffer && parsed.data.counterAmount) {
    updates.counterOfferAmount = String(parsed.data.counterAmount);
    updates.counterOfferStatus = "pending";
  }

  const [updated] = await db
    .update(negotiationsTable)
    .set(updates)
    .where(eq(negotiationsTable.id, neg.id))
    .returning();

  const [senderUser] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId));
  recordRequirementActivity({
    id: `neg-msg-${newMessage.id}`,
    requirementId,
    category: "negotiations",
    type: newMessage.isCounterOffer ? "negotiation_counter_offer" : "negotiation_message",
    title: newMessage.isCounterOffer && newMessage.counterAmount
      ? `Counter-Offer Proposed: ₹${Number(newMessage.counterAmount).toLocaleString("en-IN")}`
      : "Negotiation Message",
    description: newMessage.text,
    actorName: senderUser?.name ?? (isBuyer ? "Buyer" : "Contractor"),
    actorRole: isBuyer ? "Buyer" : "Contractor",
    amountInr: newMessage.counterAmount ?? null,
    statusFrom: newMessage.isCounterOffer ? "open" : null,
    statusTo: newMessage.isCounterOffer ? "pending" : null,
    timestamp: newMessage.sentAt,
  });

  res.json({
    ...updated,
    messages: updatedMessages,
    lastActivityAt: updated.lastActivityAt.toISOString(),
    createdAt: updated.createdAt.toISOString(),
  });
});

router.post("/requirements/:requirementId/negotiations/respond", requireAuth, async (req, res): Promise<void> => {
  const requirementId = Array.isArray(req.params.requirementId)
    ? req.params.requirementId[0]
    : req.params.requirementId;

  const parsed = RespondOfferBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [requirement] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, requirementId));
  if (!requirement) { res.status(404).json({ error: "Requirement not found" }); return; }

  const userId = req.user!.userId;

  const [neg] = await db
    .select()
    .from(negotiationsTable)
    .where(
      and(
        eq(negotiationsTable.requirementId, requirementId),
        eq(negotiationsTable.providerId, userId)
      )
    );

  if (!neg) { res.status(404).json({ error: "Negotiation not found" }); return; }
  if (neg.counterOfferStatus !== "pending") { res.status(400).json({ error: "No pending offer to respond to" }); return; }

  const newStatus = parsed.data.action === "accept" ? "accepted" : "declined";
  const currentMessages = Array.isArray(neg.messages) ? (neg.messages as unknown[]) : [];

  const systemMessage = {
    id: crypto.randomUUID(),
    senderId: userId,
    senderRole: "provider",
    text: parsed.data.action === "accept"
      ? `Counter-offer of ₹${Number(neg.counterOfferAmount).toLocaleString("en-IN")} accepted!`
      : "Counter-offer declined.",
    isCounterOffer: false,
    counterAmount: null,
    sentAt: new Date().toISOString(),
    isSystem: true,
  };

  const [updated] = await db
    .update(negotiationsTable)
    .set({
      counterOfferStatus: newStatus,
      messages: [...currentMessages, systemMessage],
      lastActivityAt: new Date(),
    })
    .where(eq(negotiationsTable.id, neg.id))
    .returning();

  const [responderUser] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId));
  recordRequirementActivity({
    id: `neg-msg-${systemMessage.id}`,
    requirementId,
    category: "negotiations",
    type: parsed.data.action === "accept" ? "counter_offer_accepted" : "counter_offer_declined",
    title: parsed.data.action === "accept" ? "Counter-Offer Accepted" : "Counter-Offer Declined",
    description: systemMessage.text,
    actorName: responderUser?.name ?? "Contractor",
    actorRole: "Contractor",
    amountInr: neg.counterOfferAmount ? Number(neg.counterOfferAmount) : null,
    statusFrom: "pending",
    statusTo: newStatus,
    timestamp: systemMessage.sentAt,
  });

  res.json({
    ...updated,
    messages: [...currentMessages, systemMessage],
    lastActivityAt: updated.lastActivityAt.toISOString(),
    createdAt: updated.createdAt.toISOString(),
  });
});

export default router;
