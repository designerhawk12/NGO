import express from 'express';
import { randomUUID } from 'node:crypto';
import cors from 'cors';
import { env, invalidProductionConfig, missingProductionConfig } from './config/env';
import { errorHandler, HttpError } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';
import { apiRouter } from './routes';

export const app = express();
app.disable('x-powered-by');
// Vercel and the supported API hosts forward the client address through one
// trusted proxy hop. This is used only to key the durable registration limit.
app.set('trust proxy', 1);
app.use(cors({ origin: env.corsOrigins }));
app.use(express.json({ limit: '1mb' }));
app.use((request, response, next) => {
  const requestId = randomUUID();
  response.locals.requestId = requestId;
  response.setHeader('X-Request-ID', requestId);
  const started = Date.now();
  response.on('finish', () => console.info(JSON.stringify({ level: 'info', requestId, method: request.method, path: request.originalUrl.split('?')[0], status: response.statusCode, durationMs: Date.now() - started })));
  next();
});
app.use('/api/v1', (request, _response, next) => {
  if ((missingProductionConfig.length > 0 || invalidProductionConfig.length > 0)
    && request.path !== '/health' && request.path !== '/health/ready') {
    next(new HttpError(503, 'SERVER_CONFIGURATION_ERROR', 'The API is not configured for this environment.'));
    return;
  }
  next();
});
app.use('/api/v1', apiRouter);
app.use(notFound);
app.use(errorHandler);
