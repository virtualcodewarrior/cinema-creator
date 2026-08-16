// API route: POST /api/v1/{endpoint}
// Muapi-compatible submit endpoint. Accepts model-specific payloads,
// queues a generation job, and returns a request_id for polling.

import type { JobQueue } from "../lib/queue.ts";
import { getModelById, LOCAL_MODEL_CATALOG } from "../storage/models.ts";
import { addHistoryEntry } from "../storage/history.ts";
import type { Config } from "../lib/config.ts";
import { type ApiResponse, jsonResponse } from "./_utils.ts";

export interface MuapiSubmitRequest {
  prompt?: string;
  image_url?: string;
  images_list?: string[];
  aspect_ratio?: string;
  resolution?: string;
  quality?: string;
  duration?: number;
  mode?: string;
  seed?: number;
  strength?: number;
  swap_url?: string;
  video_url?: string;
  videos_list?: string[];
  audio_url?: string;
  last_image?: string;
  name?: string;
  character_orientation?: string;
  num_highlights?: number;
  return_coordinates_only?: boolean;
  duration_seconds?: number;
  edit_prompt?: string;
  upscale_factor?: number;
  output_format?: string;
  [key: string]: unknown;
}

export interface MuapiSubmitResponse extends ApiResponse {
  data: { request_id: string };
}

export async function handleMuapiSubmitRequest(
  endpoint: string,
  body: MuapiSubmitRequest,
  queue: JobQueue,
  config: Config,
): Promise<Response> {
  // For local models, extract model from endpoint or body
  // The endpoint is typically the model id (e.g., "flux-dev-image")
  const modelId = endpoint.replace("-image", "").replace("-video", "");

  // Validate model exists
  const modelBase = getModelById(modelId);
  if (!modelBase) {
    return jsonResponse({
      ok: false,
      error: `Unknown model: ${modelId}`,
    }, 400);
  }

  // Check if model is downloaded
  const modelsDir = `${config.dataDir}/models`;
  const modelPath = `${modelsDir}/${modelBase.filename}`;
  try {
    await Deno.stat(modelPath);
  } catch {
    return jsonResponse({
      ok: false,
      error: `Model "${modelBase.name}" not downloaded. Download it first.`,
    }, 400);
  }

  // Check auxiliary files for Z-Image
  if (modelBase.requiresAuxiliary) {
    const llmPath = `${modelsDir}/${"Qwen3-4B-Instruct-2507-UD-Q4_K_XL.gguf"}`;
    const vaePath = `${modelsDir}/${"ae.safetensors"}`;
    try {
      await Deno.stat(llmPath);
      await Deno.stat(vaePath);
    } catch {
      return jsonResponse({
        ok: false,
        error: `Model "${modelBase.name}" requires auxiliary files. Download them first.`,
      }, 400);
    }
  }

  // Create job
  const requestId = crypto.randomUUID();
  const job = {
    id: requestId,
    model: modelId,
    payload: body,
    status: "queued" as const,
    createdAt: Date.now(),
  };

  queue.enqueue(job);

  // Add to history
  await addHistoryEntry({
    model: modelId,
    modelName: modelBase.name,
    prompt: body.prompt ?? "",
    status: "completed",
    seed: body.seed ?? -1,
  });

  return jsonResponse({ ok: true, data: { request_id: requestId } });
}
