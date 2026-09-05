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

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/omnibid";
const isLocal = connectionString.includes("localhost") || connectionString.includes("127.0.0.1");

// Resolve CA certificate bundle for strict TLS verification
const caCertPath = path.resolve(__dirname, "../../certs/supabase-prod-ca.crt");
let caCert: string | undefined;
if (fs.existsSync(caCertPath)) {
  caCert = fs.readFileSync(caCertPath, "utf-8");
}

export const pool = new Pool({
  connectionString,
  ssl: isLocal
    ? false
    : {
        ca: caCert,
        rejectUnauthorized: true,
      },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export const db = drizzle(pool, { schema });
export default db;
