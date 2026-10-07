// Password hashing and field encryption. Node built-ins only.

import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 64;

function scrypt(password: string, salt: Buffer, n: number, r: number, p: number, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password.normalize('NFKC'), salt, keylen, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P, KEYLEN);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, 'base64');
  if (expected.length === 0) return false;
  try {
    const key = await scrypt(password, Buffer.from(saltB64, 'base64'), Number(n), Number(r), Number(p), expected.length);
    return timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** A password a person can read out and type: 4 groups of 4, no look-alike characters. */
export function generatePassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(16);
  let out = '';
  for (let i = 0; i < 16; i++) {
    out += alphabet[bytes[i] % alphabet.length];
    if (i % 4 === 3 && i < 15) out += '-';
  }
  return out;
}

// ---------------------------------------------------------------- field encryption (AES-256-GCM)

export class DataKeyMissing extends Error {
  constructor() {
    super('DATA_KEY is not set, so PAN, Aadhaar and bank account numbers cannot be saved or shown.');
    this.name = 'DataKeyMissing';
  }
}

function dataKey(): Buffer {
  const raw = process.env.DATA_KEY;
  if (!raw) throw new DataKeyMissing();
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('DATA_KEY must be 32 bytes, base64 encoded');
  return key;
}

export function dataKeyConfigured(): boolean {
  try {
    dataKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptField(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', dataKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${ct.toString('base64')}`;
}

export function decryptField(stored: string): string {
  const [version, iv, tag, ct] = stored.split('.');
  if (version !== 'v1' || !iv || !tag || ct === undefined) throw new Error('Unrecognised encrypted value');
  const decipher = createDecipheriv('aes-256-gcm', dataKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64')), decipher.final()]).toString('utf8');
}

/** Encrypts a file's bytes. Layout: 12-byte IV, 16-byte tag, ciphertext. */
export function encryptBytes(plain: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', dataKey(), iv);
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]);
}

export function decryptBytes(stored: Buffer): Buffer {
  if (stored.length < 29) throw new Error('Unrecognised encrypted file');
  const decipher = createDecipheriv('aes-256-gcm', dataKey(), stored.subarray(0, 12));
  decipher.setAuthTag(stored.subarray(12, 28));
  return Buffer.concat([decipher.update(stored.subarray(28)), decipher.final()]);
}
