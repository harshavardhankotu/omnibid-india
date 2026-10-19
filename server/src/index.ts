import app from "./app.js";
import { logger } from "./lib/logger.js";
import { autoBootstrap } from "./services/auto-bootstrap.js";

const rawPort = process.env["PORT"] || (process.env.NODE_ENV !== "production" ? "5000" : "");

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
    await autoBootstrap();
  } catch (err: any) {
    logger.error({ err }, "Auto-bootstrap initialization warning");
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}

startServer();
