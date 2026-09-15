import type { FastifyInstance } from 'fastify';
import { privacyPatchSchema, providerUpsertSchema, settingsPatchSchema } from '@ai-assistant/shared';
import { PROVIDER_PRESETS } from '../ai/registry.js';
import { decryptSecret, encryptSecret, maskKeyHint } from '../security/crypto.js';
import { audit, badRequest, clientIp, parseInput, repo, requireUser } from '../http/helpers.js';

export async function registerSettingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/settings', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return reply;
    return { settings: await (await repo()).getSettings(userId) };
  });

  app.patch('/settings', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return reply;
    const parsed = parseInput(settingsPatchSchema, req.body);
    if (!parsed.ok) return badRequest(reply, parsed.issues);
    const db = await repo();
    if (parsed.data.defaultProvider) {
      const stored = await db.getProvider(userId, parsed.data.defaultProvider);
      if (!stored) return reply.code(400).send({ error: `Provider ${parsed.data.defaultProvider} is not configured` });
    }
    const settings = await db.updateSettings(userId, parsed.data);
    await audit(db, userId, 'settings.update', 'settings', clientIp(req));
    return { settings };
  });

  app.get('/privacy', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return reply;
    return { privacy: await (await repo()).getPrivacy(userId) };
  });

  app.patch('/privacy', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return reply;
    const parsed = parseInput(privacyPatchSchema, req.body);
    if (!parsed.ok) return badRequest(reply, parsed.issues);
    const db = await repo();
    const privacy = await db.updatePrivacy(userId, parsed.data);
    await audit(db, userId, 'privacy.update', 'privacy', clientIp(req));
    return { privacy };
  });

  app.get('/providers', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return reply;
    const db = await repo();
    const stored = await db.listProviders(userId);
    return {
      providers: stored.map((p) => ({
        id: p.id, provider: p.provider, isDefault: p.isDefault,
        model: p.model, baseUrl: p.baseUrl, createdAt: p.createdAt,
      })),
    };
  });

  /**
   * Keys are encrypted with AES-256-GCM before storage. The plaintext key
   * travels only over TLS and is never returned by any endpoint.
   */
  app.post('/providers', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return reply;
    const parsed = parseInput(providerUpsertSchema, req.body);
    if (!parsed.ok) return badRequest(reply, parsed.issues);
    const db = await repo();
    const preset = PROVIDER_PRESETS[parsed.data.provider];
    if (parsed.data.provider === 'openai-compatible' && !parsed.data.baseUrl) {
      return reply.code(400).send({ error: 'baseUrl is required for openai-compatible' });
    }
    await db.upsertProvider({
      userId,
      provider: parsed.data.provider,
      encryptedApiKey: encryptSecret(parsed.data.apiKey),
      isDefault: parsed.data.isDefault,
      baseUrl: parsed.data.baseUrl ?? null,
      model: parsed.data.model ?? preset.model ?? null,
    });
    await audit(db, userId, 'provider.upsert', parsed.data.provider, clientIp(req));
    return {
      provider: {
        provider: parsed.data.provider,
        label: preset.label,
        isDefault: parsed.data.isDefault,
        keyHint: maskKeyHint(parsed.data.apiKey),
      },
    };
  });

  app.delete('/providers/:id', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return reply;
    const db = await repo();
    const id = (req.params as { id: string }).id;
    await db.deleteProvider(userId, id);
    await audit(db, userId, 'provider.delete', id, clientIp(req));
    return { ok: true };
  });

  app.post('/providers/:provider/test', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return reply;
    const db = await repo();
    const id = (req.params as { provider: string }).provider;
    const stored = await db.getProvider(userId, id);
    if (!stored) return reply.code(404).send({ error: 'Provider not configured' });
    try {
      // Decryption succeeds → stored key material is intact; full round-trips
      // would spend the user's money, so connectivity is tested at call time.
      const key = decryptSecret(stored.encryptedApiKey);
      await audit(db, userId, 'provider.test', id, clientIp(req));
      return { ok: true, provider: id, keyHint: maskKeyHint(key) };
    } catch {
      return reply.code(500).send({ error: 'Stored key is not decryptable — store it again' });
    }
  });
}