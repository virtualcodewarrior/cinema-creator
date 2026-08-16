// History storage using SQLite via Deno's built-in capabilities.
// For simplicity, uses JSON file storage (no external dependencies).
// Can be upgraded to SQLite later.

export interface HistoryEntry {
  id: string;
  model: string;
  modelName: string;
  prompt: string;
  negative_prompt?: string;
  aspect_ratio?: string;
  width?: number;
  height?: number;
  steps?: number;
  seed: number;
  url?: string;
  status: "completed" | "failed";
  error?: string;
  createdAt: number;
}

const HISTORY_FILE = "~/.ai-cinema/history.json";

function resolvePath(path: string): string {
  if (path.startsWith("~/")) {
    const home = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE");
    if (!home) throw new Error("Cannot resolve ~: $HOME not set");
    return home + path.slice(1);
  }
  return path;
}

function getHistoryPath(): string {
  return resolvePath(HISTORY_FILE);
}

async function loadHistory(): Promise<HistoryEntry[]> {
  const path = getHistoryPath();
  try {
    const content = await Deno.readTextFile(path);
    return JSON.parse(content) as HistoryEntry[];
  } catch {
    return [];
  }
}

async function saveHistory(entries: HistoryEntry[]): Promise<void> {
  const path = getHistoryPath();
  await Deno.writeTextFile(path, JSON.stringify(entries, null, 2));
}

/**
 * Add a history entry.
 */
export async function addHistoryEntry(entry: Omit<HistoryEntry, "id" | "createdAt">): Promise<HistoryEntry> {
  const history = await loadHistory();
  const newEntry: HistoryEntry = {
    ...entry,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };
  history.push(newEntry);
  await saveHistory(history);
  return newEntry;
}

/**
 * Update an existing history entry by ID.
 */
export async function updateHistoryEntry(
  id: string,
  updates: Partial<Omit<HistoryEntry, "id" | "createdAt">>,
): Promise<boolean> {
  const history = await loadHistory();
  const idx = history.findIndex((e) => e.id === id);
  if (idx === -1) return false;
  history[idx] = { ...history[idx], ...updates };
  await saveHistory(history);
  return true;
}

/**
 * List history entries (most recent first).
 */
export async function listHistory(limit = 50): Promise<HistoryEntry[]> {
  const history = await loadHistory();
  return history
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

/**
 * Get a single history entry by ID.
 */
export async function getHistoryEntry(id: string): Promise<HistoryEntry | undefined> {
  const history = await loadHistory();
  return history.find((e) => e.id === id);
}

/**
 * Delete a history entry by ID.
 */
export async function deleteHistoryEntry(id: string): Promise<boolean> {
  const history = await loadHistory();
  const idx = history.findIndex((e) => e.id === id);
  if (idx === -1) return false;
  history.splice(idx, 1);
  await saveHistory(history);
  return true;
}

/**
 * Clear all history.
 */
export async function clearHistory(): Promise<void> {
  await saveHistory([]);
}
