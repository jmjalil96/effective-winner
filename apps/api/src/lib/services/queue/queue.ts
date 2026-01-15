import { Queue, type JobsOptions, type Job } from 'bullmq';
import { createChildLogger } from '../../../config/logger.js';
import { getConnection } from './connection.js';
import { QUEUE_DEFAULTS, type TypedQueue, type AddJobOptions } from './types.js';

const queueLogger = createChildLogger({ module: 'queue:queue' });

// Queue name → wrapper mapping. One queue name = one TData type.
// Calling createQueue with different TData for same name returns cached wrapper (type unsafe at runtime).
const queues = new Map<string, TypedQueue<unknown>>();

export const createQueue = <TData>(name: string): TypedQueue<TData> => {
  const existing = queues.get(name);
  if (existing) {
    return existing as TypedQueue<TData>;
  }

  const queue = new Queue(name, {
    connection: getConnection(),
    defaultJobOptions: {
      attempts: QUEUE_DEFAULTS.ATTEMPTS,
      backoff: {
        type: QUEUE_DEFAULTS.BACKOFF_TYPE,
        delay: QUEUE_DEFAULTS.BACKOFF_DELAY,
      },
      removeOnComplete: QUEUE_DEFAULTS.REMOVE_ON_COMPLETE,
      removeOnFail: QUEUE_DEFAULTS.REMOVE_ON_FAIL,
    },
  });

  queueLogger.debug({ queueName: name }, 'Queue created');

  const mapOptions = (opts?: AddJobOptions): JobsOptions | undefined => {
    if (!opts) return undefined;
    return {
      delay: opts.delay,
      priority: opts.priority,
      attempts: opts.attempts,
      backoff: opts.backoff,
      jobId: opts.jobId,
    };
  };

  const typedQueue: TypedQueue<TData> = {
    name,
    addJob: async (data: TData, options?: AddJobOptions) => {
      const job = await queue.add(name, data, mapOptions(options));
      queueLogger.debug({ queueName: name, jobId: job.id }, 'Job added');
      return job as Job<TData>;
    },
    addBulk: async (jobs: Array<{ data: TData; options?: AddJobOptions }>) => {
      const bulkJobs = jobs.map((j) => ({
        name,
        data: j.data,
        opts: mapOptions(j.options),
      }));
      const result = await queue.addBulk(bulkJobs);
      queueLogger.debug({ queueName: name, count: result.length }, 'Bulk jobs added');
      return result as Job<TData>[];
    },
    close: () => queue.close(),
  };

  queues.set(name, typedQueue as TypedQueue<unknown>);

  return typedQueue;
};

export const closeAllQueues = async (): Promise<void> => {
  const closePromises = Array.from(queues.values()).map((q) => q.close());
  await Promise.all(closePromises);
  queues.clear();
  queueLogger.debug('All queues closed');
};
