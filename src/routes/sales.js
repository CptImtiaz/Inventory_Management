const router = require('express').Router();
const { pool, tx, nextCounter, audit, getSettings } = require('../db');
const { requireLogin, requireRole, hasRole, wrap, HttpError } = require('../auth');

const r2 = n => Math.round(n * 100) / 100;

function pad2(n) { return String(n).padStart(2, '0'); }
function sqlDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/**
 * Create a sale. Body:
 *   { client_uuid?, offline_at?, customer: {name, address, phone},
 *     items: [{product_id, qty, discount, unit_price?}], payment_type: 'cash'|'credit', cash_paid }
 * Online sales use the server's current sale price and reject overselling.
 * Offline sales (offline_at set, replayed by the sync queue) keep the price that was
 * printed on the provisional invoice and are accepted even if stock goes negative —
 * the goods have already left the shop — but both cases are flagged in the audit log.
 * client_uuid makes the call idempotent so a retried sync never double-books.
 */
async function createSale(user, body) {
  const offline = !!body.offline_at;
  const cust = body.customer || {};
  const name = String(cust.name || '').trim(), address = String(cust.address || '').trim(), phone = String(cust.phone || '').trim();
  if (!name || !address || !phone) throw new HttpError(400, 'Customer name, address and phone are required');
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) throw new HttpError(400, 'Cart is empty');
  const canDiscount = hasRole(user, 'manager');

  return tx(async conn => {
    if (body.client_uuid) {
      const [[dup]] = await conn.query('SELECT id, invoice_no FROM sales WHERE client_uuid = ?', [body.client_uuid]);
      if (dup) return { id: dup.id, invoice_no: dup.invoice_no, duplicate: true };
    }

    const lines = [];
    const warnings = [];
    for (const it of items) {
      const qty = parseInt(it.qty, 10);
      if (!(qty > 0)) throw new HttpError(400, 'Quantity must be at least 1');
      const [[p]] = await conn.query('SELECT * FROM products WHERE id = ? FOR UPDATE', [it.product_id]);
      if (!p) throw new HttpError(400, `Product ${it.product_id} not found`);
      if (p.stock_qty < qty) {
        if (!offline) throw new HttpError(400, `Not enough stock for ${p.name}: ${p.stock_qty} available`);
        warnings.push(`${p.code} oversold offline: stock ${p.stock_qty}, sold ${qty}`);
      }
      let unit = p.sale_price;
      if (offline && it.unit_price != null && +it.unit_price !== p.sale_price) {
        warnings.push(`${p.code} sold offline at ${it.unit_price} (current price ${p.sale_price})`);
        unit = +it.unit_price;
      }
      const gross = r2(unit * qty);
      const discount = r2(+it.discount || 0);
      if (discount < 0 || discount > gross) throw new HttpError(400, `Invalid discount on ${p.name}`);
      if (discount > 0 && !canDiscount) throw new HttpError(403, 'Only a Manager or Admin can apply discounts');
      lines.push({ p, qty, unit, discount, line_total: r2(gross - discount) });
    }

    const subtotal = r2(lines.reduce((s, l) => s + l.unit * l.qty, 0));
    const discount_total = r2(lines.reduce((s, l) => s + l.discount, 0));
    const total = r2(subtotal - discount_total);
    const cost_total = r2(lines.reduce((s, l) => s + l.p.purchase_price * l.qty, 0));

    const payment_type = body.payment_type === 'credit' ? 'credit' : 'cash';
    let cash_paid = body.cash_paid == null || body.cash_paid === '' ? total : r2(+body.cash_paid);
    if (payment_type === 'cash') {
      if (cash_paid < total) throw new HttpError(400, 'Cash payment must cover the full amount. Use “Credit” for partial payment.');
      cash_paid = total; // change returned to the customer is not revenue
    } else if (!(cash_paid >= 0 && cash_paid <= total)) {
      throw new HttpError(400, 'Amount paid must be between 0 and the grand total');
    }
    const credit_amount = r2(total - cash_paid);

    // Customer: match on phone number, update name/address to latest.
    let [[c]] = await conn.query('SELECT id FROM customers WHERE phone = ? FOR UPDATE', [phone]);
    if (c) await conn.query('UPDATE customers SET name = ?, address = ?, credit_balance = credit_balance + ? WHERE id = ?', [name, address, credit_amount, c.id]);
    else {
      const [r] = await conn.query('INSERT INTO customers (name, address, phone, credit_balance) VALUES (?,?,?,?)', [name, address, phone, credit_amount]);
      c = { id: r.insertId };
    }

    const now = new Date();
    const when = offline ? new Date(body.offline_at) : now;
    if (isNaN(when)) throw new HttpError(400, 'Bad offline timestamp');
    const seq = await nextCounter(conn, 'invoice_' + now.getFullYear());
    const invoice_no = `INV-${now.getFullYear()}-${String(seq).padStart(6, '0')}`;

    const [sr] = await conn.query('INSERT INTO sales SET ?', [{
      invoice_no, client_uuid: body.client_uuid || null, created_at: sqlDate(when), customer_id: c.id,
      subtotal, discount_total, total, cost_total, cash_paid, credit_amount, payment_type,
      salesperson_id: user.id, offline: offline ? 1 : 0,
    }]);
    const saleId = sr.insertId;

    for (const l of lines) {
      await conn.query('INSERT INTO sale_items SET ?', [{
        sale_id: saleId, product_id: l.p.id, product_name: l.p.name, category_id: l.p.category_id,
        qty: l.qty, unit_price: l.unit, unit_cost: l.p.purchase_price, discount: l.discount, line_total: l.line_total,
      }]);
      // Stock auto-update: subtract sold quantity immediately.
      await conn.query('UPDATE products SET stock_qty = stock_qty - ? WHERE id = ?', [l.qty, l.p.id]);
      await conn.query('INSERT INTO stock_movements (product_id, change_qty, type, ref_sale_id, user_id, created_at) VALUES (?,?,?,?,?,?)',
        [l.p.id, -l.qty, 'sale', saleId, user.id, sqlDate(when)]);
    }

    await audit(conn, user.id, offline ? 'sale_offline_sync' : 'sale', {
      sale_id: saleId, invoice_no, total, cash_paid, credit_amount, discount_total,
      items: lines.map(l => ({ product_id: l.p.id, qty: l.qty, unit_price: l.unit, discount: l.discount })),
      ...(warnings.length ? { warnings } : {}),
    });
    return { id: saleId, invoice_no, warnings };
  });
}

router.post('/sales', requireLogin, wrap(async (req, res) => {
  res.json(await createSale(req.session.user, req.body));
}));

// Bulk sync of sales queued while offline. Each one is processed independently.
router.post('/sales/sync', requireLogin, wrap(async (req, res) => {
  const results = [];
  for (const s of Array.isArray(req.body.sales) ? req.body.sales : []) {
    try { results.push({ client_uuid: s.client_uuid, ok: true, ...(await createSale(req.session.user, s)) }); }
    catch (e) { results.push({ client_uuid: s.client_uuid, ok: false, error: e.status ? e.message : 'Server error' }); if (!e.status) console.error(e); }
  }
  res.json({ results });
}));

// Sales list. Salespeople see only their own sales from today.
router.get('/sales', requireLogin, wrap(async (req, res) => {
  const u = req.session.user;
  const where = [], args = [];
  if (!req.query.archived) where.push('s.archived = 0');
  if (req.query.from) { where.push('s.created_at >= ?'); args.push(req.query.from + ' 00:00:00'); }
  if (req.query.to) { where.push('s.created_at <= ?'); args.push(req.query.to + ' 23:59:59'); }
  if (req.query.q) { where.push('(s.invoice_no LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)'); args.push(...Array(3).fill(`%${req.query.q}%`)); }
  if (!hasRole(u, 'manager')) { where.push('s.salesperson_id = ? AND DATE(s.created_at) = CURDATE()'); args.push(u.id); }
  const [rows] = await pool.query(
    `SELECT s.id, s.invoice_no, s.created_at, s.total, s.cash_paid, s.credit_amount, s.payment_type, s.offline,
            c.name customer, c.phone, u.name salesperson
     FROM sales s JOIN customers c ON c.id = s.customer_id JOIN users u ON u.id = s.salesperson_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY s.id DESC LIMIT 500`, args);
  res.json(rows);
}));

// Full invoice data.
router.get('/sales/:id', requireLogin, wrap(async (req, res) => {
  const u = req.session.user;
  const [[sale]] = await pool.query(
    `SELECT s.*, c.name customer_name, c.address customer_address, c.phone customer_phone, u.name salesperson
     FROM sales s JOIN customers c ON c.id = s.customer_id JOIN users u ON u.id = s.salesperson_id WHERE s.id = ?`, [req.params.id]);
  if (!sale) throw new HttpError(404, 'Invoice not found');
  if (!hasRole(u, 'manager') && sale.salesperson_id !== u.id) throw new HttpError(403, 'Not permitted');
  const [items] = await pool.query('SELECT product_name, qty, unit_price, discount, line_total FROM sale_items WHERE sale_id = ? ORDER BY id', [sale.id]);
  const [[{ paid_later }]] = await pool.query('SELECT COALESCE(SUM(amount),0) paid_later FROM credit_payments WHERE sale_id = ?', [sale.id]);
  delete sale.cost_total;
  sale.outstanding = r2(sale.credit_amount - paid_later);
  const s = await getSettings();
  res.json({ sale, items, shop: { name: s.shop_name, address: s.shop_address, phone: s.shop_phone, logo: s.shop_logo } });
}));

module.exports = router;
module.exports.createSale = createSale;
