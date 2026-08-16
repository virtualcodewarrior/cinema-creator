// API route: POST /api/v1/upload_file
// Muapi-compatible file upload endpoint.

import { saveUpload, getServePath } from "../storage/files.ts";
import type { Config } from "../lib/config.ts";
import { type ApiResponse, jsonResponse } from "./_utils.ts";

const MAX_UPLOAD_SIZE = 50 * 1024 * 1024; // 50 MB

export interface MuapiUploadResponse extends ApiResponse {
  data: {
    url: string;
    file_url?: string;
    data?: { url: string };
  };
}

export async function handleMuapiUploadRequest(
  request: Request,
  config: Config,
): Promise<Response> {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return jsonResponse({ ok: false, error: "Expected multipart/form-data" }, 400);
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return jsonResponse({ ok: false, error: "No file provided" }, 400);
    }

    if (file.size > MAX_UPLOAD_SIZE) {
      return jsonResponse({
        ok: false,
        error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB, max ${MAX_UPLOAD_SIZE / 1024 / 1024} MB)`,
      }, 400);
    }

    const uploadsDir = `${config.dataDir}/uploads`;
    const fileInfo = await saveUpload(file, uploadsDir);
    const url = getServePath(fileInfo.filename, "uploads");

    return jsonResponse({
      ok: true,
      data: {
        url,
        file_url: url,
        data: { url },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: `Upload failed: ${message}` }, 500);
  }
}
