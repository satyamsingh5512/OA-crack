import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import { config, validateConfig } from './config.js';
import { registerRoutes } from './routes/index.js';
import { attachRealtime } from './ws/server.js';
import { serverMetrics } from './observability/metrics.js';
import { closeRepository, getRepository } from './db/index.js';

export async function buildServer() {
  validateConfig();
  const app = Fastify({
    logger: config.isTest ? false : { level: 'info' },
    bodyLimit: 2 * 1024 * 1024,
  });

  await app.register(cors, { origin: config.corsOrigin, credentials: true });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
  await app.register(multipart, { limits: { fileSize: 8 * 1024 * 1024, files: 1 } });

  // §17: server-side latency/error observability for every request.
  app.addHook('onRequest', async (req) => {
    (req as unknown as { __startedAt: number }).__startedAt = Date.now();
  });
  app.addHook('onResponse', async (req, reply) => {
    const startedAt = (req as unknown as { __startedAt?: number }).__startedAt ?? Date.now();
    serverMetrics.recordRequest(Date.now() - startedAt, reply.statusCode >= 500);
  });

  app.setErrorHandler((err, _req, reply) => {
    app.log.error(err);
    reply.code(500).send({ error: 'Internal server error' });
  });
  app.setNotFoundHandler((_req, reply) => {
    reply.code(404).send({ error: 'Not found' });
  });

  await registerRoutes(app);
  // Repository selection happens lazily per request so tests can swap drivers.
  await getRepository().catch((err) => {
    app.log.warn({ err }, 'Starting without a database driver selected; will degrade to memory at request time');
  });
  return app;
}

if (process.env.VITEST == null && process.env.PLAYWRIGHT_TEST == null) {
  const app = await buildServer();
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, () => {
      void (async () => {
        await app.close().catch(() => undefined);
        await closeRepository();
        process.exit(0);
      })();
    });
  }
  await app.listen({ port: config.port, host: '0.0.0.0' });
  attachRealtime(config.wsPort);
  console.log(`API :${config.port}  WS :${config.wsPort}  db: ${(await getRepository()).driver}`);
}
