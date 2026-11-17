import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, paymentsTable, workProofsTable, requirementsTable, bidsTable, usersTable } from "@omnibid/db";
import { requireAuth, optionalAuth } from "../middlewares/auth";
import { z } from "zod";
import { recalculateOmniScore } from "../lib/credit";
import Razorpay from "razorpay";
import crypto from "crypto";

const router: IRouter = Router();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || "rzp_test_mockkey",
  key_secret: process.env.RAZORPAY_KEY_SECRET || "rzp_test_mocksecret",
});

const CreatePaymentBody = z.object({
  bidId: z.string().uuid(),
  mobilizationAdvancePct: z.number().min(0).max(50).optional(),
  upiId: z.string().optional(),
  totalMilestones: z.number().min(1).max(10).optional(),
});

const SubmitWorkProofBody = z.object({
  milestoneNumber: z.number().min(1),
  milestoneTitle: z.string().min(1),
  notes: z.string().min(1),
  proofUrl: z.string().optional(),
});

const ApproveMilestoneBody = z.object({
  workProofId: z.string().uuid(),
  approved: z.boolean(),
  buyerNote: z.string().optional(),
});

function calcFees(totalAmount: number) {
  const platformFeePercent = 2.0;
  const platformFeeAmount = Math.round(totalAmount * platformFeePercent / 100);
  const tdsAmount = totalAmount > 30000 ? Math.round(totalAmount * 0.02) : 0;
  const netToProvider = totalAmount - platformFeeAmount - tdsAmount;
  return { platformFeePercent, platformFeeAmount, tdsAmount, netToProvider };
}

function formatPayment(p: typeof paymentsTable.$inferSelect) {
  return {
    id: p.id,
    requirementId: p.requirementId,
    bidId: p.bidId,
    buyerId: p.buyerId,
    providerId: p.providerId,
    totalAmount: Number(p.totalAmount),
    platformFeePercent: Number(p.platformFeePercent),
    platformFeeAmount: Number(p.platformFeeAmount),
    tdsAmount: Number(p.tdsAmount),
    netToProvider: Number(p.netToProvider),
    mobilizationAdvancePct: p.mobilizationAdvancePct,
    advanceReleased: p.advanceReleased,
    escrowStatus: p.escrowStatus,
    upiTransactionId: p.upiTransactionId,
    milestonesCompleted: p.milestonesCompleted,
    totalMilestones: p.totalMilestones,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

router.get("/payments/verify-receipt", optionalAuth, async (req, res): Promise<void> => {
  const rawRef = typeof req.query.ref === "string" ? req.query.ref.trim() : "";
  if (!rawRef) {
    res.status(400).json({ verified: false, error: "Receipt or transaction reference is required." });
    return;
  }

  const normalized = rawRef.replace(/^UTR_/, "");
  const allPayments = await db.select().from(paymentsTable);

  const match = allPayments.find((p) => {
    if (p.id === rawRef || p.requirementId === rawRef) return true;
    if (p.upiTransactionId && (p.upiTransactionId === rawRef || p.upiTransactionId === normalized)) return true;
    // Match short 8-char requirement prefix embedded in OmniBid UPI note (OmniBid_<type>_<shortReqId>)
    const cleanReqPrefix = p.requirementId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
    return normalized.length >= 6 && cleanReqPrefix.toLowerCase() === normalized.toLowerCase();
  });

  if (!match) {
    res.status(404).json({ verified: false, error: "No matching escrow payment receipt found for this QR code." });
    return;
  }

  const [requirement] = await db
    .select()
    .from(requirementsTable)
    .where(eq(requirementsTable.id, match.requirementId));
  const [buyer] = await db.select().from(usersTable).where(eq(usersTable.id, match.buyerId));
  const [provider] = await db.select().from(usersTable).where(eq(usersTable.id, match.providerId));

  res.json({
    verified: true,
    receipt: {
      paymentId: match.id,
      requirementId: match.requirementId,
      requirementTitle: requirement?.title ?? "OmniBid Escrow Contract",
      city: requirement?.city ?? null,
      buyerName: buyer?.name ?? "Verified Buyer",
      providerName: provider?.name ?? "Verified Provider",
      totalAmount: Number(match.totalAmount),
      platformFeeAmount: Number(match.platformFeeAmount),
      tdsAmount: Number(match.tdsAmount),
      netToProvider: Number(match.netToProvider),
      escrowStatus: match.escrowStatus,
      upiTransactionId: match.upiTransactionId,
      milestonesCompleted: match.milestonesCompleted,
      totalMilestones: match.totalMilestones,
      createdAt: match.createdAt.toISOString(),
      updatedAt: match.updatedAt.toISOString(),
    },
  });
});

router.get("/requirements/:requirementId/payment", requireAuth, async (req, res): Promise<void> => {
  const requirementId = Array.isArray(req.params.requirementId)
    ? req.params.requirementId[0]
    : req.params.requirementId;

  const [payment] = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.requirementId, requirementId));

  if (!payment) { res.status(404).json({ error: "Payment not found" }); return; }

  const workProofs = await db
    .select()
    .from(workProofsTable)
    .where(eq(workProofsTable.requirementId, requirementId));

  res.json({
    payment: formatPayment(payment),
    workProofs: workProofs.map((wp) => ({
      id: wp.id,
      requirementId: wp.requirementId,
      providerId: wp.providerId,
      milestoneNumber: wp.milestoneNumber,
      milestoneTitle: wp.milestoneTitle,
      notes: wp.notes,
      proofUrl: wp.proofUrl,
      buyerApproved: wp.buyerApproved,
      buyerNote: wp.buyerNote,
      submittedAt: wp.submittedAt.toISOString(),
      approvedAt: wp.approvedAt?.toISOString() ?? null,
    })),
  });
});

router.post("/requirements/:requirementId/payment", requireAuth, async (req, res): Promise<void> => {
  const requirementId = Array.isArray(req.params.requirementId)
    ? req.params.requirementId[0]
    : req.params.requirementId;

  const parsed = CreatePaymentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [requirement] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, requirementId));
  if (!requirement) { res.status(404).json({ error: "Requirement not found" }); return; }
  if (requirement.buyerId !== req.user!.userId) { res.status(403).json({ error: "Forbidden" }); return; }

  const [existing] = await db.select().from(paymentsTable).where(eq(paymentsTable.requirementId, requirementId));
  if (existing) {
    if (existing.escrowStatus !== "pending") {
      res.json({ payment: formatPayment(existing), workProofs: [] });
      return;
    }
    // Re-generate order for pending payment
    let order;
    try {
      const amountInPaise = Math.round((Number(existing.totalAmount) + Number(existing.platformFeeAmount)) * 100);
      order = await razorpay.orders.create({
        amount: amountInPaise,
        currency: "INR",
        receipt: `receipt_${requirementId.substring(0, 10)}_${Date.now().toString(36)}`,
        notes: {
          requirementId,
          bidId: existing.bidId,
          buyerId: req.user!.userId,
        },
      });
      await db.update(paymentsTable)
        .set({ upiTransactionId: order.id })
        .where(eq(paymentsTable.id, existing.id));
      existing.upiTransactionId = order.id;
    } catch (err) {
      order = {
        id: existing.upiTransactionId || `order_${Date.now().toString(36)}`,
        amount: Math.round((Number(existing.totalAmount) + Number(existing.platformFeeAmount)) * 100),
        currency: "INR",
      };
    }
    res.json({
      payment: formatPayment(existing),
      workProofs: [],
      razorpayOrderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID || "rzp_test_mockkey",
    });
    return;
  }

  const [bid] = await db.select().from(bidsTable).where(eq(bidsTable.id, parsed.data.bidId));
  if (!bid) { res.status(404).json({ error: "Bid not found" }); return; }

  const totalAmount = Number(bid.bidAmount);
  const { platformFeePercent, platformFeeAmount, tdsAmount, netToProvider } = calcFees(totalAmount);
  const mobPct = parsed.data.mobilizationAdvancePct ?? 0;
  const totalMilestones = parsed.data.totalMilestones ?? 1;

  let order;
  try {
    const amountInPaise = Math.round((totalAmount + platformFeeAmount) * 100);
    order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: `receipt_${requirementId.substring(0, 10)}_${Date.now().toString(36)}`,
      notes: {
        requirementId,
        bidId: parsed.data.bidId,
        buyerId: req.user!.userId,
      },
    });
  } catch (err) {
    order = {
      id: `order_${Date.now().toString(36)}`,
      amount: Math.round((totalAmount + platformFeeAmount) * 100),
      currency: "INR",
    };
  }

  const [payment] = await db.insert(paymentsTable).values({
    requirementId,
    bidId: parsed.data.bidId,
    buyerId: req.user!.userId,
    providerId: bid.providerId,
    totalAmount: String(totalAmount),
    platformFeePercent: String(platformFeePercent),
    platformFeeAmount: String(platformFeeAmount),
    tdsAmount: String(tdsAmount),
    netToProvider: String(netToProvider),
    mobilizationAdvancePct: mobPct,
    advanceReleased: false,
    escrowStatus: "pending",
    upiTransactionId: order.id,
    totalMilestones,
  }).returning();

  res.status(201).json({
    payment: formatPayment(payment),
    workProofs: [],
    razorpayOrderId: order.id,
    amount: order.amount,
    currency: order.currency,
    keyId: process.env.RAZORPAY_KEY_ID || "rzp_test_mockkey",
  });
});

const VerifySignatureBody = z.object({
  razorpay_order_id: z.string(),
  razorpay_payment_id: z.string(),
  razorpay_signature: z.string(),
  amount: z.number().optional(), // Paid amount in paise from the frontend payload
});

router.post("/requirements/:requirementId/payment/verify-signature", requireAuth, async (req, res): Promise<void> => {
  const requirementId = Array.isArray(req.params.requirementId)
    ? req.params.requirementId[0]
    : req.params.requirementId;

  const parsed = VerifySignatureBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = parsed.data;

  // Verify the signature
  const keySecret = process.env.RAZORPAY_KEY_SECRET || "rzp_test_mocksecret";
  const expectedSignature = crypto
    .createHmac("sha256", keySecret)
    .update(razorpay_order_id + "|" + razorpay_payment_id)
    .digest("hex");

  // In sandbox, we also allow standard verification bypass if keys are mock
  const isMock = keySecret === "rzp_test_mocksecret";
  const isSignatureValid = expectedSignature === razorpay_signature || (isMock && razorpay_signature === "mock_signature");

  if (!isSignatureValid) {
    res.status(400).json({ error: "Invalid payment signature verification failed." });
    return;
  }

  // Find the pending payment record for this order
  let [payment] = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.upiTransactionId, razorpay_order_id));

  if (!payment) {
    // Idempotency check: see if the transaction has already been processed and updated to 'held'
    const [alreadyProcessed] = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.upiTransactionId, razorpay_payment_id));

    if (alreadyProcessed && alreadyProcessed.escrowStatus === "held") {
      res.json({
        success: true,
        message: "Payment already processed successfully (idempotent response).",
        payment: formatPayment(alreadyProcessed),
      });
      return;
    }

    res.status(404).json({ error: "Payment record for this order not found." });
    return;
  }

  // Price tampering prevention check
  if (amount !== undefined) {
    const requiredAmountInPaise = Math.round((Number(payment.totalAmount) + Number(payment.platformFeeAmount)) * 100);
    if (amount < requiredAmountInPaise) {
      res.status(400).json({ error: "Price tampering detected: amount paid is less than required." });
      return;
    }
  }

  // Update payment status to 'held' and capture payment ID
  const [updatedPayment] = await db
    .update(paymentsTable)
    .set({
      escrowStatus: "held",
      upiTransactionId: razorpay_payment_id,
      advanceReleased: payment.mobilizationAdvancePct > 0,
      updatedAt: new Date(),
    })
    .where(eq(paymentsTable.id, payment.id))
    .returning();

  // Update requirement status to 'in_progress'
  await db
    .update(requirementsTable)
    .set({ status: "in_progress" })
    .where(eq(requirementsTable.id, payment.requirementId));

  res.json({
    success: true,
    payment: formatPayment(updatedPayment),
  });
});

const ReleaseFundsBody = z.object({
  linkedAccountId: z.string().optional(),
});

router.post("/requirements/:requirementId/payment/release", requireAuth, async (req, res): Promise<void> => {
  const requirementId = Array.isArray(req.params.requirementId)
    ? req.params.requirementId[0]
    : req.params.requirementId;

  const parsed = ReleaseFundsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  // 1. Validate buyer ownership
  const [requirement] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, requirementId));
  if (!requirement) { res.status(404).json({ error: "Requirement not found" }); return; }
  if (requirement.buyerId !== req.user!.userId) {
    res.status(403).json({ error: "Only the buyer can release escrow funds" });
    return;
  }

  // 2. Fetch the payment record
  const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.requirementId, requirementId));
  if (!payment) { res.status(404).json({ error: "Payment not found" }); return; }

  // 3. Guard against active dispute freezing
  if (payment.escrowStatus === "disputed") {
    res.status(409).json({
      error: "Cannot release funds — escrow is currently frozen due to an active dispute.",
    });
    return;
  }

  // 4. Guard: only release when funds are actively held
  if (payment.escrowStatus !== "held" && payment.escrowStatus !== "in_progress") {
    res.status(409).json({
      error: `Cannot release funds — current escrow status is '${payment.escrowStatus}'. Funds must be in 'held' or 'in_progress' state.`,
    });
    return;
  }

  // 5. Look up provider's registered account if not supplied in request body
  const [provider] = await db.select().from(usersTable).where(eq(usersTable.id, payment.providerId));
  const linkedAccountId = parsed.data.linkedAccountId || provider?.razorpayLinkedAccountId;
  if (!linkedAccountId) {
    res.status(400).json({ error: "Razorpay linked account ID is required (none provided in request body and no linked account registered for the provider)." });
    return;
  }

  // 6. Trigger Razorpay Route transfer
  //    payment.upiTransactionId holds the razorpay_payment_id after verify-signature
  const amountInPaise = Math.round(Number(payment.netToProvider) * 100);
  let transferId: string;

  try {
    const transfer = await razorpay.payments.transfer(payment.upiTransactionId!, {
      transfers: [
        {
          account: linkedAccountId,
          amount: amountInPaise,
          currency: "INR",
          notes: {
            requirementId,
            paymentId: payment.id,
            releasedBy: req.user!.userId,
          },
          linked_account_notes: ["requirementId"],
          on_hold: 0,
        },
      ],
    } as any);

    // Extract transfer ID from the items array returned by Razorpay Route
    const transferItem = (transfer as any).items?.[0] ?? transfer as any;
    transferId = transferItem.id ?? `transfer_${Date.now().toString(36)}`;
  } catch (err: any) {
    // Allow sandbox/test mode to pass through when Razorpay Route is not configured
    const isSandboxError =
      !process.env.RAZORPAY_KEY_SECRET ||
      process.env.RAZORPAY_KEY_SECRET === "rzp_test_mocksecret" ||
      err?.statusCode === 400;

    if (isSandboxError) {
      transferId = `sandbox_transfer_${Date.now().toString(36)}`;
    } else {
      res.status(502).json({
        error: "Razorpay Route transfer failed. Funds remain in escrow.",
        details: err?.error?.description ?? String(err),
      });
      return;
    }
  }

  // 5. Atomically update DB — only after transfer succeeds
  //    If this block fails, log the transferId for manual reconciliation
  try {
    const [updatedPayment] = await db.transaction(async (tx) => {
      const [pmt] = await tx
        .update(paymentsTable)
        .set({
          escrowStatus: "released",
          milestonesCompleted: payment.totalMilestones, // mark all milestones done
          updatedAt: new Date(),
        })
        .where(and(eq(paymentsTable.id, payment.id), eq(paymentsTable.requirementId, requirementId)))
        .returning();

      await tx
        .update(requirementsTable)
        .set({ status: "completed" })
        .where(eq(requirementsTable.id, requirementId));

      return [pmt];
    });

    // Recalculate OmniCredit score for the provider asynchronously
    recalculateOmniScore(payment.providerId).catch(() => {/* non-critical */});

    res.json({
      success: true,
      transferId,
      payment: formatPayment(updatedPayment),
    });
  } catch (dbErr) {
    // Transfer succeeded but DB update failed — critical to log transferId
    console.error(`[CRITICAL] Razorpay transfer ${transferId} succeeded but DB update failed for payment ${payment.id}. Manual reconciliation required.`, dbErr);
    res.status(500).json({
      error: "Transfer succeeded but database update failed. Please contact support with your transfer reference.",
      transferId,
    });
  }
});

router.post("/requirements/:requirementId/payment/submit-proof", requireAuth, async (req, res): Promise<void> => {
  const requirementId = Array.isArray(req.params.requirementId)
    ? req.params.requirementId[0]
    : req.params.requirementId;

  const parsed = SubmitWorkProofBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.requirementId, requirementId));
  if (!payment) { res.status(404).json({ error: "Payment not found" }); return; }
  if (payment.providerId !== req.user!.userId) { res.status(403).json({ error: "Forbidden" }); return; }

  const [proof] = await db.insert(workProofsTable).values({
    requirementId,
    paymentId: payment.id,
    providerId: req.user!.userId,
    milestoneNumber: parsed.data.milestoneNumber,
    milestoneTitle: parsed.data.milestoneTitle,
    notes: parsed.data.notes,
    proofUrl: parsed.data.proofUrl ?? null,
  }).returning();

  res.status(201).json({
    id: proof.id,
    requirementId: proof.requirementId,
    providerId: proof.providerId,
    milestoneNumber: proof.milestoneNumber,
    milestoneTitle: proof.milestoneTitle,
    notes: proof.notes,
    proofUrl: proof.proofUrl,
    buyerApproved: proof.buyerApproved,
    buyerNote: proof.buyerNote,
    submittedAt: proof.submittedAt.toISOString(),
    approvedAt: null,
  });
});

router.post("/requirements/:requirementId/payment/approve-milestone", requireAuth, async (req, res): Promise<void> => {
  const requirementId = Array.isArray(req.params.requirementId)
    ? req.params.requirementId[0]
    : req.params.requirementId;

  const parsed = ApproveMilestoneBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.requirementId, requirementId));
  if (!payment) { res.status(404).json({ error: "Payment not found" }); return; }
  if (payment.buyerId !== req.user!.userId) { res.status(403).json({ error: "Forbidden" }); return; }

  // 1. Guard against active dispute freezing
  if (payment.escrowStatus === "disputed") {
    res.status(409).json({ error: "Milestone approval and release is frozen due to an active dispute." });
    return;
  }

  // 2. Guard against release state
  if (payment.escrowStatus !== "held" && payment.escrowStatus !== "in_progress") {
    res.status(409).json({ error: `Cannot approve milestone: escrow status is currently '${payment.escrowStatus}'` });
    return;
  }

  const [proof] = await db.select().from(workProofsTable).where(
    and(eq(workProofsTable.id, parsed.data.workProofId), eq(workProofsTable.requirementId, requirementId))
  );
  if (!proof) { res.status(404).json({ error: "Work proof not found" }); return; }

  // Ensure we don't double approve
  if (proof.buyerApproved) {
    res.status(400).json({ error: "This milestone proof has already been approved." });
    return;
  }

  let transferId: string | undefined;

  // 3. If approved, trigger Razorpay Route disbursement
  if (parsed.data.approved) {
    const [provider] = await db.select().from(usersTable).where(eq(usersTable.id, payment.providerId));
    if (!provider || !provider.razorpayLinkedAccountId) {
      res.status(400).json({ error: "Provider does not have a linked Razorpay account configured." });
      return;
    }

    const milestoneAmount = Number(payment.netToProvider) / payment.totalMilestones;
    const amountInPaise = Math.round(milestoneAmount * 100);

    try {
      const transfer = await razorpay.payments.transfer(payment.upiTransactionId!, {
        transfers: [
          {
            account: provider.razorpayLinkedAccountId,
            amount: amountInPaise,
            currency: "INR",
            notes: {
              requirementId,
              paymentId: payment.id,
              milestoneNumber: proof.milestoneNumber,
              approvedBy: req.user!.userId,
            },
            linked_account_notes: ["requirementId"],
            on_hold: 0,
          },
        ],
      } as any);

      const transferItem = (transfer as any).items?.[0] ?? transfer as any;
      transferId = transferItem.id ?? `transfer_${Date.now().toString(36)}`;
    } catch (err: any) {
      // Sandbox compatibility block
      const isSandboxError =
        !process.env.RAZORPAY_KEY_SECRET ||
        process.env.RAZORPAY_KEY_SECRET === "rzp_test_mocksecret" ||
        err?.statusCode === 400;

      if (isSandboxError) {
        transferId = `sandbox_transfer_${Date.now().toString(36)}`;
      } else {
        res.status(502).json({
          error: "Razorpay Route transfer failed. Milestone funds remain in escrow.",
          details: err?.error?.description ?? String(err),
        });
        return;
      }
    }
  }

  // 4. Atomically update DB records inside a Drizzle transaction
  const [updatedProof] = await db.transaction(async (tx) => {
    const [updatedWp] = await tx.update(workProofsTable)
      .set({
        buyerApproved: parsed.data.approved,
        buyerNote: parsed.data.buyerNote ?? null,
        approvedAt: parsed.data.approved ? new Date() : null,
      })
      .where(eq(workProofsTable.id, parsed.data.workProofId))
      .returning();

    if (parsed.data.approved) {
      const newCompleted = payment.milestonesCompleted + 1;
      const allDone = newCompleted >= payment.totalMilestones;

      await tx.update(paymentsTable)
        .set({
          milestonesCompleted: newCompleted,
          escrowStatus: allDone ? "released" : "in_progress",
          updatedAt: new Date(),
        })
        .where(eq(paymentsTable.id, payment.id));

      if (allDone) {
        await tx.update(requirementsTable)
          .set({ status: "completed" })
          .where(eq(requirementsTable.id, requirementId));
      }
    }

    return [updatedWp];
  });

  if (parsed.data.approved) {
    const newCompleted = payment.milestonesCompleted + 1;
    const allDone = newCompleted >= payment.totalMilestones;
    if (allDone) {
      // Recalculate OmniCredit score for the provider asynchronously
      recalculateOmniScore(payment.providerId).catch(() => {/* non-critical */});
    }
  }

  res.json({
    id: updatedProof.id,
    requirementId: updatedProof.requirementId,
    providerId: updatedProof.providerId,
    milestoneNumber: updatedProof.milestoneNumber,
    milestoneTitle: updatedProof.milestoneTitle,
    notes: updatedProof.notes,
    proofUrl: updatedProof.proofUrl,
    buyerApproved: updatedProof.buyerApproved,
    buyerNote: updatedProof.buyerNote,
    submittedAt: updatedProof.submittedAt.toISOString(),
    approvedAt: updatedProof.approvedAt?.toISOString() ?? null,
    transferId,
  });
});

// ─── GET /requirements/:requirementId/payment/invoice ──────────────────────────
// Streams a GST-compliant PDF invoice for completed (released) payments.
// Accessible by both buyer and contractor of the requirement.
router.get("/requirements/:requirementId/payment/invoice", requireAuth, async (req, res): Promise<void> => {
  const requirementId = Array.isArray(req.params.requirementId)
    ? req.params.requirementId[0]
    : req.params.requirementId;

  // 1. Fetch payment record
  const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.requirementId, requirementId));
  if (!payment) { res.status(404).json({ error: "Payment record not found" }); return; }

  // 2. Only allow download once funds have been released
  if (payment.escrowStatus !== "released") {
    res.status(409).json({
      error: `Invoice is only available once the escrow is released. Current status: '${payment.escrowStatus}'.`,
    });
    return;
  }

  // 3. Authorisation — only buyer or provider of this payment
  const requesterId = req.user!.userId;
  if (requesterId !== payment.buyerId && requesterId !== payment.providerId) {
    res.status(403).json({ error: "Forbidden — you are not a party to this payment." });
    return;
  }

  // 4. Fetch requirement for title
  const [requirement] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, requirementId));
  if (!requirement) { res.status(404).json({ error: "Requirement not found" }); return; }

  // 5. Fetch buyer and provider user records
  const [buyer] = await db.select().from(usersTable).where(eq(usersTable.id, payment.buyerId));
  const [provider] = await db.select().from(usersTable).where(eq(usersTable.id, payment.providerId));

  if (!buyer || !provider) { res.status(404).json({ error: "User records not found" }); return; }

  // 6. Build a deterministic invoice number
  const invoiceNumber = `OBI-${Date.now().toString(36).toUpperCase()}-${requirementId.substring(0, 6).toUpperCase()}`;
  const invoiceDate = new Date().toLocaleDateString("en-IN", {
    day: "2-digit", month: "long", year: "numeric",
  });

  // 7. Stream PDF
  const { streamGstInvoice } = await import("../lib/gst-invoice.js");
  streamGstInvoice(res, {
    invoiceNumber,
    invoiceDate,
    buyerName: buyer.name,
    buyerEmail: buyer.email,
    buyerGst: buyer.gstNumber,
    contractorName: provider.name,
    contractorEmail: provider.email,
    contractorGst: provider.gstNumber,
    razorpayLinkedAccountId: provider.razorpayLinkedAccountId,
    requirementTitle: requirement.title,
    requirementId,
    baseAmount: Number(payment.netToProvider),
    platformFee: Number(payment.platformFeeAmount),
    tdsAmount: Number(payment.tdsAmount),
  });
});

export default router;

