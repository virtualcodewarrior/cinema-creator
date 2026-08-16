// API route: GET /api/v1/predictions/{requestId}/result
// Muapi-compatible polling endpoint. Returns job status and result.

import type { JobQueue } from "../lib/queue.ts";
import { type ApiResponse, jsonResponse } from "./_utils.ts";

export interface MuapiPollResponse extends ApiResponse {
  data: {
    status: string;
    outputs?: Array<{ url: string }>;
    url?: string;
    output?: { url: string };
    error?: string;
  };
}

export function handleMuapiPollRequest(
  requestId: string,
  queue: JobQueue,
): Response {
  const job = queue.getJob(requestId);

  if (!job) {
    return jsonResponse({
      ok: true,
      data: {
        status: "pending",
      },
    });
  }

  if (job.status === "queued" || job.status === "running") {
    return jsonResponse({
      ok: true,
      data: {
        status: "processing",
      },
    });
  }

  if (job.status === "completed") {
    const result = job.result as { url?: string; seed?: number } | undefined;
    return jsonResponse({
      ok: true,
      data: {
        status: "completed",
        outputs: result?.url ? [{ url: result.url }] : undefined,
        url: result?.url,
        output: result?.url ? { url: result.url } : undefined,
      },
    });
  }

  if (job.status === "failed") {
    return jsonResponse({
      ok: true,
      data: {
        status: "failed",
        error: job.error,
      },
    });
  }

  return jsonResponse({
    ok: true,
    data: {
      status: "unknown",
    },
  });
}
