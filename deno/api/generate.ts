// API route: POST /api/generate
// Submits a generation job to the queue and returns a job ID.
// The frontend polls GET /api/generate/{jobId} for status.

import type { JobQueue } from "../lib/queue.ts";
import { getModelById, LOCAL_MODEL_CATALOG } from "../storage/models.ts";
import { addHistoryEntry } from "../storage/history.ts";
import type { Config } from "../lib/config.ts";
import { type ApiResponse, jsonResponse } from "./_utils.ts";

export interface GenerateRequest {
  model: string;
  prompt: string;
  negative_prompt?: string;
  aspect_ratio?: string;
  width?: number;
  height?: number;
  steps?: number;
  guidance_scale?: number;
  seed?: number;
  llmPath?: string;
  vaePath?: string;
}

export interface GenerateResponse extends ApiResponse {
  data: { jobId: string };
}

export async function handleGenerateRequest(
  body: GenerateRequest,
  queue: JobQueue,
  config: Config,
): Promise<Response> {
  // Validate model exists
  const modelBase = getModelById(body.model);
  if (!modelBase) {
    return jsonResponse({ ok: false, error: `Unknown model: ${body.model}` }, 400);
  }

  // Find full model info with state
  const modelState = LOCAL_MODEL_CATALOG.find((m) => m.id === body.model);
  if (!modelState) {
    return jsonResponse({ ok: false, error: `Model not found: ${body.model}` }, 404);
  }

  // Check if model is downloaded
  const modelsDir = `${config.dataDir}/models`;
  const modelPath = `${modelsDir}/${modelState.filename}`;
  try {
    await Deno.stat(modelPath);
  } catch {
    return jsonResponse({
      ok: false,
      error: `Model "${modelState.name}" not downloaded. Download it first.`,
    }, 400);
  }

  // Check auxiliary files for Z-Image
  if (modelState.requiresAuxiliary) {
    if (!body.llmPath || !body.vaePath) {
      return jsonResponse({
        ok: false,
        error: `Model "${modelState.name}" requires auxiliary files (text encoder + VAE). Download them first.`,
      }, 400);
    }
  }

  // Create job
  const jobId = crypto.randomUUID();
  const job = {
    id: jobId,
    model: body.model,
    payload: body,
    status: "queued" as const,
    createdAt: Date.now(),
  };

  queue.enqueue(job);

  // Add to history as pending
  await addHistoryEntry({
    model: body.model,
    modelName: modelState.name,
    prompt: body.prompt,
    negative_prompt: body.negative_prompt,
    aspect_ratio: body.aspect_ratio,
    width: body.width,
    height: body.height,
    steps: body.steps,
    seed: body.seed ?? -1,
    status: "completed", // Will be updated when complete
  });

  return jsonResponse({ ok: true, data: { jobId } });
}
