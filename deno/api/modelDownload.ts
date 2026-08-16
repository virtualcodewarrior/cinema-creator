// API route: POST /api/models/{id}/download
// Downloads a model's weights from HuggingFace to the local models directory.

import { LOCAL_MODEL_CATALOG, ZIMAGE_AUXILIARY } from "../storage/models.ts";
import { downloadAuxiliary, downloadModel } from "../storage/downloads.ts";
import { type ApiResponse, jsonResponse } from "./_utils.ts";
import type { Config } from "../lib/config.ts";

export interface DownloadProgress {
  id: string;
  phase: "downloading" | "done" | "error";
  progress: number;
  error?: string;
}

export type ProgressCallback = (progress: DownloadProgress) => void;

export interface ModelDownloadRequest extends ApiResponse {
  data: {
    downloading: boolean;
    modelId: string;
  };
}

export interface AuxDownloadRequest extends ApiResponse {
  data: {
    downloading: boolean;
    auxKey: string;
  };
}

// Track active downloads
const activeDownloads = new Map<string, { abort: AbortController }>();

/**
 * Download a model's weights.
 */
export async function handleModelDownloadRequest(
  modelId: string,
  config: Config,
): Promise<Response> {
  // Check if already downloading
  if (activeDownloads.has(modelId)) {
    return jsonResponse({
      ok: true,
      data: { downloading: true, modelId },
    });
  }

  // Find model in catalog
  const model = LOCAL_MODEL_CATALOG.find((m) => m.id === modelId);
  if (!model || !model.downloadUrl) {
    return jsonResponse({
      ok: false,
      error: `Model "${modelId}" not found or has no download URL`,
    }, 404);
  }

  // Check if already downloaded
  const modelsDir = `${config.dataDir}/models`;
  const modelPath = `${modelsDir}/${model.filename}`;
  try {
    await Deno.stat(modelPath);
    return jsonResponse({
      ok: false,
      error: `Model "${model.name}" is already downloaded`,
    }, 400);
  } catch {
    // Not downloaded yet, proceed
  }

  // Start download
  const abort = new AbortController();
  activeDownloads.set(modelId, { abort });

  // Create a sub-queue for tracking download progress
  const downloadQueue = new DownloadProgressQueue();

  // Run download in background
  (async () => {
    try {
      await downloadModel(
        modelId,
        model.downloadUrl!,
        modelPath,
        (p) => {
          downloadQueue.emit({
            id: modelId,
            phase: p.phase as "downloading" | "done" | "error",
            progress: p.progress,
            error: p.error,
          });
        },
        { signal: abort.signal },
      );

      activeDownloads.delete(modelId);
      downloadQueue.emit({ id: modelId, phase: "done", progress: 1 });
    } catch (err) {
      activeDownloads.delete(modelId);
      const message = err instanceof Error ? err.message : String(err);
      downloadQueue.emit({ id: modelId, phase: "error", progress: 0, error: message });
    }
  })();

  return jsonResponse({ ok: true, data: { downloading: true, modelId } });
}

/**
 * Download auxiliary files for Z-Image models.
 */
export async function handleAuxDownloadRequest(
  auxKey: string,
  config: Config,
): Promise<Response> {
  if (activeDownloads.has(auxKey)) {
    return jsonResponse({
      ok: true,
      data: { downloading: true, auxKey },
    });
  }

  const aux = ZIMAGE_AUXILIARY[auxKey as keyof typeof ZIMAGE_AUXILIARY];
  if (!aux || !aux.downloadUrl) {
    return jsonResponse({
      ok: false,
      error: `Auxiliary file "${auxKey}" not found`,
    }, 404);
  }

  const modelsDir = `${config.dataDir}/models`;
  const auxPath = `${modelsDir}/${aux.filename}`;

  try {
    await Deno.stat(auxPath);
    return jsonResponse({
      ok: false,
      error: `Auxiliary file "${aux.displayName}" is already downloaded`,
    }, 400);
  } catch {
    // Not downloaded yet
  }

  const abort = new AbortController();
  activeDownloads.set(auxKey, { abort });

  const downloadQueue = new DownloadProgressQueue();

  (async () => {
    try {
      await downloadAuxiliary(
        auxKey,
        aux.downloadUrl,
        auxPath,
        (p) => {
          downloadQueue.emit({
            id: auxKey,
            phase: p.phase as "downloading" | "done" | "error",
            progress: p.progress,
            error: p.error,
          });
        },
        { signal: abort.signal },
      );

      activeDownloads.delete(auxKey);
      downloadQueue.emit({ id: auxKey, phase: "done", progress: 1 });
    } catch (err) {
      activeDownloads.delete(auxKey);
      const message = err instanceof Error ? err.message : String(err);
      downloadQueue.emit({ id: auxKey, phase: "error", progress: 0, error: message });
    }
  })();

  return jsonResponse({ ok: true, data: { downloading: true, auxKey } });
}

/**
 * Check if a model download is in progress.
 */
export function isDownloading(modelId: string): boolean {
  return activeDownloads.has(modelId);
}

/**
 * Cancel a model download.
 */
export function cancelDownload(modelId: string): boolean {
  const download = activeDownloads.get(modelId);
  if (download) {
    download.abort.abort();
    activeDownloads.delete(modelId);
    return true;
  }
  return false;
}

/**
 * Simple queue for download progress (used internally).
 */
class DownloadProgressQueue {
  private listeners: ProgressCallback[] = [];

  onProgress(cb: ProgressCallback): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  emit(data: DownloadProgress): void {
    for (const listener of this.listeners) {
      listener(data);
    }
  }
}
