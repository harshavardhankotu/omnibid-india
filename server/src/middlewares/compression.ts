import { type Request, type Response, type NextFunction } from "express";
import zlib from "node:zlib";

/**
 * Lightweight native zlib HTTP compression middleware
 * Compresses JSON/Text payloads >= 1KB using gzip if accepted by client.
 * Bypasses text/event-stream (SSE) to maintain real-time low-latency flushing.
 */
export function httpCompression(req: Request, res: Response, next: NextFunction): void {
  const acceptEncoding = (req.headers["accept-encoding"] as string) || "";
  const isSse = req.headers["accept"] === "text/event-stream" || res.getHeader("Content-Type") === "text/event-stream";

  if (isSse || !acceptEncoding.includes("gzip")) {
    return next();
  }

  const originalSend = res.send.bind(res);

  res.send = function (body: any): Response {
    if (!body || res.headersSent) {
      return originalSend(body);
    }

    const contentType = (res.getHeader("Content-Type") as string) || "";
    if (contentType.includes("image/") || contentType.includes("video/") || contentType.includes("audio/")) {
      return originalSend(body);
    }

    const payload =
      typeof body === "string"
        ? Buffer.from(body)
        : Buffer.isBuffer(body)
        ? body
        : Buffer.from(JSON.stringify(body));

    // Only compress responses >= 1KB
    if (payload.length < 1024) {
      return originalSend(body);
    }

    zlib.gzip(payload, (err, compressed) => {
      if (err) {
        return originalSend(body);
      }
      res.setHeader("Content-Encoding", "gzip");
      res.setHeader("Vary", "Accept-Encoding");
      res.removeHeader("Content-Length");
      return originalSend(compressed);
    });

    return res;
  };

  next();
}
