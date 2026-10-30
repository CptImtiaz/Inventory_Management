// Load demo data from the command line (same data as Settings → "Load demo data").
// Usage: npm run seed   (only works while the shop has no sales)
require('dotenv').config();
process.env.TZ = process.env.APP_TZ || 'Asia/Dhaka';
const { pool, migrate } = require('../src/db');
const { loadDemoData } = require('../src/demo');

(async () => {
  await migrate();
  const [[admin]] = await pool.query("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1");
  const r = await loadDemoData(admin.id);
  console.log(`Loaded ${r.products} products, ${r.customers} customers, ${r.sales} sales, ${r.payments} due payments.`);
  for (const u of r.users) console.log(`Demo login: ${u.username} / ${u.password} (${u.role})`);
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
