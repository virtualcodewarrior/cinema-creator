// Download manager with resume support for model weights and auxiliary files.
// Handles HTTP downloads with progress callbacks, partial file detection,
// and retry logic.

export interface DownloadProgress {
  id: string;
  phase: "downloading" | "extracting" | "done" | "error";
  progress: number;
  error?: string;
}

export type ProgressCallback = (progress: DownloadProgress) => void;

interface DownloadTask {
  id: string;
  url: string;
  destPath: string;
  onProgress?: ProgressCallback;
}

const MAX_REDIRECTS = 10;
const MAX_RETRIES = 5;

/**
 * Download a file with resume support (HTTP Range) and retry logic.
 */
export async function downloadFile(
  url: string,
  destPath: string,
  onProgress?: (progress: number) => void,
): Promise<void> {
  const tmp = destPath + ".part";

  // Get already downloaded bytes for resume
  let alreadyDownloaded = 0;
  try {
    const stat = await Deno.stat(tmp);
    alreadyDownloaded = stat.size;
  } catch {
    // No partial file yet
  }

  let knownTotal = 0;
  let received = alreadyDownloaded;

  await downloadAttempt(url, tmp, alreadyDownloaded, MAX_REDIRECTS, MAX_RETRIES);

  async function downloadAttempt(
    requestUrl: string,
    tmpPath: string,
    resumeFrom: number,
    redirectsLeft: number,
    retriesLeft: number,
  ): Promise<void> {
    const urlObj = new URL(requestUrl);

    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (compatible; ai-cinema/1.0)",
      Accept: "*/*",
      Connection: "keep-alive",
    };

    if (resumeFrom > 0) {
      headers.Range = `bytes=${resumeFrom}-`;
    }

    const response = await fetch(requestUrl, { headers });

    // Follow redirects
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirectsLeft <= 0) {
        throw new Error("Too many redirects");
      }
      return downloadAttempt(location, tmpPath, 0, redirectsLeft - 1, retriesLeft);
    }

    if (response.status !== 200 && response.status !== 206) {
      throw new Error(`HTTP ${response.status} from ${urlObj.hostname}${urlObj.pathname}`);
    }

    // Calculate total size
    const contentLength = parseInt(response.headers.get("content-length") || "0", 10);
    if (response.status === 200) {
      // Server ignored Range header — restart
      try {
        await Deno.remove(tmpPath);
      } catch {
        // Ignore
      }
      knownTotal = contentLength;
      received = 0;
    } else {
      // 206 Partial Content
      knownTotal = resumeFrom + contentLength;
    }

    // Write response body to file
    const file = await Deno.open(tmpPath, {
      create: true,
      write: true,
      append: response.status === 206,
    });

    const reader = response.body?.getReader();
    if (!reader) {
      file.close();
      throw new Error("No response body");
    }

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        await file.write(value);
        received += value.length;

        if (knownTotal > 0 && onProgress) {
          onProgress(Math.min(1, received / knownTotal));
        }
      }
    } finally {
      reader.releaseLock();
      file.close();
    }

    // Rename temp to final
    await Deno.rename(tmpPath, destPath);
  }
}

/**
 * Download a model with progress reporting to a callback.
 */
export async function downloadModel(
  modelId: string,
  url: string,
  destPath: string,
  onProgress: ProgressCallback,
): Promise<{ ok: true; path: string }> {
  onProgress({ id: modelId, phase: "downloading", progress: 0 });

  try {
    await downloadFile(
      url,
      destPath,
      (p) => onProgress({ id: modelId, phase: "downloading", progress: p }),
    );
    onProgress({ id: modelId, phase: "done", progress: 1 });
    return { ok: true, path: destPath };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    onProgress({ id: modelId, phase: "error", progress: 0, error: message });
    throw new Error(`Failed to download "${modelId}": ${message}`);
  }
}

/**
 * Download an auxiliary file (text encoder, VAE, etc.).
 */
export function downloadAuxiliary(
  auxKey: string,
  url: string,
  destPath: string,
  onProgress: ProgressCallback,
): Promise<{ ok: true; path: string }> {
  return downloadModel(auxKey, url, destPath, onProgress);
}

/**
 * Download the sd.cpp binary (zip archive extraction).
 */
export async function downloadBinary(
  url: string,
  destDir: string,
  onProgress: (progress: DownloadProgress) => void,
): Promise<{ ok: true; source: string }> {
  onProgress({ id: "__binary__", phase: "downloading", progress: 0 });

  const zipName = url.split("/").pop() ?? "sd-cli.zip";
  const zipPath = `${destDir}/${zipName}`;

  try {
    await downloadFile(url, zipPath, (p) => onProgress({ id: "__binary__", phase: "downloading", progress: p }));

    onProgress({ id: "__binary__", phase: "extracting", progress: 0.95 });
    await extractZip(zipPath, destDir);
    await Deno.remove(zipPath);

    onProgress({ id: "__binary__", phase: "done", progress: 1 });
    return { ok: true, source: "downloaded" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    onProgress({ id: "__binary__", phase: "error", progress: 0, error: message });
    throw err;
  }
}

/**
 * Extract a zip file using the system unzip command.
 */
async function extractZip(zipPath: string, destDir: string): Promise<void> {
  const cmd = new Deno.Command("unzip", {
    args: ["-o", zipPath, "-d", destDir],
  });
  const { code } = await cmd.output();
  if (code !== 0) {
    throw new Error(`Failed to extract zip: ${zipPath}`);
  }
}

/**
 * Find a file by name recursively under a directory.
 */
export function findFile(dir: string, name: string): string | null {
  try {
    for (const entry of Deno.readDirSync(dir)) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory) {
        const found = findFile(full, name);
        if (found) return found;
      } else if (entry.name === name) {
        return full;
      }
    }
  } catch {
    // Directory doesn't exist or isn't readable
  }
  return null;
}
