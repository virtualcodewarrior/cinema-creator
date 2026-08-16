// Progress parser for sd.cpp stdout/stderr output.
// Ported from electron/lib/localInferenceRuntime.js.
// Parses step completion lines like "step 5 / 20" or "5 / 20 - 0.5s/it".

export function stripAnsiSequences(text: string): string {
  // deno-lint-ignore no-control-regex
  return text.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "");
}

export function extractProgressEvents(text: string): ProgressEvent[] {
  const events: ProgressEvent[] = [];
  const patterns = [
    /step\s+(\d+)\s*\/\s*(\d+)/gi,
    /(\d+)\s*\/\s*(\d+)\s*-\s*[\d.]+s\/it/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const step = parseInt(match[1], 10);
      const totalSteps = parseInt(match[2], 10);
      if (Number.isFinite(step) && Number.isFinite(totalSteps) && totalSteps > 0) {
        events.push({
          step,
          totalSteps,
          progress: Math.min(1, step / totalSteps),
        });
      }
      // Prevent infinite loop on zero-length match
      if (match[0].length === 0) {
        pattern.lastIndex++;
      }
    }
  }

  // Deduplicate and sort
  const seen = new Set<string>();
  const unique: ProgressEvent[] = [];
  for (const event of events) {
    const key = `${event.step}-${event.totalSteps}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(event);
    }
  }
  unique.sort((a, b) => {
    const aSteps = a.totalSteps ?? 0;
    const bSteps = b.totalSteps ?? 0;
    if (aSteps !== bSteps) return aSteps - bSteps;
    const aStep = a.step ?? 0;
    const bStep = b.step ?? 0;
    return aStep - bStep;
  });
  return unique;
}

export interface ParseState {
  tail: string;
  lastStep: number;
  lastTotalSteps: number;
}

export function parseGenerationProgressChunk(
  chunk: string,
  state: ParseState = { tail: "", lastStep: 0, lastTotalSteps: 0 },
): ProgressEvent[] {
  const normalizedChunk = stripAnsiSequences(chunk).replace(/\r/g, "\n");
  const combined = `${state.tail}${normalizedChunk}`;
  const events = extractProgressEvents(combined);
  const freshEvents: ProgressEvent[] = [];

  for (const event of events) {
    const totalSteps = event.totalSteps ?? 0;
    if (totalSteps !== state.lastTotalSteps) {
      state.lastTotalSteps = totalSteps;
      state.lastStep = 0;
    }
    const step = event.step ?? 0;
    if (step > state.lastStep) {
      state.lastStep = step;
      freshEvents.push(event);
    }
  }

  // Keep tail for next chunk (last 1KB to handle split lines)
  state.tail = combined.slice(-1024);
  return freshEvents;
}

export function formatStartupProgressMessage(elapsedMs: number): string {
  const seconds = Math.max(0, Math.floor(elapsedMs / 1000));
  if (seconds < 10) return "Starting local model...";
  if (seconds < 60) return `Loading local model (${seconds}s)...`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `Loading local model (${minutes}m ${remainingSeconds}s)...`;
}

export interface ProgressEvent {
  step?: number;
  totalSteps?: number;
  progress?: number;
  status?: "starting" | "generating" | "done";
  message?: string;
}
