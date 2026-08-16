// File storage management for uploads and generated outputs.
// Handles file operations with unique naming and cleanup.

export interface FileInfo {
  filename: string;
  path: string;
  size: number;
  contentType: string;
  createdAt: number;
}

/**
 * Save an uploaded file to the uploads directory.
 * Returns a unique filename and the full path.
 */
export async function saveUpload(
  file: File,
  uploadsDir: string,
): Promise<FileInfo> {
  // Generate unique filename
  const ext = file.name.split(".").pop() ?? "bin";
  const timestamp = Date.now();
  const random = crypto.randomUUID().slice(0, 8);
  const filename = `${timestamp}-${random}.${ext}`;
  const fullPath = `${uploadsDir}/${filename}`;

  // Save file
  const bytes = new Uint8Array(await file.arrayBuffer());
  await Deno.writeFile(fullPath, bytes);

  const stat = await Deno.stat(fullPath);

  return {
    filename,
    path: fullPath,
    size: stat.size,
    contentType: file.type || "application/octet-stream",
    createdAt: timestamp,
  };
}

/**
 * Save a generated output to the output directory.
 */
export async function saveOutput(
  dataUrl: string,
  outputDir: string,
): Promise<FileInfo> {
  // Extract base64 data
  const base64 = dataUrl.split(",")[1] ?? "";
  const bytes = new Uint8Array(atob(base64).split("").map((c) => c.charCodeAt(0)));

  const filename = `output-${Date.now()}.png`;
  const fullPath = `${outputDir}/${filename}`;

  await Deno.writeFile(fullPath, bytes);
  const stat = await Deno.stat(fullPath);

  return {
    filename,
    path: fullPath,
    size: stat.size,
    contentType: "image/png",
    createdAt: Date.now(),
  };
}

/**
 * Get a file by its stored filename.
 */
export async function getFile(filepath: string): Promise<Deno.FsFile | null> {
  try {
    return await Deno.open(filepath);
  } catch {
    return null;
  }
}

/**
 * Get the URL path for serving a file.
 */
export function getServePath(filename: string, dirName: "uploads" | "output"): string {
  return `/${dirName}/${filename}`;
}

/**
 * Delete a file by its stored filename.
 */
export async function deleteFile(filename: string, dirName: "uploads" | "output"): Promise<boolean> {
  const filepath = `~/.ai-cinema/${dirName}/${filename}`;
  try {
    await Deno.remove(filepath);
    return true;
  } catch {
    return false;
  }
}

/**
 * List all files in a directory.
 */
export async function listFiles(dirName: "uploads" | "output"): Promise<FileInfo[]> {
  const dir = `~/.ai-cinema/${dirName}`;
  const files: FileInfo[] = [];

  try {
    for await (const entry of Deno.readDir(dir)) {
      if (entry.isFile) {
        const stat = await Deno.stat(`${dir}/${entry.name}`);
        files.push({
          filename: entry.name,
          path: `${dir}/${entry.name}`,
          size: stat.size,
          contentType: entry.name.endsWith(".png") ? "image/png" : "application/octet-stream",
          createdAt: stat.mtime?.getTime() ?? stat.atime?.getTime() ?? Date.now(),
        });
      }
    }
  } catch {
    // Directory doesn't exist
  }

  return files.sort((a, b) => b.createdAt - a.createdAt);
}
