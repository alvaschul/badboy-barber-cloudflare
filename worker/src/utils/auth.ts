import { verifyToken } from './jwt';

export async function requireAuth(
  req: Request,
  env: any
): Promise<{ ok: boolean; response?: Response; payload?: any }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ detail: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    };
  }

  const payload = await verifyToken(authHeader.slice(7), env);
  if (!payload || !payload.user_id) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ detail: 'Invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    };
  }

  return { ok: true, payload };
}

export async function requireAdmin(
  req: Request,
  env: any
): Promise<{ ok: boolean; response?: Response; payload?: any }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ detail: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    };
  }

  const payload = await verifyToken(authHeader.slice(7), env);
  if (!payload || payload.role !== 'admin') {
    return {
      ok: false,
      response: new Response(JSON.stringify({ detail: 'Admin access required' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      })
    };
  }

  return { ok: true, payload };
}