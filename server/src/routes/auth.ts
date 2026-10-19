import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable, providerSubscriptionsTable } from "@omnibid/db";
import { RegisterBody, LoginBody } from "@omnibid/api-zod";
import { requireAuth, signToken } from "../middlewares/auth";

const router: IRouter = Router();

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { name, email, password, role, phone, city, state, pincode } = parsed.data;

  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing.length > 0) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db.insert(usersTable).values({
    name,
    email,
    phone: phone ?? null,
    passwordHash,
    role: role as "buyer" | "provider" | "both",
    city: city ?? null,
    state: state ?? null,
    pincode: pincode ?? null,
  }).returning();

  if (role === "provider" || role === "both" || role === "solo_provider" || role === "agency_provider") {
    await db.insert(providerSubscriptionsTable).values({
      providerId: user.id,
      plan: "free",
      bidsRemaining: 5,
    });
  }

  const token = signToken({ userId: user.id, email: user.email, role: user.role });

  res.status(201).json({
    user: {
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
    },
    token,
  });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { email, password } = parsed.data;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = signToken({ userId: user.id, email: user.email, role: user.role });

  res.json({
    user: {
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
    },
    token,
  });
});

router.post("/auth/logout", (_req, res): void => {
  res.json({ message: "Logged out" });
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  let subscriptionTier = "free";
  try {
    const { db: schemaDb } = await import("../db/connection.js");
    const { users: schemaUsers } = await import("../db/schema.js");
    const [su] = await schemaDb.select().from(schemaUsers).where(eq(schemaUsers.id, user.id));
    if (su?.subscription_tier === "pro") {
      subscriptionTier = "pro";
    }
  } catch {}

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
    kycStatus: user.kycStatus,
    kycVerifiedAt: user.kycVerifiedAt?.toISOString() ?? null,
    razorpayLinkedAccountId: user.razorpayLinkedAccountId,
    subscriptionTier,
    subscription_tier: subscriptionTier,
    createdAt: user.createdAt.toISOString(),
  });
});

export default router;
