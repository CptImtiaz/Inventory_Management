// Optional demo data: a few brands, products and users so the system can be tried out.
// Usage: npm run seed   (safe to run once on an empty database)
require('dotenv').config();
process.env.TZ = process.env.APP_TZ || 'Asia/Dhaka';
const bcrypt = require('bcryptjs');
const { pool, migrate } = require('../src/db');

const PRODUCTS = [
  ['Walton', 'Refrigerator', 'Walton WFC-3F5-GDEL 380L', 52000, 58990, 12, 3],
  ['Samsung', 'Refrigerator', 'Samsung RT39 394L Inverter', 68000, 76500, 6, 2],
  ['Walton', 'Television', 'Walton 43" 4K Android TV', 36000, 41990, 15, 4],
  ['Sony', 'Television', 'Sony Bravia 55" X75L', 82000, 92900, 5, 2],
  ['Gree', 'AC', 'Gree 1.5 Ton Inverter AC', 61000, 69500, 8, 3],
  ['Miyako', 'Blender', 'Miyako 3-in-1 Blender 750W', 2600, 3250, 30, 8],
  ['Miyako', 'Rice Cooker', 'Miyako Rice Cooker 2.8L', 2300, 2850, 25, 6],
  ['Walton', 'Electric Cooker', 'Walton Infrared Cooker', 3400, 4190, 18, 5],
  ['Kiam', 'Pressure Cooker', 'Kiam Pressure Cooker 5L', 1900, 2450, 22, 6],
  ['Walton', 'Kettle', 'Walton Electric Kettle 1.8L', 1000, 1250, 50, 10],
  ['Vision', 'Mosquito Trap', 'Vision Mosquito Killer Lamp', 850, 1150, 4, 5],
  ['Samsung', 'Mobile Phone', 'Samsung Galaxy A35 8/128', 36000, 40999, 10, 3],
  ['Xiaomi', 'Mobile Phone', 'Redmi Note 13 8/256', 23500, 26999, 14, 4],
  ['HP', 'Computer', 'HP 15s Core i5 12th Gen', 61000, 68500, 4, 2],
];

(async () => {
  await migrate();
  const [[{ n }]] = await pool.query('SELECT COUNT(*) n FROM products');
  if (n) { console.log('Products already exist — skipping demo seed.'); process.exit(0); }
  const [[admin]] = await pool.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  for (const b of [...new Set(PRODUCTS.map(p => p[0]))]) await pool.query('INSERT IGNORE INTO brands (name) VALUES (?)', [b]);
  let i = 0;
  for (const [brand, cat, name, buy, sell, stock, threshold] of PRODUCTS) {
    const [[b]] = await pool.query('SELECT id FROM brands WHERE name = ?', [brand]);
    const [[c]] = await pool.query('SELECT id FROM categories WHERE name = ?', [cat]);
    const code = 'P' + String(++i).padStart(5, '0');
    const [r] = await pool.query('INSERT INTO products SET ?', [{ code, name, brand_id: b.id, category_id: c.id, purchase_price: buy, sale_price: sell,
      margin: +(((sell - buy) / buy) * 100).toFixed(2), stock_qty: stock, threshold }]);
    await pool.query("INSERT INTO stock_movements (product_id, change_qty, type, reason, user_id) VALUES (?,?, 'initial', 'Opening stock', ?)", [r.insertId, stock, admin.id]);
  }
  await pool.query("INSERT INTO counters (name, value) VALUES ('product', ?) ON DUPLICATE KEY UPDATE value = GREATEST(value, ?)", [i, i]);
  for (const [username, name, role] of [['manager', 'Shop Manager', 'manager'], ['sales', 'Salesperson', 'salesperson']]) {
    await pool.query('INSERT IGNORE INTO users (username, name, role, password_hash) VALUES (?,?,?,?)', [username, name, role, await bcrypt.hash(username + '123', 12)]);
  }
  console.log(`Seeded ${i} products. Demo logins: manager / manager123, sales / sales123`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
