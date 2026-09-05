import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

// Synchronously load root .env variables to ensure database modules configure correctly
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootEnvPath = path.resolve(__dirname, "../../.env");
if (fs.existsSync(rootEnvPath)) {
  const envContent = fs.readFileSync(rootEnvPath, "utf-8");
  envContent.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const [key, ...valueParts] = trimmed.split("=");
      const value = valueParts.join("=").trim().replace(/^['"]|['"]$/g, "");
      process.env[key.trim()] = value;
    }
  });
}

import { eq, and, sql } from "drizzle-orm";

const BACKEND_URL = "http://127.0.0.1:3001/api";
const shouldSkip = !process.env.RUN_INTEGRATION_TESTS || !!process.env.CI || !process.env.DATABASE_URL;

describe.skipIf(shouldSkip)("Drizzle Business Logic & Transaction Audit Suite", () => {
  let db: any;
  let usersTable: any;
  let categoriesTable: any;
  let requirementsTable: any;
  let bidsTable: any;
  let paymentsTable: any;

  let buyerId = "";
  let providerId = "";
  let categoryId = "";
  let requirementId = "";
  let bidId = "";
  let paymentId = "";
  let orderId = "";

  let buyerToken = "";
  let providerToken = "";

  beforeAll(async () => {
    try {
      // Dynamically import database and Drizzle ORM after loading environment variables
      const dbModules = await import("../../drizzle/src/index");
      db = dbModules.db;
      usersTable = dbModules.usersTable;
      categoriesTable = dbModules.categoriesTable;
      requirementsTable = dbModules.requirementsTable;
      bidsTable = dbModules.bidsTable;
      paymentsTable = dbModules.paymentsTable;
      // 1. Ensure RLS is active on payments table in DB
      try {
        await db.execute(sql.raw("ALTER TABLE payments ENABLE ROW LEVEL SECURITY;"));
        await db.execute(sql.raw("DROP POLICY IF EXISTS select_payments ON payments;"));
        await db.execute(sql.raw(
          "CREATE POLICY select_payments ON payments FOR SELECT TO authenticated USING (buyer_id = auth.uid() OR provider_id = auth.uid());"
        ));
      } catch (err: any) {
        console.warn("Could not apply payments RLS migration in sandbox:", err.message);
      }

      // 2. Fetch or seed category
      const cats = await db.select().from(categoriesTable).limit(1);
      if (cats.length > 0) {
        categoryId = cats[0].id;
      } else {
        const [newCat] = await db.insert(categoriesTable).values({
          name: "Construction",
          slug: `const_${Date.now()}`,
          iconName: "HardHat",
          description: "Test Category",
          customFields: [],
          minBidFloor: "1000",
        }).returning();
        categoryId = newCat.id;
      }
    } catch (setupErr: any) {
      console.warn("Live database integration setup skipped (no live DB connection):", setupErr?.message);
      return;
    }

    // 3. Register a fresh buyer and provider via the API to get tokens and user IDs
    const buyerEmail = `buyer_${Date.now()}_audit@example.com`;
    const resBuyer = await fetch(`${BACKEND_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Audit Buyer",
        email: buyerEmail,
        password: "secure_password_123",
        role: "buyer",
        city: "Mumbai",
        state: "Maharashtra",
        pincode: "400001",
      }),
    });
    const payloadBuyer = await resBuyer.json();
    buyerToken = payloadBuyer.token;
    buyerId = payloadBuyer.user.id;

    const providerEmail = `provider_${Date.now()}_audit@example.com`;
    const resProvider = await fetch(`${BACKEND_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Audit Provider",
        email: providerEmail,
        password: "secure_password_456",
        role: "provider",
        city: "Mumbai",
        state: "Maharashtra",
        pincode: "400001",
      }),
    });
    const payloadProvider = await resProvider.json();
    providerToken = payloadProvider.token;
    providerId = payloadProvider.user.id;

    // 4. Create an open requirement
    const resReq = await fetch(`${BACKEND_URL}/requirements`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${buyerToken}`,
      },
      body: JSON.stringify({
        categoryId,
        title: "Escrow Project Audit",
        description: "Masonry work needing atomic commits.",
        maxBudget: 60000,
        deadlineHours: 72,
        city: "Mumbai",
        state: "Maharashtra",
        pincode: "400001",
      }),
    });
    const payloadReq = await resReq.json();
    requirementId = payloadReq.id;

    // 5. Place a valid bid from the provider
    const resBid = await fetch(`${BACKEND_URL}/requirements/${requirementId}/bids`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${providerToken}`,
      },
      body: JSON.stringify({
        bidAmount: 50000,
        message: "Professional masonry work.",
        estimatedCompletion: "3 days",
      }),
    });
    const payloadBid = await resBid.json();
    bidId = payloadBid.id;

    // 6. Request escrow initialization from the buyer (generates a pending payment record)
    const resPayInit = await fetch(`${BACKEND_URL}/requirements/${requirementId}/payment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${buyerToken}`,
      },
      body: JSON.stringify({
        bidId,
        totalMilestones: 2,
      }),
    });
    const payloadPayInit = await resPayInit.json();
    paymentId = payloadPayInit.payment.id;
    orderId = payloadPayInit.razorpayOrderId;
  }, 60000);

  afterAll(async () => {
    // Cleanup seeded data in correct referential order
    try {
      if (paymentId) await db.delete(paymentsTable).where(eq(paymentsTable.id, paymentId));
      if (bidId) await db.delete(bidsTable).where(eq(bidsTable.id, bidId));
      if (requirementId) await db.delete(requirementsTable).where(eq(requirementsTable.id, requirementId));
      if (buyerId) await db.delete(usersTable).where(eq(usersTable.id, buyerId));
      if (providerId) await db.delete(usersTable).where(eq(usersTable.id, providerId));
    } catch (err) {
      console.warn("Cleanup warning:", err.message);
    }
  }, 60000);

  // =========================================================================
  // Test Case 1: Atomic Escrow Commitment (Rollback Test)
  // =========================================================================
  it("should rollback payment state to pending if transaction fails before updating requirement", async () => {
    // Verify initial payment state is 'pending'
    const [initialPayment] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, paymentId));
    expect(initialPayment.escrowStatus).toBe("pending");

    let errorThrown = false;
    try {
      await db.transaction(async (tx) => {
        // Step A: Update the paymentsTable to 'held'
        await tx
          .update(paymentsTable)
          .set({ escrowStatus: "held" })
          .where(eq(paymentsTable.id, paymentId));

        // Step B: Deliberately throw an error before making subsequent requirement updates
        throw new Error("Atomic rollback audit failure!");
      });
    } catch (err) {
      if (err.message === "Atomic rollback audit failure!") {
        errorThrown = true;
      }
    }

    expect(errorThrown).toBe(true);

    // Verify database state outside the failed transaction
    // Payments record MUST have rolled back from 'held' to 'pending'
    const [finalPayment] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, paymentId));
    expect(finalPayment.escrowStatus).toBe("pending");
  });

  // =========================================================================
  // Test Case 2: RLS Tenant Isolation (Blind Escrow)
  // =========================================================================
  it("should restrict visibility to 0 records when queried under unauthorized tenant impersonation", async () => {
    const hackerUuid = "77777777-7777-7777-7777-777777777777";

    const visibleRecords = await db.transaction(async (tx) => {
      // 1. Impersonate the hacker UUID at the session layer
      await tx.execute(sql.raw(`SET LOCAL request.jwt.claim.sub = '${hackerUuid}'`));
      await tx.execute(sql.raw("SET LOCAL role = 'authenticated'"));

      // 2. Attempt to select our buyer's payment record
      return await tx.select().from(paymentsTable).where(eq(paymentsTable.id, paymentId));
    });

    // RLS policy select_payments must restrict selection to 0 rows
    expect(visibleRecords.length).toBe(0);
  });

  // =========================================================================
  // Test Case 3: Price Tampering Prevention
  // =========================================================================
  it("should reject verify-signature requests where amount is less than agreed bid amount", async () => {
    // Generate valid payment signatures
    const keySecret = process.env.RAZORPAY_KEY_SECRET || "rzp_test_mocksecret";
    const paymentIdMock = `pay_${Date.now().toString(36)}`;
    const validSignature = crypto
      .createHmac("sha256", keySecret)
      .update(orderId + "|" + paymentIdMock)
      .digest("hex");

    // Make request sending a tampered amount (e.g. ₹5,000 paid for a ₹50,000 bid)
    const res = await fetch(`${BACKEND_URL}/requirements/${requirementId}/payment/verify-signature`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${buyerToken}`,
      },
      body: JSON.stringify({
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentIdMock,
        razorpay_signature: validSignature,
        amount: 5000 * 100, // ₹5,000 in paise (bid requires ₹50,000 + ₹1,000 fee = ₹51,000)
      }),
    });

    const payload = await res.json();
    
    // Assert backend returns a 400 Bad Request indicating tampering was detected
    expect(res.status).toBe(400);
    expect(payload.error).toContain("Price tampering detected");

    // Verify database remains untouched (escrowStatus is still 'pending')
    const [finalPayment] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, paymentId));
    expect(finalPayment.escrowStatus).toBe("pending");
  });

  // =========================================================================
  // Test Case 4: Webhook Idempotency (Double-Charge Prevention)
  // =========================================================================
  it("should process the first signature call normally and return idempotent response on the second", async () => {
    const keySecret = process.env.RAZORPAY_KEY_SECRET || "rzp_test_mocksecret";
    const paymentIdMock = `pay_${Date.now().toString(36)}`;
    const validSignature = crypto
      .createHmac("sha256", keySecret)
      .update(orderId + "|" + paymentIdMock)
      .digest("hex");

    const payloadBody = {
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentIdMock,
      razorpay_signature: validSignature,
      amount: 51000 * 100, // Exact agreed amount (₹50,000 bid + 2% ₹1,000 fee) in paise
    };

    // First Verification Call (processes normally)
    const res1 = await fetch(`${BACKEND_URL}/requirements/${requirementId}/payment/verify-signature`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${buyerToken}`,
      },
      body: JSON.stringify(payloadBody),
    });
    
    expect(res1.status).toBe(200);
    const payload1 = await res1.json();
    expect(payload1.success).toBe(true);

    // Verify DB updated successfully to 'held'
    const [paymentAfterCall1] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, paymentId));
    expect(paymentAfterCall1.escrowStatus).toBe("held");
    expect(paymentAfterCall1.upiTransactionId).toBe(paymentIdMock);

    // Capture DB modification date to verify the second call doesn't overwrite it
    const firstUpdateTimestamp = paymentAfterCall1.updatedAt.getTime();

    // Second Verification Call (Idempotent replay)
    const res2 = await fetch(`${BACKEND_URL}/requirements/${requirementId}/payment/verify-signature`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${buyerToken}`,
      },
      body: JSON.stringify(payloadBody),
    });

    // Must return 200 OK without errors, reflecting successful double-charge prevention
    expect(res2.status).toBe(200);
    const payload2 = await res2.json();
    expect(payload2.success).toBe(true);
    expect(payload2.message).toContain("already processed");

    // Assert that the database row was NOT modified a second time (timestamp remains identical)
    const [paymentAfterCall2] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, paymentId));
    expect(paymentAfterCall2.updatedAt.getTime()).toBe(firstUpdateTimestamp);
  });
});
