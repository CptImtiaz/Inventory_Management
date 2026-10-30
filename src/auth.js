// Role hierarchy: admin > manager > salesperson
const RANK = { salesperson: 1, manager: 2, admin: 3 };

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function requireLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  next();
}

// requireRole('manager') allows manager and admin.
const requireRole = min => (req, res, next) => {
  const u = req.session.user;
  if (!u) return res.status(401).json({ error: 'Not logged in' });
  if (RANK[u.role] < RANK[min]) return res.status(403).json({ error: 'Not permitted for your role' });
  next();
};

const hasRole = (user, min) => RANK[user.role] >= RANK[min];

// Wrap async route handlers so rejections reach the error middleware.
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { requireLogin, requireRole, hasRole, wrap, HttpError };
