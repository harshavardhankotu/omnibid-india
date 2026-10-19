import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import router from "./routes";
import seoRouter from "./routes/seo.js";
import { logger } from "./lib/logger";
import { httpCompression } from "./middlewares/compression.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app: Express = express();

app.use(httpCompression);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  })
);

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : [
      "http://localhost:3000",
      "http://localhost:5173",
      "https://omnibid-client.vercel.app",
      "capacitor://localhost",
      process.env.CLIENT_URL || "",
    ].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const cleanOrigin = origin.replace(/\/$/, "");
      const cleanAllowed = allowedOrigins.map((o) => o.trim().replace(/\/$/, ""));
      const isVercel = /\.vercel\.app$/.test(cleanOrigin);

      if (cleanAllowed.includes(cleanOrigin) || cleanAllowed.includes("*") || isVercel) {
        callback(null, true);
      } else {
        callback(new Error(`Not allowed by CORS: ${origin}`));
      }
    },
    credentials: true,
  })
);

app.use(
  express.json({
    verify: (req: any, res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true }));

// 0. High-availability Health checks for Render, keep-alive crons, and cloud balancers
app.get(["/healthz", "/health"], (_req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// 1. Mount /sitemap.xml and /robots.txt before router or static assets
app.use(seoRouter);

// 2. Mount API router
app.use("/api", router);

// 3. Single-Origin Static Asset Serving & SPA Fallback
function getClientDistPath(): string | null {
  const candidates = [
    path.resolve(process.cwd(), "client/dist"),
    path.resolve(__dirname, "../../client/dist"),
    path.resolve(__dirname, "../client/dist"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return c;
    }
  }
  return null;
}

const clientDistPath = getClientDistPath();

if (clientDistPath) {
  const indexPath = path.join(clientDistPath, "index.html");

  // Specific service worker route with strict no-cache
  app.get("/sw.js", (_req, res, next) => {
    const swPath = path.join(clientDistPath, "sw.js");
    if (fs.existsSync(swPath)) {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Content-Type", "application/javascript");
      return res.sendFile(swPath);
    }
    next();
  });

  // Serve static assets with proper cache headers
  app.use(
    express.static(clientDistPath, {
      index: false,
      setHeaders: (res, filePath) => {
        const normalized = filePath.replace(/\\/g, "/");
        if (normalized.includes("/assets/")) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else if (normalized.endsWith("sw.js") || normalized.endsWith("index.html")) {
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        }
      },
    })
  );

  // Fallback for all other non-API GET requests to client index.html
  app.get(/^(?!\/api).*/, (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      return next();
    }
    if (req.path.startsWith("/api")) {
      return next();
    }
    if (fs.existsSync(indexPath)) {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      return res.sendFile(indexPath);
    }
    next();
  });
}

export default app;
