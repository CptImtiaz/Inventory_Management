// Vercel serverless entry point: every /api/* request is routed here (see vercel.json).
// Static files in public/ are served directly by Vercel's CDN.
const { app, ready } = require('../src/app');

module.exports = async (req, res) => {
  try {
    await ready();
  } catch (e) {
    console.error('Database not reachable:', e.message);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Database not reachable. Check DB_* environment variables.' }));
  }
  return app(req, res);
};
