// In-memory job queue for the Deno backend.
// Serial execution per model to avoid resource contention.
// Supports multiple concurrent jobs across different models.

import { getLogger, type Logger } from "./logger.ts";

export interface Job<T = unknown> {
  id: string;
  model: string;
  payload: T;
  status: "queued" | "running" | "completed" | "failed";
  result?: unknown;
  error?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

export interface QueueOptions {
  maxConcurrentPerModel?: number;
}

export type ProgressCallback = (jobId: string, data: ProgressEvent) => void;

export interface ProgressEvent {
  step?: number;
  totalSteps?: number;
  progress?: number;
  status?: "starting" | "generating" | "done";
  message?: string;
}

export class JobQueue {
  private queue: Job[] = [];
  private running: Map<string, Job> = new Map(); // model -> current job
  private completed: Map<string, Job> = new Map(); // jobId -> job
  private progressListeners: ProgressCallback[] = [];
  private logger: Logger;
  private maxConcurrentPerModel: number;

  constructor(options: QueueOptions = {}) {
    this.logger = getLogger("queue");
    this.maxConcurrentPerModel = options.maxConcurrentPerModel ?? 1;
  }

  /**
   * Add a job to the queue. Returns immediately; job runs when a slot opens.
   */
  enqueue(job: Job): void {
    this.queue.push(job);
    this.logger.info(`Job ${job.id} enqueued for model ${job.model}`);
    this._tryDispatch();
  }

  /**
   * Subscribe to progress events from any job.
   */
  onProgress(cb: ProgressCallback): () => void {
    this.progressListeners.push(cb);
    return () => {
      this.progressListeners = this.progressListeners.filter((l) => l !== cb);
    };
  }

  /**
   * Get job status by ID.
   */
  getJob(jobId: string): Job | undefined {
    return this.completed.get(jobId) ?? this.running.get(this._modelKey(jobId));
  }

  /**
   * Cancel a running job.
   */
  cancel(jobId: string): boolean {
    for (const [key, job] of this.running) {
      if (job.id === jobId) {
        job.status = "failed";
        job.error = "Cancelled by user";
        job.completedAt = Date.now();
        this.completed.set(jobId, job);
        this.running.delete(key);
        this.logger.info(`Job ${jobId} cancelled`);
        this._tryDispatch();
        return true;
      }
    }
    // Also remove from queue if not yet running
    const idx = this.queue.findIndex((j) => j.id === jobId);
    if (idx !== -1) {
      this.queue.splice(idx, 1);
      this.logger.info(`Job ${jobId} removed from queue`);
      return true;
    }
    return false;
  }

  /**
   * List all jobs (most recent first).
   */
  listJobs(limit = 50): Job[] {
    const all = [...this.completed.values()];
    all.sort((a, b) => (b.completedAt ?? b.createdAt) - (a.completedAt ?? a.createdAt));
    return all.slice(0, limit);
  }

  // --- Internal ---

  private _modelKey(jobId: string): string {
    const job = this.completed.get(jobId);
    return job?.model ?? "unknown";
  }

  private _tryDispatch(): void {
    if (this.queue.length === 0) return;

    // Find the next job whose model has a free slot
    for (let i = 0; i < this.queue.length; i++) {
      const job = this.queue[i];
      const modelJobs = [...this.running.values()].filter((j) => j.model === job.model);
      if (modelJobs.length < this.maxConcurrentPerModel) {
        // Remove from queue and mark as running
        this.queue.splice(i, 1);
        job.status = "running";
        job.startedAt = Date.now();
        this.running.set(job.model, job);
        this.logger.info(`Job ${job.id} started for model ${job.model}`);
        return;
      }
    }
  }

  /**
   * Called by the inference engine when a job completes.
   */
  complete(jobId: string, result: unknown): void {
    const job = this.running.get(this._modelKey(jobId));
    if (!job) return;
    job.status = "completed";
    job.result = result;
    job.completedAt = Date.now();
    this.completed.set(jobId, job);
    this.running.delete(this._modelKey(jobId));
    this.logger.info(`Job ${jobId} completed`);
    this._tryDispatch();
  }

  /**
   * Called by the inference engine when a job fails.
   */
  fail(jobId: string, error: string): void {
    const job = this.running.get(this._modelKey(jobId));
    if (!job) return;
    job.status = "failed";
    job.error = error;
    job.completedAt = Date.now();
    this.completed.set(jobId, job);
    this.running.delete(this._modelKey(jobId));
    this.logger.error(`Job ${jobId} failed: ${error}`);
    this._tryDispatch();
  }

  /**
   * Called by the inference engine to emit progress.
   */
  emitProgress(jobId: string, data: ProgressEvent): void {
    for (const listener of this.progressListeners) {
      listener(jobId, data);
    }
  }

  /**
   * Called by the inference engine to cancel a running job.
   */
  cancelRunning(jobId: string): boolean {
    return this.cancel(jobId);
  }
}
