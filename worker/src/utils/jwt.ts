import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

const ALGORITHM = 'HS256';

export function getJwtSecret(env: any): string {
  const secret = env?.SECRET_KEY ?? env?.JWT_SECRET ?? env?.BADBOY_BARBBER_SECRET;
  if (typeof secret === 'string' && secret.trim().length > 0) {
    return secret;
  }
  throw new Error('JWT_SECRET is not configured. Set the SECRET_KEY secret binding.');
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

export async function createToken(payload: Omit<JWTPayload, 'exp'>, env: any, expiresIn: number = 60 * 60 * 24): Promise<string> {
  const secret = getJwtSecret(env);

  return new SignJWT(payload as JWTPayload)
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresIn)
    .sign(new TextEncoder().encode(secret));
}

export async function verifyToken(token: string, env: any): Promise<JWTPayload | null> {
  try {
    const secret = getJwtSecret(env);
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    return payload as JWTPayload;
  } catch {
    return null;
  }
}
