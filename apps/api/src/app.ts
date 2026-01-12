import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { healthRouter } from './routes/health.js';

const app: Express = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/', (_req, res) => {
  res.json({ name: 'CRM API', version: '0.0.1' });
});

app.use('/health', healthRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

export { app };
