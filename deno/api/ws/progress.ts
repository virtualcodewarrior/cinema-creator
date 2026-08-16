// API route: WebSocket /ws/progress
// Streams real-time progress updates for generation jobs.

import type { JobQueue, ProgressEvent } from "../../lib/queue.ts";
import { getLogger, type Logger } from "../../lib/logger.ts";

const logger: Logger = getLogger("ws");

interface WsClient {
  jobId: string;
}

const clients = new Map<string, WsClient>();

export function setupProgressWebSocket(
  queue: JobQueue,
): (request: Request) => Response {
  // Subscribe to queue progress events
  queue.onProgress((jobId: string, data: ProgressEvent) => {
    // Broadcast to all clients interested in this job
    const message = `data: ${JSON.stringify(data)}\n\n`;
    for (const [clientId, client] of clients) {
      if (client.jobId === jobId) {
        // Send via WebSocket send
        const wsKey = clientId;
        // We store the socket in a separate map for sending
        const ws = wsClients.get(wsKey);
        if (ws) {
          try {
            ws.send(message);
          } catch {
            // Client disconnected
          }
        }
      }
    }
  });

  return (request: Request) => {
    const url = new URL(request.url);
    const jobId = url.searchParams.get("jobId");

    if (!jobId) {
      return new Response("Missing jobId parameter", { status: 400 });
    }

    const { response, socket: ws } = Deno.upgradeWebSocket(request);

    wsClients.set(jobId, ws);
    clients.set(jobId, { jobId });

    logger.info(`WebSocket client connected for job ${jobId}`);

    // Send initial status
    const job = queue.getJob(jobId);
    if (job) {
      const initialData = {
        type: "initial" as const,
        status: job.status,
        error: job.error,
        result: job.result,
      };
      try {
        ws.send(JSON.stringify(initialData));
      } catch {
        // Client may have disconnected
      }
    }

    ws.onmessage = (event) => {
      // Handle client messages (e.g., cancel)
      try {
        const msg = JSON.parse(event.data as string);
        if (msg.type === "cancel") {
          queue.cancel(jobId);
        }
      } catch {
        // Ignore parse errors
      }
    };

    ws.onclose = () => {
      clients.delete(jobId);
      wsClients.delete(jobId);
      logger.info(`WebSocket client disconnected for job ${jobId}`);
    };

    ws.onerror = () => {
      clients.delete(jobId);
      wsClients.delete(jobId);
    };

    return response;
  };
}

// Store WebSocket instances for sending messages
const wsClients = new Map<string, WebSocket>();

/**
 * Serve static files from the uploads or output directories.
 */
export async function serveStaticFile(
  path: string,
  dirName: "uploads" | "output",
  config: { dataDir: string },
): Promise<Response> {
  const fullPath = `${config.dataDir}/${dirName}/${path}`;

  try {
    const file = await Deno.open(fullPath);
    const stat = await Deno.stat(fullPath);

    // Determine content type
    let contentType = "application/octet-stream";
    if (path.endsWith(".png")) contentType = "image/png";
    else if (path.endsWith(".jpg") || path.endsWith(".jpeg")) contentType = "image/jpeg";
    else if (path.endsWith(".webp")) contentType = "image/webp";
    else if (path.endsWith(".mp4")) contentType = "video/mp4";
    else if (path.endsWith(".webm")) contentType = "video/webm";
    else if (path.endsWith(".mp3")) contentType = "audio/mpeg";
    else if (path.endsWith(".wav")) contentType = "audio/wav";
    else if (path.endsWith(".ogg")) contentType = "audio/ogg";

    return new Response(file.readable, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(stat.size),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

// ─── Frontend static file serving ─────────────────────────────────────────────

const FRONTEND_DIR = new URL("../../out", import.meta.url).pathname;

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

let frontendReady = false;
let frontendCheckAttempts = 0;

async function checkFrontendExists(): Promise<boolean> {
  if (frontendReady) return true;
  if (frontendCheckAttempts > 10) return false;
  frontendCheckAttempts++;
  try {
    await Deno.stat(FRONTEND_DIR);
    frontendReady = true;
    return true;
  } catch {
    return false;
  }
}

export async function serveFrontend(request: Request, config: { dataDir: string }): Promise<Response> {
  const url = new URL(request.url);
  let pathname = url.pathname;

  // Don't serve frontend for uploads/output paths (handled elsewhere)
  if (pathname.startsWith("/uploads/") || pathname.startsWith("/output/")) {
    return new Response("", { status: 204 });
  }

  // Check if frontend is available
  const exists = await checkFrontendExists();
  if (!exists) {
    return new Response(
      `<html><head><meta http-equiv="refresh" content="5;url=/"></head><body><p>Building frontend... Please wait.</p></body></html>`,
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  // Handle SPA routing: if the path doesn't match a static file, serve index.html
  let filePath = "";
  if (pathname === "/") {
    filePath = `${FRONTEND_DIR}/index.html`;
  } else if (pathname.endsWith("/")) {
    // Directory-like path: try index.html in that directory
    filePath = `${FRONTEND_DIR}${pathname}index.html`;
  } else {
    // Try the exact path first
    filePath = `${FRONTEND_DIR}${pathname}`;
    let fileExists = false;
    try {
      await Deno.stat(filePath);
      fileExists = true;
    } catch {
      fileExists = false;
    }
    // If not found, try adding .html extension
    if (!fileExists) {
      filePath = `${filePath}.html`;
    }
  }

  try {
    const file = await Deno.open(filePath);
    const stat = await Deno.stat(filePath);

    // Determine content type from file extension
    const ext = filePath.split(".").pop()?.toLowerCase() || "";
    const contentType = CONTENT_TYPES[`.${ext}`] || "application/octet-stream";

    // Cache strategy: static assets get long cache, HTML gets no cache
    let cacheControl = "public, max-age=31536000, immutable";
    if (ext === "html") {
      cacheControl = "no-cache, no-store, must-revalidate";
    } else if (ext === "js" || ext === "css") {
      // Next.js static assets have hashes in names, safe to cache long
      cacheControl = "public, max-age=31536000, immutable";
    }

    return new Response(file.readable, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(stat.size),
        "Cache-Control": cacheControl,
      },
    });
  } catch {
    // Not found - for SPA routing, serve index.html for non-API paths
    if (!pathname.startsWith("/api/") && !pathname.startsWith("/_next/")) {
      try {
        const indexContent = await Deno.readTextFile(`${FRONTEND_DIR}/index.html`);
        return new Response(indexContent, {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-cache, no-store, must-revalidate",
          },
        });
      } catch {
        return new Response("Frontend not found. Run `npm run build` to generate the static site.", { status: 404 });
      }
    }
    return new Response("Not found", { status: 404 });
  }
}
