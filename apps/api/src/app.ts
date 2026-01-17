import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { logger, genReqId } from './config/logger.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './modules/auth/routes.js';
import { rbacRouter } from './modules/rbac/routes.js';
import { agentsRouter } from './modules/agents/routes.js';
import { accountsRouter } from './modules/accounts/routes.js';
import { clientsRouter } from './modules/clients/routes.js';
import { NotFoundError, errorHandler } from './errors/index.js';

const app: Express = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(pinoHttp({ logger, genReqId }) as express.RequestHandler);

// Forward request ID to client
app.use((req, res, next) => {
  const requestId =
    typeof req.id === 'string' ? req.id : typeof req.id === 'number' ? String(req.id) : '';
  res.setHeader('X-Request-Id', requestId);
  next();
});

app.get('/', (_req, res) => {
  res.json({ name: 'CRM API', version: '0.0.1' });
});

app.use('/health', healthRouter);
app.use('/auth', authRouter);
app.use('/rbac', rbacRouter);
app.use('/agents', agentsRouter);
app.use('/accounts', accountsRouter);
app.use('/clients', clientsRouter);

// 404 handler
app.use((_req, _res, next) => {
  next(new NotFoundError());
});

// Error handler (must be last)
app.use(errorHandler);

export { app };
