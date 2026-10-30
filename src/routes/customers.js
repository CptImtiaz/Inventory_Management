const router = require('express').Router();
const { pool, tx, audit } = require('../db');
const { requireLogin, requireRole, wrap, HttpError } = require('../auth');

const r2 = n => Math.round(n * 100) / 100;

// Quick lookup by phone for the POS screen (any logged-in user).
router.get('/customers/lookup', requireLogin, wrap(async (req, res) => {
  const [[c]] = await pool.query('SELECT id, name, address, phone, credit_balance FROM customers WHERE phone = ?', [String(req.query.phone || '').trim()]);
  res.json(c || null);
}));

router.get('/customers', requireRole('manager'), wrap(async (req, res) => {
  const where = [], args = [];
  if (req.query.q) { where.push('(name LIKE ? OR phone LIKE ?)'); args.push(`%${req.query.q}%`, `%${req.query.q}%`); }
  if (req.query.owing) where.push('credit_balance > 0');
  const [rows] = await pool.query(`SELECT * FROM customers ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY credit_balance DESC, name LIMIT 500`, args);
  res.json(rows);
}));

// Unpaid invoices for a customer.
router.get('/customers/:id/dues', requireRole('manager'), wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT s.id, s.invoice_no, s.created_at, s.total, s.credit_amount,
            s.credit_amount - COALESCE((SELECT SUM(amount) FROM credit_payments cp WHERE cp.sale_id = s.id), 0) outstanding
     FROM sales s WHERE s.customer_id = ? AND s.credit_amount > 0 HAVING outstanding > 0 ORDER BY s.id`, [req.params.id]);
  const [payments] = await pool.query(
    `SELECT cp.*, s.invoice_no, u.name user_name FROM credit_payments cp LEFT JOIN sales s ON s.id = cp.sale_id
     JOIN users u ON u.id = cp.user_id WHERE cp.customer_id = ? ORDER BY cp.id DESC LIMIT 100`, [req.params.id]);
  res.json({ dues: rows, payments });
}));

// Record a credit (due) payment. Applied oldest invoice first unless sale_id is given.
router.post('/customers/:id/payments', requireRole('manager'), wrap(async (req, res) => {
  let amount = r2(+req.body.amount);
  if (!(amount > 0)) throw new HttpError(400, 'Amount must be greater than zero');
  const out = await tx(async conn => {
    const [[c]] = await conn.query('SELECT * FROM customers WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!c) throw new HttpError(404, 'Customer not found');
    if (amount > c.credit_balance) throw new HttpError(400, `Amount exceeds outstanding balance (${c.credit_balance})`);
    const [dues] = await conn.query(
      `SELECT s.id, s.credit_amount - COALESCE((SELECT SUM(amount) FROM credit_payments cp WHERE cp.sale_id = s.id), 0) outstanding
       FROM sales s WHERE s.customer_id = ? AND s.credit_amount > 0 ${req.body.sale_id ? 'AND s.id = ?' : ''}
       HAVING outstanding > 0 ORDER BY s.id`, req.body.sale_id ? [c.id, req.body.sale_id] : [c.id]);
    const total = amount;
    for (const d of dues) {
      if (amount <= 0) break;
      const pay = r2(Math.min(amount, d.outstanding));
      await conn.query('INSERT INTO credit_payments (customer_id, sale_id, amount, user_id) VALUES (?,?,?,?)', [c.id, d.id, pay, req.session.user.id]);
      amount = r2(amount - pay);
    }
    if (amount > 0) await conn.query('INSERT INTO credit_payments (customer_id, sale_id, amount, user_id) VALUES (?,?,?,?)', [c.id, null, amount, req.session.user.id]);
    await conn.query('UPDATE customers SET credit_balance = credit_balance - ? WHERE id = ?', [total, c.id]);
    await audit(conn, req.session.user.id, 'credit_payment', { customer_id: c.id, amount: total });
    return { credit_balance: r2(c.credit_balance - total) };
  });
  res.json(out);
}));

module.exports = router;
