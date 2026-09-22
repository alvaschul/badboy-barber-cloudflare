import { Router, type Context } from '../utils/router';
import { requireAuth } from '../utils/auth';

function parsePositiveInteger(value: unknown, label: string): number {
  if (value === undefined || value === null) {
    throw new Error(`${label} is required`);
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function parseNonNegativeNumber(value: unknown, label: string): number {
  if (value === undefined || value === null) {
    return 0;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (isNaN(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative number`);
  }
  return parsed;
}

export function transactionsRoutes() {
  const router = new Router();

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
        cabang_id?: number | string;
      };

      const userId = auth.payload.user_id as number;
      
      const items = Array.isArray(body.items) ? body.items : [];
      if (items.length === 0) {
        return new Response(JSON.stringify({ detail: 'At least one item is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
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
            headers: { 'Content-Type': 'application/json' }
          });
        }

        const unitPrice = parseNonNegativeNumber(itemRecord.price, 'Item price');
        normalizedItems.push({ item_id: itemId, quantity, price: unitPrice });
        computedTotal += unitPrice * quantity;
      }

      const cash = parseNonNegativeNumber(body.cash_amount ?? 0, 'Cash amount');
      const qris = parseNonNegativeNumber(body.qris_amount ?? 0, 'QRIS amount');

      const providedTotal = body.total_amount !== undefined ? parseNonNegativeNumber(body.total_amount, 'Total amount') : computedTotal;
      if (Math.abs(providedTotal - computedTotal) > 0.0001) {
        return new Response(JSON.stringify({ detail: 'Total amount does not match item total' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const expectedChange = Math.max(cash + qris - computedTotal, 0);
      const providedChange = body.change_amount !== undefined ? parseNonNegativeNumber(body.change_amount, 'Change amount') : expectedChange;
      if (Math.abs(providedChange - expectedChange) > 0.0001) {
        return new Response(JSON.stringify({ detail: 'Change amount does not match payment total' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const date = new Date().toISOString().slice(0, 10);

      // Insert transaction
      const txResult = await db.prepare(
        `INSERT INTO transactions (user_id, total_amount, cash_amount, qris_amount, change_amount, status, notes, date)
         VALUES (?, ?, ?, ?, ?, 'completed', ?, ?)`
      ).bind(userId, computedTotal, cash, qris, expectedChange, body.notes || '', date).run();

      const transactionId = txResult.meta.last_row_id;

      if (!transactionId) {
        return new Response(JSON.stringify({ detail: 'Failed to create transaction' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Insert transaction items
      for (const item of normalizedItems) {
        await db.prepare(
          `INSERT INTO transaction_items (transaction_id, item_id, quantity, unit_price)
           VALUES (?, ?, ?, ?)`
        ).bind(transactionId, item.item_id, item.quantity, item.price).run();
      }

      return new Response(JSON.stringify({
        id: transactionId,
        total: computedTotal,
        status: 'completed',
        created_at: date
      }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (e) {
      console.error('Create transaction error:', e);
      return new Response(JSON.stringify({ detail: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });

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
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (e) {
      console.error('List transactions error:', e);
      return new Response(JSON.stringify({ detail: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });

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
          SUM(ti.quantity * ti.unit_price) as total
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
        headers: { 'Content-Type': 'application/json' }
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
