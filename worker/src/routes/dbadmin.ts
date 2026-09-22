import { Router, type Context } from '../utils/router';
import { requireAdmin } from '../utils/auth';

// Whitelist of tables exposed via dbadmin
const ALLOWED_TABLES = ['items', 'transactions', 'transaction_items', 'branches', 'users'];

// Read-only columns per table
const READ_COLUMNS: Record<string, string[]> = {
  items: ['id', 'name', 'price', 'category', 'branch_id', 'is_active', 'is_hidden', 'created_at'],
  transactions: ['id', 'user_id', 'total_amount', 'cash_amount', 'qris_amount', 'change_amount', 'status', 'date', 'notes'],
  transaction_items: ['id', 'transaction_id', 'item_id', 'quantity', 'unit_price'],
  branches: ['id', 'name', 'created_at'],
  users: ['id', 'username', 'role', 'is_active', 'created_at']
};

// Editable columns per table
const EDIT_COLUMNS: Record<string, string[]> = {
  items: ['name', 'price', 'category', 'is_active', 'is_hidden', 'branch_id'],
  transactions: ['total_amount', 'cash_amount', 'qris_amount', 'change_amount', 'status', 'notes'],
  transaction_items: ['quantity', 'unit_price'],
  branches: ['name'],
  users: ['username', 'role', 'is_active']
};

function sanitizeAdminQuery(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error('Query is empty');
  }

  if (/[;\-\-]|\/\*|\*\//.test(trimmed)) {
    throw new Error('Query contains forbidden characters');
  }

  const upper = trimmed.toUpperCase();
  if (!upper.startsWith('SELECT') && !upper.startsWith('WITH')) {
    throw new Error('Only SELECT / WITH queries allowed');
  }

  if (/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|REPLACE|GRANT|REVOKE|ATTACH|DETACH|PRAGMA)\b/i.test(trimmed)) {
    throw new Error('Only read-only queries are allowed');
  }

  return trimmed.replace(/;\s*$/, '');
}

export function dbadminRoutes() {
  const router = new Router();
  
  // Helper to require admin auth
  async function requireAdminAuth(req: Request, env: any): Promise<any> {
    const auth = await requireAdmin(req, env);
    if (!auth.ok) return { error: true, response: auth.response };
    return { error: false, payload: auth.payload };
  }
  
  // GET /api/db/tables
  router.get('/tables', async (req: Request, env: any, ctx: Context) => {
    const auth = await requireAdminAuth(req, env);
    if (auth.error) return auth.response;
    
    const tables = ALLOWED_TABLES;
    const result = await Promise.all(tables.map(async (t) => {
      const count = await env.DB.prepare(`SELECT COUNT(*) as cnt FROM ${t}`).first();
      return { table: t, rows: count.cnt };
    }));
    
    return new Response(JSON.stringify({ tables: result }), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': env.ALLOWED_ORIGINS || '*'
      }
    });
  });
  
  // GET /api/db/table/:name
  router.get('/table/:name', async (req: Request, env: any, ctx: Context) => {
    const auth = await requireAdminAuth(req, env);
    if (auth.error) return auth.response;
    
    const table = ctx.params.name;
    if (!ALLOWED_TABLES.includes(table)) {
      return new Response(JSON.stringify({ detail: `Table '${table}' not exposed` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const cols = READ_COLUMNS[table].join(', ');
    const limit = parseInt(new URL(req.url).searchParams.get('limit') || '100');
    const offset = parseInt(new URL(req.url).searchParams.get('offset') || '0');
    
    const total = await env.DB.prepare(`SELECT COUNT(*) as cnt FROM ${table}`).first();
    const rows = await env.DB.prepare(
      `SELECT ${cols} FROM ${table} ORDER BY id LIMIT ? OFFSET ?`
    ).bind(limit, offset).all();
    
    return new Response(JSON.stringify({
      table,
      columns: READ_COLUMNS[table],
      editable: EDIT_COLUMNS[table],
      total: total.cnt,
      limit,
      offset,
      rows: rows.results
    }), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': env.ALLOWED_ORIGINS || '*'
      }
    });
  });
  
  // POST /api/db/query - raw SELECT queries only
  router.post('/query', async (req: Request, env: any, ctx: Context) => {
    const auth = await requireAdminAuth(req, env);
    if (auth.error) return auth.response;
    
    const body = await req.json() as { query: string };

    try {
      const query = sanitizeAdminQuery(body.query);
      const result = await env.DB.prepare(query).all();
      const rows = result.results;
      const columns = rows.length > 0 ? (rows[0] ? Object.keys(rows[0]) : []) : [];
      return new Response(JSON.stringify({
        columns: columns.map((c: string) => ({ name: c })),
        rows,
        truncated: rows.length >= 500
      }), {
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': env.ALLOWED_ORIGINS || '*'
        }
      });
    } catch (e) {
      return new Response(JSON.stringify({ detail: `Query error: ${e}` }), {
        status: 400,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': env.ALLOWED_ORIGINS || '*'
        }
      });
    }
  });
  
  // PATCH /api/db/row/:table/:id
  router.patch('/row/:table/:id', async (req: Request, env: any, ctx: Context) => {
    const auth = await requireAdminAuth(req, env);
    if (auth.error) return auth.response;
    
    const table = ctx.params.table;
    const id = parseInt(ctx.params.id);
    
    if (!ALLOWED_TABLES.includes(table)) {
      return new Response(JSON.stringify({ detail: `Table '${table}' not editable` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const body = await req.json() as { values: Record<string, any> };
    const allowed = EDIT_COLUMNS[table];
    const values = Object.fromEntries(
      Object.entries(body.values || {}).filter(([k]) => allowed.includes(k))
    );
    
    if (Object.keys(values).length === 0) {
      return new Response(JSON.stringify({ detail: 'No valid columns to update' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const updates = Object.entries(values).map(([k, v], i) => `${k} = ?`).join(', ');
    const params = [...Object.values(values), id];
    
    await env.DB.prepare(`UPDATE ${table} SET ${updates} WHERE id = ?`).bind(...params).run();
    
    return new Response(JSON.stringify({ table, id, updated: Object.keys(values) }), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': env.ALLOWED_ORIGINS || '*'
      }
    });
  });
  
  // DELETE /api/db/row/:table/:id
  router.delete('/row/:table/:id', async (req: Request, env: any, ctx: Context) => {
    const auth = await requireAdminAuth(req, env);
    if (auth.error) return auth.response;
    
    const table = ctx.params.table;
    const id = parseInt(ctx.params.id);
    
    // Check for foreign key violations
    if (table === 'branches') {
      const used = await env.DB.prepare('SELECT COUNT(*) as cnt FROM items WHERE branch_id = ?').bind(id).first();
      if (used.cnt > 0) {
        return new Response(JSON.stringify({ detail: 'Branch has items — reassign first' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    
    // Cascade deletes
    if (table === 'transactions') {
      await env.DB.prepare('DELETE FROM transaction_items WHERE transaction_id = ?').bind(id).run();
    }
    if (table === 'items') {
      await env.DB.prepare('DELETE FROM transaction_items WHERE item_id = ?').bind(id).run();
    }
    
    await env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
    
    return new Response(JSON.stringify({ table, id, deleted: true }), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': env.ALLOWED_ORIGINS || '*'
      }
    });
  });
  
  return router;
}
