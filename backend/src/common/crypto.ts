import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto';

/**
 * Field-level AES-256-GCM encryption for sensitive strings (notes, counterparty names, secrets).
 * Stored format: "enc:v1:<iv>:<tag>:<ciphertext>" (base64 parts).
 */
const PREFIX = 'enc:v1:';
let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;
  const hex = process.env.FIELD_ENCRYPTION_KEY ?? '';
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('FIELD_ENCRYPTION_KEY must be 64 hex characters (generate with: openssl rand -hex 32)');
  }
  cachedKey = Buffer.from(hex, 'hex');
  return cachedKey;
}

export function encrypt(plain: string | null | undefined): string | null | undefined {
  if (plain === null || plain === undefined || plain === '' || plain.startsWith(PREFIX)) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${PREFIX}${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${data.toString('base64')}`;
}

export function decrypt(value: string | null | undefined): string | null | undefined {
  if (!value || !value.startsWith(PREFIX)) return value;
  const [iv, tag, data] = value.slice(PREFIX.length).split(':');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

/** Deterministic keyed hash so encrypted values can still be looked up (e.g. counterparty by name). */
export function blindIndex(value: string): string {
  return createHmac('sha256', key()).update(value.trim().toLowerCase()).digest('hex');
}

/** Mongoose field options for an encrypted string. Remember to enable getters in toJSON/toObject. */
export const encryptedString = { type: String, set: encrypt, get: decrypt };
