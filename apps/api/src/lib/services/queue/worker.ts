import { Worker, type Job } from 'bullmq';
import { createChildLogger } from '../../../config/logger.js';
import { getConnection } from './connection.js';
import type { JobHandler, CreateWorkerOptions } from './types.js';

const workerLogger = createChildLogger({ module: 'queue:worker' });

// Worker name → worker mapping. Creating a worker with an existing name closes the old one.
const workers = new Map<string, Worker>();

export const createWorker = async <TData, TResult = void>(
  queueName: string,
  handler: JobHandler<TData, TResult>,
  options?: CreateWorkerOptions<TData>
): Promise<Worker<TData, TResult>> => {
  const workerName = options?.name ?? queueName;

  // Close existing worker with same name before creating new
  const existing = workers.get(workerName);
  if (existing) {
    workerLogger.info({ workerName }, 'Closing existing worker before replacement');
    await existing.close();
    workers.delete(workerName);
  }

  const worker = new Worker<TData, TResult>(
    queueName,
    async (job: Job<TData>) => {
      workerLogger.debug(
        { queueName, jobId: job.id, attempt: job.attemptsMade + 1 },
        'Processing job'
      );
      return handler(job);
    },
    {
      connection: getConnection(),
      concurrency: options?.concurrency ?? 1,
    }
  );

  worker.on('completed', (job: Job<TData>, result: TResult) => {
    workerLogger.debug({ queueName, jobId: job.id }, 'Job completed');
    options?.onCompleted?.(job, result);
  });

  worker.on('failed', (job: Job<TData> | undefined, err: Error) => {
    workerLogger.error({ queueName, jobId: job?.id, err }, 'Job failed');
    options?.onFailed?.(job, err);
  });

  worker.on('error', (err: Error) => {
    workerLogger.error({ queueName, err }, 'Worker error');
  });

  workers.set(workerName, worker as Worker);
  workerLogger.info(
    { queueName, workerName, concurrency: options?.concurrency ?? 1 },
    'Worker started'
  );

  return worker;
};

export const closeAllWorkers = async (): Promise<void> => {
  const closePromises = Array.from(workers.values()).map((w) => w.close());
  await Promise.all(closePromises);
  const count = workers.size;
  workers.clear();
  workerLogger.info({ count }, 'All workers closed');
};

export const getWorkerCount = (): number => workers.size;
