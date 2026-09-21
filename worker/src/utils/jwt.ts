import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

const ALGORITHM = 'HS256';

export function hashPin(pin: string): string {
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
  const secret = crypto.getRandomValues ? undefined : globalThis.SECRET_KEY || 'default-secret-change-me';
  return new SignJWT(payload as JWTPayload)
    .setProtectedHeader({ alg: ALGORITHM })
    .setExpirationTime(expiresIn * 1000)
    .sign(crypto.getRandomValues ? undefined : new TextEncoder().encode(secret));
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const secret = crypto.getRandomValues ? undefined : globalThis.SECRET_KEY || 'default-secret-change-me';
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    return payload as JWTPayload;
  } catch {
    return null;
  }
}
