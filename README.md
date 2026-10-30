# Shop Manager — Inventory & Sales Management System

A web-based retail system for an electronics shop. It replaces handwritten bills and stock ledgers.
It covers inventory, point of sale, invoices, credit/dues, daily and monthly reports, and an audit trail.
All amounts are in BDT, and the UI is available in **English and Bangla**.

**Stack:** Node.js 18+ (Express) · MySQL 8 / MariaDB 10.6+ · plain HTML/CSS/JS front end with no build step.
It is an installable PWA that keeps working offline.

---

## Quick start

```bash
cp .env.example .env        # fill in your MySQL details and a SESSION_SECRET
npm install
npm start                   # creates tables, default categories and the admin user on first run
npm run seed                # optional: demo data (or Settings → Load demo data)
```

Open http://localhost:3000 and log in as **admin / admin123** (or whatever `ADMIN_PASSWORD` is set to).
Change this password straight away under **Settings → Change my password**.

Demo data (40 products, 28 customers, ~2 months of sales) can be loaded from **Settings → Load demo data** or `npm run seed`, only while the shop has no sales. It also creates `manager` and `sales` logins with random passwords, which are shown once.

With Docker (bundles a MySQL container): `docker compose up --build`.

### Deploying to Vercel
The repo is set up for Vercel (`vercel.json` + `api/index.js`). `public/` is served from the CDN, and every `/api/*` request runs as one serverless function.
1. **You need a cloud MySQL database.** Vercel doesn't host MySQL. Railway, Aiven, TiDB Cloud and DigitalOcean all work.
2. Import the GitHub repo in Vercel. Framework preset: *Other*. No build command is needed.
3. Add the environment variables: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSL` (usually `true`), `DB_SSL_CA` (if your provider gives you a CA certificate, e.g. Aiven), `SESSION_SECRET`, `ADMIN_PASSWORD` and `CRON_SECRET`.
   HTTPS and the proxy settings are detected automatically.
4. Deploy. Tables and the admin user are created on the first request.
   To load demo data, run `npm run seed` once from your computer with the same `DB_*` values in `.env`.
5. Retention archiving runs daily through Vercel Cron, calling `/api/cron/archive`.

### Production checklist
- Use a cloud MySQL (set `DB_*`, and `DB_SSL=true` if the provider requires it).
- Set a long random `SESSION_SECRET`.
- **HTTPS is required.** Use one of these:
  - Run behind a TLS proxy or platform (Caddy, Nginx, Railway, Render…) and set `TRUST_PROXY=true`.
    HTTP is then redirected to HTTPS, cookies become `Secure`, and HSTS is switched on.
  - Set `TLS_CERT` and `TLS_KEY` so Node serves HTTPS itself.
- Offline mode and offline login need HTTPS, because browsers only allow service workers and WebCrypto on secure origins (localhost is the exception).

---

## Requirements coverage

See **[REQUIREMENTS-CHECK.md](REQUIREMENTS-CHECK.md)** for the item-by-item checklist.

| Requirement | Where / how |
|---|---|
| **Login, roles** (Admin / Manager / Salesperson) | `src/routes/auth.js`, `src/auth.js`. Every API route enforces roles on the server; the menu only shows what the role may use. |
| **Auto-logout after 30 min idle** | The server session has a rolling 30-minute expiry, and the browser has its own idle timer. |
| **Product fields + auto Product ID** (`P00001`…) | `src/routes/products.js`. IDs come from an atomic counter. |
| **Brands & categories**, 11 default categories, add/edit/delete | *Brands & Categories* page (Admin). There is no limit on categories per brand. A category in use is deactivated rather than deleted, so old sales stay intact. |
| **Stock auto-update on sale** | Runs in the same DB transaction as the sale (row-locked, so two tills can't oversell). |
| **Manual stock adjustment with required reason** | *Inventory → ± Stock*: restock or correction. Every movement is kept, see *History*. |
| **Searchable/filterable inventory list** | Search by name, ID or brand. Filter by category, brand or low stock. Excel / CSV / print. |
| **Low-stock threshold per product** | Shown on the dashboard and highlighted in inventory. |
| **POS flow** (search → qty → discount → cart → customer → payment → invoice) | *New Sale* page. Search by name, product ID or code; press Enter to pick the first match. |
| **Discounts: Manager/Admin only**, textbox | A per-line textbox that takes `500` (taka) or `10%`. The server rejects discounts from salespeople. Original price, discount and final price are all stored. |
| **Global default margin** | *Settings*. It pre-fills the sale price when a new product is added, and the actual margin is stored per product. |
| **Customer details required** | Name, address and phone. Returning customers are matched by phone and auto-filled, and their existing due is shown. |
| **Printable invoice** with every listed field | Invoice page and print stylesheet. Invoice numbers look like `INV-2026-000123`. |
| **Daily closing report** | Transactions, gross sales, cash collected (sales plus dues collected), credit extended, profit, category breakdown and a transaction list. |
| **Monthly report** | P&L, stock consumed vs restocked per product, category breakdown, credit overview (given, paid, still outstanding) and a day-by-day breakdown. |
| **Print / PDF, Excel / CSV export** | Buttons on Reports and Inventory. Print uses a clean print layout, and "Save as PDF" in the print dialog gives a PDF. |
| **Settings** (Admin) | Business profile with logo (shown on invoices), default margin, retention period, users (add / edit / deactivate / reset password / role), categories. |
| **Data retention (60 days default)** | Sales older than the set period are *archived*: hidden from Sales History but never deleted, so reports and the audit trail stay complete. Runs every 6 hours. |
| **English + Bangla** | A toggle in the top bar switches all labels and Bangla digits. Product names are shown as entered. |
| **Offline POS + sync** | Explained below. |
| **bcrypt passwords** | bcrypt with cost 12. Repeated failed logins are locked out for 15 minutes. |
| **Audit log** | Every sale, payment, stock change, product/settings/user change and login is logged with user and timestamp. Viewable in Settings. |
| **Salesperson cannot view financial reports** | Blocked on the server (403). Salespeople also never receive purchase prices. |
| **10-inch tablet support** | The layout is responsive; on smaller screens the sidebar collapses into a menu. |

### Offline mode
- A service worker caches the app. The POS keeps a local copy of the product list and shop settings.
- With no internet, the sale is queued on the device and a **provisional invoice** (`OFFLINE-xxxxxxxx`) can be printed.
  Local stock counts are reduced so the next search stays accurate.
- When the connection returns, the queue syncs automatically, or tap the status pill. Each sale gets its real invoice number.
  Syncing uses an idempotency key, so a retried sync can never double-book a sale.
- Offline sales keep the price that was printed. They are accepted even if stock would go negative, because the goods have already left the shop. Any price or stock mismatch is flagged in the audit log.
- **Offline login:** after one successful online login, that user can unlock the POS on the same device while offline. A PBKDF2 hash is stored only in that browser.

---

## Decisions on unclear points in the spec
The spec had a few conflicts. I made these choices; each is easy to change.

1. **Manager role.** The roles table lists only Admin and Salesperson, but Modules 1 and 3 mention a Manager. I added Manager: inventory, discounts, customers/dues and reports, but **not** Settings.
2. **Credit payments.** Section 3.3 lists only Cash, yet the invoice (*Outstanding Balance*), the reports (*credit extended*, *credit overview*) and the data model (*Credit Payment*) all need credit.
   So there are two payment types: **Cash** (paid in full) and **Credit** (partial or nothing paid now, the rest becomes the customer's due).
   Dues are collected under *Customers & Dues* and applied oldest invoice first.
3. **"Each brand supports 20–30 categories."** Brands and categories are separate lists, and each product has one of each. Any brand can be used with any category, with no cap.
4. **Data retention** means archiving, not deleting, because financial records shouldn't silently disappear.
5. **Monthly "stock consumed"** = units sold + units written off. **"Restocked"** = opening stock + restocks + positive corrections.

## Project layout
```
src/app.js             app setup, security headers, sessions (shared)
src/server.js          standalone server (VPS / Docker / local), HTTPS
api/index.js           Vercel serverless entry point
src/db.js              MySQL pool, migrations, seeding defaults, audit helper
src/routes/*.js        auth, catalog (brands/categories), products, sales, customers, reports, settings
src/archiver.js        retention / archival job
db/schema.sql          database schema (auto-applied on start)
public/                front end (index.html, css/app.css, js/{i18n,api,app}.js, sw.js)
scripts/seed-demo.js   optional demo data
```
