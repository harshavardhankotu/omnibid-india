import { defineConfig } from "drizzle-kit";
import path from "path";
import fs from "fs";

// Pure Node.js .env parser (avoids module dependency issues)
const rootEnvPath = path.resolve(__dirname, "../.env");
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

const dbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  throw new Error("DIRECT_URL or DATABASE_URL must be provided for migrations and schema operations");
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: dbUrl,
  },
});
