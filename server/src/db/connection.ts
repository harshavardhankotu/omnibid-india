import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createMockDb, ensureDbReady as ensureWorkspaceDbReady } from "@omnibid/db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config();

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const { Pool } = pg;

const runtimeUrl = (process.env.DATABASE_URL || "").trim();
const directUrl = (process.env.DIRECT_URL || runtimeUrl).trim();

const caCertPath = path.resolve(__dirname, "../../certs/supabase-prod-ca.crt");
const caCert = fs.existsSync(caCertPath) ? fs.readFileSync(caCertPath, "utf-8") : undefined;

const getSSLConfig = (connStr: string) => {
  const isLocal = connStr.includes("localhost") || connStr.includes("127.0.0.1");
  if (isLocal) return false;
  return {
    ca: caCert,
    rejectUnauthorized: false,
  };
};

let pool: pg.Pool | undefined;
let directPool: pg.Pool | undefined;
let activeDb: any;
let activeMigrationDb: any;
let mockFallbackActive = false;

try {
  if (!runtimeUrl) {
    throw new Error("DATABASE_URL not configured");
  }
  pool = new Pool({
    connectionString: runtimeUrl,
    ssl: getSSLConfig(runtimeUrl),
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2500,
  });
  pool.on("error", () => {});

  directPool = new Pool({
    connectionString: directUrl,
    ssl: getSSLConfig(directUrl),
    max: 5,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 2500,
  });
  directPool.on("error", () => {});

  activeDb = drizzle(pool, { schema });
  activeMigrationDb = drizzle(directPool, { schema });
} catch {
  const mock = createMockDb();
  activeDb = mock;
  activeMigrationDb = mock;
  mockFallbackActive = true;
}

let probePromise: Promise<boolean> | null = null;

export async function ensureServerDbReady(): Promise<boolean> {
  await ensureWorkspaceDbReady();
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
        console.warn("[AI Studio] Server DATABASE_URL unreachable — falling back to in-memory Drizzle mock.");
        mockFallbackActive = true;
        const mock = createMockDb();
        activeDb = mock;
        activeMigrationDb = mock;
        try {
          await pool?.end();
          await directPool?.end();
        } catch {
          // ignore
        }
        pool = undefined;
        directPool = undefined;
        return false;
      }
    })();
  }
  return probePromise;
}

export function isServerUsingMockDb(): boolean {
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

const migrationDb: any = new Proxy(
  {},
  {
    get(_target, prop, receiver) {
      const value = Reflect.get(activeMigrationDb, prop, receiver);
      return typeof value === "function" ? value.bind(activeMigrationDb) : value;
    },
  }
);

export { pool, directPool, db, migrationDb };
export default db;
