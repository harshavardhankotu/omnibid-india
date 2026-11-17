import { Router, type IRouter } from "express";
import { and, eq, avg, count } from "drizzle-orm";
import { db, usersTable, reviewsTable, bidsTable, providerSubscriptionsTable } from "@omnibid/db";
import { UpdateUserBody } from "@omnibid/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/users/:id", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const [reviewStats] = await db
    .select({ count: count(), avg: avg(reviewsTable.rating) })
    .from(reviewsTable)
    .where(eq(reviewsTable.revieweeId, id));

  const [wonBids] = await db
    .select({ count: count() })
    .from(bidsTable)
    .where(and(eq(bidsTable.providerId, id), eq(bidsTable.status, "accepted")));

  const [sub] = await db
    .select()
    .from(providerSubscriptionsTable)
    .where(eq(providerSubscriptionsTable.providerId, id));

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    city: user.city,
    state: user.state,
    pincode: user.pincode,
    avatarUrl: user.avatarUrl,
    trustScore: user.trustScore,
    isVerified: user.isVerified,
    aadhaarVerified: user.aadhaarVerified,
    createdAt: user.createdAt.toISOString(),
    reviewCount: Number(reviewStats?.count ?? 0),
    avgRating: reviewStats?.avg ? Number(reviewStats.avg) : null,
    totalBidsWon: Number(wonBids?.count ?? 0),
    subscriptionPlan: sub?.plan ?? null,
  });
});

router.patch("/users/:id/update", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  if (req.user!.userId !== id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Record<string, string | null> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.phone !== undefined) updates.phone = parsed.data.phone ?? null;
  if (parsed.data.city !== undefined) updates.city = parsed.data.city ?? null;
  if (parsed.data.state !== undefined) updates.state = parsed.data.state ?? null;
  if (parsed.data.pincode !== undefined) updates.pincode = parsed.data.pincode ?? null;
  if (parsed.data.avatarUrl !== undefined) updates.avatarUrl = parsed.data.avatarUrl ?? null;

  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    city: user.city,
    state: user.state,
    pincode: user.pincode,
    avatarUrl: user.avatarUrl,
    trustScore: user.trustScore,
    isVerified: user.isVerified,
    aadhaarVerified: user.aadhaarVerified,
    createdAt: user.createdAt.toISOString(),
  });
});

export default router;
