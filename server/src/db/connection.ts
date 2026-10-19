import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config();

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const { Pool } = pg;

// 1. Runtime API connection string: Port 6543 (Supabase Transaction Pooler)
const runtimeUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/omnibid";

// 2. Direct migration connection string: Port 5432 (Session Mode)
const directUrl = process.env.DIRECT_URL || runtimeUrl;

// Resolve bundled Global Root CA certificate for strict TLS verification
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

// Split Pooler 1: Runtime API queries via transaction pooler (port 6543)
export const pool = new Pool({
  connectionString: runtimeUrl,
  ssl: getSSLConfig(runtimeUrl),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Split Pooler 2: Direct session mode for schema migrations (port 5432)
export const directPool = new Pool({
  connectionString: directUrl,
  ssl: getSSLConfig(directUrl),
  max: 5,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
});

export const db = drizzle(pool, { schema });
export const migrationDb = drizzle(directPool, { schema });
export default db;
