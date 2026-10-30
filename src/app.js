// Express app, shared by the standalone server (src/server.js) and the Vercel function (api/index.js).
require('dotenv').config();
// Business day boundaries follow Bangladesh time. APP_TZ (not TZ) because hosts like Vercel reserve TZ.
process.env.TZ = process.env.APP_TZ || 'Asia/Dhaka';
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieSession = require('cookie-session');
const { pool, migrate } = require('./db');
const { runArchive } = require('./archiver');
const { sessionGuard } = require('./auth');

const IDLE_MS = 30 * 60 * 1000; // auto logout after 30 minutes of inactivity
const onVercel = !!process.env.VERCEL;
const useTls = !!(process.env.TLS_CERT && process.env.TLS_KEY);
const behindProxy = onVercel || process.env.TRUST_PROXY === 'true';

const app = express();
if (behindProxy) app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: { directives: { 'img-src': ["'self'", 'data:'], 'upgrade-insecure-requests': useTls || behindProxy ? [] : null } },
  hsts: useTls || behindProxy,
}));
app.use(express.json({ limit: '2mb' }));

// Redirect plain HTTP to HTTPS when running behind a TLS-terminating proxy.
if (behindProxy && process.env.FORCE_HTTPS !== 'false') {
  app.use((req, res, next) => (req.secure ? next() : res.redirect(301, `https://${req.headers.host}${req.originalUrl}`)));
}

// Scheduled archival (Vercel Cron calls this; the standalone server also runs it on a timer).
app.get('/api/cron/archive', async (req, res, next) => {
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: 'Unauthorized' });
  try { res.json({ archived: await runArchive() }); } catch (e) { next(e); }
});

// Signed, HTTP-only cookie session: no database round trip per request.
// Idle timeout and "is this user still active?" are enforced by sessionGuard.
app.use(cookieSession({
  name: 'ims.sid',
  keys: [process.env.SESSION_SECRET || 'change-me-in-.env'],
  httpOnly: true,
  sameSite: 'lax',
  secure: useTls || behindProxy,
  maxAge: IDLE_MS,
}));
app.use('/api', sessionGuard(IDLE_MS));

app.use('/api', require('./routes/auth'));
app.use('/api', require('./routes/catalog'));
app.use('/api', require('./routes/products'));
app.use('/api', require('./routes/sales'));
app.use('/api', require('./routes/customers'));
app.use('/api', require('./routes/reports'));
app.use('/api', require('./routes/settings'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  if (res.headersSent) return; // e.g. a session save failing after the response went out
  res.status(status).json({ error: status >= 500 ? 'Server error' : err.message });
});

app.use(express.static(path.join(__dirname, '..', 'public'), { index: 'index.html' }));

// Create/upgrade tables once per process (cold start on Vercel).
let readyPromise;
const ready = () => (readyPromise ||= migrate().catch(e => { readyPromise = null; throw e; }));

module.exports = { app, ready, useTls };
