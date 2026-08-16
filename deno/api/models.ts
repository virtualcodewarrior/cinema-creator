// API route: GET /api/models
// Returns the full model catalog with download states.

import { getModelsWithState } from "../storage/models.ts";
import { jsonResponse } from "./_utils.ts";

export function handleModelsRequest(modelsDir: string): Response {
  const models = getModelsWithState(modelsDir);
  return jsonResponse({ ok: true, data: models });
}
