import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { isUsingMockDb } from "@omnibid/db";
import { isServerUsingMockDb } from "../db/connection.js";

const router: IRouter = Router();

router.get(["/health", "/healthz"], async (_req, res) => {
  if (!process.env.DATABASE_URL || isUsingMockDb() || isServerUsingMockDb()) {
    res.json({ status: "ok", database: "in-memory-mock" });
    return;
  }
  try {
    const { db } = await import("@omnibid/db");
    await db.execute(sql`SELECT 1`);
    res.json({ status: "ok", database: "connected" });
  } catch (err) {
    res.status(500).json({ status: "error", database: "disconnected", error: String(err) });
  }
});

export default router;
