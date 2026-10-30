const { pool } = require('./db');

// Role hierarchy: admin > manager > salesperson
const RANK = { salesperson: 1, manager: 2, admin: 3 };

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Per-instance cache of user status so deactivations and role changes take effect
// within a minute without a database query on every request.
const userCache = new Map();
const USER_TTL = 60 * 1000;
const forgetUser = id => userCache.delete(id);

async function currentUser(id) {
  const c = userCache.get(id);
  if (c && Date.now() - c.at < USER_TTL) return c.user;
  const [[u]] = await pool.query('SELECT id, name, username, role, active FROM users WHERE id = ?', [id]);
  userCache.set(id, { user: u || null, at: Date.now() });
  return u || null;
}

// Runs on every API request: 30-minute idle logout, rolling expiry, and drops
// sessions of users who were deactivated (role changes are picked up too).
const sessionGuard = idleMs => async (req, res, next) => {
  const s = req.session;
  if (!s || !s.user) return next();
  const now = Date.now();
  if (!s.seen || now - s.seen > idleMs) { req.session = null; return next(); }
  try {
    const u = await currentUser(s.user.id);
    if (!u || !u.active) { req.session = null; return next(); }
    if (u.role !== s.user.role || u.name !== s.user.name) s.user = { id: u.id, name: u.name, username: u.username, role: u.role };
  } catch (e) { return next(e); }
  if (now - s.seen > 30 * 1000) s.seen = now; // re-issue the cookie → rolling expiry
  next();
};

function requireLogin(req, res, next) {
  if (!req.session || !req.session.user) return res.status(401).json({ error: 'Not logged in' });
  next();
}

// requireRole('manager') allows manager and admin.
const requireRole = min => (req, res, next) => {
  const u = req.session && req.session.user;
  if (!u) return res.status(401).json({ error: 'Not logged in' });
  if (RANK[u.role] < RANK[min]) return res.status(403).json({ error: 'Not permitted for your role' });
  next();
};

const hasRole = (user, min) => RANK[user.role] >= RANK[min];

// Wrap async route handlers so rejections reach the error middleware.
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { requireLogin, requireRole, hasRole, wrap, HttpError, sessionGuard, forgetUser };
