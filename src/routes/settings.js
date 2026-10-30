// Settings, user management and audit log — Admin only (except the read-only shop profile).
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { pool, audit, getSettings } = require('../db');
const { requireLogin, requireRole, wrap, HttpError, forgetUser } = require('../auth');
const { runArchive } = require('../archiver');
const { loadDemoData } = require('../demo');

const EDITABLE = ['shop_name', 'shop_address', 'shop_phone', 'shop_logo', 'default_margin', 'retention_days'];

// Shop profile + default margin, needed by every user for invoices and the product form.
router.get('/settings', requireLogin, wrap(async (req, res) => {
  res.json(await getSettings());
}));

router.put('/settings', requireRole('admin'), wrap(async (req, res) => {
  const changes = {};
  for (const k of EDITABLE) if (req.body[k] !== undefined) changes[k] = String(req.body[k]);
  if (changes.default_margin !== undefined && !(+changes.default_margin >= 0)) throw new HttpError(400, 'Margin must be 0 or more');
  if (changes.retention_days !== undefined && !(parseInt(changes.retention_days, 10) >= 1)) throw new HttpError(400, 'Retention must be at least 1 day');
  if (changes.shop_logo && !/^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/.test(changes.shop_logo)) throw new HttpError(400, 'Logo must be an image');
  for (const [k, v] of Object.entries(changes)) await pool.query('REPLACE INTO settings (k, v) VALUES (?, ?)', [k, v]);
  const logged = { ...changes };
  if (logged.shop_logo) logged.shop_logo = '(updated)';
  await audit(null, req.session.user.id, 'settings_update', logged);
  if (changes.retention_days) await runArchive();
  res.json(await getSettings());
}));

// ---- Users ----
const ROLES = ['admin', 'manager', 'salesperson'];

router.get('/users', requireRole('admin'), wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT id, username, name, role, active, created_at FROM users WHERE deleted = 0 ORDER BY active DESC, name');
  res.json(rows);
}));

function checkPassword(pw) {
  if (String(pw).length < 6) throw new HttpError(400, 'Password must be at least 6 characters');
}

router.post('/users', requireRole('admin'), wrap(async (req, res) => {
  const { username, name, role, password } = req.body;
  if (!username || !name) throw new HttpError(400, 'Username and name are required');
  if (!ROLES.includes(role)) throw new HttpError(400, 'Invalid role');
  checkPassword(password || '');
  try {
    const [r] = await pool.query('INSERT INTO users (username, name, role, password_hash) VALUES (?,?,?,?)',
      [String(username).trim(), String(name).trim(), role, await bcrypt.hash(password, 12)]);
    await audit(null, req.session.user.id, 'user_add', { id: r.insertId, username, role });
    res.json({ id: r.insertId });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Username already taken');
    throw e;
  }
}));

router.put('/users/:id', requireRole('admin'), wrap(async (req, res) => {
  const id = +req.params.id;
  const { name, role, active, password } = req.body;
  if (!ROLES.includes(role)) throw new HttpError(400, 'Invalid role');
  if (id === req.session.user.id && (role !== 'admin' || !active)) throw new HttpError(400, 'You cannot demote or deactivate yourself');
  const [upd] = await pool.query('UPDATE users SET name = ?, role = ?, active = ? WHERE id = ? AND deleted = 0', [String(name).trim(), role, active ? 1 : 0, id]);
  if (!upd.affectedRows) throw new HttpError(404, 'User not found');
  if (password) {
    checkPassword(password);
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(password, 12), id]);
  }
  forgetUser(id); // this instance applies the change at once; others within a minute
  await audit(null, req.session.user.id, 'user_edit', { id, role, active: !!active, password_changed: !!password });
  res.json({ ok: true });
}));

// Any user may change their own password.
// Delete a user (Admin/Owner only). The account can never log in again and disappears from
// the user list; the person's name stays on their past invoices and in the audit log,
// so sales history and reports are not affected. The username becomes free to reuse.
router.delete('/users/:id', requireRole('admin'), wrap(async (req, res) => {
  const id = +req.params.id;
  if (id === req.session.user.id) throw new HttpError(400, 'You cannot delete your own account');
  const [[u]] = await pool.query('SELECT id, username, role FROM users WHERE id = ? AND deleted = 0', [id]);
  if (!u) throw new HttpError(404, 'User not found');
  if (u.role === 'admin') {
    const [[{ n }]] = await pool.query("SELECT COUNT(*) n FROM users WHERE role = 'admin' AND active = 1 AND deleted = 0 AND id <> ?", [id]);
    if (!n) throw new HttpError(400, 'At least one active Admin must remain');
  }
  await pool.query("UPDATE users SET deleted = 1, active = 0, password_hash = '!', username = ? WHERE id = ?",
    [`${u.username}~deleted~${id}`.slice(0, 50), id]);
  forgetUser(id); // signs the user out on this instance at once, others within a minute
  await audit(null, req.session.user.id, 'user_delete', { id, username: u.username, role: u.role });
  res.json({ ok: true });
}));

router.post('/me/password', requireLogin, wrap(async (req, res) => {
  const { current, password } = req.body;
  const [[u]] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [req.session.user.id]);
  if (!u || !(await bcrypt.compare(String(current || ''), u.password_hash))) throw new HttpError(400, 'Current password is wrong');
  checkPassword(password || '');
  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(password, 12), req.session.user.id]);
  await audit(null, req.session.user.id, 'password_change', '');
  res.json({ ok: true });
}));

// Fill an empty shop with sample data so the system can be tried out.
router.post('/demo-data', requireRole('admin'), wrap(async (req, res) => {
  res.json(await loadDemoData(req.session.user.id));
}));

router.get('/audit', requireRole('admin'), wrap(async (req, res) => {
  const where = [], args = [];
  if (req.query.action) { where.push('a.action = ?'); args.push(req.query.action); }
  if (req.query.date) { where.push('DATE(a.created_at) = ?'); args.push(req.query.date); }
  const [rows] = await pool.query(
    `SELECT a.*, u.name user_name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY a.id DESC LIMIT 500`, args);
  res.json(rows);
}));

module.exports = router;
