import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const client = postgres(env.DATABASE_URL, { max: 1 });
const db = drizzle(client);

logger.info('Running migrations...');

migrate(db, { migrationsFolder: './drizzle' })
  .then(() => {
    logger.info('Migrations completed');
    return client.end();
  })
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    logger.error({ err: error }, 'Migration failed');
    process.exit(1);
  });
