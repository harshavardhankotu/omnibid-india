import { Router, type IRouter, type Request, type Response } from "express";
import {
  savePushSubscription,
  getUserSubscriptions,
  sendWebPush,
  type PushSubscriptionData,
} from "../services/push-notification.service.js";

const router: IRouter = Router();

/**
 * POST /api/push/subscribe
 * Registers or updates a client VAPID Web Push subscription.
 * Request body: { userId: string, subscription: { endpoint: string, keys: { p256dh: string, auth: string } } }
 */
router.post("/push/subscribe", async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, subscription } = req.body;

    if (!userId || !subscription?.endpoint) {
      res.status(400).json({
        error: "Missing required fields: userId and subscription with endpoint are required",
      });
      return;
    }

    const userAgent = req.headers["user-agent"] || "unknown";
    const saved = savePushSubscription(
      String(userId),
      subscription as PushSubscriptionData,
      userAgent
    );

    res.status(201).json({
      success: true,
      subscriptionId: saved.id,
      userId: saved.userId,
      registeredAt: saved.createdAt,
      message: "Web Push subscription registered successfully",
    });
  } catch (error: any) {
    console.error("Error saving push subscription:", error);
    res.status(500).json({ error: error.message || "Failed to register push subscription" });
  }
});

/**
 * GET /api/push/subscriptions/:userId
 * Returns registered push subscriptions for a user.
 */
router.get("/push/subscriptions/:userId", async (req: Request, res: Response): Promise<void> => {
  const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const subscriptions = getUserSubscriptions(userId);
  res.json({ userId, count: subscriptions.length, subscriptions });
});

/**
 * POST /api/push/test
 * Sends a test push alert to a user.
 */
router.post("/push/test", async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, title, body } = req.body;
    if (!userId) {
      res.status(400).json({ error: "userId is required" });
      return;
    }

    const result = await sendWebPush(String(userId), {
      title: title || "OmniBid India Push Test",
      body: body || "Real-time reverse auction alerts are configured and active.",
      url: "/",
    });

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
