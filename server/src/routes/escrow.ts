import { Router } from "express";
import { EscrowService } from "../services/escrow.service.js";
import { InvoiceService } from "../services/invoice.service.js";
import { db } from "../db/connection.js";
import { escrow_payments, requirements, bids, users } from "../db/schema.js";
import { eq } from "drizzle-orm";

const router = Router();

// POST /api/escrow/order
router.post("/api/escrow/order", async (req, res) => {
  try {
    const { requirementId, bidId } = req.body;
    if (!requirementId || !bidId) {
      return res.status(400).json({ error: "requirementId and bidId are required" });
    }

    const orderData = await EscrowService.createEscrowOrder(requirementId, bidId);
    return res.status(200).json(orderData);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Failed to create escrow order" });
  }
});

// POST /api/escrow/verify
router.post("/api/escrow/verify", async (req, res) => {
  try {
    const { requirementId, bidId, razorpayOrderId, razorpayPaymentId, signature } = req.body;
    if (!requirementId || !bidId || !razorpayOrderId || !signature) {
      return res.status(400).json({ error: "Missing required payment verification fields" });
    }

    await EscrowService.verifyAndHoldEscrow({
      requirementId,
      bidId,
      razorpayOrderId,
      razorpayPaymentId: razorpayPaymentId || `pay_mock_${Date.now()}`,
      signature,
    });

    return res.status(200).json({ status: "success", message: "Escrow funds held securely in vault" });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || "Escrow signature verification failed" });
  }
});

// POST /api/escrow/:escrowId/release
router.post("/api/escrow/:escrowId/release", async (req, res) => {
  try {
    const { escrowId } = req.params;
    const { milestoneIndex = 1 } = req.body;

    const result = await EscrowService.releaseMilestoneDisbursement(escrowId, Number(milestoneIndex));
    return res.status(200).json(result);
  } catch (error: any) {
    if (error.statusCode === 409) {
      return res.status(409).json({ error: error.message });
    }
    return res.status(500).json({ error: error?.message || "Disbursement failed" });
  }
});

// GET /api/escrow/:escrowId/invoice
router.get("/api/escrow/:escrowId/invoice", async (req, res) => {
  try {
    const { escrowId } = req.params;
    const [escrow] = await db.select().from(escrow_payments).where(eq(escrow_payments.id, escrowId)).limit(1);
    if (!escrow) {
      return res.status(404).json({ error: "Escrow payment not found" });
    }

    const [reqRecord] = await db.select().from(requirements).where(eq(requirements.id, escrow.requirement_id)).limit(1);
    const [bidRecord] = await db.select().from(bids).where(eq(bids.id, escrow.bid_id)).limit(1);
    const [buyer] = await db.select().from(users).where(eq(users.id, reqRecord.buyer_id)).limit(1);
    const [provider] = await db.select().from(users).where(eq(users.id, bidRecord.provider_id)).limit(1);

    const isInterState = (buyer?.city || "") !== (provider?.city || "");

    InvoiceService.generateGSTInvoice(
      {
        invoiceNumber: `OMNI-INV-${escrow.id.slice(0, 8).toUpperCase()}`,
        invoiceDate: new Date(escrow.created_at).toISOString().split("T")[0],
        sacCode: reqRecord.sector === "IT" ? "9983" : "9954",
        isInterState,
        buyer: {
          name: buyer?.name || "Corporate Client",
          city: buyer?.city || "Bengaluru",
          state: "Karnataka",
          pan: buyer?.pan_number || "AAACB1234K",
          gstin: "29AAACB1234K1Z5",
        },
        provider: {
          name: provider?.name || "Verified Contractor",
          city: provider?.city || "Mumbai",
          state: "Maharashtra",
          pan: provider?.pan_number || "BBBCD5678L",
          gstin: "27BBBCD5678L1Z2",
        },
        requirementTitle: reqRecord.title,
        baseAmount: parseFloat(bidRecord.bid_amount),
        tdsDeducted: parseFloat(escrow.tds_amount),
      },
      res
    );
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Failed to generate GST invoice" });
  }
});

export default router;
