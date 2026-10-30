# Requirements check

Each item from the *Inventory & Sales Management System* requirements document, and where it is in the app.
✅ = done · ➕ = done, with an addition or interpretation (explained below the table)

## 1–2. Overview & roles
| Requirement | Status | Where |
|---|---|---|
| Web-based retail system for an electronics shop, BDT currency | ✅ | Whole app; all amounts in ৳ with Bangladeshi digit grouping (1,00,000) |
| Admin (Owner): full access | ✅ | Every menu item; Settings is admin-only |
| Salesperson: sales entry and invoice generation only | ✅ | Sees only *New Sale* and today's own sales; the server returns 403 for everything else and never sends purchase prices |

## 3. Modules
| Requirement | Status | Where |
|---|---|---|
| **M1** Login with username & password | ✅ | Login screen |
| **M1** Roles Admin / Manager / Salesperson | ➕ | Note 1 |
| **M1** Auto-logout after 30 min inactivity | ✅ | Server-side idle check on every request, plus a browser timer |
| **2.1** Brand, Product Name, auto Product ID, Category dropdown, Purchase price, Sale price, Stock qty, Low-stock threshold | ✅ | *Inventory → Add product*; IDs `P00001`… |
| **2.2** Brands; 20–30 categories per brand | ➕ | *Brands & Categories*; no limit (Note 3) |
| **2.2** 11 default categories | ✅ | Created automatically on first start |
| **2.2** Admin can add / edit / delete categories | ✅ | Categories in use are deactivated instead of deleted, so old invoices stay intact |
| **2.3** Sale automatically subtracts stock | ✅ | Same database transaction as the sale, with row locking |
| **2.3** Manual stock adjustment (+/−) with a required reason | ✅ | *Inventory → ± Stock*; full history per product |
| **2.5** Searchable, filterable inventory: Name, ID, Category, Stock, Purchase, Sale | ✅ | *Inventory*; filters by category, brand, low stock; Excel/CSV/print |
| **3.1** Search product by name, ID or code | ✅ | *New Sale* search (also brand and model/barcode); product tiles by category |
| **3.1** Enter quantity → discount → Add to cart → repeat → customer → payment → confirm → invoice | ✅ | *New Sale*: tap or Enter adds to the cart; qty stepper; confirm opens the invoice |
| **3.2** Customer name, address, phone required | ✅ | Validated on screen and on the server; returning customers auto-filled by phone, existing due shown |
| **3.3** Payment type: Cash, full or partial | ✅ | Leave *Amount paid* empty for full payment, or enter less; the shortfall is saved as the customer's due (Note 2) |
| **3.4** Global default margin for new products | ✅ | *Settings*; pre-fills the sale price in *Add product* |
| **3.4** Manager/Admin per-transaction discount textbox | ✅ | "Discount on whole bill" (`500` or `10%`), plus an optional per-item discount; salespeople can't discount (enforced on the server) |
| **3.4** Record original price, discount and final price | ✅ | Stored on every invoice line |
| **3.5** Invoice no., date/time, shop name/address/contact (+logo), customer, itemised lines, subtotal → discount → grand total, paid → outstanding, payment mode | ✅ | Invoice page; print or save as PDF |
| **5.1** Daily: transactions, gross sales, cash collected, credit extended, profit, by category | ✅ | *Reports → Daily closing* |
| **5.3** Monthly: P&L, stock consumed vs restocked, by category, credit owed / paid / outstanding | ✅ | *Reports → Monthly* (+ day-by-day breakdown) |
| **5.4** Print / PDF and Excel / CSV for every report | ✅ | Buttons on Reports and Inventory |
| **M6** Business profile with logo on invoices | ✅ | *Settings* |
| **M6** Global default margin | ✅ | *Settings* |
| **M6** Retention / archival period (default 60 days) | ✅ | *Settings*; old sales are archived (hidden from Sales History, never deleted), daily via Vercel Cron |
| **M6** Users: add / edit / deactivate, assign roles | ✅ | *Settings → Users*; a deactivated user is signed out within a minute. Admin (Owner) can also **delete** a user (not themselves or the last Admin); past invoices keep the person's name |
| **M6** Categories: add / edit / deactivate | ✅ | *Brands & Categories* |

## 4. Technical
| Requirement | Status | Where |
|---|---|---|
| Web-based; optionally a desktop app | ✅ | Installable as an app (PWA: "Install" in Chrome/Edge) |
| Chrome, Firefox, Edge | ✅ | Standard HTML/CSS/JS, no browser-specific features |
| English and Bangla UI | ✅ | Toggle in the top bar; Bangla digits too |
| Core POS works offline and syncs later | ✅ | Product list cached on the device; offline sales queued with a provisional `OFFLINE-…` number (searchable after sync) and synced automatically |
| Cloud-hosted MySQL | ✅ | Aiven MySQL 8 |
| Browser print / PDF | ✅ | Print layouts for invoices, reports and inventory |
| Minimum 10-inch screen | ✅ | Tested at 800×1280 (10" portrait) and desktop sizes; also works on phones |

## 6–7. Security & data
| Requirement | Status | Where |
|---|---|---|
| bcrypt password hashing | ✅ | Cost factor 12 |
| HTTPS | ✅ | Vercel (HSTS on); plain HTTP redirects to HTTPS |
| Audit log of every financial transaction with user and time | ✅ | Sales, due payments, stock changes, price/product/user/settings changes, logins; *Settings → Audit log* |
| Salesperson can't view financial reports | ✅ | Blocked on the server (403) |
| Product / Category / Customer / Sale / Sale item / Credit payment / User / Audit log fields | ✅ | `db/schema.sql`: every listed field, plus the product *Code* (model/barcode) as its own field |

## Notes
1. **Manager role.** The roles table lists only Admin and Salesperson, but Modules 1 and 3 mention a Manager. A Manager can do inventory, discounts, customers/dues and reports, but not Settings.
2. **Partial cash payment.** The only payment type is Cash, and the customer may pay in full or in part. The unpaid part becomes the customer's due. It feeds the invoice's *Outstanding Balance*, the reports' *credit extended* and *credit overview*, and *Credit Payment* records. Dues are collected in *Customers & Dues*, oldest invoice first. The invoice shows "Cash — paid in full" or "Cash — partial payment".
3. **Brands and categories** are separate lists that can be combined freely, so any brand can have any number of categories.
