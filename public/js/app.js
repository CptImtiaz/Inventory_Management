// Single-page app: hash routes → view functions that render into #main.
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const RANK = { salesperson: 1, manager: 2, admin: 3 };
const can = min => App.user && RANK[App.user.role] >= RANK[min];
const today = () => new Date().toLocaleDateString('en-CA');

const App = { user: null, settings: {}, brands: [], categories: [] };

// ---------------------------------------------------------------------------
// UI helpers
function toast(msg, kind = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function modal(title, bodyHtml, onSubmit, { submitLabel = t('save'), wide = false } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-back';
  wrap.innerHTML = `<form class="modal ${wide ? 'wide' : ''}" novalidate>
    <h2>${esc(title)}</h2><div class="modal-body">${bodyHtml}</div>
    <p class="err" hidden></p>
    <div class="row end">${onSubmit ? `<button type="button" class="btn ghost" data-close>${t('cancel')}</button>
      <button class="btn primary">${esc(submitLabel)}</button>` : `<button type="button" class="btn" data-close>OK</button>`}</div>
  </form>`;
  document.body.appendChild(wrap);
  const form = $('form', wrap);
  const close = () => wrap.remove();
  $$('[data-close]', wrap).forEach(b => b.addEventListener('click', close));
  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!onSubmit) return close();
    const err = $('.err', form);
    err.hidden = true;
    try {
      const data = Object.fromEntries(new FormData(form));
      if ((await onSubmit(data, form)) !== false) close();
    } catch (ex) { err.textContent = ex.message === 'offline' ? t('offline') : ex.message; err.hidden = false; }
  });
  setTimeout(() => $('input, select, textarea', form)?.focus(), 30);
  return form;
}

const field = (label, name, value = '', type = 'text', extra = '') =>
  `<label class="field"><span>${esc(label)}</span><input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
const select = (label, name, options, value, extra = '') =>
  `<label class="field"><span>${esc(label)}</span><select name="${name}" ${extra}>${options.map(([v, l]) =>
    `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;

function table(cols, rows, empty = t('none')) {
  if (!rows.length) return `<p class="muted empty">${empty}</p>`;
  return `<div class="table-wrap"><table><thead><tr>${cols.map(c => `<th class="${c.cls || ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr class="${r._cls || ''}">${cols.map(c => `<td class="${c.cls || ''}">${c.html ? c.html(r) : esc(r[c.key])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function download(url) {
  const a = document.createElement('a');
  a.href = url; a.download = ''; document.body.appendChild(a); a.click(); a.remove();
}

const roleName = r => ({ admin: t('admin'), manager: t('manager'), salesperson: t('salesperson_role') }[r] || r);

// ---------------------------------------------------------------------------
// Offline login: a PBKDF2 hash of the last password is kept on this device so the
// POS can be unlocked when the internet is down. It never leaves the browser.
async function pwHash(password, salt) {
  if (!crypto.subtle) return null;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 150000, hash: 'SHA-256' }, key, 256);
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

async function rememberOffline(username, password, user) {
  const salt = uuid();
  const hash = await pwHash(password, salt).catch(() => null);
  if (!hash) return;
  const creds = LS.get('ims.offlineCreds', {});
  creds[username.toLowerCase()] = { salt, hash, user };
  LS.set('ims.offlineCreds', creds);
}

async function offlineLogin(username, password) {
  const c = LS.get('ims.offlineCreds', {})[username.toLowerCase()];
  if (!c || (await pwHash(password, c.salt)) !== c.hash) return null;
  return c.user;
}

// ---------------------------------------------------------------------------
// Session & idle timeout (30 minutes, mirrored on the server)
const IDLE_MS = 30 * 60 * 1000;
let lastActivity = Date.now();
['click', 'keydown', 'touchstart'].forEach(ev => document.addEventListener(ev, () => { lastActivity = Date.now(); }, { passive: true }));
setInterval(() => {
  if (App.user && Date.now() - lastActivity > IDLE_MS) logout(true);
}, 30 * 1000);

window.addEventListener('ims:unauthorized', () => {
  // Server session gone (idle timeout, or an offline unlock now back online) → log in again; queued sales sync afterwards.
  if (App.user && navigator.onLine) { App.user = null; LS.del('ims.user'); renderLogin(t('session_expired')); }
});

async function logout(idle = false) {
  await api('/logout', { method: 'POST' }).catch(() => {});
  App.user = null;
  LS.del('ims.user');
  renderLogin(idle ? t('session_expired') : '');
}

function renderLogin(message = '') {
  document.body.className = 'login-page';
  $('#app').innerHTML = `<form class="login card" id="loginForm">
    <div class="brand-mark">${App.settings.shop_logo ? `<img src="${esc(App.settings.shop_logo)}" alt="">` : '৳'}</div>
    <h1>${esc(App.settings.shop_name || t('app_name'))}</h1>
    ${message ? `<p class="notice">${esc(message)}</p>` : ''}
    ${field(t('username'), 'username', '', 'text', 'autocomplete="username" required autocapitalize="off"')}
    ${field(t('password'), 'password', '', 'password', 'autocomplete="current-password" required')}
    <p class="err" hidden></p>
    <button class="btn primary block">${t('login')}</button>
    <button type="button" class="btn ghost block" data-lang>${t('language')}</button>
  </form>`;
  $('[data-lang]').onclick = () => { setLang(LANG === 'bn' ? 'en' : 'bn'); renderLogin(message); };
  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const { username, password } = Object.fromEntries(new FormData(e.target));
    const err = $('.err', e.target);
    err.hidden = true;
    try {
      const { user } = await api('/login', { body: { username, password } });
      App.user = user;
      rememberOffline(username, password, user);
      start();
    } catch (ex) {
      if (ex.status === 0) {
        const user = await offlineLogin(username, password);
        if (user) { App.user = { ...user, offline: true }; return start(); }
        err.textContent = t('offline_login');
      } else err.textContent = ex.message;
      err.hidden = false;
    }
  });
}

// ---------------------------------------------------------------------------
// Shell
const NAV = [
  ['dashboard', 'manager', '▦'], ['pos', 'salesperson', '＋'], ['sales', 'salesperson', '☰'], ['inventory', 'manager', '▤'],
  ['customers', 'manager', '◉'], ['reports', 'manager', '▥'], ['categories', 'admin', '◈'], ['settings', 'admin', '⚙'],
];

function renderShell() {
  document.body.className = '';
  $('#app').innerHTML = `
    <header class="topbar no-print">
      <button class="btn icon" id="menuBtn" aria-label="Menu">☰</button>
      <div class="shop">${App.settings.shop_logo ? `<img src="${esc(App.settings.shop_logo)}" alt="">` : ''}<strong>${esc(App.settings.shop_name || t('app_name'))}</strong></div>
      <div class="spacer"></div>
      <span id="netStatus" class="pill"></span>
      <button class="btn ghost sm" id="langBtn">${t('language')}</button>
      <span class="who">${esc(App.user.name)} · ${roleName(App.user.role)}</span>
      <button class="btn ghost sm" id="logoutBtn">${t('logout')}</button>
    </header>
    <nav class="sidebar no-print" id="sidebar">${NAV.filter(([, r]) => can(r)).map(([k, , i]) =>
      `<a href="#/${k}" data-nav="${k}"><span class="ico">${i}</span>${t(k)}</a>`).join('')}</nav>
    <main id="main"></main>`;
  $('#menuBtn').onclick = () => $('#sidebar').classList.toggle('open');
  $('#langBtn').onclick = () => { setLang(LANG === 'bn' ? 'en' : 'bn'); renderShell(); route(); };
  $('#logoutBtn').onclick = () => logout();
  $('#netStatus').onclick = async () => {
    const r = await Offline.sync().catch(e => { toast(e.message, 'bad'); return null; });
    if (r) toast(`${num(r.synced)} ${t('synced')}${r.failed ? `, ${num(r.failed)} ${t('sync_failed')}` : ''}`, r.failed ? 'bad' : 'ok');
  };
  updateNet();
}

function updateNet() {
  const el = $('#netStatus');
  if (!el) return;
  const q = Offline.queue().length;
  el.className = 'pill ' + (navigator.onLine ? 'on' : 'off');
  el.textContent = (navigator.onLine ? t('online') : t('offline')) + (q ? ` · ${num(q)} ${t('pending_sync')}` : '');
  el.title = q ? t('sync_now') : '';
}
window.addEventListener('online', updateNet);
window.addEventListener('offline', updateNet);
window.addEventListener('ims:queue', updateNet);

async function loadLookups() {
  try {
    [App.brands, App.categories] = await Promise.all([api('/brands'), api('/categories')]);
  } catch { /* offline: keep previous */ }
}

const VIEWS = {};
function route() {
  const [, name = '', arg] = location.hash.split('/');
  const def = can('manager') ? 'dashboard' : 'pos';
  const entry = NAV.find(n => n[0] === name);
  const view = name === 'invoice' ? 'invoice' : entry && can(entry[1]) ? name : def;
  if (view !== name && name !== 'invoice') { location.hash = '#/' + view; return; }
  $$('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === view));
  $('#sidebar')?.classList.remove('open');
  const main = $('#main');
  main.innerHTML = '<p class="muted">…</p>';
  Promise.resolve(VIEWS[view](main, arg)).catch(e => {
    main.innerHTML = `<p class="err">${esc(e.message === 'offline' ? t('offline') : e.message)}</p>`;
  });
}
window.addEventListener('hashchange', () => App.user && route());

async function start() {
  LS.set('ims.user', App.user);
  lastActivity = Date.now();
  try { App.settings = await api('/settings'); } catch { App.settings = Offline.settings(); }
  await loadLookups();
  Offline.refresh().catch(() => {});
  Offline.sync().catch(() => {});
  renderShell();
  route();
}

// ---------------------------------------------------------------------------
// Dashboard
VIEWS.dashboard = async main => {
  const [d, low] = await Promise.all([api('/reports/daily'), api('/reports/low-stock')]);
  const s = d.summary;
  main.innerHTML = `<h1>${t('today_summary')}</h1>
    <div class="stats">
      ${stat(t('transactions'), num(s.transactions))}${stat(t('gross_sales'), money(s.gross_sales))}
      ${stat(t('cash_collected'), money(s.cash_collected))}${stat(t('credit_extended'), money(s.credit_extended))}
      ${stat(t('profit'), money(s.profit))}
    </div>
    <div class="grid2">
      <section class="card"><h2>${t('low_stock')} <span class="badge bad">${num(low.length)}</span></h2>
        ${table([{ label: t('id'), key: 'code' }, { label: t('product'), key: 'name' }, { label: t('category'), key: 'category' },
          { label: t('stock'), cls: 'num', html: r => `<b class="bad-text">${num(r.stock_qty)}</b> / ${num(r.threshold)}` }], low)}
      </section>
      <section class="card"><h2>${t('by_category')}</h2>
        ${table([{ label: t('category'), key: 'category' }, { label: t('qty'), cls: 'num', html: r => num(r.qty) },
          { label: t('gross_sales'), cls: 'num', html: r => money(r.sales) }], d.categories)}
      </section>
    </div>`;
};
const stat = (label, value) => `<div class="stat card"><span>${esc(label)}</span><strong>${value}</strong></div>`;

// ---------------------------------------------------------------------------
// POS
const POS = { cart: [] };

VIEWS.pos = async main => {
  let products = Offline.catalog();
  if (navigator.onLine) products = await Offline.refresh().catch(() => products);
  const settings = navigator.onLine ? App.settings : Offline.settings();
  const canDisc = can('manager');

  main.innerHTML = `<h1>${t('pos')}</h1>
  <div class="pos">
    <section class="card">
      <div class="search-box">
        <input id="pSearch" placeholder="${t('search_product')}" autocomplete="off">
        <ul id="pResults" class="results" hidden></ul>
      </div>
      <div id="pPicked" class="picked muted">—</div>
      <div class="row">
        <label class="field sm"><span>${t('qty')}</span><input id="pQty" type="number" min="1" value="1" inputmode="numeric"></label>
        ${canDisc ? `<label class="field sm"><span>${t('discount')}</span><input id="pDisc" placeholder="${t('discount_hint')}"></label>` : ''}
        <button class="btn primary" id="addCart" disabled>${t('add_to_cart')}</button>
      </div>
      <h2>${t('cart')}</h2>
      <div id="cart"></div>
    </section>
    <form class="card" id="checkout" novalidate>
      <h2>${t('customer')}</h2>
      ${field(t('phone'), 'phone', '', 'tel', 'required id="cPhone" inputmode="tel"')}
      <p id="cDue" class="muted small"></p>
      ${field(t('customer_name'), 'name', '', 'text', 'required')}
      ${field(t('address'), 'address', '', 'text', 'required')}
      <h2>${t('payment_type')}</h2>
      <div class="seg">
        <label><input type="radio" name="payment_type" value="cash" checked> ${t('cash')}</label>
        <label><input type="radio" name="payment_type" value="credit"> ${t('credit')}</label>
      </div>
      ${field(t('amount_paid'), 'cash_paid', '', 'number', 'min="0" step="0.01" inputmode="decimal" id="cPaid"')}
      <div class="totals" id="totals"></div>
      <p class="err" hidden></p>
      <button class="btn primary block lg" id="confirmBtn">${t('confirm_sale')}</button>
    </form>
  </div>`;

  let picked = null;
  const search = $('#pSearch'), results = $('#pResults');

  const findProducts = q => {
    q = q.trim().toLowerCase();
    if (!q) return [];
    return products.filter(p => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) ||
      String(p.id) === q || (p.brand || '').toLowerCase().includes(q)).slice(0, 12);
  };
  const pick = p => {
    picked = p;
    results.hidden = true;
    search.value = '';
    $('#pPicked').className = 'picked';
    $('#pPicked').innerHTML = `<b>${esc(p.name)}</b> <span class="muted">${esc(p.code)} · ${esc(p.brand || '')} ${esc(p.category)}</span>
      <span class="price">${money(p.sale_price)}</span> <span class="${p.stock_qty <= p.threshold ? 'bad-text' : 'muted'}">${num(p.stock_qty)} ${t('in_stock')}</span>`;
    $('#addCart').disabled = false;
    $('#pQty').focus(); $('#pQty').select();
  };
  search.addEventListener('input', () => {
    const list = findProducts(search.value);
    results.hidden = !list.length;
    results.innerHTML = list.map(p => `<li data-id="${p.id}"><span><b>${esc(p.name)}</b><small>${esc(p.code)} · ${esc(p.category)}</small></span>
      <span class="num">${money(p.sale_price)}<small>${num(p.stock_qty)} ${t('in_stock')}</small></span></li>`).join('');
  });
  search.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); const l = findProducts(search.value); if (l.length) pick(l[0]); }
  });
  results.addEventListener('click', e => {
    const li = e.target.closest('li'); if (li) pick(products.find(p => p.id === +li.dataset.id));
  });

  const parseDiscount = (raw, gross) => {
    raw = String(raw || '').trim();
    if (!raw) return 0;
    const pct = raw.endsWith('%');
    const v = parseFloat(raw);
    if (!(v >= 0)) throw new Error(t('discount') + '?');
    const d = pct ? gross * v / 100 : v;
    if (d > gross) throw new Error(t('discount') + ' > ' + money(gross));
    return Math.round(d * 100) / 100;
  };

  $('#addCart').onclick = () => {
    if (!picked) return;
    const qty = parseInt($('#pQty').value, 10);
    if (!(qty > 0)) return toast(t('qty') + '?', 'bad');
    const inCart = POS.cart.filter(c => c.product_id === picked.id).reduce((s, c) => s + c.qty, 0);
    if (qty + inCart > picked.stock_qty && navigator.onLine) return toast(`${picked.name}: ${num(picked.stock_qty)} ${t('in_stock')}`, 'bad');
    let discount = 0;
    try { discount = canDisc ? parseDiscount($('#pDisc').value, picked.sale_price * qty) : 0; } catch (e) { return toast(e.message, 'bad'); }
    POS.cart.push({ product_id: picked.id, name: picked.name, code: picked.code, qty, unit_price: picked.sale_price, discount });
    picked = null;
    $('#pPicked').className = 'picked muted'; $('#pPicked').textContent = '—';
    $('#addCart').disabled = true; $('#pQty').value = 1;
    if ($('#pDisc')) $('#pDisc').value = '';
    renderCart();
    search.focus();
  };

  const totals = () => {
    const subtotal = POS.cart.reduce((s, c) => s + c.unit_price * c.qty, 0);
    const discount = POS.cart.reduce((s, c) => s + c.discount, 0);
    return { subtotal, discount, total: Math.round((subtotal - discount) * 100) / 100 };
  };

  const renderTotals = () => {
    const tt = totals();
    const form = $('#checkout');
    const type = form.payment_type.value;
    const paid = form.cash_paid.value === '' ? tt.total : +form.cash_paid.value;
    form.cash_paid.placeholder = tt.total.toFixed(2);
    $('#totals').innerHTML = `
      <div><span>${t('subtotal')}</span><span>${money(tt.subtotal)}</span></div>
      <div><span>${t('discount')}</span><span>− ${money(tt.discount)}</span></div>
      <div class="grand"><span>${t('grand_total')}</span><span>${money(tt.total)}</span></div>
      ${type === 'cash' && paid > tt.total ? `<div><span>${t('change')}</span><span>${money(paid - tt.total)}</span></div>` : ''}
      ${type === 'credit' ? `<div class="bad-text"><span>${t('outstanding')}</span><span>${money(Math.max(0, tt.total - paid))}</span></div>` : ''}`;
  };

  const renderCart = () => {
    $('#cart').innerHTML = POS.cart.length ? table([
      { label: t('product'), html: r => `${esc(r.name)}<br><small class="muted">${esc(r.code)}</small>` },
      { label: t('qty'), cls: 'num', html: r => num(r.qty) },
      { label: t('unit_price'), cls: 'num', html: r => money(r.unit_price) },
      { label: t('discount'), cls: 'num', html: r => r.discount ? '− ' + money(r.discount) : '' },
      { label: t('line_total'), cls: 'num', html: r => money(r.unit_price * r.qty - r.discount) },
      { label: '', html: (r) => `<button type="button" class="btn icon ghost" data-rm="${POS.cart.indexOf(r)}" aria-label="${t('delete')}">✕</button>` },
    ], POS.cart) : `<p class="muted empty">${t('cart_empty')}</p>`;
    renderTotals();
  };
  $('#cart').addEventListener('click', e => {
    const b = e.target.closest('[data-rm]'); if (b) { POS.cart.splice(+b.dataset.rm, 1); renderCart(); }
  });
  $('#checkout').addEventListener('input', renderTotals);
  renderCart();

  // Autofill returning customers by phone.
  $('#cPhone').addEventListener('change', async e => {
    const c = await api('/customers/lookup?phone=' + encodeURIComponent(e.target.value)).catch(() => null);
    const f = $('#checkout');
    $('#cDue').textContent = c && c.credit_balance > 0 ? `${t('existing_due')}: ${money(c.credit_balance)}` : '';
    if (c) { if (!f.name.value) f.name.value = c.name; if (!f.address.value) f.address.value = c.address; }
  });

  $('#checkout').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target, err = $('.err', f), btn = $('#confirmBtn');
    err.hidden = true;
    const fail = m => { err.textContent = m; err.hidden = false; };
    if (!POS.cart.length) return fail(t('cart_empty'));
    const data = Object.fromEntries(new FormData(f));
    if (!data.name.trim() || !data.address.trim() || !data.phone.trim()) return fail(`${t('customer_name')}, ${t('address')}, ${t('phone')}`);
    const tt = totals();
    const sale = {
      client_uuid: uuid(),
      customer: { name: data.name.trim(), address: data.address.trim(), phone: data.phone.trim() },
      items: POS.cart.map(c => ({ product_id: c.product_id, qty: c.qty, discount: c.discount, unit_price: c.unit_price })),
      payment_type: data.payment_type,
      cash_paid: data.cash_paid === '' ? tt.total : Math.min(+data.cash_paid, data.payment_type === 'cash' ? Infinity : tt.total),
    };
    if (sale.payment_type === 'cash' && sale.cash_paid < tt.total) return fail(t('amount_paid') + ' < ' + money(tt.total));
    btn.disabled = true;
    try {
      const r = await api('/sales', { body: sale });
      POS.cart = [];
      Offline.refresh().catch(() => {});
      location.hash = '#/invoice/' + r.id;
    } catch (ex) {
      if (ex.status === 0 || (ex.status === 401 && App.user.offline)) {
        // Offline: queue it and print a provisional invoice from local data.
        const offlineSale = { ...sale, offline_at: new Date().toISOString(),
          _local: { cart: POS.cart, totals: tt, user: App.user.name, settings } };
        Offline.enqueue(offlineSale);
        POS.cart = [];
        location.hash = '#/invoice/local-' + sale.client_uuid;
      } else fail(ex.message);
    } finally { btn.disabled = false; }
  });
};

// ---------------------------------------------------------------------------
// Invoice (printable)
VIEWS.invoice = async (main, id) => {
  let sale, items, shop, provisional = false;
  if (id && id.startsWith('local-')) {
    const uid = id.slice(6);
    const synced = LS.get('ims.syncedMap', {})[uid];
    if (synced && navigator.onLine) { location.hash = '#/invoice/' + synced.id; return; }
    const q = Offline.queue().find(s => s.client_uuid === uid);
    if (!q) throw new Error(t('none'));
    const L = q._local;
    provisional = true;
    shop = { name: L.settings.shop_name, address: L.settings.shop_address, phone: L.settings.shop_phone, logo: L.settings.shop_logo };
    const paid = q.payment_type === 'cash' ? L.totals.total : q.cash_paid;
    sale = { invoice_no: 'OFFLINE-' + uid.slice(0, 8).toUpperCase(), created_at: q.offline_at.replace('T', ' ').slice(0, 19),
      customer_name: q.customer.name, customer_address: q.customer.address, customer_phone: q.customer.phone,
      subtotal: L.totals.subtotal, discount_total: L.totals.discount, total: L.totals.total, cash_paid: paid,
      outstanding: L.totals.total - paid, payment_type: q.payment_type, salesperson: L.user };
    sale.created_at = new Date(q.offline_at).toLocaleString('en-GB');
    items = L.cart.map(c => ({ product_name: c.name, qty: c.qty, unit_price: c.unit_price, discount: c.discount, line_total: c.unit_price * c.qty - c.discount }));
  } else {
    ({ sale, items, shop } = await api('/sales/' + id));
  }
  main.innerHTML = `
    <div class="row no-print"><button class="btn primary" id="printBtn">🖨 ${t('print')}</button>
      ${can('salesperson') ? `<a class="btn" href="#/pos">${t('new_sale')}</a>` : ''}</div>
    ${provisional ? `<p class="notice no-print">${t('provisional')}</p>` : ''}
    <article class="invoice card">
      <header>
        <div>${shop.logo ? `<img src="${esc(shop.logo)}" alt="" class="inv-logo">` : ''}
          <h2>${esc(shop.name)}</h2><p>${esc(shop.address)}<br>${esc(shop.phone)}</p></div>
        <div class="inv-meta"><h1>${t('invoice')}</h1>
          <p><b>${t('invoice_no')}:</b> ${esc(sale.invoice_no)}<br><b>${t('date_time')}:</b> ${esc(sale.created_at)}<br>
          <b>${t('salesperson')}:</b> ${esc(sale.salesperson)}</p></div>
      </header>
      <section class="inv-cust"><b>${t('customer')}:</b> ${esc(sale.customer_name)}<br>${esc(sale.customer_address)}<br>${esc(sale.customer_phone)}</section>
      <table class="inv-items"><thead><tr><th>#</th><th>${t('product')}</th><th class="num">${t('qty')}</th><th class="num">${t('unit_price')}</th>
        <th class="num">${t('discount')}</th><th class="num">${t('line_total')}</th></tr></thead>
        <tbody>${items.map((it, i) => `<tr><td>${num(i + 1)}</td><td>${esc(it.product_name)}</td><td class="num">${num(it.qty)}</td>
          <td class="num">${money(it.unit_price)}</td><td class="num">${it.discount ? money(it.discount) : '—'}</td><td class="num">${money(it.line_total)}</td></tr>`).join('')}</tbody></table>
      <div class="inv-totals">
        <div><span>${t('subtotal')}</span><span>${money(sale.subtotal)}</span></div>
        <div><span>${t('discount')}</span><span>− ${money(sale.discount_total)}</span></div>
        <div class="grand"><span>${t('grand_total')}</span><span>${money(sale.total)}</span></div>
        <div><span>${t('amount_paid')}</span><span>${money(sale.cash_paid)}</span></div>
        <div><span>${t('outstanding')}</span><span>${money(sale.outstanding)}</span></div>
        <div><span>${t('payment_mode')}</span><span>${sale.payment_type === 'cash' ? t('cash') : t('credit')}</span></div>
      </div>
      <footer>${t('thanks')}</footer>
    </article>`;
  $('#printBtn').onclick = () => window.print();
};

// ---------------------------------------------------------------------------
// Inventory
VIEWS.inventory = async main => {
  const state = { q: '', category_id: '', brand_id: '', low: '' };
  main.innerHTML = `<div class="row between"><h1>${t('inventory')}</h1>
    <div class="row"><button class="btn" data-exp="xlsx">⤓ ${t('export_xlsx')}</button><button class="btn" data-exp="csv">⤓ ${t('export_csv')}</button>
    <button class="btn" id="printInv">🖨 ${t('print')}</button><button class="btn primary" id="addProd">＋ ${t('add_product')}</button></div></div>
    <div class="filters card no-print">
      <input id="fQ" placeholder="${t('search')}…" type="search">
      <select id="fCat"><option value="">${t('category')}: ${t('all')}</option>${App.categories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
      <select id="fBrand"><option value="">${t('brand')}: ${t('all')}</option>${App.brands.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
      <label class="check"><input type="checkbox" id="fLow"> ${t('low_stock')}</label>
    </div>
    <div id="invTable"></div>`;

  const load = async () => {
    const qs = new URLSearchParams(Object.entries(state).filter(([, v]) => v)).toString();
    const rows = await api('/products?' + qs);
    rows.forEach(r => { if (r.stock_qty <= r.threshold) r._cls = 'low'; });
    $('#invTable').innerHTML = table([
      { label: t('name'), html: r => `<b>${esc(r.name)}</b><br><small class="muted">${esc(r.brand || '')}</small>` },
      { label: t('id'), key: 'code' }, { label: t('category'), key: 'category' },
      { label: t('stock_qty'), cls: 'num', html: r => `${num(r.stock_qty)}${r.stock_qty <= r.threshold ? ` <span class="badge bad">${t('low_stock')}</span>` : ''}` },
      { label: t('purchase_price'), cls: 'num', html: r => money(r.purchase_price) },
      { label: t('sale_price'), cls: 'num', html: r => money(r.sale_price) },
      { label: '', cls: 'actions no-print', html: r => `<button class="btn sm" data-edit="${r.id}">${t('edit')}</button>
        <button class="btn sm" data-adj="${r.id}">± ${t('stock')}</button><button class="btn sm ghost" data-hist="${r.id}">${t('history')}</button>` },
    ], rows);
    main._rows = rows;
  };

  let timer;
  $('#fQ').addEventListener('input', e => { clearTimeout(timer); timer = setTimeout(() => { state.q = e.target.value; load(); }, 250); });
  $('#fCat').onchange = e => { state.category_id = e.target.value; load(); };
  $('#fBrand').onchange = e => { state.brand_id = e.target.value; load(); };
  $('#fLow').onchange = e => { state.low = e.target.checked ? '1' : ''; load(); };
  $$('[data-exp]', main).forEach(b => b.onclick = () => download(`/api/reports/inventory?format=${b.dataset.exp}`));
  $('#printInv').onclick = () => window.print();
  $('#addProd').onclick = () => productForm(null, load);
  $('#invTable').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const p = main._rows.find(r => r.id === +(b.dataset.edit || b.dataset.adj || b.dataset.hist));
    if (b.dataset.edit) productForm(p, load);
    if (b.dataset.adj) adjustForm(p, load);
    if (b.dataset.hist) historyView(p);
  });
  await load();
};

function productForm(p, done) {
  const margin = +App.settings.default_margin || 0;
  const form = modal(p ? `${t('edit')} — ${p.code}` : t('add_product'), `
    ${select(t('brand'), 'brand_id', [['', '—'], ...App.brands.map(b => [b.id, b.name])], p?.brand_id)}
    ${field(t('product_name'), 'name', p?.name, 'text', 'required')}
    ${select(t('category'), 'category_id', App.categories.map(c => [c.id, c.name]), p?.category_id)}
    <div class="grid2">
      ${field(t('purchase_price') + ' (৳)', 'purchase_price', p?.purchase_price ?? '', 'number', 'min="0" step="0.01" required')}
      ${field(t('sale_price') + ' (৳)', 'sale_price', p?.sale_price ?? '', 'number', 'min="0" step="0.01" required')}
    </div>
    <p class="muted small" id="marginNote">${p ? '' : `${t('margin_hint')}: ${num(margin)}%`}</p>
    <div class="grid2">
      ${p ? '' : field(t('stock_qty'), 'stock_qty', 0, 'number', 'min="0" step="1"')}
      ${field(t('threshold'), 'threshold', p?.threshold ?? 5, 'number', 'min="0" step="1"')}
    </div>`, async data => {
    await api(p ? `/products/${p.id}` : '/products', { method: p ? 'PUT' : 'POST', body: data });
    toast(t('saved'));
    done();
  });
  // Global default margin pre-fills the sale price for new products.
  let touched = !!p;
  form.sale_price.addEventListener('input', () => { touched = true; note(); });
  form.purchase_price.addEventListener('input', () => {
    if (!touched) form.sale_price.value = (Math.round(+form.purchase_price.value * (1 + margin / 100) * 100) / 100) || '';
    note();
  });
  const note = () => {
    const pp = +form.purchase_price.value, sp = +form.sale_price.value;
    if (pp > 0 && sp) $('#marginNote', form).textContent = `${t('margin')}: ${num(((sp - pp) / pp * 100).toFixed(1))}%`;
  };
}

function adjustForm(p, done) {
  modal(`${t('adjust_stock')} — ${p.name}`, `
    <p>${t('stock')}: <b>${num(p.stock_qty)}</b></p>
    ${select(t('action'), 'type', [['restock', t('restock')], ['adjustment', t('adjustment')]], 'restock')}
    ${field(t('qty_change'), 'qty', '', 'number', 'step="1" required')}
    ${field(t('reason'), 'reason', '', 'text', 'required maxlength="250"')}`, async data => {
    if (!data.reason.trim()) throw new Error(t('reason'));
    await api(`/products/${p.id}/adjust`, { body: data });
    toast(t('saved'));
    done();
  });
}

async function historyView(p) {
  const rows = await api(`/products/${p.id}/movements`);
  modal(`${t('history')} — ${p.name}`, table([
    { label: t('date'), key: 'created_at' }, { label: t('action'), key: 'type' },
    { label: t('qty'), cls: 'num', html: r => (r.change_qty > 0 ? '+' : '') + num(r.change_qty) },
    { label: t('reason'), key: 'reason' }, { label: t('user'), key: 'user_name' }], rows), null, { wide: true });
}

// ---------------------------------------------------------------------------
// Brands & categories (admin)
VIEWS.categories = async main => {
  const render = async () => {
    const [brands, cats] = await Promise.all([api('/brands?all=1'), api('/categories?all=1')]);
    main.innerHTML = `<h1>${t('categories')}</h1><div class="grid2">${[['brands', t('brands'), brands], ['categories', t('categories').split(' & ').pop(), cats]].map(([kind, title, rows]) => `
      <section class="card"><div class="row between"><h2>${esc(title)}</h2>
        <form class="row" data-add="${kind}"><input name="name" placeholder="${t('name')}" required><button class="btn primary">${t('add')}</button></form></div>
        ${table([{ label: t('name'), key: 'name' }, { label: t('products'), cls: 'num', html: r => num(r.product_count) },
          { label: t('status'), html: r => r.active ? `<span class="badge ok">${t('active')}</span>` : `<span class="badge">${t('inactive')}</span>` },
          { label: '', cls: 'actions', html: r => `<button class="btn sm" data-ed="${kind}:${r.id}">${t('edit')}</button>
            <button class="btn sm ghost" data-tog="${kind}:${r.id}">${r.active ? t('deactivate') : t('activate')}</button>
            ${r.product_count ? '' : `<button class="btn sm ghost danger" data-del="${kind}:${r.id}">${t('delete')}</button>`}` }], rows)}
      </section>`).join('')}</div>`;
    main._data = { brands, categories: cats };
  };
  main.onsubmit = async e => {
    const kind = e.target.dataset.add; if (!kind) return;
    e.preventDefault();
    try { await api('/' + kind, { body: { name: e.target.name.value } }); await loadLookups(); render(); } catch (ex) { toast(ex.message, 'bad'); }
  };
  main.onclick = async e => {
    const b = e.target.closest('button[data-ed],button[data-tog],button[data-del]'); if (!b) return;
    const [kind, id] = (b.dataset.ed || b.dataset.tog || b.dataset.del).split(':');
    const row = main._data[kind].find(r => r.id === +id);
    try {
      if (b.dataset.ed) return modal(t('edit'), field(t('name'), 'name', row.name, 'text', 'required'), async d => {
        await api(`/${kind}/${id}`, { method: 'PUT', body: { name: d.name, active: row.active } }); await loadLookups(); render();
      });
      if (b.dataset.tog) await api(`/${kind}/${id}`, { method: 'PUT', body: { name: row.name, active: !row.active } });
      if (b.dataset.del) { if (!confirm(t('confirm_delete'))) return; await api(`/${kind}/${id}`, { method: 'DELETE' }); }
      await loadLookups(); render();
    } catch (ex) { toast(ex.message, 'bad'); }
  };
  await render();
};

// ---------------------------------------------------------------------------
// Customers & dues
VIEWS.customers = async main => {
  const state = { q: '', owing: '1' };
  main.innerHTML = `<h1>${t('customers')}</h1>
    <div class="filters card"><input id="cq" type="search" placeholder="${t('search')}… (${t('name')} / ${t('phone')})">
      <label class="check"><input type="checkbox" id="cOwing" checked> ${t('owing_only')}</label></div><div id="cTable"></div>`;
  const load = async () => {
    const rows = await api('/customers?' + new URLSearchParams(Object.entries(state).filter(([, v]) => v)));
    main._rows = rows;
    $('#cTable').innerHTML = table([
      { label: t('name'), key: 'name' }, { label: t('phone'), key: 'phone' }, { label: t('address'), key: 'address' },
      { label: t('due'), cls: 'num', html: r => r.credit_balance > 0 ? `<b class="bad-text">${money(r.credit_balance)}</b>` : money(0) },
      { label: '', cls: 'actions', html: r => `<button class="btn sm" data-view="${r.id}">${t('view')}</button>
        ${r.credit_balance > 0 ? `<button class="btn sm primary" data-pay="${r.id}">${t('record_payment')}</button>` : ''}` }], rows);
  };
  let timer;
  $('#cq').oninput = e => { clearTimeout(timer); timer = setTimeout(() => { state.q = e.target.value; load(); }, 250); };
  $('#cOwing').onchange = e => { state.owing = e.target.checked ? '1' : ''; load(); };
  $('#cTable').onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    const c = main._rows.find(r => r.id === +(b.dataset.view || b.dataset.pay));
    if (b.dataset.pay) {
      modal(`${t('record_payment')} — ${c.name}`, `<p>${t('due')}: <b>${money(c.credit_balance)}</b></p>
        ${field(t('amount') + ' (৳)', 'amount', c.credit_balance, 'number', `min="0.01" max="${c.credit_balance}" step="0.01" required`)}`,
      async d => { await api(`/customers/${c.id}/payments`, { body: d }); toast(t('saved')); load(); });
    } else {
      const { dues, payments } = await api(`/customers/${c.id}/dues`);
      modal(`${c.name} — ${c.phone}`, `<h3>${t('unpaid_invoices')}</h3>${table([
        { label: t('invoice_no'), html: r => `<a href="#/invoice/${r.id}" data-close>${esc(r.invoice_no)}</a>` }, { label: t('date'), key: 'created_at' },
        { label: t('total'), cls: 'num', html: r => money(r.total) }, { label: t('due'), cls: 'num', html: r => money(r.outstanding) }], dues)}
        <h3>${t('payments')}</h3>${table([{ label: t('date'), key: 'created_at' }, { label: t('invoice_no'), key: 'invoice_no' },
        { label: t('amount'), cls: 'num', html: r => money(r.amount) }, { label: t('user'), key: 'user_name' }], payments)}`, null, { wide: true });
    }
  };
  await load();
};

// ---------------------------------------------------------------------------
// Sales history
VIEWS.sales = async main => {
  const state = { q: '', from: can('manager') ? today() : '', to: can('manager') ? today() : '' };
  const queued = Offline.queue();
  main.innerHTML = `<h1>${t('sales')}</h1>
    ${queued.length ? `<section class="card warn"><h2>${t('offline')} · ${num(queued.length)} ${t('pending_sync')}</h2>
      ${table([{ label: t('invoice_no'), html: r => `<a href="#/invoice/local-${r.client_uuid}">OFFLINE-${esc(r.client_uuid.slice(0, 8).toUpperCase())}</a>` },
        { label: t('date'), html: r => esc(new Date(r.offline_at).toLocaleString('en-GB')) }, { label: t('customer'), html: r => esc(r.customer.name) },
        { label: t('total'), cls: 'num', html: r => money(r._local.totals.total) }, { label: '', html: r => r.sync_error ? `<span class="bad-text">${esc(r.sync_error)}</span>` : '' }], queued)}</section>` : ''}
    ${can('manager') ? `<div class="filters card"><input id="sq" type="search" placeholder="${t('search')}… (${t('invoice_no')} / ${t('customer')} / ${t('phone')})">
      <label class="field inline"><span>${t('from')}</span><input type="date" id="sFrom" value="${state.from}"></label>
      <label class="field inline"><span>${t('to')}</span><input type="date" id="sTo" value="${state.to}"></label></div>` : ''}
    <div id="sTable"></div>`;
  const load = async () => {
    const rows = await api('/sales?' + new URLSearchParams(Object.entries(state).filter(([, v]) => v)));
    $('#sTable').innerHTML = table([
      { label: t('invoice_no'), html: r => `<a href="#/invoice/${r.id}">${esc(r.invoice_no)}</a>${r.offline ? ' <span class="badge">offline</span>' : ''}` },
      { label: t('date_time'), key: 'created_at' }, { label: t('customer'), html: r => `${esc(r.customer)}<br><small class="muted">${esc(r.phone)}</small>` },
      { label: t('total'), cls: 'num', html: r => money(r.total) }, { label: t('paid'), cls: 'num', html: r => money(r.cash_paid) },
      { label: t('due'), cls: 'num', html: r => r.credit_amount ? `<span class="bad-text">${money(r.credit_amount)}</span>` : '—' },
      { label: t('salesperson'), key: 'salesperson' }], rows);
  };
  if (can('manager')) {
    let timer;
    $('#sq').oninput = e => { clearTimeout(timer); timer = setTimeout(() => { state.q = e.target.value; load(); }, 250); };
    $('#sFrom').onchange = e => { state.from = e.target.value; load(); };
    $('#sTo').onchange = e => { state.to = e.target.value; load(); };
  }
  await load().catch(e => { if (e.status === 0) $('#sTable').innerHTML = `<p class="muted">${t('offline')}</p>`; else throw e; });
};

// ---------------------------------------------------------------------------
// Reports
VIEWS.reports = async main => {
  const st = { kind: 'daily', date: today(), month: today().slice(0, 7) };
  main.innerHTML = `<div class="row between no-print"><h1>${t('reports')}</h1>
    <div class="row"><button class="btn" data-fmt="xlsx">⤓ ${t('export_xlsx')}</button><button class="btn" data-fmt="csv">⤓ ${t('export_csv')}</button>
    <button class="btn primary" id="rPrint">🖨 ${t('print')} / PDF</button></div></div>
    <div class="filters card no-print"><div class="seg"><label><input type="radio" name="kind" value="daily" checked> ${t('daily_report')}</label>
      <label><input type="radio" name="kind" value="monthly"> ${t('monthly_report')}</label></div>
      <input type="date" id="rDate" value="${st.date}"><input type="month" id="rMonth" value="${st.month}" hidden></div>
    <div id="report"></div>`;
  const param = () => st.kind === 'daily' ? `date=${st.date}` : `month=${st.month}`;
  const load = async () => {
    $('#rDate').hidden = st.kind !== 'daily'; $('#rMonth').hidden = st.kind === 'daily';
    const r = await api(`/reports/${st.kind}?${param()}`);
    $('#report').innerHTML = st.kind === 'daily' ? dailyHtml(r) : monthlyHtml(r);
  };
  $$('input[name=kind]', main).forEach(i => i.onchange = () => { st.kind = i.value; load(); });
  $('#rDate').onchange = e => { st.date = e.target.value; load(); };
  $('#rMonth').onchange = e => { st.month = e.target.value; load(); };
  $$('[data-fmt]', main).forEach(b => b.onclick = () => download(`/api/reports/${st.kind}?${param()}&format=${b.dataset.fmt}`));
  $('#rPrint').onclick = () => window.print();
  await load();
};

const reportHead = title => `<div class="report-head"><h2>${esc(App.settings.shop_name)}</h2><p>${esc(title)}</p></div>`;

function dailyHtml(r) {
  const s = r.summary;
  return `${reportHead(`${t('daily_report')} — ${r.date}`)}
    <div class="stats">${stat(t('transactions'), num(s.transactions))}${stat(t('gross_sales'), money(s.gross_sales))}
      ${stat(t('cash_collected'), money(s.cash_collected))}${stat(t('credit_extended'), money(s.credit_extended))}${stat(t('profit'), money(s.profit))}</div>
    <p class="muted small">${t('cash_collected')} = ${money(s.cash_from_sales)} + ${t('due_collected')} ${money(s.due_collected)} · ${t('discounts')}: ${money(s.discounts)}</p>
    <section class="card"><h2>${t('by_category')}</h2>${table([{ label: t('category'), key: 'category' }, { label: t('qty'), cls: 'num', html: x => num(x.qty) },
      { label: t('gross_sales'), cls: 'num', html: x => money(x.sales) }, { label: t('profit'), cls: 'num', html: x => money(x.profit) }], r.categories)}</section>
    <section class="card"><h2>${t('transactions')}</h2>${table([{ label: t('invoice_no'), key: 'invoice_no' }, { label: t('date_time'), key: 'time' },
      { label: t('customer'), key: 'customer' }, { label: t('total'), cls: 'num', html: x => money(x.total) },
      { label: t('paid'), cls: 'num', html: x => money(x.cash_paid) }, { label: t('due'), cls: 'num', html: x => money(x.credit_amount) },
      { label: t('salesperson'), key: 'salesperson' }], r.transactions)}</section>`;
}

function monthlyHtml(r) {
  const p = r.pnl, c = r.credit;
  return `${reportHead(`${t('monthly_report')} — ${r.month}`)}
    <div class="stats">${stat(t('transactions'), num(p.transactions))}${stat(t('revenue'), money(p.revenue))}
      ${stat(t('cost_of_goods'), money(p.cost_of_goods))}${stat(t('gross_profit'), money(p.gross_profit))}${stat(t('discounts'), money(p.discounts))}</div>
    <div class="grid2">
      <section class="card"><h2>${t('credit_overview')}</h2><dl class="kv">
        <dt>${t('credit_owed')}</dt><dd>${money(c.extended)}</dd><dt>${t('credit_paid')}</dt><dd>${money(c.paid)}</dd>
        <dt>${t('credit_outstanding')}</dt><dd class="bad-text">${money(c.outstanding_total)}</dd></dl></section>
      <section class="card"><h2>${t('by_category')}</h2>${table([{ label: t('category'), key: 'category' }, { label: t('qty'), cls: 'num', html: x => num(x.qty) },
        { label: t('revenue'), cls: 'num', html: x => money(x.sales) }, { label: t('profit'), cls: 'num', html: x => money(x.profit) }], r.categories)}</section>
    </div>
    <section class="card"><h2>${t('stock_flow')} <small class="muted">(${t('sold')} + ${t('written_off')}: ${num(r.stock_totals.consumed)} · ${t('restocked')}: ${num(r.stock_totals.restocked)})</small></h2>
      ${table([{ label: t('id'), key: 'code' }, { label: t('product'), key: 'name' }, { label: t('category'), key: 'category' },
        { label: t('sold'), cls: 'num', html: x => num(x.sold) }, { label: t('written_off'), cls: 'num', html: x => num(x.written_off) },
        { label: t('restocked'), cls: 'num', html: x => num(x.restocked) }, { label: t('current_stock'), cls: 'num', html: x => num(x.current_stock) }], r.stock)}</section>
    <section class="card"><h2>${t('daily_breakdown')}</h2>${table([{ label: t('day'), key: 'day' }, { label: t('transactions'), cls: 'num', html: x => num(x.transactions) },
      { label: t('revenue'), cls: 'num', html: x => money(x.revenue) }, { label: t('profit'), cls: 'num', html: x => money(x.profit) }], r.daily)}</section>`;
}

// ---------------------------------------------------------------------------
// Settings (admin)
VIEWS.settings = async main => {
  const [s, users, log] = await Promise.all([api('/settings'), api('/users'), api('/audit')]);
  main.innerHTML = `<h1>${t('settings')}</h1>
    <div class="grid2">
      <form class="card" id="profile"><h2>${t('business_profile')}</h2>
        ${field(t('shop_name'), 'shop_name', s.shop_name, 'text', 'required')}
        ${field(t('address'), 'shop_address', s.shop_address)}
        ${field(t('phone'), 'shop_phone', s.shop_phone, 'tel')}
        <label class="field"><span>${t('logo')}</span><input type="file" accept="image/*" id="logoFile"></label>
        <div class="row">${s.shop_logo ? `<img src="${esc(s.shop_logo)}" class="logo-prev" alt="">` : ''}</div>
        <div class="grid2">${field(t('default_margin'), 'default_margin', s.default_margin, 'number', 'min="0" step="0.1"')}
        ${field(t('retention'), 'retention_days', s.retention_days, 'number', 'min="1" step="1"')}</div>
        <button class="btn primary">${t('save')}</button></form>
      <section class="card"><div class="row between"><h2>${t('users')}</h2><button class="btn primary" id="addUser">＋ ${t('add_user')}</button></div>
        ${table([{ label: t('name'), html: u => `${esc(u.name)}<br><small class="muted">${esc(u.username)}</small>` },
          { label: t('role'), html: u => roleName(u.role) },
          { label: t('status'), html: u => u.active ? `<span class="badge ok">${t('active')}</span>` : `<span class="badge">${t('inactive')}</span>` },
          { label: '', cls: 'actions', html: u => `<button class="btn sm" data-user="${u.id}">${t('edit')}</button>` }], users)}
        <button class="btn ghost" id="myPw">${t('change_password')}</button>
      </section>
    </div>
    <section class="card"><h2>${t('audit_log')}</h2>${table([{ label: t('date'), key: 'created_at' }, { label: t('user'), key: 'user_name' },
      { label: t('action'), key: 'action' }, { label: t('details'), html: r => `<code class="details">${esc(r.details)}</code>` }], log)}</section>`;

  let logo;
  $('#logoFile').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 500 * 1024) { toast('Max 500 KB', 'bad'); e.target.value = ''; return; }
    const r = new FileReader(); r.onload = () => { logo = r.result; }; r.readAsDataURL(f);
  };
  $('#profile').onsubmit = async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    if (logo) data.shop_logo = logo;
    try { App.settings = await api('/settings', { method: 'PUT', body: data }); toast(t('saved')); renderShell(); route(); } catch (ex) { toast(ex.message, 'bad'); }
  };
  const roles = [['salesperson', t('salesperson_role')], ['manager', t('manager')], ['admin', t('admin')]];
  const reload = () => VIEWS.settings(main);
  $('#addUser').onclick = () => modal(t('add_user'), `${field(t('name'), 'name', '', 'text', 'required')}
    ${field(t('username'), 'username', '', 'text', 'required autocapitalize="off"')}${select(t('role'), 'role', roles, 'salesperson')}
    ${field(t('password'), 'password', '', 'password', 'required minlength="6" autocomplete="new-password"')}`,
  async d => { await api('/users', { body: d }); toast(t('saved')); reload(); });
  main.querySelectorAll('[data-user]').forEach(b => b.onclick = () => {
    const u = users.find(x => x.id === +b.dataset.user);
    modal(`${t('edit')} — ${u.username}`, `${field(t('name'), 'name', u.name, 'text', 'required')}${select(t('role'), 'role', roles, u.role)}
      ${select(t('status'), 'active', [['1', t('active')], ['0', t('inactive')]], u.active ? '1' : '0')}
      ${field(`${t('new_password')} (${t('leave_blank')})`, 'password', '', 'password', 'autocomplete="new-password"')}`,
    async d => { await api(`/users/${u.id}`, { method: 'PUT', body: { ...d, active: d.active === '1' } }); toast(t('saved')); reload(); });
  });
  $('#myPw').onclick = () => modal(t('change_password'), `${field(t('current_password'), 'current', '', 'password', 'required autocomplete="current-password"')}
    ${field(t('new_password'), 'password', '', 'password', 'required minlength="6" autocomplete="new-password"')}`,
  async d => { await api('/me/password', { body: d }); toast(t('saved')); });
};

// ---------------------------------------------------------------------------
// Boot
(async function boot() {
  setLang(LANG);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  App.settings = Offline.settings();
  try {
    const { user } = await api('/me');
    App.user = user;
    return start();
  } catch (e) {
    const cached = LS.get('ims.user', null);
    if (e.status === 0 && cached) { App.user = { ...cached, offline: true }; return start(); }
  }
  try { App.settings = await api('/settings'); } catch {}
  renderLogin();
})();
