// API route: GET /api/v1/history
// Muapi-compatible history listing endpoint.

import { listHistory } from "../storage/history.ts";
import { type ApiResponse, jsonResponse } from "./_utils.ts";

export interface MuapiHistoryResponse extends ApiResponse {
  data: {
    items: Array<{
      id: string;
      model: string;
      modelName: string;
      prompt: string;
      aspect_ratio?: string;
      seed: number;
      url?: string;
      status: string;
      createdAt: number;
    }>;
    cursor?: string;
    has_more?: boolean;
  };
}

export async function handleMuapiHistoryRequest(
  url: URL,
): Promise<Response> {
  const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);
  const history = await listHistory(Math.min(limit, 100));

  return jsonResponse({
    ok: true,
    data: {
      items: history.map((entry) => ({
        id: entry.id,
        model: entry.model,
        modelName: entry.modelName,
        prompt: entry.prompt,
        aspect_ratio: entry.aspect_ratio,
        seed: entry.seed,
        url: entry.url,
        status: entry.status,
        createdAt: entry.createdAt,
      })),
      cursor: undefined,
      has_more: history.length >= limit,
    },
  });
}
