import { Router } from '../utils/router';

export function reportsRoutes() {
  const router = new Router();
  
  // GET /api/reports/daily-summary
  router.get('/daily-summary', async (req: Request, env: any, ctx: Context) => {
    try {
      const url = new URL(req.url);
      const date = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
      
      // Get summary
      const summary = await env.DB.prepare(
        `SELECT 
          COUNT(*) as total_transactions,
          COALESCE(SUM(total_amount), 0) as total_revenue,
          COALESCE(SUM(cash_amount), 0) as total_cash,
          COALESCE(SUM(qris_amount), 0) as total_qris,
          COALESCE(SUM(change_amount), 0) as total_change
         FROM transactions WHERE date = ?`
      ).bind(date).first();
      
      // Get item breakdown
      const breakdown = await env.DB.prepare(
        `SELECT 
          i.id, i.name, i.category, i.price,
          SUM(ti.quantity) as quantity,
          SUM(ti.quantity * ti.unit_price) as total
         FROM transaction_items ti
         JOIN items i ON ti.item_id = i.id
         JOIN transactions t ON ti.transaction_id = t.id
         WHERE t.date = ?
         GROUP BY i.id
         ORDER BY i.id`
      ).bind(date).all();
      
      // Get transactions
      const txns = await env.DB.prepare(
        `SELECT id, total_amount, cash_amount, qris_amount, change_amount, notes, date
         FROM transactions WHERE date = ? ORDER BY id`
      ).bind(date).all();
      
      // Calculate totals
      const totalSales = breakdown.results.reduce((s: number, b: any) => s + (b.quantity || 0), 0);
      const totalProducts = breakdown.results
        .filter((b: any) => b.category === 'product')
        .reduce((s: number, b: any) => s + (b.price * b.quantity), 0);
      
      return new Response(JSON.stringify({
        date,
        summary: {
          total_transactions: summary.total_transactions || 0,
          total_revenue: summary.total_revenue || 0,
          total_cash: summary.total_cash || 0,
          total_qris: summary.total_qris || 0
        },
        total_sales: totalSales,
        total_products: totalProducts,
        items: breakdown.results.map((b: any) => ({
          id: b.id,
          name: b.name,
          category: b.category,
          price: b.price,
          quantity: b.quantity,
          total: b.total
        })),
        transactions: txns.results.map((t: any) => ({
          id: t.id,
          total_amount: t.total_amount,
          cash_amount: t.cash_amount,
          qris_amount: t.qris_amount,
          change_amount: t.change_amount,
          notes: t.notes,
          created_at: t.date
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
  
  // GET /api/reports/daily-detail
  router.get('/daily-detail', async (req: Request, env: any, ctx: Context) => {
    try {
      const url = new URL(req.url);
      const date = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
      
      const summary = await env.DB.prepare(
        `SELECT 
          COUNT(*) as total_transactions,
          COALESCE(SUM(total_amount), 0) as total_revenue
         FROM transactions WHERE date = ?`
      ).bind(date).first();
      
      const breakdown = await env.DB.prepare(
        `SELECT i.id, i.name, i.category, i.price,
                SUM(ti.quantity) as quantity,
                SUM(ti.quantity * ti.unit_price) as total
         FROM transaction_items ti
         JOIN items i ON ti.item_id = i.id
         JOIN transactions t ON ti.transaction_id = t.id
         WHERE t.date = ?
         GROUP BY i.id`
      ).bind(date).all();
      
      // Get active non-admin users
      const users = await env.DB.prepare(
        'SELECT id, username, role FROM users WHERE is_active = 1 AND role != ? ORDER BY id',
        ['admin']
      ).all();
      
      const txns = await env.DB.prepare(
        `SELECT id, total_amount, cash_amount, qris_amount, change_amount, notes, date
         FROM transactions WHERE date = ? ORDER BY id`
      ).bind(date).all();
      
      return new Response(JSON.stringify({
        date,
        summary: {
          total_transactions: summary.total_transactions || 0,
          total_revenue: summary.total_revenue || 0
        },
        items: breakdown.results.map((b: any) => ({
          id: b.id,
          name: b.name,
          category: b.category,
          price: b.price,
          quantity: b.quantity,
          total: b.total
        })),
        transactions: txns.results.map((t: any) => ({
          id: t.id,
          total_amount: t.total_amount,
          cash_amount: t.cash_amount,
          qris_amount: t.qris_amount,
          change_amount: t.change_amount,
          notes: t.notes,
          created_at: t.date
        })),
        users: users.results.map((u: any) => ({
          id: u.id,
          name: u.username,
          username: u.username,
          role: u.role
        })),
        staff_pay: 'UM (Uang Makan)'
      }), {
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': env.ALLOWED_ORIGINS || '*'
        }
      });
    } catch (e) {
      console.error('Daily detail error:', e);
      return new Response(JSON.stringify({ detail: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });
  
  // GET /api/reports/csv
  router.get('/csv', async (req: Request, env: any, ctx: Context) => {
    try {
      const url = new URL(req.url);
      const date = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
      
      const txns = await env.DB.prepare(
        `SELECT id, date, total_amount, cash_amount, qris_amount, change_amount, notes
         FROM transactions WHERE date = ? ORDER BY id`
      ).bind(date).all();
      
      let csv = 'ID,Date,Total,Cash,QRIS,Change,Notes\n';
      for (const t of txns.results) {
        const notes = (t.notes || '').replace(/"/g, '""');
        csv += `${t.id},${t.date},${t.total_amount},${t.cash_amount},${t.qris_amount},${t.change_amount},"${notes}"\n`;
      }
      
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename=transactions_${date}.csv`,
          'Access-Control-Allow-Origin': env.ALLOWED_ORIGINS || '*'
        }
      });
    } catch (e) {
      console.error('CSV export error:', e);
      return new Response(JSON.stringify({ detail: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });
  
  return router;
}
