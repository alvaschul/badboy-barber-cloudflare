import { Router, type Context } from '../utils/router';

export function branchesRoutes() {
  const router = new Router();
  
  // GET /api/cabang - list branches
  router.get('/', async (req: Request, env: any, ctx: Context) => {
    try {
      const branches = await env.DB.prepare(
        'SELECT id, name, created_at FROM branches ORDER BY id'
      ).all();
      
      return new Response(JSON.stringify({ 
        items: branches.results.map((b: any) => ({
          id: b.id,
          name: b.name
        })),
        branches: branches.results.map((b: any) => ({
          id: b.id,
          name: b.name
        }))
      }), {
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': env.ALLOWED_ORIGINS || '*'
        }
      });
    } catch (e) {
      console.error('List branches error:', e);
      return new Response(JSON.stringify({ detail: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });
  
  // POST /api/cabang - create branch
  router.post('/', async (req: Request, env: any, ctx: Context) => {
    try {
      const body = await req.json() as { name: string };
      
      if (!body.name || body.name.trim().length < 1) {
        return new Response(JSON.stringify({ detail: 'Name is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      const name = body.name.trim();
      await env.DB.prepare('INSERT INTO branches (name) VALUES (?)').bind(name).run();
      
      // Get the ID of the newly created branch
      const newBranch = await env.DB.prepare(
        'SELECT id FROM branches WHERE name = ? ORDER BY id DESC LIMIT 1'
      ).bind(name).first();
      
      return new Response(JSON.stringify({ id: newBranch?.id }), {
        status: 201,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': env.ALLOWED_ORIGINS || '*'
        }
      });
    } catch (e) {
      console.error('Create branch error:', e);
      return new Response(JSON.stringify({ detail: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });
  
  // DELETE /api/cabang/:id - delete branch
  router.delete('/:id', async (req: Request, env: any, ctx: Context) => {
    try {
      const id = parseInt(ctx.params.id);
      
      const used = await env.DB.prepare(
        'SELECT COUNT(*) as cnt FROM items WHERE branch_id = ?'
      ).bind(id).first();
      
      if (used.cnt > 0) {
        return new Response(JSON.stringify({ 
          detail: 'Branch has items — reassign or delete items first' 
        }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      await env.DB.prepare('DELETE FROM branches WHERE id = ?').bind(id).run();
      
      return new Response(JSON.stringify({ id, deleted: true }), {
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': env.ALLOWED_ORIGINS || '*'
        }
      });
    } catch (e) {
      console.error('Delete branch error:', e);
      return new Response(JSON.stringify({ detail: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });
  
  return router;
}
