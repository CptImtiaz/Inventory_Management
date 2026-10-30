const router = require('express').Router();
const { pool, tx, nextCounter, audit } = require('../db');
const { requireLogin, requireRole, hasRole, wrap, HttpError } = require('../auth');

const BASE = `SELECT p.*, c.name category, b.name brand
  FROM products p JOIN categories c ON c.id = p.category_id LEFT JOIN brands b ON b.id = p.brand_id`;

// Inventory list (search + filters). Salespeople get a reduced view without purchase prices.
router.get('/products', requireLogin, wrap(async (req, res) => {
  const { q, category_id, brand_id, low, inactive } = req.query;
  const where = [], args = [];
  if (!inactive) where.push('p.active = 1');
  if (q) { where.push('(p.name LIKE ? OR p.code LIKE ? OR b.name LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (category_id) { where.push('p.category_id = ?'); args.push(category_id); }
  if (brand_id) { where.push('p.brand_id = ?'); args.push(brand_id); }
  if (low) where.push('p.stock_qty <= p.threshold');
  const [rows] = await pool.query(`${BASE} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY p.name`, args);
  if (!hasRole(req.session.user, 'manager')) rows.forEach(r => { delete r.purchase_price; delete r.margin; });
  res.json(rows);
}));

function readProduct(body) {
  const p = {
    name: String(body.name || '').trim(),
    brand_id: body.brand_id ? +body.brand_id : null,
    category_id: +body.category_id,
    purchase_price: +body.purchase_price || 0,
    sale_price: +body.sale_price || 0,
    threshold: Math.max(0, parseInt(body.threshold, 10) || 0),
  };
  if (!p.name) throw new HttpError(400, 'Product name is required');
  if (!p.category_id) throw new HttpError(400, 'Category is required');
  if (p.purchase_price < 0 || p.sale_price < 0) throw new HttpError(400, 'Prices cannot be negative');
  p.margin = p.purchase_price > 0 ? +(((p.sale_price - p.purchase_price) / p.purchase_price) * 100).toFixed(2) : 0;
  return p;
}

router.post('/products', requireRole('manager'), wrap(async (req, res) => {
  const p = readProduct(req.body);
  const stock = Math.max(0, parseInt(req.body.stock_qty, 10) || 0);
  const result = await tx(async conn => {
    const code = 'P' + String(await nextCounter(conn, 'product')).padStart(5, '0');
    const [r] = await conn.query('INSERT INTO products SET ?', [{ ...p, code, stock_qty: stock }]);
    if (stock) await conn.query('INSERT INTO stock_movements (product_id, change_qty, type, reason, user_id) VALUES (?,?,?,?,?)',
      [r.insertId, stock, 'initial', 'Opening stock', req.session.user.id]);
    await audit(conn, req.session.user.id, 'product_add', { id: r.insertId, code, ...p, stock_qty: stock });
    return { id: r.insertId, code };
  });
  res.json(result);
}));

router.put('/products/:id', requireRole('manager'), wrap(async (req, res) => {
  const p = readProduct(req.body);
  await pool.query('UPDATE products SET ? WHERE id = ?', [p, req.params.id]);
  await audit(null, req.session.user.id, 'product_edit', { id: +req.params.id, ...p });
  res.json({ ok: true });
}));

router.delete('/products/:id', requireRole('admin'), wrap(async (req, res) => {
  await pool.query('UPDATE products SET active = 0 WHERE id = ?', [req.params.id]);
  await audit(null, req.session.user.id, 'product_deactivate', { id: +req.params.id });
  res.json({ ok: true });
}));

// Manual stock adjustment: qty is signed (+ add / − subtract); a reason is mandatory.
router.post('/products/:id/adjust', requireRole('manager'), wrap(async (req, res) => {
  const qty = parseInt(req.body.qty, 10);
  const reason = String(req.body.reason || '').trim();
  const type = req.body.type === 'restock' ? 'restock' : 'adjustment';
  if (!qty) throw new HttpError(400, 'Quantity must be a non-zero number');
  if (!reason) throw new HttpError(400, 'A reason note is required');
  const out = await tx(async conn => {
    const [[prod]] = await conn.query('SELECT stock_qty FROM products WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!prod) throw new HttpError(404, 'Product not found');
    if (prod.stock_qty + qty < 0) throw new HttpError(400, `Cannot subtract ${-qty}; only ${prod.stock_qty} in stock`);
    await conn.query('UPDATE products SET stock_qty = stock_qty + ? WHERE id = ?', [qty, req.params.id]);
    await conn.query('INSERT INTO stock_movements (product_id, change_qty, type, reason, user_id) VALUES (?,?,?,?,?)',
      [req.params.id, qty, type, reason, req.session.user.id]);
    await audit(conn, req.session.user.id, 'stock_' + type, { product_id: +req.params.id, qty, reason });
    return { stock_qty: prod.stock_qty + qty };
  });
  res.json(out);
}));

router.get('/products/:id/movements', requireRole('manager'), wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT m.*, u.name user_name FROM stock_movements m JOIN users u ON u.id = m.user_id
     WHERE m.product_id = ? ORDER BY m.id DESC LIMIT 200`, [req.params.id]);
  res.json(rows);
}));

module.exports = router;
