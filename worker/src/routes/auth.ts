import { Router } from '../utils/router';
import { createToken, verifyPin, verifyToken } from '../utils/jwt';

export function authRoutes() {
  const router = new Router();
  
  // POST /api/auth/login
  router.post('/login', async (req: Request, env: any, ctx: Context) => {
    try {
      const body = await req.json() as { username: string; pin: string };
      
      if (!body.username || !body.pin) {
        return new Response(JSON.stringify({ detail: 'Username and PIN required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      const db = env.DB;
      const user = await db.prepare(
        'SELECT id, username, pin_hash, role FROM users WHERE username = ? AND is_active = 1'
      ).bind(body.username).first();
      
      if (!user || !(await verifyPin(body.pin, user.pin_hash))) {
        return new Response(JSON.stringify({ detail: 'Invalid credentials' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      const token = await createToken({
        sub: user.username,
        user_id: user.id,
        role: user.role
      });
      
      return new Response(JSON.stringify({
        access_token: token,
        token_type: 'bearer',
        user: { id: user.id, username: user.username, role: user.role }
      }), {
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': env.ALLOWED_ORIGINS || '*'
        }
      });
    } catch (e) {
      console.error('Login error:', e);
      return new Response(JSON.stringify({ detail: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });
  
  // POST /api/auth/refresh
  router.post('/refresh', async (req: Request, env: any, ctx: Context) => {
    try {
      const body = await req.json() as { access_token: string };
      const payload = await verifyToken(body.access_token);
      
      if (!payload || !payload.user_id) {
        return new Response(JSON.stringify({ detail: 'Invalid token' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      const user = await env.DB.prepare(
        'SELECT id, username, role FROM users WHERE id = ? AND is_active = 1'
      ).bind(payload.user_id).first();
      
      if (!user) {
        return new Response(JSON.stringify({ detail: 'User not found' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      const token = await createToken({
        sub: user.username,
        user_id: user.id,
        role: user.role
      });
      
      return new Response(JSON.stringify({
        access_token: token,
        token_type: 'bearer',
        user: { id: user.id, username: user.username, role: user.role }
      }), {
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': env.ALLOWED_ORIGINS || '*'
        }
      });
    } catch (e) {
      console.error('Refresh error:', e);
      return new Response(JSON.stringify({ detail: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });
  
  // GET /api/auth/me
  router.get('/me', async (req: Request, env: any, ctx: Context) => {
    try {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ detail: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      const payload = await verifyToken(authHeader.slice(7));
      if (!payload || !payload.user_id) {
        return new Response(JSON.stringify({ detail: 'Invalid token' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      const user = await env.DB.prepare(
        'SELECT id, username, role FROM users WHERE id = ?'
      ).bind(payload.user_id).first();
      
      if (!user) {
        return new Response(JSON.stringify({ detail: 'User not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      return new Response(JSON.stringify({ id: user.id, username: user.username, role: user.role }), {
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': env.ALLOWED_ORIGINS || '*'
        }
      });
    } catch (e) {
      console.error('Me error:', e);
      return new Response(JSON.stringify({ detail: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });
  
  // POST /api/auth/logout (client-side logout, just return success)
  router.post('/logout', async () => {
    return new Response(JSON.stringify({ message: 'Logged out' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  });
  
  return router;
}
