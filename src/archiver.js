// Data retention: sales older than the configured period are marked archived.
// Archived sales are hidden from the day-to-day sales list but are never deleted,
// so they still count in monthly reports and the audit trail.
const { pool, getSettings } = require('./db');

async function runArchive() {
  const days = Math.max(1, parseInt((await getSettings()).retention_days, 10) || 60);
  const [r] = await pool.query('UPDATE sales SET archived = 1 WHERE archived = 0 AND created_at < NOW() - INTERVAL ? DAY', [days]);
  if (r.affectedRows) console.log(`Archived ${r.affectedRows} sales older than ${days} days`);
  return r.affectedRows;
}

function startArchiver() {
  const tick = () => runArchive().catch(e => console.error('Archiver:', e.message));
  tick();
  setInterval(tick, 6 * 60 * 60 * 1000);
}

module.exports = { runArchive, startArchiver };
