// Job dispatcher — listens for jobs that start running and dispatches them
// to the inference engine.

import type { Job, JobQueue } from "../lib/queue.ts";
import type { SdCppEngine } from "../inference/sdcpp.ts";
import { getLogger, type Logger } from "../lib/logger.ts";
import { getModelById, ZIMAGE_AUXILIARY } from "../storage/models.ts";
import { updateHistoryEntry } from "../storage/history.ts";

export class JobDispatcher {
  private logger: Logger;
  private queue: JobQueue;
  private engine: SdCppEngine;
  private dataDir: string;
  private running = false;
  private processingJobId: string | null = null;

  constructor(queue: JobQueue, engine: SdCppEngine, dataDir: string) {
    this.logger = getLogger("dispatcher");
    this.queue = queue;
    this.engine = engine;
    this.dataDir = dataDir;

    // Listen for jobs that transition to "running"
    this.queue.onStarted((job) => {
      if (!this.running) return;
      if (this.processingJobId) return; // Already processing another job
      this._processJob(job);
    });
  }

  /**
   * Start the dispatcher.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.logger.info("Dispatcher started");
  }

  /**
   * Stop the dispatcher.
   */
  stop(): void {
    this.running = false;
    this.logger.info("Dispatcher stopped");
  }

  /**
   * Process a single job through the engine.
   */
  private async _processJob(job: Job): Promise<void> {
    this.processingJobId = job.id;
    this.logger.info(`Processing job ${job.id} for model ${job.model}`);

    // Get model info
    const modelBase = getModelById(job.model);
    if (!modelBase) {
      this.logger.error(`Job ${job.id}: Unknown model ${job.model}`);
      this.queue.fail(job.id, `Unknown model: ${job.model}`);
      this.processingJobId = null;
      return;
    }

    // Check if model file exists
    const modelPath = `${this.dataDir}/models/${modelBase.filename}`;
    try {
      await Deno.stat(modelPath);
    } catch {
      this.logger.error(`Job ${job.id}: Model file not found: ${modelPath}`);
      this.queue.fail(job.id, `Model file not found: ${modelPath}`);
      this.processingJobId = null;
      return;
    }

    // Resolve auxiliary file paths for Z-Image
    const params = job.payload as Record<string, unknown>;
    const llmPath = modelBase.requiresAuxiliary ? `${this.dataDir}/models/${ZIMAGE_AUXILIARY.llm.filename}` : undefined;
    const vaePath = modelBase.requiresAuxiliary ? `${this.dataDir}/models/${ZIMAGE_AUXILIARY.vae.filename}` : undefined;

    try {
      // Run generation
      const result = await this.engine.generate(job.id, {
        model: job.model,
        prompt: (params.prompt as string) ?? "",
        negative_prompt: params.negative_prompt as string | undefined,
        aspect_ratio: params.aspect_ratio as string | undefined,
        width: params.width as number | undefined,
        height: params.height as number | undefined,
        steps: params.steps as number | undefined,
        guidance_scale: params.guidance_scale as number | undefined,
        seed: (params.seed as number) ?? -1,
        llmPath,
        vaePath,
      }, modelBase);

      // Update history with result
      try {
        await updateHistoryEntry(job.id, {
          model: job.model,
          modelName: modelBase.name,
          prompt: (params.prompt as string) ?? "",
          url: result.url,
          seed: result.seed,
          status: "completed",
        });
      } catch {
        // History update failure is non-fatal
      }

      this.logger.info(`Job ${job.id} completed successfully`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Job ${job.id} failed: ${message}`);

      // Update history with error
      try {
        await updateHistoryEntry(job.id, {
          model: job.model,
          modelName: modelBase.name,
          prompt: (params.prompt as string) ?? "",
          status: "failed",
          error: message,
        });
      } catch {
        // History update failure is non-fatal
      }
    } finally {
      this.processingJobId = null;
    }
  }
}
