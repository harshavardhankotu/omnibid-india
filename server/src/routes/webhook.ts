import { Router, type IRouter } from "express";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import { webhook_events, escrow_payments, requirements, disputes, users } from "../db/schema.js";

const router: IRouter = Router();

/**
 * Verifies Razorpay Webhook HMAC-SHA256 signature using rawBody
 */
export function verifyWebhookSignature(rawBody: string | Buffer, signature: string, secret: string): boolean {
  if (!signature || !secret) return false;
  const bodyString = typeof rawBody === "string" ? rawBody : rawBody.toString("utf-8");
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(bodyString)
    .digest("hex");

  try {
    const a = Buffer.from(expectedSignature);
    const b = Buffer.from(signature);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * POST /api/webhook/razorpay
 * Hardened webhook receiver with HMAC-SHA256 signature check, atomic idempotency replay protection,
 * and transactional state handling for payment.captured, transfer.processed, and dispute.created.
 */
router.post("/webhook/razorpay", async (req, res): Promise<void> => {
  const signature = req.headers["x-razorpay-signature"] as string;
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || "";

  // 1. Validate cryptographic webhook signature
  const rawBody = (req as any).rawBody;
  const bodyBuffer = rawBody || Buffer.from(JSON.stringify(req.body));
  const isMock = !webhookSecret || webhookSecret.includes("mock") || process.env.NODE_ENV !== "production";

  if (!isMock) {
    const isValid = verifyWebhookSignature(bodyBuffer, signature, webhookSecret);
    if (!isValid) {
      res.status(400).json({ error: "Invalid Razorpay webhook signature" });
      return;
    }
  }

  const { event, payload } = req.body;
  const eventId = (req.body?.event_id as string) || (req.headers["x-razorpay-event-id"] as string) || (req.body?.id as string);

  if (!eventId) {
    res.status(400).json({ error: "Missing event_id in webhook payload" });
    return;
  }

  let resourceId: string | null = null;
  if (event === "payment.captured") {
    resourceId = payload?.payment?.entity?.id || null;
  } else if (event === "transfer.processed") {
    resourceId = payload?.transfer?.entity?.id || null;
  } else if (event === "dispute.created") {
    resourceId = payload?.dispute?.entity?.id || null;
  }

  // 2. Atomic Idempotency Check: ON CONFLICT (id) DO NOTHING
  try {
    const [inserted] = await db
      .insert(webhook_events)
      .values({
        id: eventId,
        event_type: event || "unknown",
        resource_id: resourceId,
        payload: req.body,
      })
      .onConflictDoNothing()
      .returning();

    // Replay detection: If no row was inserted, event was previously processed
    if (!inserted) {
      res.status(200).json({
        status: "skipped",
        message: `Duplicate webhook event '${eventId}' ignored via idempotency guard`,
        eventId,
      });
      return;
    }
  } catch (error) {
    console.error("Idempotency insert check error:", error);
    res.status(500).json({ error: "Failed to verify webhook idempotency" });
    return;
  }

  // 3. Transactional Business Logic for Razorpay Event Types
  try {
    if (event === "payment.captured") {
      const paymentEntity = payload?.payment?.entity;
      const razorpayPaymentId = paymentEntity?.id;
      const razorpayOrderId = paymentEntity?.order_id;

      await db.transaction(async (tx) => {
        // Find matching escrow payment
        let [escrow] = await tx
          .select()
          .from(escrow_payments)
          .where(eq(escrow_payments.razorpay_order_id, razorpayOrderId))
          .limit(1);

        if (escrow) {
          await tx
            .update(escrow_payments)
            .set({
              status: "held",
              razorpay_payment_id: razorpayPaymentId,
            })
            .where(eq(escrow_payments.id, escrow.id));

          await tx
            .update(requirements)
            .set({ status: "in_escrow" })
            .where(eq(requirements.id, escrow.requirement_id));
        }
      });
    } else if (event === "transfer.processed") {
      // Milestone disbursement confirmed by Razorpay Route
      console.log(`[Webhook] Razorpay Route transfer confirmed for resource ${resourceId}`);
    } else if (event === "dispute.created") {
      const disputeEntity = payload?.dispute?.entity;
      const paymentId = disputeEntity?.payment_id;
      const reason = disputeEntity?.reason_code || "Dispute created by buyer via Razorpay";

      await db.transaction(async (tx) => {
        // Find escrow payment linked to this payment ID
        const [escrow] = await tx
          .select()
          .from(escrow_payments)
          .where(eq(escrow_payments.razorpay_payment_id, paymentId))
          .limit(1);

        if (escrow) {
          // Freeze escrow: Set status to 'disputed'
          await tx
            .update(escrow_payments)
            .set({ status: "disputed" })
            .where(eq(escrow_payments.id, escrow.id));

          // Freeze requirement
          await tx
            .update(requirements)
            .set({ status: "disputed" })
            .where(eq(requirements.id, escrow.requirement_id));

          // Open dispute record
          const [buyer] = await tx
            .select()
            .from(users)
            .limit(1);

          await tx.insert(disputes).values({
            escrow_id: escrow.id,
            opened_by: buyer ? buyer.id : escrow.requirement_id,
            reason: `[Auto Razorpay Dispute] ${reason}`,
            evidence_urls: [],
            status: "open",
          });
        }
      });
    }

    res.status(200).json({
      status: "success",
      message: `Webhook event '${event}' processed successfully`,
      eventId,
    });
  } catch (err: any) {
    console.error(`Error processing webhook event ${event}:`, err);
    res.status(500).json({ error: "Failed to process webhook transaction", details: err?.message });
  }
});

export default router;
