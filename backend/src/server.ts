import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import './firebase/admin';
import { apiLimiter, errorHandler, notFoundHandler, requestContext } from './middleware';
import { apiRouter, internalRouter, publicRouter, webhookRouter } from './routes';
import { startScheduler } from './services/scheduler';
import { createLogger } from './utils/logger';

const log = createLogger('server');
const app = express();

if (env.NODE_ENV === 'production') app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet());

const origins = new Set([env.FRONTEND_URL.replace(/\/$/, ''), ...env.CORS_ALLOWED_ORIGINS.split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean)]);
app.use(
  cors({
    origin: (origin, cb) => cb(null, !origin || origins.has(origin)),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['authorization', 'content-type', 'x-request-id'],
    exposedHeaders: ['x-request-id'],
    maxAge: 600,
  }),
);
app.use(express.json({ limit: '2mb' }));
app.use(requestContext);

// Unauthenticated: health check and OAuth redirect callback (protected by signed state).
app.use('/api', apiLimiter, publicRouter);
// Machine-to-machine: protected by shared secrets, not user tokens.
app.use('/api/webhooks', webhookRouter);
app.use('/api/internal', internalRouter);
// User API.
app.use('/api', apiLimiter, apiRouter);

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(env.PORT, () => {
  log.info('Backend listening', { port: env.PORT, env: env.NODE_ENV });
  startScheduler();
});

const shutdown = (signal: string) => {
  log.info('Shutting down', { signal });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (e) => log.error('Unhandled rejection', e));
