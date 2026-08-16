// API route: GET/DELETE /api/history
// Manages generation history.

import { deleteHistoryEntry, listHistory } from "../storage/history.ts";
import { type ApiResponse, jsonResponse } from "./_utils.ts";

export interface HistoryListResponse extends ApiResponse {
  data: Array<{
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
}

export interface HistoryDeleteResponse extends ApiResponse {
  data: { deleted: boolean };
}

export async function handleHistoryListRequest(
  url: URL,
): Promise<Response> {
  const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);
  const history = await listHistory(Math.min(limit, 100));

  return jsonResponse({
    ok: true,
    data: history.map((entry) => ({
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
  });
}

export async function handleHistoryDeleteRequest(
  url: URL,
): Promise<Response> {
  const id = url.searchParams.get("id");
  if (!id) {
    return jsonResponse({ ok: false, error: "Missing id parameter" }, 400);
  }

  const deleted = await deleteHistoryEntry(id);
  return jsonResponse({ ok: true, data: { deleted } });
}
