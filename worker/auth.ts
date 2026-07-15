/**
 * Server-side authentication: PBKDF2 password hashing and HMAC-signed
 * session tokens, both via the Workers runtime's native Web Crypto
 * (crypto.subtle) — no external auth library needed.
 *
 * Previously, "authentication" was a client-side-only Zustand store with a
 * hardcoded plaintext credential table shipped in the JS bundle, and every
 * /api/* route was completely unauthenticated — anyone with the URL could
 * read and write clinical notes, patient identifiers, and claims with a
 * bare curl. This module and the middleware in user-routes.ts close that
 * gap: passwords are salted+hashed server-side and verified server-side,
 * and every route (other than login) requires a valid signed token.
 */
const PBKDF2_ITERATIONS = 100_000;
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const b of arr) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64Url(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  const binary = atob(padded);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return arr;
}

export function generateSalt(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
}

/** Salted PBKDF2-SHA256 password hash. Returns a base64url digest. */
export async function hashPassword(password: string, salt: string): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: fromBase64Url(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return toBase64Url(bits);
}

export async function verifyPassword(password: string, salt: string, expectedHash: string): Promise<boolean> {
  const actualHash = await hashPassword(password, salt);
  // Constant-time comparison to avoid leaking hash contents via response-time side channel.
  if (actualHash.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < actualHash.length; i++) diff |= actualHash.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  return diff === 0;
}

export interface TokenPayload {
  username: string;
  role: 'admin' | 'coder';
  exp: number; // epoch millis
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

/** Issues a compact `payload.signature` token, both base64url, signed with AUTH_SECRET. */
export async function createToken(payload: Omit<TokenPayload, 'exp'>, secret: string): Promise<string> {
  const full: TokenPayload = { ...payload, exp: Date.now() + TOKEN_TTL_MS };
  const encodedPayload = toBase64Url(new TextEncoder().encode(JSON.stringify(full)));
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(encodedPayload));
  return `${encodedPayload}.${toBase64Url(signature)}`;
}

/** Verifies signature and expiry. Returns the payload if valid, null otherwise. */
export async function verifyToken(token: string, secret: string): Promise<TokenPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encodedPayload, encodedSignature] = parts;
  try {
    const key = await hmacKey(secret);
    const valid = await crypto.subtle.verify('HMAC', key, fromBase64Url(encodedSignature), new TextEncoder().encode(encodedPayload));
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(encodedPayload))) as TokenPayload;
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
