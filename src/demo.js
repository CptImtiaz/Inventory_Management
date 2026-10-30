// Demo data: brands, ~45 products in every category, customers and ~2 months of sales
// (cash and credit, discounts, due payments, restocks). Only allowed while the shop has
// no sales yet, so it can never mix with real trading data. Uses bulk inserts so it
// finishes within a few round trips, even against a remote cloud database.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool, tx, audit } = require('./db');
const { HttpError } = require('./auth');

const PRODUCTS = [
  // brand, category, name, model code, purchase, sale, threshold
  ['Walton', 'Refrigerator', 'Walton WFC-3F5-GDEL 380L Frost', 'WFC-3F5-GDEL', 52000, 58990, 3],
  ['Walton', 'Refrigerator', 'Walton WNI-5F3-GDEL-DD 341L Non-Frost', 'WNI-5F3', 61500, 68900, 2],
  ['Samsung', 'Refrigerator', 'Samsung RT39 394L Digital Inverter', 'RT39CG6424S8', 68000, 76500, 2],
  ['LG', 'Refrigerator', 'LG GL-B282SLQL 260L Smart Inverter', 'GL-B282SLQL', 47000, 53500, 2],
  ['Walton', 'Television', 'Walton 32" HD Smart Android TV', 'W32D210EG1', 17500, 20990, 4],
  ['Walton', 'Television', 'Walton 43" 4K Google TV', 'W43D210GT', 36000, 41990, 3],
  ['Sony', 'Television', 'Sony Bravia 55" X75L 4K', 'KD-55X75L', 82000, 92900, 2],
  ['Samsung', 'Television', 'Samsung 50" Crystal UHD CU8000', 'UA50CU8000', 58000, 65500, 2],
  ['Xiaomi', 'Television', 'Xiaomi TV A Pro 43" 4K', 'L43MA-AUIN', 34000, 38999, 3],
  ['Gree', 'AC', 'Gree 1.5 Ton Inverter Split AC', 'GS-18XFV32', 61000, 69500, 2],
  ['Walton', 'AC', 'Walton 1 Ton Inverter Split AC', 'WSI-RIVERINE-12C', 44000, 49900, 2],
  ['Midea', 'AC', 'Midea 2 Ton Inverter Split AC', 'MSI24CRN1', 82000, 91500, 1],
  ['Miyako', 'Blender', 'Miyako 3-in-1 Blender 750W', 'MBL-750', 2600, 3250, 6],
  ['Philips', 'Blender', 'Philips HR2223 Blender 700W', 'HR2223/00', 5200, 6150, 4],
  ['Panasonic', 'Blender', 'Panasonic MX-AC400 Mixer Grinder', 'MX-AC400', 6800, 7900, 3],
  ['Miyako', 'Rice Cooker', 'Miyako Rice Cooker 2.8L', 'ASL-402', 2300, 2850, 6],
  ['Walton', 'Rice Cooker', 'Walton Rice Cooker 1.8L Double Pot', 'WRC-SGAD18', 2900, 3490, 5],
  ['Panasonic', 'Rice Cooker', 'Panasonic SR-WA22 2.2L Rice Cooker', 'SR-WA22', 4500, 5350, 3],
  ['Walton', 'Electric Cooker', 'Walton Infrared Cooker 2000W', 'WIR-KS22', 3400, 4190, 4],
  ['Miyako', 'Electric Cooker', 'Miyako Induction Cooker 2000W', 'MIC-20A', 3700, 4490, 4],
  ['Vision', 'Electric Cooker', 'Vision Curry Cooker 3L', 'VIS-CC-3L', 2100, 2650, 4],
  ['Kiam', 'Pressure Cooker', 'Kiam Pressure Cooker 5L', 'KPC-5L', 1900, 2450, 5],
  ['Kiam', 'Pressure Cooker', 'Kiam Pressure Cooker 3.5L', 'KPC-3.5L', 1550, 1990, 5],
  ['Prestige', 'Pressure Cooker', 'Prestige Popular Plus 5L', 'PPP-5L', 2900, 3550, 3],
  ['Walton', 'Kettle', 'Walton Electric Kettle 1.8L', 'WK-LJ18', 1000, 1250, 8],
  ['Miyako', 'Kettle', 'Miyako Electric Kettle 1.5L', 'MK-15', 850, 1090, 8],
  ['Philips', 'Kettle', 'Philips HD9306 Kettle 1.5L', 'HD9306/02', 2400, 2950, 4],
  ['Vision', 'Mosquito Trap', 'Vision Mosquito Killer Lamp', 'VIS-MKL-01', 850, 1150, 5],
  ['Walton', 'Mosquito Trap', 'Walton Mosquito Bat Rechargeable', 'WMB-R01', 450, 650, 10],
  ['Xiaomi', 'Mosquito Trap', 'Xiaomi Mi Mosquito Repellent Lamp', 'MLT-01', 1300, 1690, 4],
  ['Samsung', 'Mobile Phone', 'Samsung Galaxy A35 8/128', 'SM-A356E', 36000, 40999, 3],
  ['Samsung', 'Mobile Phone', 'Samsung Galaxy A15 6/128', 'SM-A155F', 18500, 21499, 4],
  ['Xiaomi', 'Mobile Phone', 'Redmi Note 13 8/256', '2312DRA50G', 23500, 26999, 4],
  ['Xiaomi', 'Mobile Phone', 'Redmi 13C 4/128', '23100RN82L', 12800, 14999, 5],
  ['Walton', 'Mobile Phone', 'Walton Orbit Y21 4/64', 'ORBIT-Y21', 8200, 9999, 4],
  ['Realme', 'Mobile Phone', 'Realme C67 8/128', 'RMX3890', 19000, 21999, 4],
  ['HP', 'Computer', 'HP 15s Core i5 12th Gen 8/512', '15S-FQ5111TU', 61000, 68500, 2],
  ['Lenovo', 'Computer', 'Lenovo IdeaPad Slim 3 Ryzen 5', '82XM00CVIN', 56000, 62900, 2],
  ['Walton', 'Computer', 'Walton Tamarind EX510 Core i5', 'WTEX510N5', 48000, 54500, 2],
  ['ASUS', 'Computer', 'ASUS Vivobook 15 Core i3 8/512', 'X1504VA', 45500, 51500, 2],
];

const FIRST = ['Rahim', 'Karim', 'Abdul', 'Nusrat', 'Farhana', 'Sabbir', 'Tanvir', 'Mahmudul', 'Shirin', 'Jahid', 'Rokeya', 'Imran',
  'Sumaiya', 'Arif', 'Mitu', 'Habib', 'Sadia', 'Rakib', 'Moushumi', 'Shafiq', 'Taslima', 'Nazmul', 'Liton', 'Ayesha', 'Belal'];
const LAST = ['Uddin', 'Hossain', 'Rahman', 'Akter', 'Islam', 'Chowdhury', 'Ahmed', 'Hasan', 'Begum', 'Sarker', 'Miah', 'Khan'];
const AREAS = ['Mirpur 10, Dhaka', 'Uttara Sector 7, Dhaka', 'Dhanmondi 27, Dhaka', 'Mohammadpur, Dhaka', 'Banasree, Dhaka',
  'Bashundhara R/A, Dhaka', 'Gulshan 1, Dhaka', 'Badda, Dhaka', 'Jatrabari, Dhaka', 'Savar, Dhaka', 'Tongi, Gazipur', 'Narayanganj Sadar'];

// Deterministic pseudo-random numbers so the demo looks the same every time.
function rng(seed) {
  let x = seed;
  return () => ((x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296);
}
const pad2 = n => String(n).padStart(2, '0');
const sqlDate = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
const r2 = n => Math.round(n * 100) / 100;

async function loadDemoData(adminId, { days = 58 } = {}) {
  const [[{ n: salesCount }]] = await pool.query('SELECT COUNT(*) n FROM sales');
  if (salesCount) throw new HttpError(409, 'Demo data can only be loaded while the shop has no sales.');
  const rand = rng(20261030);
  const pick = a => a[Math.floor(rand() * a.length)];
  const int = (a, b) => a + Math.floor(rand() * (b - a + 1));

  const passwords = { manager: 'Mgr-' + crypto.randomBytes(4).toString('hex'), sales: 'Sale-' + crypto.randomBytes(4).toString('hex') };
  const hashes = { manager: await bcrypt.hash(passwords.manager, 10), sales: await bcrypt.hash(passwords.sales, 10) };

  return tx(async conn => {
    // ---- lookups ----
    for (const b of [...new Set(PRODUCTS.map(p => p[0]))]) await conn.query('INSERT IGNORE INTO brands (name) VALUES (?)', [b]);
    const [brands] = await conn.query('SELECT id, name FROM brands');
    const [cats] = await conn.query('SELECT id, name FROM categories');
    const brandId = Object.fromEntries(brands.map(b => [b.name, b.id]));
    const catId = Object.fromEntries(cats.map(c => [c.name, c.id]));

    // ---- users ----
    const created = [];
    for (const [username, name, role] of [['manager', 'Shop Manager', 'manager'], ['sales', 'Salesperson', 'salesperson']]) {
      const [r] = await conn.query('INSERT IGNORE INTO users (username, name, role, password_hash) VALUES (?,?,?,?)', [username, name, role, hashes[username]]);
      if (r.affectedRows) created.push({ username, password: passwords[username], role });
    }
    const [users] = await conn.query('SELECT id, role FROM users WHERE active = 1');
    const sellers = users.filter(u => u.role !== 'admin').map(u => u.id).concat(adminId);

    // ---- products ----
    const [[{ maxP }]] = await conn.query('SELECT COALESCE(MAX(id), 0) maxP FROM products');
    const [[ctr]] = await conn.query("SELECT value FROM counters WHERE name = 'product'");
    let codeNo = ctr ? ctr.value : 0;
    const start = new Date(); start.setDate(start.getDate() - days); start.setHours(9, 0, 0, 0);
    const products = PRODUCTS.filter(p => catId[p[1]]).map((p, i) => {
      const cheap = p[5] < 5000;
      return {
        id: maxP + i + 1, code: 'P' + String(++codeNo).padStart(5, '0'), model_code: p[3], name: p[2],
        brand_id: brandId[p[0]], category_id: catId[p[1]], purchase_price: p[4], sale_price: p[5],
        margin: r2((p[5] - p[4]) / p[4] * 100), threshold: p[6],
        opening: cheap ? int(18, 40) : int(5, 12), stock: 0, restockAt: null,
      };
    });
    products.forEach(p => { p.stock = p.opening; });

    // ---- customers ----
    const [[{ maxC }]] = await conn.query('SELECT COALESCE(MAX(id), 0) maxC FROM customers');
    const customers = Array.from({ length: 28 }, (_, i) => ({
      id: maxC + i + 1, name: `${FIRST[i % FIRST.length]} ${pick(LAST)}`, address: `House ${int(2, 120)}, Road ${int(1, 30)}, ${pick(AREAS)}`,
      phone: '01' + pick(['3', '5', '6', '7', '8', '9']) + String(11000000 + i * 314159 + int(0, 999)), credit: 0,
    }));

    // ---- sales, day by day ----
    const movements = products.map(p => [p.id, p.opening, 'initial', 'Opening stock', null, adminId, sqlDate(start)]);
    const sales = [], items = [], payments = [];
    const [[{ maxS }]] = await conn.query('SELECT COALESCE(MAX(id), 0) maxS FROM sales');
    const year = new Date().getFullYear();
    const [[ictr]] = await conn.query('SELECT value FROM counters WHERE name = ?', ['invoice_' + year]);
    let invNo = ictr ? ictr.value : 0, saleId = maxS;
    const openCredit = [];

    for (let d = 0; d <= days; d++) {
      const day = new Date(start); day.setDate(start.getDate() + d);
      const isFriday = day.getDay() === 5;
      const count = isFriday ? int(5, 9) : int(2, 6);
      for (let k = 0; k < count; k++) {
        const when = new Date(day); when.setHours(int(10, 20), int(0, 59), int(0, 59));
        if (when > new Date()) continue;
        const lineCount = rand() < 0.7 ? 1 : int(2, 3);
        const chosen = new Set();
        const lines = [];
        for (let l = 0; l < lineCount; l++) {
          const p = rand() < 0.65 ? pick(products.filter(x => x.sale_price < 5000)) : pick(products);
          if (chosen.has(p.id)) continue;
          // Restock before running out (purchase from supplier).
          if (p.stock <= p.threshold) {
            const add = p.sale_price < 5000 ? int(15, 30) : int(4, 8);
            p.stock += add;
            movements.push([p.id, add, 'restock', pick(['Supplier delivery', 'New purchase from distributor', 'Restock from warehouse']), null, adminId, sqlDate(new Date(when.getTime() - 3600e3))]);
          }
          const qty = p.sale_price < 3000 && rand() < 0.3 ? 2 : 1;
          chosen.add(p.id);
          p.stock -= qty;
          const gross = p.sale_price * qty;
          const discount = p.sale_price > 20000 && rand() < 0.35 ? r2(Math.round(gross * pick([0.02, 0.03, 0.05]) / 50) * 50) : (rand() < 0.1 ? 50 : 0);
          lines.push({ p, qty, discount, line_total: r2(gross - discount) });
        }
        if (!lines.length) continue;
        const subtotal = r2(lines.reduce((s, l) => s + l.p.sale_price * l.qty, 0));
        const discount_total = r2(lines.reduce((s, l) => s + l.discount, 0));
        const total = r2(subtotal - discount_total);
        const cost_total = r2(lines.reduce((s, l) => s + l.p.purchase_price * l.qty, 0));
        const cust = pick(customers);
        const credit = total > 15000 && rand() < 0.3;
        const cash_paid = credit ? r2(Math.round(total * pick([0.3, 0.5, 0.6]) / 100) * 100) : total;
        const credit_amount = r2(total - cash_paid);
        cust.credit = r2(cust.credit + credit_amount);
        saleId++;
        sales.push([saleId, `INV-${year}-${String(++invNo).padStart(6, '0')}`, sqlDate(when), cust.id, subtotal, discount_total, total,
          cost_total, cash_paid, credit_amount, credit ? 'credit' : 'cash', pick(sellers)]);
        for (const l of lines) {
          items.push([saleId, l.p.id, l.p.name, l.p.category_id, l.qty, l.p.sale_price, l.p.purchase_price, l.discount, l.line_total]);
          movements.push([l.p.id, -l.qty, 'sale', null, saleId, sales[sales.length - 1][11], sqlDate(when)]);
        }
        if (credit_amount) openCredit.push({ saleId, cust, due: credit_amount, when });
      }
    }

    // Some customers pay part or all of their dues 1–3 weeks later.
    for (const oc of openCredit) {
      const payDay = new Date(oc.when); payDay.setDate(payDay.getDate() + int(7, 21)); payDay.setHours(int(11, 19), int(0, 59));
      if (payDay > new Date() || rand() < 0.3) continue;
      const amt = rand() < 0.6 ? oc.due : r2(Math.round(oc.due / 2 / 100) * 100);
      if (!(amt > 0)) continue;
      oc.cust.credit = r2(oc.cust.credit - amt);
      payments.push([oc.cust.id, oc.saleId, amt, adminId, sqlDate(payDay)]);
    }
    // A couple of manual corrections with reasons.
    const dmg = pick(products.filter(p => p.stock > 3));
    dmg.stock -= 1;
    movements.push([dmg.id, -1, 'adjustment', 'Damaged in transport — returned to supplier', null, adminId, sqlDate(new Date(Date.now() - 5 * 864e5))]);

    // ---- write everything ----
    await conn.query(`INSERT INTO products (id, code, model_code, name, brand_id, category_id, purchase_price, sale_price, margin, stock_qty, threshold, created_at) VALUES ?`,
      [products.map(p => [p.id, p.code, p.model_code, p.name, p.brand_id, p.category_id, p.purchase_price, p.sale_price, p.margin, p.stock, p.threshold, sqlDate(start)])]);
    await conn.query('INSERT INTO customers (id, name, address, phone, credit_balance, created_at) VALUES ?',
      [customers.map(c => [c.id, c.name, c.address, c.phone, c.credit, sqlDate(start)])]);
    if (sales.length) {
      await conn.query(`INSERT INTO sales (id, invoice_no, created_at, customer_id, subtotal, discount_total, total, cost_total, cash_paid, credit_amount, payment_type, salesperson_id) VALUES ?`, [sales]);
      await conn.query('INSERT INTO sale_items (sale_id, product_id, product_name, category_id, qty, unit_price, unit_cost, discount, line_total) VALUES ?', [items]);
    }
    await conn.query('INSERT INTO stock_movements (product_id, change_qty, type, reason, ref_sale_id, user_id, created_at) VALUES ?', [movements]);
    if (payments.length) await conn.query('INSERT INTO credit_payments (customer_id, sale_id, amount, user_id, created_at) VALUES ?', [payments]);
    await conn.query("INSERT INTO counters (name, value) VALUES ('product', ?) ON DUPLICATE KEY UPDATE value = GREATEST(value, VALUES(value))", [codeNo]);
    await conn.query('INSERT INTO counters (name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = GREATEST(value, VALUES(value))', ['invoice_' + year, invNo]);
    // Fill the shop profile only if it still has the out-of-the-box values.
    await conn.query("UPDATE settings SET v = 'Rahman Electronics' WHERE k = 'shop_name' AND v = 'My Electronics Shop'");
    await conn.query("UPDATE settings SET v = 'Shop 12, Bashundhara City (Level 5), Panthapath, Dhaka 1215' WHERE k = 'shop_address' AND v = 'Dhaka, Bangladesh'");
    await conn.query("UPDATE settings SET v = '+880 1711-000000' WHERE k = 'shop_phone' AND v = ''");
    await audit(conn, adminId, 'demo_data_loaded', { products: products.length, customers: customers.length, sales: sales.length, payments: payments.length });
    return { products: products.length, customers: customers.length, sales: sales.length, payments: payments.length, users: created };
  });
}

module.exports = { loadDemoData };
