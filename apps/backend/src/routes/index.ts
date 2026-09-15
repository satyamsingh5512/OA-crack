import type { FastifyInstance } from 'fastify';
import { registerAuthRoutes } from './auth.js';
import { registerSessionRoutes } from './sessions.js';
import { registerAiRoutes } from './ai.js';
import { registerDocumentRoutes } from './documents.js';
import { registerSettingsRoutes } from './settings.js';
import { registerAccountRoutes } from './account.js';
import { registerMetaRoutes } from './meta.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await registerMetaRoutes(app);
  await registerAuthRoutes(app);
  await registerSessionRoutes(app);
  await registerAiRoutes(app);
  await registerDocumentRoutes(app);
  await registerSettingsRoutes(app);
  await registerAccountRoutes(app);
}