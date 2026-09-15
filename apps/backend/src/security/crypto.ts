import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';

const VERSION = 'v1';
const DEV_FALLBACK_KEY = 'dev-only-insecure-encryption-key-change-me';

/**
 * AES-256-GCM at-rest encryption for third-party API keys (§13).
 * Ciphertext format: v1:<iv-b64>:<tag-b64>:<cipher-b64>. Keys never leave the server.
 */
function keyFor(secret: string): Buffer {
  return scryptSync(secret, 'ai-interview-assistant', 32);
}

function encryptionKey(): { key: Buffer; usingFallback: boolean } {
  const configured = process.env.ENCRYPTION_KEY;
  if (configured && configured.length >= 32) return { key: keyFor(configured), usingFallback: false };
  return { key: keyFor(DEV_FALLBACK_KEY), usingFallback: true };
}

export function isEncryptionKeyConfigured(): boolean {
  return (process.env.ENCRYPTION_KEY?.length ?? 0) >= 32;
}

export function encryptSecret(plaintext: string): string {
  const { key } = encryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) throw new Error('Unsupported ciphertext format');
  const [, ivB64, tagB64, dataB64] = parts;
  const { key } = encryptionKey();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}

/** Refresh tokens are only ever stored as hashes (rotation is enforced in the route). */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function maskKeyHint(plaintext: string): string {
  if (plaintext.length <= 4) return '****';
  return `****${plaintext.slice(-4)}`;
}