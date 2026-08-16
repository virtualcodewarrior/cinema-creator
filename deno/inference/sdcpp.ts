// sd.cpp subprocess management for the Deno backend.
// Spawns sd-cli, pipes stdout/stderr, parses progress events,
// and returns the output image as a base64 data URL.

import { getLogger, type Logger } from "../lib/logger.ts";
import { formatStartupProgressMessage, parseGenerationProgressChunk, type ParseState } from "./progressParser.ts";
import type { JobQueue } from "../lib/queue.ts";
import { type GenerationParams, type ModelConfig, resolveArgs } from "./modelRunner.ts";

export interface SdCppOptions {
  binaryPath: string;
  modelsDir: string;
  tmpDir: string;
  binDir: string;
  queue: JobQueue;
}

export class SdCppEngine {
  private logger: Logger;
  private binaryPath: string;
  private modelsDir: string;
  private tmpDir: string;
  private binDir: string;
  private queue: JobQueue;
  private activeProcess: Deno.ChildProcess | null = null;
  private progressState: ParseState = { tail: "", lastStep: 0, lastTotalSteps: 0 };
  private startupHeartbeat: ReturnType<typeof setInterval> | null = null;
  private samplingStarted = false;
  private jobCancellationRequested = false;

  constructor(options: SdCppOptions) {
    this.logger = getLogger("sdcpp");
    this.binaryPath = options.binaryPath;
    this.modelsDir = options.modelsDir;
    this.tmpDir = options.tmpDir;
    this.binDir = options.binDir;
    this.queue = options.queue;

    // Listen for job completion to clean up
    this.queue.onProgress((_jobId, data) => {
      if (data.status === "done") {
        this._cleanupJob();
      }
    });
  }

  /**
   * Check if the sd-cli binary exists.
   */
  binaryExists(): boolean {
    try {
      Deno.statSync(this.binaryPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Run a generation job. Returns when complete (success or failure).
   */
  async generate(jobId: string, params: GenerationParams, model: ModelConfig): Promise<{ url: string; seed: number }> {
    const modelPath = `${this.modelsDir}/${model.filename}`;

    // Verify model file exists
    try {
      await Deno.stat(modelPath);
    } catch {
      throw new Error(`Model file not found: ${modelPath}. Download "${model.name}" first.`);
    }

    // Verify auxiliary files for Z-Image
    if (model.requiresAuxiliary) {
      const auxFiles = [
        { key: "llm", path: params.llmPath ?? "" },
        { key: "vae", path: params.vaePath ?? "" },
      ];
      for (const aux of auxFiles) {
        if (!aux.path) {
          throw new Error(`Missing auxiliary file for Z-Image: ${aux.key}. Download all required files in Settings.`);
        }
        try {
          await Deno.stat(aux.path);
        } catch {
          throw new Error(`Auxiliary file not found: ${aux.key} at ${aux.path}`);
        }
      }
    }

    // Resolve command arguments
    const resolved = resolveArgs(params, model, this.binaryPath, this.tmpDir);

    // Check if job was cancelled before starting
    const job = this.queue.getJob(jobId);
    if (job?.status === "failed" && job.error === "Cancelled by user") {
      throw new Error("Job cancelled");
    }

    this.jobCancellationRequested = false;

    return new Promise<{ url: string; seed: number }>((resolve, reject) => {
      // Track if this promise has been settled
      let settled = false;
      const settle = () => {
        settled = true;
      };
      const outputLines: string[] = [];
      this.samplingStarted = false;

      const spawnEnv: Record<string, string> = {
        ...Deno.env.toObject(),
        DYLD_LIBRARY_PATH: this.binDir,
        LD_LIBRARY_PATH: this.binDir,
      };

      this.logger.info(`[sd-cli] command: ${resolved.binaryPath} ${resolved.args.join(" ")}`);

      let process: Deno.ChildProcess;
      try {
        const cmd = new Deno.Command(resolved.binaryPath, {
          args: resolved.args,
          stdout: "piped",
          stderr: "piped",
          env: spawnEnv,
        });
        process = cmd.spawn();
        this.activeProcess = process;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reject(new Error(`Failed to spawn sd-cli: ${message}`));
        return;
      }

      // Start startup heartbeat
      const startedAt = Date.now();
      this.startupHeartbeat = setInterval(() => {
        if (!this.samplingStarted && !this.jobCancellationRequested) {
          this.queue.emitProgress(jobId, {
            step: 0,
            totalSteps: 20, // approximate
            status: "starting",
            progress: 0,
            message: formatStartupProgressMessage(Date.now() - startedAt),
          });
        }
      }, 5000);

      // Collect output
      const collectOutput = async (reader: ReadableStream<Uint8Array>): Promise<string[]> => {
        const lines: string[] = [];
        const decoder = new TextDecoder();
        let buffer = "";

        for await (const chunk of reader) {
          buffer += decoder.decode(chunk, { stream: true });
          const lineBreaks = buffer.split("\n");
          // Keep last element as it may be incomplete
          buffer = lineBreaks.pop() ?? "";

          for (const line of lineBreaks) {
            const trimmed = line.trimEnd();
            if (trimmed) {
              lines.push(trimmed);
              this._handleOutput(jobId, trimmed, outputLines);
            }
          }
        }
        // Flush remaining buffer
        if (buffer.trim()) {
          lines.push(buffer.trim());
        }
        return lines;
      };

      // Run output collectors in parallel
      const stdoutPromise = collectOutput(process.stdout);
      const stderrPromise = collectOutput(process.stderr);

      // Wait for process to exit
      const statusPromise = process.status.then(async (status) => {
        // Stop heartbeat
        if (this.startupHeartbeat) {
          clearInterval(this.startupHeartbeat);
          this.startupHeartbeat = null;
        }
        this.activeProcess = null;

        const allOutput = [...outputLines].filter((l) => l.trim());
        this.logger.debug(`[sd-cli] full output:\n${allOutput.join("\n")}`);

        if (status.code !== 0) {
          const tail = allOutput.slice(-20).join("\n");
          const killed = status.code === null;
          const hint = killed
            ? "sd-cli was terminated before finishing (often OOM — try a smaller model or close other apps). "
            : "";
          const errMsg = `${hint}sd-cli exited (code ${status.code ?? "signal"}):\n${tail}`;
          this.queue.fail(jobId, errMsg);
          if (!settled) {
            reject(new Error(errMsg));
            settle();
          }
          return;
        }

        // Read output file
        try {
          const imgBuffer = await Deno.readFile(resolved.outputPath);
          // Use Deno.encodeToUtf8 + btoa for base64 encoding
          const base64 = btoa(String.fromCharCode(...imgBuffer));
          const dataUrl = `data:image/png;base64,${base64}`;
          await Deno.remove(resolved.outputPath); // Clean up

          this.queue.emitProgress(jobId, {
            step: 20,
            totalSteps: 20,
            status: "done",
            progress: 1,
          });

          const seed = params.seed !== undefined && params.seed !== -1
            ? params.seed
            : Math.floor(Math.random() * 2147483647);

          this.queue.complete(jobId, { url: dataUrl, seed });
          if (!settled) {
            resolve({ url: dataUrl, seed });
            settle();
          }
        } catch (err) {
          const readErr = err instanceof Error ? err.message : String(err);
          const finalErr = `sd.cpp finished but no output image found: ${readErr}`;
          this.queue.fail(jobId, finalErr);
          if (!settled) {
            reject(new Error(finalErr));
            settle();
          }
        }
      });

      // Handle cancellation
      const cancelCheck = setInterval(() => {
        if (this.jobCancellationRequested) {
          try {
            process.kill("SIGTERM");
          } catch {
            // Process may already be dead
          }
        }
      }, 500);

      // Clean up on resolution
      Promise.allSettled([stdoutPromise, stderrPromise, statusPromise]).finally(() => {
        clearInterval(cancelCheck);
        this._cleanupJob();
      });
    });
  }

  /**
   * Handle a single line of output from sd-cli.
   */
  private _handleOutput(jobId: string, line: string, outputLines: string[]): void {
    outputLines.push(line);

    const events = parseGenerationProgressChunk(line, this.progressState);
    for (const event of events) {
      this.samplingStarted = true;
      if (this.startupHeartbeat) {
        clearInterval(this.startupHeartbeat);
        this.startupHeartbeat = null;
      }
      this.queue.emitProgress(jobId, {
        ...event,
        status: "generating",
      });
    }
  }

  /**
   * Clean up resources after a job completes.
   */
  private _cleanupJob(): void {
    this.progressState = { tail: "", lastStep: 0, lastTotalSteps: 0 };
    this.samplingStarted = false;
    this.jobCancellationRequested = false;
  }

  /**
   * Request cancellation of the current job.
   */
  cancel(): void {
    this.jobCancellationRequested = true;
    if (this.activeProcess) {
      try {
        this.activeProcess.kill("SIGTERM");
      } catch {
        // Process may already be dead
      }
    }
  }
}
