// API route: GET /api/generate/{jobId}
// Returns the current status of a generation job.

import type { JobQueue } from "../lib/queue.ts";
import { type ApiResponse, jsonResponse } from "./_utils.ts";

export interface JobStatusResponse extends ApiResponse {
  data: {
    jobId: string;
    status: "queued" | "running" | "completed" | "failed" | "not-found";
    progress?: number;
    step?: number;
    totalSteps?: number;
    url?: string;
    seed?: number;
    error?: string;
  };
}

export function handleJobStatusRequest(
  jobId: string,
  queue: JobQueue,
): Response {
  const job = queue.getJob(jobId);

  if (!job) {
    return jsonResponse({
      ok: true,
      data: { jobId, status: "not-found" },
    });
  }

  return jsonResponse({
    ok: true,
    data: {
      jobId: job.id,
      status: job.status,
      progress: job.result ? 1 : undefined,
      url: (job.result as { url?: string } | undefined)?.url,
      seed: (job.result as { seed?: number } | undefined)?.seed,
      error: job.error,
    },
  });
}
