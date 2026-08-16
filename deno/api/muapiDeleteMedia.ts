// API route: DELETE /api/v1/predictions/{requestId}/media
// Muapi-compatible media deletion endpoint.

import { deleteHistoryEntry } from "../storage/history.ts";
import { type ApiResponse, jsonResponse } from "./_utils.ts";

export interface MuapiDeleteMediaResponse extends ApiResponse {
  data: { deleted: boolean };
}

export async function handleMuapiDeleteMediaRequest(
  requestId: string,
): Promise<Response> {
  const deleted = await deleteHistoryEntry(requestId);
  return jsonResponse({ ok: true, data: { deleted } });
}
