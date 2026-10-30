// Financial reports — Manager/Admin only (salespeople cannot see them).
// Each report is returned as JSON, or as Excel / CSV with ?format=xlsx|csv.
const router = require('express').Router();
const ExcelJS = require('exceljs');
const { pool, getSettings } = require('../db');
const { requireRole, wrap, HttpError } = require('../auth');

const r2 = n => Math.round((+n || 0) * 100) / 100;

async function dailyReport(date) {
  const from = `${date} 00:00:00`, to = `${date} 23:59:59`;
  const [[t]] = await pool.query(
    `SELECT COUNT(*) transactions, COALESCE(SUM(total),0) gross_sales, COALESCE(SUM(subtotal),0) before_discount,
            COALESCE(SUM(discount_total),0) discounts, COALESCE(SUM(cash_paid),0) cash_from_sales,
            COALESCE(SUM(credit_amount),0) credit_extended, COALESCE(SUM(total - cost_total),0) profit
     FROM sales WHERE created_at BETWEEN ? AND ?`, [from, to]);
  const [[{ due_collected }]] = await pool.query(
    'SELECT COALESCE(SUM(amount),0) due_collected FROM credit_payments WHERE created_at BETWEEN ? AND ?', [from, to]);
  const [categories] = await pool.query(
    `SELECT c.name category, SUM(i.qty) qty, SUM(i.line_total) sales, SUM(i.line_total - i.unit_cost * i.qty) profit
     FROM sale_items i JOIN sales s ON s.id = i.sale_id JOIN categories c ON c.id = i.category_id
     WHERE s.created_at BETWEEN ? AND ? GROUP BY c.id, c.name ORDER BY sales DESC`, [from, to]);
  const [transactions] = await pool.query(
    `SELECT s.invoice_no, TIME(s.created_at) time, c.name customer, s.total, s.cash_paid, s.credit_amount, u.name salesperson
     FROM sales s JOIN customers c ON c.id = s.customer_id JOIN users u ON u.id = s.salesperson_id
     WHERE s.created_at BETWEEN ? AND ? ORDER BY s.id`, [from, to]);
  return {
    date,
    summary: {
      transactions: t.transactions,
      gross_sales: r2(t.gross_sales),
      discounts: r2(t.discounts),
      cash_from_sales: r2(t.cash_from_sales),
      due_collected: r2(due_collected),
      cash_collected: r2(+t.cash_from_sales + +due_collected),
      credit_extended: r2(t.credit_extended),
      profit: r2(t.profit),
    },
    categories: categories.map(c => ({ ...c, qty: +c.qty, sales: r2(c.sales), profit: r2(c.profit) })),
    transactions,
  };
}

async function monthlyReport(month) {
  const from = `${month}-01 00:00:00`;
  const [[{ to }]] = await pool.query("SELECT CONCAT(LAST_DAY(?), ' 23:59:59') `to`", [`${month}-01`]);
  const [[t]] = await pool.query(
    `SELECT COUNT(*) transactions, COALESCE(SUM(total),0) revenue, COALESCE(SUM(cost_total),0) cost,
            COALESCE(SUM(discount_total),0) discounts, COALESCE(SUM(cash_paid),0) cash_from_sales,
            COALESCE(SUM(credit_amount),0) credit_extended
     FROM sales WHERE created_at BETWEEN ? AND ?`, [from, to]);
  const [[{ credit_paid }]] = await pool.query(
    'SELECT COALESCE(SUM(amount),0) credit_paid FROM credit_payments WHERE created_at BETWEEN ? AND ?', [from, to]);
  const [[{ outstanding }]] = await pool.query('SELECT COALESCE(SUM(credit_balance),0) outstanding FROM customers');
  const [categories] = await pool.query(
    `SELECT c.name category, SUM(i.qty) qty, SUM(i.line_total) sales, SUM(i.unit_cost * i.qty) cost,
            SUM(i.line_total - i.unit_cost * i.qty) profit
     FROM sale_items i JOIN sales s ON s.id = i.sale_id JOIN categories c ON c.id = i.category_id
     WHERE s.created_at BETWEEN ? AND ? GROUP BY c.id, c.name ORDER BY sales DESC`, [from, to]);
  // Stock consumed (sales + negative adjustments) vs restocked (restock, opening stock, positive adjustments).
  const [stock] = await pool.query(
    `SELECT p.code, p.name, c.name category,
            -SUM(CASE WHEN m.type = 'sale' THEN m.change_qty ELSE 0 END) sold,
            SUM(CASE WHEN m.change_qty > 0 THEN m.change_qty ELSE 0 END) restocked,
            -SUM(CASE WHEN m.type = 'adjustment' AND m.change_qty < 0 THEN m.change_qty ELSE 0 END) written_off,
            p.stock_qty current_stock
     FROM stock_movements m JOIN products p ON p.id = m.product_id JOIN categories c ON c.id = p.category_id
     WHERE m.created_at BETWEEN ? AND ? GROUP BY p.id, p.code, p.name, c.name, p.stock_qty ORDER BY c.name, p.name`, [from, to]);
  const [daily] = await pool.query(
    `SELECT DATE(created_at) day, COUNT(*) transactions, SUM(total) revenue, SUM(total - cost_total) profit
     FROM sales WHERE created_at BETWEEN ? AND ? GROUP BY DATE(created_at) ORDER BY day`, [from, to]);
  const revenue = r2(t.revenue), cost = r2(t.cost);
  return {
    month,
    pnl: { transactions: t.transactions, revenue, cost_of_goods: cost, gross_profit: r2(revenue - cost), discounts: r2(t.discounts) },
    stock: stock.map(s => ({ ...s, sold: +s.sold, restocked: +s.restocked, written_off: +s.written_off })),
    stock_totals: {
      consumed: stock.reduce((a, s) => a + +s.sold + +s.written_off, 0),
      restocked: stock.reduce((a, s) => a + +s.restocked, 0),
    },
    categories: categories.map(c => ({ ...c, qty: +c.qty, sales: r2(c.sales), cost: r2(c.cost), profit: r2(c.profit) })),
    credit: { extended: r2(t.credit_extended), paid: r2(credit_paid), outstanding_total: r2(outstanding) },
    daily: daily.map(d => ({ ...d, revenue: r2(d.revenue), profit: r2(d.profit) })),
  };
}

// Turn a report into a list of titled tables, shared by Excel and CSV export.
function sections(kind, r) {
  const kv = obj => Object.entries(obj).map(([k, v]) => ({ item: k.replace(/_/g, ' '), value: v }));
  return kind === 'daily'
    ? [['Summary', kv(r.summary)], ['Sales by category', r.categories], ['Transactions', r.transactions]]
    : [['Profit & Loss', kv(r.pnl)], ['Credit overview', kv(r.credit)], ['Sales by category', r.categories],
      ['Stock consumed vs restocked', [...r.stock, { code: 'TOTAL', name: '', category: '', sold: '', restocked: r.stock_totals.restocked, written_off: '', current_stock: '', consumed: r.stock_totals.consumed }]],
      ['Daily breakdown', r.daily]];
}

const csvCell = v => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function send(res, kind, label, report, format) {
  const shop = (await getSettings()).shop_name;
  const fname = `${kind}-report-${label}`;
  if (format === 'csv') {
    const out = [`${shop} — ${kind} report ${label}`, ''];
    for (const [title, rows] of sections(kind, report)) {
      out.push(title);
      if (rows.length) {
        const cols = [...new Set(rows.flatMap(Object.keys))];
        out.push(cols.join(','), ...rows.map(r => cols.map(c => csvCell(r[c])).join(',')));
      } else out.push('(none)');
      out.push('');
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}.csv"`);
    return res.send('﻿' + out.join('\r\n'));
  }
  if (format === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    wb.creator = shop;
    for (const [title, rows] of sections(kind, report)) {
      const ws = wb.addWorksheet(title.slice(0, 31));
      ws.addRow([`${shop} — ${title} (${label})`]).font = { bold: true, size: 13 };
      ws.addRow([]);
      const cols = [...new Set(rows.flatMap(Object.keys))];
      if (!cols.length) { ws.addRow(['(none)']); continue; }
      const head = ws.addRow(cols.map(c => c.replace(/_/g, ' ').toUpperCase()));
      head.font = { bold: true };
      head.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }; });
      rows.forEach(r => ws.addRow(cols.map(c => r[c])));
      ws.columns.forEach((col, i) => { col.width = Math.min(40, Math.max(12, ...rows.map(r => String(r[cols[i]] ?? '').length + 2))); });
    }
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}.xlsx"`);
    return wb.xlsx.write(res).then(() => res.end());
  }
  res.json(report);
}

router.get('/reports/daily', requireRole('manager'), wrap(async (req, res) => {
  const date = req.query.date || new Date().toLocaleDateString('en-CA');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, 'Date must be YYYY-MM-DD');
  await send(res, 'daily', date, await dailyReport(date), req.query.format);
}));

router.get('/reports/monthly', requireRole('manager'), wrap(async (req, res) => {
  const month = req.query.month || new Date().toLocaleDateString('en-CA').slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) throw new HttpError(400, 'Month must be YYYY-MM');
  await send(res, 'monthly', month, await monthlyReport(month), req.query.format);
}));

// Inventory export (for the inventory list's Excel/CSV buttons).
router.get('/reports/inventory', requireRole('manager'), wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT p.code id, p.name, b.name brand, c.name category, p.stock_qty, p.threshold low_stock_threshold,
            p.purchase_price, p.sale_price, p.margin margin_pct
     FROM products p JOIN categories c ON c.id = p.category_id LEFT JOIN brands b ON b.id = p.brand_id
     WHERE p.active = 1 ORDER BY c.name, p.name`);
  if (req.query.format === 'csv' || req.query.format === 'xlsx') {
    return sendSingle(res, 'inventory', new Date().toLocaleDateString('en-CA'), 'Inventory', rows, req.query.format);
  }
  res.json(rows);
}));

async function sendSingle(res, kind, label, title, rows, format) {
  const shop = (await getSettings()).shop_name;
  const cols = [...new Set(rows.flatMap(Object.keys))];
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${kind}-${label}.csv"`);
    return res.send('﻿' + [cols.join(','), ...rows.map(r => cols.map(c => csvCell(r[c])).join(','))].join('\r\n'));
  }
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(title);
  ws.addRow([`${shop} — ${title} (${label})`]).font = { bold: true, size: 13 };
  ws.addRow([]);
  ws.addRow(cols.map(c => c.replace(/_/g, ' ').toUpperCase())).font = { bold: true };
  rows.forEach(r => ws.addRow(cols.map(c => r[c])));
  ws.columns.forEach(col => { col.width = 18; });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${kind}-${label}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}

// Everything the dashboard needs in one request (queries run in parallel).
router.get('/reports/dashboard', requireRole('manager'), wrap(async (req, res) => {
  const today = new Date().toLocaleDateString('en-CA');
  const q = (sql, args) => pool.query(sql, args).then(r => r[0]);
  const [todayRows, yRows, series, mtdRows, top, cats, low, recent, dues] = await Promise.all([
    q(`SELECT COUNT(*) transactions, COALESCE(SUM(total),0) gross, COALESCE(SUM(total - cost_total),0) profit,
              COALESCE(SUM(cash_paid),0) cash, COALESCE(SUM(credit_amount),0) credit
       FROM sales WHERE created_at >= ? AND created_at < ? + INTERVAL 1 DAY`, [today, today]),
    q(`SELECT COALESCE(SUM(total),0) gross FROM sales WHERE created_at >= ? - INTERVAL 1 DAY AND created_at < ?`, [today, today]),
    q(`SELECT DATE(created_at) day, SUM(total) revenue, SUM(total - cost_total) profit, COUNT(*) n
       FROM sales WHERE created_at >= ? - INTERVAL 29 DAY GROUP BY DATE(created_at) ORDER BY day`, [today]),
    q(`SELECT COUNT(*) transactions, COALESCE(SUM(total),0) revenue, COALESCE(SUM(total - cost_total),0) profit
       FROM sales WHERE created_at >= DATE_FORMAT(?, '%Y-%m-01')`, [today]),
    q(`SELECT i.product_name name, SUM(i.qty) qty, SUM(i.line_total) revenue FROM sale_items i JOIN sales s ON s.id = i.sale_id
       WHERE s.created_at >= ? - INTERVAL 29 DAY GROUP BY i.product_id, i.product_name ORDER BY revenue DESC LIMIT 5`, [today]),
    q(`SELECT c.name category, SUM(i.line_total) revenue FROM sale_items i JOIN sales s ON s.id = i.sale_id
       JOIN categories c ON c.id = i.category_id WHERE s.created_at >= ? - INTERVAL 29 DAY GROUP BY c.id, c.name ORDER BY revenue DESC`, [today]),
    q(`SELECT p.id, p.code, p.name, c.name category, p.stock_qty, p.threshold FROM products p JOIN categories c ON c.id = p.category_id
       WHERE p.active = 1 AND p.stock_qty <= p.threshold ORDER BY p.stock_qty LIMIT 8`),
    q(`SELECT s.id, s.invoice_no, s.created_at, s.total, s.credit_amount, c.name customer FROM sales s
       JOIN customers c ON c.id = s.customer_id ORDER BY s.id DESC LIMIT 6`),
    q('SELECT COALESCE(SUM(credit_balance),0) total, COUNT(*) customers FROM customers WHERE credit_balance > 0'),
  ]);
  const t = todayRows[0];
  // Fill missing days so the chart has 30 evenly spaced bars.
  const byDay = Object.fromEntries(series.map(s => [s.day, s]));
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - 29 + i);
    const k = d.toLocaleDateString('en-CA');
    return { day: k, revenue: r2(byDay[k]?.revenue), profit: r2(byDay[k]?.profit), n: +(byDay[k]?.n || 0) };
  });
  res.json({
    today: { transactions: t.transactions, gross: r2(t.gross), profit: r2(t.profit), cash: r2(t.cash), credit: r2(t.credit), yesterday: r2(yRows[0].gross) },
    month: { transactions: mtdRows[0].transactions, revenue: r2(mtdRows[0].revenue), profit: r2(mtdRows[0].profit) },
    series: days,
    top: top.map(x => ({ ...x, qty: +x.qty, revenue: r2(x.revenue) })),
    categories: cats.map(x => ({ ...x, revenue: r2(x.revenue) })),
    low, recent,
    dues: { total: r2(dues[0].total), customers: dues[0].customers },
  });
}));

// Low-stock alert list for the dashboard.
router.get('/reports/low-stock', requireRole('manager'), wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT p.id, p.code, p.name, c.name category, p.stock_qty, p.threshold FROM products p
     JOIN categories c ON c.id = p.category_id WHERE p.active = 1 AND p.stock_qty <= p.threshold ORDER BY p.stock_qty`);
  res.json(rows);
}));

module.exports = router;
