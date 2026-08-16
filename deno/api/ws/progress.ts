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
