import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createMockDb } from "./mock-db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config();

const { Pool } = pg;

let pool: pg.Pool | undefined;
let activeDb: any;
let mockFallbackActive = false;

try {
  const dbUrl = (process.env.DATABASE_URL || "").trim();
  if (!dbUrl) {
    throw new Error("DATABASE_URL not configured");
  }
  pool = new Pool({
    connectionString: dbUrl,
    connectionTimeoutMillis: 2500,
    idleTimeoutMillis: 30000,
  });
  pool.on("error", () => {
    // Prevent unhandled pool errors when database is offline
  });
  activeDb = drizzle(pool as any, { schema });
} catch {
  pool = undefined;
  activeDb = createMockDb();
  mockFallbackActive = true;
}

let probePromise: Promise<boolean> | null = null;

export async function ensureDbReady(): Promise<boolean> {
  if (mockFallbackActive || !pool) return false;
  if (!probePromise) {
    probePromise = (async () => {
      try {
        await Promise.race([
          pool!.query("SELECT 1"),
          new Promise((_, reject) => setTimeout(() => reject(new Error("DB probe timeout")), 2500)),
        ]);
        return true;
      } catch {
        console.warn("[AI Studio] Configured DATABASE_URL is unreachable — switching @omnibid/db to in-memory Drizzle mock.");
        mockFallbackActive = true;
        activeDb = createMockDb();
        try {
          await pool?.end();
        } catch {
          // ignore
        }
        pool = undefined;
        return false;
      }
    })();
  }
  return probePromise;
}

export function isUsingMockDb(): boolean {
  return mockFallbackActive || !pool;
}

const db: any = new Proxy(
  {},
  {
    get(_target, prop, receiver) {
      const value = Reflect.get(activeDb, prop, receiver);
      return typeof value === "function" ? value.bind(activeDb) : value;
    },
  }
);

export { pool, db };
export * from "./schema";
export { createMockDb };
