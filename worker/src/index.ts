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

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Initialize DB tables on first request (idempotent)
    await initDb(env.DB);
    
    const url = new URL(request.url);
    const router = new Router();
    
    // Register routes
    router.use('/api/auth', authRoutes());
    router.use('/api/items', itemsRoutes());
    router.use('/api/transactions', transactionsRoutes());
    router.use('/api/reports', reportsRoutes());
    router.use('/api/cabang', branchesRoutes());
    router.use('/api/db', dbadminRoutes());
    
    // Health check
    router.get('/api/health', () => new Response(JSON.stringify({ status: 'ok', version: '1.0.0' }), {
      headers: { 'Content-Type': 'application/json' }
    }));
    
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': env.ALLOWED_ORIGINS,
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
      });
    }
    
    return router.handle(request, env, ctx);
  }
};
