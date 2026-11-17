import app from "./app.js";
import { logger } from "./lib/logger.js";
import { autoBootstrap } from "./services/auto-bootstrap.js";
import { ensureServerDbReady } from "./db/connection.js";

const envPort = process.env["PORT"];
const rawPort = !envPort || envPort === "8080" ? "3000" : envPort;

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function startServer(): Promise<void> {
  try {
    await ensureServerDbReady();
    await autoBootstrap();
  } catch (err: any) {
    logger.error({ err }, "Auto-bootstrap initialization warning");
  }

  app.listen(port, "0.0.0.0", (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening on 0.0.0.0");
  });
}

startServer();
