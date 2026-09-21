import { Router } from '../utils/router';
import { verifyToken } from '../utils/jwt';

function parsePositiveInteger(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function parseNonNegativeNumber(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative number`);
  }
  return parsed;
}

async function requireAuth(req: Request, env: any): Promise<{ ok: boolean; response?: Response; payload?: any }> {
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

  const payload = await verifyToken(authHeader.slice(7));
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

export function transactionsRoutes() {
  const router = new Router();

  // POST /api/transactions - create transaction
  router.post('/', async (req: Request, env: any, ctx: Context) => {
    try {
      const auth = await requireAuth(req, env);
      if (!auth.ok) return auth.response!;

      const body = await req.json() as {
        items?: Array<{ item_id?: number | string; quantity?: number | string; price?: number | string }>;
        cash_amount?: number | string;
        qris_amount?: number | string;
        total_amount?: number | string;
        change_amount?: number | string;
        notes?: string;
        user_id?: number | string;
        cabang_id?: number | string;
      };

      const items = Array.isArray(body.items) ? body.items : [];
      if (items.length === 0) {
        return new Response(JSON.stringify({ detail: 'At least one item is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': env.ALLOWED_ORIGINS || '*' }
        });
      }

      const db = env.DB;
      const normalizedItems: Array<{ item_id: number; quantity: number; price: number }> = [];
      let computedTotal = 0;

      for (const item of items) {
        const itemId = parsePositiveInteger(item?.item_id, 'Item id');
        const quantity = parsePositiveInteger(item?.quantity, 'Quantity');
        const itemRecord = await db.prepare('SELECT id, price, is_active FROM items WHERE id = ?').bind(itemId).first();

        if (!itemRecord || itemRecord.is_active !== 1) {
          return new Response(JSON.stringify({ detail: `Item ${itemId} not found or inactive` }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': env.ALLOWED_ORIGINS || '*' }
          });
        }

        const unitPrice = parseNonNegativeNumber(itemRecord.price, 'Item price');
        normalizedItems.push({ item_id: itemId, quantity, price: unitPrice });
        computedTotal += unitPrice * quantity;
      }

      const cash = parseNonNegativeNumber(body.cash_amount ?? 0, 'Cash amount');
      const qris = parseNonNegativeNumber(body.qris_amount ?? 0, 'QRIS amount');
      const userId = parsePositiveInteger(body.user_id, 'User id');
      const user = await db.prepare('SELECT id FROM users WHERE id = ? AND is_active = 1').bind(userId).first();

      if (!user) {
        return new Response(JSON.stringify({ detail: 'User not found' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': env.ALLOWED_ORIGINS || '*' }
        });
      }

      const providedTotal = body.total_amount !== undefined ? parseNonNegativeNumber(body.total_amount, 'Total amount') : computedTotal;
      if (Math.abs(providedTotal - computedTotal) > 0.0001) {
        return new Response(JSON.stringify({ detail: 'Total amount does not match item total' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': env.ALLOWED_ORIGINS || '*' }
        });
      }

      const providedChange = body.change_amount !== undefined ? parseNonNegativeNumber(body.change_amount, 'Change amount') : Math.max(cash + qris - computedTotal, 0);
      const expectedChange = Math.max(cash + qris - computedTotal, 0);
      if (Math.abs(providedChange - expectedChange) > 0.0001) {
        return new Response(JSON.stringify({ detail: 'Change amount does not match payment total' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': env.ALLOWED_ORIGINS || '*' }
        });
      }

      const date = new Date().toISOString().slice(0, 10);

      const txn = await db.exec('BEGIN TRANSACTION');

      try {
        const txResult = await db.prepare(
          `INSERT INTO transactions (user_id, total_amount, cash_amount, qris_amount, change_amount, status, notes, date)
           VALUES (?, ?, ?, ?, ?, 'completed', ?, ?)`
        ).bind(
          userId,
          computedTotal,
          cash,
          qris,
          expectedChange,
          body.notes || '',
          date
        ).run();

        const txId = txResult.lastInsertRowid;

        for (const item of normalizedItems) {
          await db.prepare(
            `INSERT INTO transaction_items (transaction_id, item_id, quantity, unit_price)
             VALUES (?, ?, ?, ?)`
          ).bind(txId, item.item_id, item.quantity, item.price).run();
        }

        await db.exec('COMMIT');

        return new Response(JSON.stringify({
          id: txId,
          total: computedTotal,
          status: 'completed',
          created_at: date
        }), {
          status: 201,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': env.ALLOWED_ORIGINS || '*'
          }
        });
      } catch (e) {
        await db.exec('ROLLBACK');
        console.error('Transaction commit error:', e);
        return new Response(JSON.stringify({ detail: 'Transaction failed' }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': env.ALLOWED_ORIGINS || '*'
          }
        });
      }
    } catch (e) {
      console.error('Create transaction error:', e);
      return new Response(JSON.stringify({ detail: e instanceof Error ? e.message : 'Internal server error' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': env.ALLOWED_ORIGINS || '*'
        }
      });
    }
  });

  // GET /api/transactions - list transactions
  router.get('/', async (req: Request, env: any, ctx: Context) => {
    try {
      const auth = await requireAuth(req, env);
      if (!auth.ok) return auth.response!;

      const url = new URL(req.url);
      const date = url.searchParams.get('date');

      let query = 'SELECT id, user_id, total_amount, cash_amount, qris_amount, change_amount, status, notes, date FROM transactions';
      const params: any[] = [];

      if (date) {
        query += ' WHERE date = ?';
        params.push(date);
      }

      query += ' ORDER BY id DESC LIMIT 100';

      const txns = await env.DB.prepare(query).bind(...params).all();

      const result = txns.results.map((t: any) => ({
        id: t.id,
        total: t.total_amount,
        date: t.date,
        status: t.status,
        notes: t.notes
      }));

      return new Response(JSON.stringify(result), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': env.ALLOWED_ORIGINS || '*'
        }
      });
    } catch (e) {
      console.error('List transactions error:', e);
      return new Response(JSON.stringify({ detail: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });

  // GET /api/transactions/daily - daily summary
  router.get('/daily', async (req: Request, env: any, ctx: Context) => {
    try {
      const auth = await requireAuth(req, env);
      if (!auth.ok) return auth.response!;

      const url = new URL(req.url);
      const date = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);

      const summary = await env.DB.prepare(
        `SELECT 
          COUNT(*) as total_transactions,
          COALESCE(SUM(total_amount), 0) as total_revenue,
          COALESCE(SUM(cash_amount), 0) as total_cash,
          COALESCE(SUM(qris_amount), 0) as total_qris
         FROM transactions WHERE date = ?`
      ).bind(date).first();

      const breakdown = await env.DB.prepare(
        `SELECT 
          i.name, i.category, i.price,
          SUM(ti.quantity) as quantity,
          COALESCE(SUM(ti.quantity * ti.unit_price), 0) as total
         FROM transaction_items ti
         JOIN items i ON ti.item_id = i.id
         JOIN transactions t ON ti.transaction_id = t.id
         WHERE t.date = ?
         GROUP BY i.id`
      ).bind(date).all();

      return new Response(JSON.stringify({
        date,
        summary: {
          total_transactions: summary.total_transactions || 0,
          total_revenue: summary.total_revenue || 0,
          total_cash: summary.total_cash || 0,
          total_qris: summary.total_qris || 0
        },
        items: breakdown.results.map((b: any) => ({
          name: b.name,
          category: b.category,
          price: b.price,
          quantity: b.quantity,
          total: b.total
        }))
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': env.ALLOWED_ORIGINS || '*'
        }
      });
    } catch (e) {
      console.error('Daily summary error:', e);
      return new Response(JSON.stringify({ detail: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });

  return router;
}
