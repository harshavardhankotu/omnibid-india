import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

process.chdir(rootDir);

const clientIndex = path.join(rootDir, "client", "dist", "index.html");
const serverEntry = path.join(rootDir, "server", "dist", "index.mjs");

if (!fs.existsSync(clientIndex) || !fs.existsSync(serverEntry)) {
  execSync("npm run build", { cwd: rootDir, stdio: "inherit" });
}

if (!process.env.PORT || process.env.PORT === "8080") {
  process.env.PORT = "3000";
}

await import(pathToFileURL(serverEntry).href);
