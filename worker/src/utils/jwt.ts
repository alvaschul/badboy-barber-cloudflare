import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

const ALGORITHM = 'HS256';
const DEFAULT_JWT_SECRET = 'badboy-barber-cloudflare-default-secret-change-me';

function getJwtSecret(): string {
  if (typeof globalThis !== 'undefined') {
    const globalSecret =
      (globalThis as any).SECRET_KEY ??
      (globalThis as any).JWT_SECRET ??
      (globalThis as any).__JWT_SECRET__;

    if (typeof globalSecret === 'string' && globalSecret.trim().length > 0) {
      return globalSecret;
    }
  }

  if (typeof process !== 'undefined' && process.env) {
    const envSecret =
      process.env.SECRET_KEY ??
      process.env.JWT_SECRET ??
      process.env.BADBOY_BARBBER_SECRET;

    if (typeof envSecret === 'string' && envSecret.trim().length > 0) {
      return envSecret;
    }
  }

  return DEFAULT_JWT_SECRET;
}

export async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  const data = encoder.encode(pin + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hash = btoa(String.fromCharCode(...hashArray));

  return `${salt}:${hash}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(':');
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const computed = btoa(String.fromCharCode(...hashArray));

  return computed === hash;
}

export async function createToken(payload: Omit<JWTPayload, 'exp'>, expiresIn: number = 60 * 60 * 24): Promise<string> {
  const secret = getJwtSecret();

  return new SignJWT(payload as JWTPayload)
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresIn)
    .sign(new TextEncoder().encode(secret));
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(getJwtSecret()));
    return payload as JWTPayload;
  } catch {
    return null;
  }
}
