import type { Job, Worker, Queue } from 'bullmq';

export type { Job, Worker, Queue };

export const QUEUE_DEFAULTS = {
  ATTEMPTS: 3,
  BACKOFF_TYPE: 'exponential' as const,
  BACKOFF_DELAY: 1000,
  REMOVE_ON_COMPLETE: 100,
  REMOVE_ON_FAIL: 500,
} as const;

export interface AddJobOptions {
  /** Delay job execution by ms */
  delay?: number;
  /** Priority (lower = higher priority, default 0) */
  priority?: number;
  /** Override retry attempts */
  attempts?: number;
  /** Custom backoff settings */
  backoff?: { type: 'exponential' | 'fixed'; delay: number };
  /** Unique job ID (for deduplication) */
  jobId?: string;
}

export interface CreateWorkerOptions<TData> {
  /** Worker name for registry (defaults to queueName). Existing worker with same name is closed. */
  name?: string;
  /** Max concurrent jobs (default 1) */
  concurrency?: number;
  /** Called when job completes */
  onCompleted?: (job: Job<TData>, result: unknown) => void;
  /** Called when job fails after all retries */
  onFailed?: (job: Job<TData> | undefined, error: Error) => void;
}

export interface TypedQueue<TData> {
  /** Add a job to the queue */
  addJob: (data: TData, options?: AddJobOptions) => Promise<Job<TData>>;
  /** Add multiple jobs */
  addBulk: (jobs: Array<{ data: TData; options?: AddJobOptions }>) => Promise<Job<TData>[]>;
  /** Get queue name */
  readonly name: string;
  /** Close the queue */
  close: () => Promise<void>;
}

export type JobHandler<TData, TResult = void> = (job: Job<TData>) => Promise<TResult>;
