import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { logger, genReqId } from './config/logger.js';
import { healthRouter } from './routes/health.js';
import { NotFoundError, errorHandler } from './errors/index.js';

const app: Express = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(pinoHttp({ logger, genReqId }) as express.RequestHandler);

// Forward request ID to client
app.use((req, res, next) => {
  res.setHeader('X-Request-Id', req.id as string);
  next();
});

app.get('/', (_req, res) => {
  res.json({ name: 'CRM API', version: '0.0.1' });
});

app.use('/health', healthRouter);

// 404 handler
app.use((_req, _res, next) => {
  next(new NotFoundError());
});

// Error handler (must be last)
app.use(errorHandler);

export { app };
