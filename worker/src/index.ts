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

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (!dbInitialized) {
      await initDb(env.DB);
      dbInitialized = true;
    }

    const url = new URL(request.url);
    const router = new Router();
    
    // Get origin from request - for CORS we echo back the request origin
    // This allows any Pages URL (with hash or without) to work
    const requestOrigin = request.headers.get('Origin');
    let allowedOrigin = env.ALLOWED_ORIGINS || '*';
    
    // If request has Origin header, use it for CORS (allows Pages preview URLs)
    if (requestOrigin) {
      // Allow the request origin (works for any Pages URL)
      allowedOrigin = requestOrigin;
    }

    router.use('/api/auth', authRoutes());
    router.use('/api/items', itemsRoutes());
    router.use('/api/transactions', transactionsRoutes());
    router.use('/api/reports', reportsRoutes());
    router.use('/api/cabang', branchesRoutes());
    router.use('/api/db', dbadminRoutes());

    router.get('/api/health', () => new Response(JSON.stringify({ status: 'ok', version: '1.0.0' }), {
      headers: { 'Content-Type': 'application/json' }
    }));

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': allowedOrigin,
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        }
      });
    }

    return router.handle(request, env, ctx);
  }
};
