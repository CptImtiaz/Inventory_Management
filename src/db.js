const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'shop',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'shopdb',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
  connectionLimit: process.env.VERCEL ? 3 : 10,
  decimalNumbers: true,
  dateStrings: true,
  timezone: 'local',
  charset: 'utf8mb4',
});

// Make MySQL's NOW()/CURDATE()/DEFAULT CURRENT_TIMESTAMP use the same clock as the app (Asia/Dhaka by default).
pool.on('connection', conn => {
  const m = -new Date().getTimezoneOffset();
  const off = `${m < 0 ? '-' : '+'}${String(Math.floor(Math.abs(m) / 60)).padStart(2, '0')}:${String(Math.abs(m) % 60).padStart(2, '0')}`;
  conn.query(`SET time_zone = '${off}'`);
});

const DEFAULT_CATEGORIES = ['Refrigerator', 'Television', 'AC', 'Blender', 'Rice Cooker', 'Electric Cooker',
  'Pressure Cooker', 'Kettle', 'Mosquito Trap', 'Mobile Phone', 'Computer'];

const DEFAULT_SETTINGS = {
  shop_name: 'My Electronics Shop',
  shop_address: 'Dhaka, Bangladesh',
  shop_phone: '',
  shop_logo: '',
  default_margin: '15',
  retention_days: '60',
};

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  const stmts = sql.split(/;\s*\n/).map(s => s.split('\n').filter(l => !l.trim().startsWith('--')).join('\n').trim()).filter(Boolean);
  for (const stmt of stmts) {
    await pool.query(stmt);
  }
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    await pool.query('INSERT IGNORE INTO settings (k, v) VALUES (?, ?)', [k, v]);
  }
  const [[{ n }]] = await pool.query('SELECT COUNT(*) n FROM categories');
  if (!n) for (const c of DEFAULT_CATEGORIES) await pool.query('INSERT INTO categories (name) VALUES (?)', [c]);
  const [[{ u }]] = await pool.query('SELECT COUNT(*) u FROM users');
  if (!u) {
    const pw = process.env.ADMIN_PASSWORD || 'admin123';
    await pool.query('INSERT INTO users (username, name, role, password_hash) VALUES (?,?,?,?)',
      ['admin', 'Owner', 'admin', await bcrypt.hash(pw, 12)]);
    console.log(`Created initial admin user: admin / ${pw}  (change it in Settings → Users)`);
  }
}

// Run fn inside a transaction; fn receives a connection.
async function tx(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const r = await fn(conn);
    await conn.commit();
    return r;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// Atomic sequence (used for product codes and invoice numbers).
async function nextCounter(conn, name) {
  await conn.query('INSERT INTO counters (name, value) VALUES (?, 1) ON DUPLICATE KEY UPDATE value = value + 1', [name]);
  const [[{ value }]] = await conn.query('SELECT value FROM counters WHERE name = ?', [name]);
  return value;
}

async function audit(conn, userId, action, details) {
  await (conn || pool).query('INSERT INTO audit_log (user_id, action, details) VALUES (?,?,?)',
    [userId || null, action, typeof details === 'string' ? details : JSON.stringify(details)]);
}

async function getSettings() {
  const [rows] = await pool.query('SELECT k, v FROM settings');
  return Object.fromEntries(rows.map(r => [r.k, r.v]));
}

module.exports = { pool, migrate, tx, nextCounter, audit, getSettings };
