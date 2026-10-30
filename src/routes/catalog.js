// Brands and categories (lookup lists). Reading is open to all logged-in users;
// changing them is admin-only.
const router = require('express').Router();
const { pool, audit } = require('../db');
const { requireLogin, requireRole, wrap, HttpError } = require('../auth');

for (const table of ['brands', 'categories']) {
  router.get(`/${table}`, requireLogin, wrap(async (req, res) => {
    const where = req.query.all ? '' : 'WHERE active = 1';
    const [rows] = await pool.query(
      `SELECT t.*, (SELECT COUNT(*) FROM products p WHERE p.${table === 'brands' ? 'brand_id' : 'category_id'} = t.id AND p.active = 1) product_count
       FROM ${table} t ${where} ORDER BY name`);
    res.json(rows);
  }));

  router.post(`/${table}`, requireRole('admin'), wrap(async (req, res) => {
    const name = String(req.body.name || '').trim();
    if (!name) throw new HttpError(400, 'Name is required');
    try {
      const [r] = await pool.query(`INSERT INTO ${table} (name) VALUES (?)`, [name]);
      await audit(null, req.session.user.id, `${table}_add`, { id: r.insertId, name });
      res.json({ id: r.insertId, name, active: 1 });
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') throw new HttpError(409, `"${name}" already exists`);
      throw e;
    }
  }));

  router.put(`/${table}/:id`, requireRole('admin'), wrap(async (req, res) => {
    const name = String(req.body.name || '').trim();
    const active = req.body.active === undefined ? 1 : (req.body.active ? 1 : 0);
    if (!name) throw new HttpError(400, 'Name is required');
    await pool.query(`UPDATE ${table} SET name = ?, active = ? WHERE id = ?`, [name, active, req.params.id]);
    await audit(null, req.session.user.id, `${table}_edit`, { id: +req.params.id, name, active });
    res.json({ ok: true });
  }));

  // Delete only if unused; otherwise deactivate so historical sales stay intact.
  router.delete(`/${table}/:id`, requireRole('admin'), wrap(async (req, res) => {
    const col = table === 'brands' ? 'brand_id' : 'category_id';
    const [[{ n }]] = await pool.query(`SELECT COUNT(*) n FROM products WHERE ${col} = ?`, [req.params.id]);
    if (n) {
      await pool.query(`UPDATE ${table} SET active = 0 WHERE id = ?`, [req.params.id]);
      await audit(null, req.session.user.id, `${table}_deactivate`, { id: +req.params.id });
      return res.json({ deactivated: true });
    }
    await pool.query(`DELETE FROM ${table} WHERE id = ?`, [req.params.id]);
    await audit(null, req.session.user.id, `${table}_delete`, { id: +req.params.id });
    res.json({ deleted: true });
  }));
}

module.exports = router;
