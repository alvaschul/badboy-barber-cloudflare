import { Router } from '../utils/router';

export function transactionsRoutes() {
  const router = new Router();
  
  // POST /api/transactions - create transaction
  router.post('/', async (req: Request, env: any, ctx: Context) => {
    try {
      const body = await req.json() as {
        items?: Array<{ item_id: number; quantity: number; price: number }>;
        cash_amount?: number;
        qris_amount?: number;
        total_amount?: number;
        change_amount?: number;
        notes?: string;
        user_id?: number | string;
        cabang_id?: number | string;
      };
      
      const items = body.items || [];
      const cash = body.cash_amount ?? 0;
      const qris = body.qris_amount ?? 0;
      const total = body.total_amount ?? items.reduce((s: number, i: any) => s + i.price * i.quantity, 0);
      const change = body.change_amount ?? Math.max(cash - total, 0);
      
      const db = env.DB;
      
      // Begin transaction
      const txn = await db.exec('BEGIN TRANSACTION');
      
      try {
        // Insert transaction
        const txResult = await db.prepare(
          `INSERT INTO transactions (user_id, total_amount, cash_amount, qris_amount, change_amount, status, notes, date)
           VALUES (?, ?, ?, ?, ?, 'completed', ?, ?)`
        ).bind(
          parseInt(body.user_id as any) || 1,
          total,
          cash,
          qris,
          change,
          body.notes || '',
          new Date().toISOString().slice(0, 10)
        ).run();
        
        const txId = txResult.lastInsertRowid;
        
        // Insert transaction items
        for (const item of items) {
          await db.prepare(
            `INSERT INTO transaction_items (transaction_id, item_id, quantity, unit_price)
             VALUES (?, ?, ?, ?)`
          ).bind(txId, item.item_id, item.quantity, item.price).run();
        }
        
        await db.exec('COMMIT');
        
        return new Response(JSON.stringify({
          id: txId,
          total: total,
          status: 'completed',
          created_at: new Date().toISOString().slice(0, 10)
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
      return new Response(JSON.stringify({ detail: 'Internal server error' }), {
        status: 500,
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
      
      // Item breakdown
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
