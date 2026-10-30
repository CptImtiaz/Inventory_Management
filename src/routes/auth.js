const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { pool, audit } = require('../db');
const { wrap } = require('../auth');

// Simple in-memory brute-force guard: 10 failed attempts per username+IP → 15 min lockout.
const failures = new Map();

router.post('/login', wrap(async (req, res) => {
  const { username = '', password = '' } = req.body || {};
  const key = `${username.toLowerCase()}|${req.ip}`;
  const f = failures.get(key);
  if (f && f.count >= 10 && Date.now() - f.at < 15 * 60 * 1000) {
    return res.status(429).json({ error: 'Too many failed attempts. Try again in 15 minutes.' });
  }
  const [[user]] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
  const ok = user && user.active && await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    failures.set(key, { count: (f && Date.now() - f.at < 15 * 60 * 1000 ? f.count : 0) + 1, at: Date.now() });
    await audit(null, null, 'login_failed', { username, ip: req.ip });
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  failures.delete(key);
  req.session.regenerate(async err => {
    if (err) return res.status(500).json({ error: 'Session error' });
    req.session.user = { id: user.id, name: user.name, username: user.username, role: user.role };
    await audit(null, user.id, 'login', { ip: req.ip }).catch(() => {});
    res.json({ user: req.session.user });
  });
}));

router.post('/logout', (req, res) => {
  const u = req.session.user;
  req.session.destroy(() => {
    if (u) audit(null, u.id, 'logout', '').catch(() => {});
    res.clearCookie('ims.sid');
    res.json({ ok: true });
  });
});

router.get('/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  res.json({ user: req.session.user });
});

module.exports = router;
