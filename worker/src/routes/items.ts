import { Router } from '../utils/router';

function normalizeBranchId(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error('Invalid branch id');
  }

  return parsed;
}

export function itemsRoutes() {
  const router = new Router();
  
  // GET /api/items - list items
  router.get('/', async (req: Request, env: any, ctx: Context) => {
    try {
      const url = new URL(req.url);
      const all = url.searchParams.get('all') === 'true';
      const active = url.searchParams.get('active') === 'true';
      const cabang = url.searchParams.get('cabang');
      const cabangId = cabang === null || cabang === '' ? null : Number(cabang);
      
      let query = 'SELECT id, name, price, category, branch_id, is_active, is_hidden, created_at FROM items';
      const conditions: string[] = [];
      const params: any[] = [];
      
      if (!all) {
        conditions.push('is_active = 1');
      }
      if (active !== null) {
        conditions.push('is_hidden = 0');
      }
      if (cabangId !== null && Number.isInteger(cabangId) && cabangId >= 1) {
        conditions.push('branch_id = ?');
        params.push(cabangId);
      }
      
      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
      
      query += ' ORDER BY id';
      
      const items = await env.DB.prepare(query).bind(...params).all();
      
      const result = items.results.map((it: any) => ({
        id: it.id,
        name: it.name,
        price: it.price,
        category: it.category,
        cabang_id: it.branch_id,
        active: Boolean(it.is_active),
        hidden: Boolean(it.is_hidden)
      }));
      
      return new Response(JSON.stringify({ items: result }), {
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': env.ALLOWED_ORIGINS || '*'
        }
      });
    } catch (e) {
      console.error('List items error:', e);
      return new Response(JSON.stringify({ detail: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });
  
  // POST /api/items - create item
  router.post('/', async (req: Request, env: any, ctx: Context) => {
    try {
      const body = await req.json() as {
        name: string;
        price: number;
        category?: string;
        cabang_id?: number | string | null;
      };
      
      if (!body.name || body.name.trim().length < 2) {
        return new Response(JSON.stringify({ detail: 'Name is required (min 2 chars)' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      if (body.price == null || body.price < 0) {
        return new Response(JSON.stringify({ detail: 'Price must be positive' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      const branchId = body.cabang_id === undefined ? null : normalizeBranchId(body.cabang_id);
      if (body.cabang_id !== undefined && body.cabang_id !== null && body.cabang_id !== '' && branchId === null) {
        return new Response(JSON.stringify({ detail: 'Invalid cabang_id' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (branchId !== null) {
        const branch = await env.DB.prepare('SELECT id FROM branches WHERE id = ?').bind(branchId).first();
        if (!branch) {
          return new Response(JSON.stringify({ detail: 'Branch not found' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
      
      const result = await env.DB.prepare(
        `INSERT INTO items (name, price, category, branch_id, is_active, is_hidden)
         VALUES (?, ?, ?, ?, 1, 0)`
      ).bind(
        body.name.trim(),
        body.price,
        body.category || 'service',
        branchId
      ).run();
      
      const newItem = await env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(result.lastInsertRowid).first();
      
      return new Response(JSON.stringify({
        id: newItem.id,
        name: newItem.name,
        price: newItem.price,
        category: newItem.category,
        cabang_id: newItem.branch_id,
        active: true,
        hidden: false
      }), {
        status: 201,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': env.ALLOWED_ORIGINS || '*'
        }
      });
    } catch (e) {
      console.error('Create item error:', e);
      return new Response(JSON.stringify({ detail: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });
  
  // PATCH /api/items/:id - update item
  router.patch('/:id', async (req: Request, env: any, ctx: Context) => {
    try {
      const id = parseInt(ctx.params.id);
      const body = await req.json() as {
        name?: string;
        price?: number;
        category?: string;
        hidden?: boolean;
        cabang_id?: number | string | null;
      };
      
      const existing = await env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(id).first();
      if (!existing) {
        return new Response(JSON.stringify({ detail: 'Item not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      const updates: string[] = [];
      const params: any[] = [];
      
      if (body.name !== undefined) {
        updates.push('name = ?');
        params.push(body.name.trim());
      }
      if (body.price !== undefined) {
        updates.push('price = ?');
        params.push(body.price);
      }
      if (body.category !== undefined) {
        updates.push('category = ?');
        params.push(body.category);
      }
      if (body.hidden !== undefined) {
        updates.push('is_hidden = ?');
        params.push(body.hidden ? 1 : 0);
      }
      if (body.cabang_id !== undefined) {
        const normalizedBranchId = body.cabang_id === null || body.cabang_id === ''
          ? null
          : normalizeBranchId(body.cabang_id);

        if (body.cabang_id !== null && body.cabang_id !== '' && normalizedBranchId === null) {
          return new Response(JSON.stringify({ detail: 'Invalid cabang_id' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        if (normalizedBranchId !== null) {
          const branch = await env.DB.prepare('SELECT id FROM branches WHERE id = ?').bind(normalizedBranchId).first();
          if (!branch) {
            return new Response(JSON.stringify({ detail: 'Branch not found' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            });
          }
        }

        updates.push('branch_id = ?');
        params.push(normalizedBranchId);
      }
      
      if (updates.length === 0) {
        return new Response(JSON.stringify({ detail: 'No updates provided' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      params.push(id);
      await env.DB.prepare(`UPDATE items SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();
      
      const updated = await env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(id).first();
      
      return new Response(JSON.stringify({
        id: updated.id,
        name: updated.name,
        price: updated.price,
        category: updated.category,
        cabang_id: updated.branch_id,
        active: Boolean(updated.is_active),
        hidden: Boolean(updated.is_hidden)
      }), {
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': env.ALLOWED_ORIGINS || '*'
        }
      });
    } catch (e) {
      console.error('Update item error:', e);
      return new Response(JSON.stringify({ detail: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });
  
  // DELETE /api/items/:id
  router.delete('/:id', async (req: Request, env: any, ctx: Context) => {
    try {
      const id = parseInt(ctx.params.id);
      
      // Delete related transaction items first
      await env.DB.prepare('DELETE FROM transaction_items WHERE item_id = ?').bind(id).run();
      await env.DB.prepare('DELETE FROM items WHERE id = ?').bind(id).run();
      
      return new Response(JSON.stringify({ id, deleted: true }), {
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': env.ALLOWED_ORIGINS || '*'
        }
      });
    } catch (e) {
      console.error('Delete item error:', e);
      return new Response(JSON.stringify({ detail: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });
  
  return router;
}
