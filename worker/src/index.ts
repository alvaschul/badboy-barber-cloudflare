import { Router } from './utils/router';
import { initDb } from './db/schema';
import { authRoutes } from './routes/auth';
import { itemsRoutes } from './routes/items';
import { transactionsRoutes } from './routes/transactions';
import { reportsRoutes } from './routes/reports';
import { branchesRoutes } from './routes/branches';
import { dbadminRoutes } from './routes/dbadmin';

export interface Env {
  DB: D1Database;
  SECRET_KEY: string;
  ALLOWED_ORIGINS: string;
}

let dbInitialized = false;

function isOriginAllowed(origin: string | null, allowedEnv: string | undefined): boolean {
  if (!origin) return false;
  const allowed = (allowedEnv || '')
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0);
  if (allowed.length === 0 || allowed.includes('*')) return true;
  if (allowed.includes(origin)) return true;
  // Allow subdomains of allowed origins (e.g. pages.dev previews)
  const originHost = new URL(origin).hostname;
  return allowed.some(a => {
    let allowedHost: string;
    try { allowedHost = new URL(a).hostname; } catch { allowedHost = a.replace(/^https?:\/\//, '').split('/')[0]; }
    return originHost === allowedHost || originHost.endsWith('.' + allowedHost);
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (!dbInitialized) {
      await initDb(env.DB);
      dbInitialized = true;
    }

    const url = new URL(request.url);
    const router = new Router();
    
    router.use('/api/auth', authRoutes());
    router.use('/api/items', itemsRoutes());
    router.use('/api/transactions', transactionsRoutes());
    router.use('/api/reports', reportsRoutes());
    router.use('/api/cabang', branchesRoutes());
    router.use('/api/db', dbadminRoutes());

    router.get('/api/health', () => new Response(JSON.stringify({ status: 'ok', version: '1.0.0' }), {
      headers: { 'Content-Type': 'application/json' }
    }));

    const origin = request.headers.get('Origin');
    const originAllowed = isOriginAllowed(origin, env.ALLOWED_ORIGINS);

    let response: Response;
    
    if (request.method === 'OPTIONS') {
      response = new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': originAllowed ? (origin || '*') : '',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        }
      });
      if (originAllowed && origin) {
        response.headers.set('Access-Control-Allow-Credentials', 'true');
      }
      return response;
    }
    
    response = await router.handle(request, env, ctx);
    
    // Add CORS headers dynamically, but only for allowed origins
    if (origin) {
      const newHeaders = new Headers(response.headers);
      if (originAllowed) {
        newHeaders.set('Access-Control-Allow-Origin', origin);
        newHeaders.set('Access-Control-Allow-Credentials', 'true');
      }
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    }
    
    return response;
  }
};
