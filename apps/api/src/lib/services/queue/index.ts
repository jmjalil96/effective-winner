// Types
export {
  QUEUE_DEFAULTS,
  type AddJobOptions,
  type CreateWorkerOptions,
  type TypedQueue,
  type JobHandler,
  type Job,
  type Worker,
  type Queue,
} from './types.js';

// Connection
export { getConnection, closeConnection, setConnection } from './connection.js';

// Queue
export { createQueue, closeAllQueues } from './queue.js';

// Worker
export { createWorker, closeAllWorkers, getWorkerCount } from './worker.js';

// Shutdown
import { closeAllWorkers } from './worker.js';
import { closeAllQueues } from './queue.js';
import { closeConnection } from './connection.js';
import { createChildLogger } from '../../../config/logger.js';

const shutdownLogger = createChildLogger({ module: 'queue:shutdown' });

/**
 * Graceful shutdown: workers first, then queues, then connection.
 * Call this from main index.ts shutdown handler.
 */
export const closeQueue = async (): Promise<void> => {
  shutdownLogger.info('Queue service shutting down');
  await closeAllWorkers();
  await closeAllQueues();
  await closeConnection();
  shutdownLogger.info('Queue service shutdown complete');
};
