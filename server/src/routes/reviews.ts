import { Router, type IRouter } from "express";
import { and, eq, desc } from "drizzle-orm";
import { db, requirementsTable, reviewsTable, usersTable } from "@omnibid/db";
import { CreateReviewBody } from "@omnibid/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.post("/reviews", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateReviewBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const rating = Math.round(parsed.data.rating);
  if (rating < 1 || rating > 5) {
    res.status(400).json({ error: "Rating must be between 1 and 5 stars." });
    return;
  }

  const [requirement] = await db
    .select()
    .from(requirementsTable)
    .where(eq(requirementsTable.id, parsed.data.requirementId));

  if (!requirement) {
    res.status(404).json({ error: "Contract requirement not found." });
    return;
  }

  if (requirement.buyerId !== req.user!.userId) {
    res.status(403).json({ error: "Only the buyer of this contract can submit provider feedback." });
    return;
  }

  if (requirement.status !== "completed") {
    res.status(409).json({ error: "Feedback can only be submitted once the contract is completed." });
    return;
  }

  const [existing] = await db
    .select()
    .from(reviewsTable)
    .where(
      and(
        eq(reviewsTable.requirementId, parsed.data.requirementId),
        eq(reviewsTable.reviewerId, req.user!.userId),
        eq(reviewsTable.revieweeId, parsed.data.revieweeId)
      )
    );

  if (existing) {
    res.status(409).json({ error: "You have already submitted feedback for this completed contract." });
    return;
  }

  const [review] = await db
    .insert(reviewsTable)
    .values({
      requirementId: parsed.data.requirementId,
      reviewerId: req.user!.userId,
      revieweeId: parsed.data.revieweeId,
      rating,
      comment: parsed.data.comment?.trim() || null,
    })
    .returning();

  const [reviewer] = await db.select().from(usersTable).where(eq(usersTable.id, review.reviewerId));

  res.status(201).json({
    id: review.id,
    requirementId: review.requirementId,
    requirementTitle: requirement.title,
    reviewerId: review.reviewerId,
    revieweeId: review.revieweeId,
    rating: review.rating,
    comment: review.comment,
    reviewerName: reviewer?.name ?? "Unknown",
    createdAt: review.createdAt.toISOString(),
  });
});

router.get("/requirements/:id/review", async (req, res): Promise<void> => {
  const requirementId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const reviews = await db
    .select()
    .from(reviewsTable)
    .where(eq(reviewsTable.requirementId, requirementId))
    .orderBy(desc(reviewsTable.createdAt));

  if (!reviews.length) {
    res.json({ review: null });
    return;
  }

  const r = reviews[0];
  const [reviewer] = await db.select().from(usersTable).where(eq(usersTable.id, r.reviewerId));
  const [requirement] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, r.requirementId));

  res.json({
    review: {
      id: r.id,
      requirementId: r.requirementId,
      requirementTitle: requirement?.title ?? null,
      reviewerId: r.reviewerId,
      revieweeId: r.revieweeId,
      rating: r.rating,
      comment: r.comment,
      reviewerName: reviewer?.name ?? "Unknown",
      createdAt: r.createdAt.toISOString(),
    },
  });
});

router.get("/users/:id/reviews", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const reviews = await db
    .select()
    .from(reviewsTable)
    .where(eq(reviewsTable.revieweeId, id))
    .orderBy(desc(reviewsTable.createdAt));

  const result = await Promise.all(
    reviews.map(async (r) => {
      const [reviewer] = await db.select().from(usersTable).where(eq(usersTable.id, r.reviewerId));
      const [requirement] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, r.requirementId));
      return {
        id: r.id,
        requirementId: r.requirementId,
        requirementTitle: requirement?.title ?? null,
        reviewerId: r.reviewerId,
        revieweeId: r.revieweeId,
        rating: r.rating,
        comment: r.comment,
        reviewerName: reviewer?.name ?? "Unknown",
        createdAt: r.createdAt.toISOString(),
      };
    })
  );

  res.json(result);
});

export default router;
