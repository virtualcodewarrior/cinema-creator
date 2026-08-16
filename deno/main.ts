// Main entry point for the Deno backend server.
// Starts an HTTP server on the configured port with all API routes.

import { ensureDataDirs, loadConfig } from "./lib/config.ts";
import { getLogger, setLogLevel } from "./lib/logger.ts";
import { extractApiKey, validateApiKey } from "./lib/auth.ts";
import { JobQueue } from "./lib/queue.ts";
import { JobDispatcher } from "./lib/dispatcher.ts";
import { SdCppEngine } from "./inference/sdcpp.ts";
import { handleModelsRequest } from "./api/models.ts";
import { type GenerateRequest, handleGenerateRequest } from "./api/generate.ts";
import { handleJobStatusRequest } from "./api/jobStatus.ts";
import { handleUploadRequest } from "./api/upload.ts";
import { handleHistoryDeleteRequest, handleHistoryListRequest } from "./api/history.ts";
import {
  cancelDownload,
  handleAuxDownloadRequest,
  handleModelDownloadRequest,
  isDownloading,
} from "./api/modelDownload.ts";
import { serveStaticFile, setupProgressWebSocket, serveFrontend } from "./api/ws/progress.ts";
import { handleCors, jsonResponse } from "./api/_utils.ts";

// Set up logging
const config = loadConfig();
setLogLevel(config.logLevel);
const logger = getLogger("server");

// Ensure data directories exist
ensureDataDirs(config.dataDir);
logger.info(`Data directory: ${config.dataDir}`);

// Initialize core services
const queue = new JobQueue();
const engine = new SdCppEngine({
  binaryPath: `${config.dataDir}/bin/sd-cli`,
  modelsDir: `${config.dataDir}/models`,
  tmpDir: `${config.dataDir}/tmp`,
  binDir: `${config.dataDir}/bin`,
  queue,
});

const dispatcher = new JobDispatcher(queue, engine, config.dataDir);
dispatcher.start();

const wsHandler = setupProgressWebSocket(queue);

// Request handler
async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  // Handle CORS preflight
  if (method === "OPTIONS") {
    return handleCors();
  }

  // Validate API key (skip for health check)
  if (url.pathname !== "/health") {
    const apiKey = extractApiKey(request.headers);
    const authResult = validateApiKey(apiKey, config);
    if (!authResult.valid) {
      return jsonResponse({ ok: false, error: authResult.error }, 401);
    }
  }

  // ─── Health check ───────────────────────────────────────────────────────
  if (url.pathname === "/health") {
    return jsonResponse({ ok: true, status: "ok" });
  }

  // ─── Model catalog ──────────────────────────────────────────────────────
  if (method === "GET" && url.pathname === "/api/models") {
    return handleModelsRequest(`${config.dataDir}/models`);
  }

  // ─── Model download ─────────────────────────────────────────────────────
  const modelDownloadMatch = url.pathname.match(/^\/api\/models\/(.+)\/download$/);
  if (method === "POST" && modelDownloadMatch) {
    const modelId = modelDownloadMatch[1];
    return handleModelDownloadRequest(modelId, config);
  }

  // ─── Auxiliary download ─────────────────────────────────────────────────
  const auxDownloadMatch = url.pathname.match(/^\/api\/aux\/(.+)\/download$/);
  if (method === "POST" && auxDownloadMatch) {
    const auxKey = auxDownloadMatch[1];
    return handleAuxDownloadRequest(auxKey, config);
  }

  // ─── Cancel download ────────────────────────────────────────────────────
  if (method === "POST" && url.pathname === "/api/download/cancel") {
    const modelId = url.searchParams.get("modelId") ?? url.searchParams.get("auxKey");
    if (!modelId) {
      return jsonResponse({ ok: false, error: "Missing modelId or auxKey" }, 400);
    }
    const cancelled = cancelDownload(modelId);
    return jsonResponse({ ok: true, cancelled });
  }

  // ─── Check download status ──────────────────────────────────────────────
  if (method === "GET" && url.pathname === "/api/download/status") {
    const modelId = url.searchParams.get("modelId");
    if (!modelId) {
      return jsonResponse({ ok: false, error: "Missing modelId" }, 400);
    }
    return jsonResponse({
      ok: true,
      data: { downloading: isDownloading(modelId), modelId },
    });
  }

  // ─── Generate ───────────────────────────────────────────────────────────
  if (method === "POST" && url.pathname === "/api/generate") {
    try {
      const body = (await request.json()) as GenerateRequest;
      return handleGenerateRequest(body, queue, config);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return jsonResponse({ ok: false, error: `Invalid request: ${message}` }, 400);
    }
  }

  // ─── Job status ─────────────────────────────────────────────────────────
  const jobStatusMatch = url.pathname.match(/^\/api\/generate\/(.+)$/);
  if (method === "GET" && jobStatusMatch) {
    const jobId = jobStatusMatch[1];
    return handleJobStatusRequest(jobId, queue);
  }

  // ─── Cancel job ─────────────────────────────────────────────────────────
  if (method === "POST" && url.pathname.startsWith("/api/generate/")) {
    const jobId = url.pathname.replace("/api/generate/", "");
    if (url.searchParams.get("action") === "cancel") {
      const cancelled = queue.cancel(jobId);
      return jsonResponse({ ok: true, cancelled });
    }
  }

  // ─── Upload ─────────────────────────────────────────────────────────────
  if (method === "POST" && url.pathname === "/api/upload") {
    return handleUploadRequest(request, config);
  }

  // ─── History ────────────────────────────────────────────────────────────
  if (method === "GET" && url.pathname === "/api/history") {
    return handleHistoryListRequest(url);
  }
  if (method === "DELETE" && url.pathname === "/api/history") {
    return handleHistoryDeleteRequest(url);
  }

  // ─── WebSocket progress ─────────────────────────────────────────────────
  if (url.pathname === "/ws/progress") {
    return wsHandler(request);
  }

  // ─── Serve static files (uploads, output) ───────────────────────────────
  const uploadMatch = url.pathname.match(/^\/uploads\/(.+)$/);
  if (uploadMatch) {
    return serveStaticFile(uploadMatch[1], "uploads", config);
  }

  const outputMatch = url.pathname.match(/^\/output\/(.+)$/);
  if (outputMatch) {
    return serveStaticFile(outputMatch[1], "output", config);
  }

  // ─── Serve frontend (static files + SPA routing) ────────────────────────
  return serveFrontend(request, config);

  // ─── 404 ────────────────────────────────────────────────────────────────
  return new Response("Not found", { status: 404 });
}

// ─── Start server ────────────────────────────────────────────────────────────

logger.info(`Starting AI Cinema backend on ${config.host}:${config.port}`);
logger.info(`Data directory: ${config.dataDir}`);
logger.info(`sd.cpp binary: ${engine.binaryExists() ? "found" : "not found"}`);

Deno.serve({
  hostname: config.host,
  port: config.port,
}, handleRequest);
