// Single-page app: hash routes → view functions that render into #main.
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const RANK = { salesperson: 1, manager: 2, admin: 3 };
const can = min => App.user && RANK[App.user.role] >= RANK[min];
const today = () => new Date().toLocaleDateString('en-CA');
const r2 = n => Math.round((+n || 0) * 100) / 100;

const App = { user: null, settings: {}, brands: [], categories: [], products: [] };

// Compact taka for chart axes: 1.2K, 3.4L (lakh), 1.1Cr (crore).
function compact(n) {
  n = +n || 0;
  const s = n >= 1e7 ? (n / 1e7).toFixed(1) + 'Cr' : n >= 1e5 ? (n / 1e5).toFixed(1) + 'L' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(Math.round(n));
  return '৳' + (LANG === 'bn' ? toBn(s.replace('.0', '')) : s.replace('.0', ''));
}

// ---------------------------------------------------------------------------
// Theme (light / dark, follows the system until chosen)
function applyTheme(t) {
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
}
applyTheme(LS.get('ims.theme', null));
const isDark = () => (document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';

// ---------------------------------------------------------------------------
// UI helpers
function toast(msg, kind = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `${icon(kind === 'bad' ? 'alert' : 'check')}<span>${esc(msg)}</span>`;
  $('#toasts').appendChild(el);
  setTimeout(() => el.classList.add('out'), 3600);
  setTimeout(() => el.remove(), 4000);
}

function modal(title, bodyHtml, onSubmit, { submitLabel = t('save'), wide = false } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-back';
  wrap.innerHTML = `<form class="modal ${wide ? 'wide' : ''}" novalidate>
    <div class="modal-head"><h2>${esc(title)}</h2><button type="button" class="btn icon ghost" data-close aria-label="${t('cancel')}">${icon('x')}</button></div>
    <div class="modal-body">${bodyHtml}</div>
    <p class="err" hidden></p>
    <div class="modal-foot">${onSubmit ? `<button type="button" class="btn ghost" data-close>${t('cancel')}</button>
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
    const err = $('.err', form), btn = $('.modal-foot .primary', form);
    err.hidden = true; btn.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(form));
      if ((await onSubmit(data, form)) !== false) close();
    } catch (ex) { err.textContent = ex.message === 'offline' ? t('offline') : ex.message; err.hidden = false; }
    finally { btn.disabled = false; }
  });
  setTimeout(() => $('.modal-body input, .modal-body select', form)?.focus(), 30);
  return form;
}

const field = (label, name, value = '', type = 'text', extra = '') =>
  `<label class="field"><span>${esc(label)}</span><input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
const select = (label, name, options, value, extra = '') =>
  `<label class="field"><span>${esc(label)}</span><select name="${name}" ${extra}>${options.map(([v, l]) =>
    `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;

function table(cols, rows, empty = t('none')) {
  if (!rows.length) return `<div class="empty">${icon('box')}<p>${esc(empty)}</p></div>`;
  return `<div class="table-wrap"><table><thead><tr>${cols.map(c => `<th class="${c.cls || ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr class="${r._cls || ''}">${cols.map(c => {
      const v = c.html ? c.html(r) : esc(r[c.key]);
      return `<td class="${c.cls || ''}">${(c.cls || '').includes('actions') ? `<div class="row-actions">${v}</div>` : v}</td>`;
    }).join('')}</tr>`).join('')}</tbody></table></div>`;
}

const pageHead = (title, actions = '', sub = '') =>
  `<div class="page-head"><div><h1>${esc(title)}</h1>${sub ? `<p class="muted">${sub}</p>` : ''}</div><div class="head-actions no-print">${actions}</div></div>`;

const stat = (label, value, ic, { tone = 'brand', foot = '' } = {}) =>
  `<div class="stat card tone-${tone}"><div class="stat-ic">${icon(ic)}</div><div><span>${esc(label)}</span><strong>${value}</strong>${foot ? `<small>${foot}</small>` : ''}</div></div>`;

function download(url) {
  const a = document.createElement('a');
  a.href = url; a.download = ''; document.body.appendChild(a); a.click(); a.remove();
}

const roleName = r => ({ admin: t('admin'), manager: t('manager'), salesperson: t('salesperson_role') }[r] || r);
const initials = name => String(name || '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
const fmtDate = s => { const d = new Date(String(s).replace(' ', 'T')); return isNaN(d) ? s : d.toLocaleDateString(LANG === 'bn' ? 'bn-BD' : 'en-GB', { day: 'numeric', month: 'short' }); };
const fmtDateTime = s => { const d = new Date(String(s).replace(' ', 'T')); return isNaN(d) ? s : d.toLocaleString(LANG === 'bn' ? 'bn-BD' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };

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
  const s = App.settings;
  $('#app').innerHTML = `<div class="login-wrap">
    <section class="login-hero">
      <div class="brand-mark lg">${s.shop_logo ? `<img src="${esc(s.shop_logo)}" alt="">` : '৳'}</div>
      <h2>${esc(s.shop_name || t('app_name'))}</h2>
      <p>${t('tagline')}</p>
      <ul>
        <li>${icon('pos')} ${t('pos')}</li><li>${icon('inventory')} ${t('inventory')}</li>
        <li>${icon('reports')} ${t('reports')}</li><li>${icon('wifiOff')} ${t('offline')} POS</li>
      </ul>
    </section>
    <form class="login card" id="loginForm">
      <h1>${t('welcome')}</h1>
      <p class="muted">${t('sign_in_hint')}</p>
      ${message ? `<p class="notice">${esc(message)}</p>` : ''}
      ${field(t('username'), 'username', '', 'text', 'autocomplete="username" required autocapitalize="off"')}
      ${field(t('password'), 'password', '', 'password', 'autocomplete="current-password" required')}
      <p class="err" hidden></p>
      <button class="btn primary block lg">${icon('lock')} ${t('login')}</button>
      <button type="button" class="btn ghost block" data-lang>${icon('globe')} ${t('language')}</button>
    </form></div>`;
  $('[data-lang]').onclick = () => { setLang(LANG === 'bn' ? 'en' : 'bn'); renderLogin(message); };
  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const { username, password } = Object.fromEntries(new FormData(e.target));
    const err = $('.err', e.target), btn = $('button.primary', e.target);
    err.hidden = true; btn.disabled = true;
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
    } finally { btn.disabled = false; }
  });
}

// ---------------------------------------------------------------------------
// Shell
const NAV = [
  ['dashboard', 'manager'], ['pos', 'salesperson'], ['sales', 'salesperson'], ['inventory', 'manager'],
  ['customers', 'manager'], ['reports', 'manager'], ['categories', 'admin'], ['settings', 'admin'],
];

function renderShell() {
  document.body.className = '';
  const s = App.settings;
  $('#app').innerHTML = `
    <aside class="sidebar no-print" id="sidebar">
      <div class="side-brand">
        <div class="brand-mark">${s.shop_logo ? `<img src="${esc(s.shop_logo)}" alt="">` : '৳'}</div>
        <div><strong>${esc(s.shop_name || t('app_name'))}</strong><small>${t('tagline')}</small></div>
      </div>
      <nav>${NAV.filter(([, r]) => can(r)).map(([k]) => `<a href="#/${k}" data-nav="${k}">${icon(k)}<span>${t(k)}</span></a>`).join('')}</nav>
      <div class="side-user">
        <div class="avatar">${esc(initials(App.user.name))}</div>
        <div class="who"><strong>${esc(App.user.name)}</strong><small>${roleName(App.user.role)}</small></div>
        <button class="btn icon ghost" id="logoutBtn" title="${t('logout')}" aria-label="${t('logout')}">${icon('logout')}</button>
      </div>
    </aside>
    <div class="scrim no-print" id="scrim"></div>
    <header class="topbar no-print">
      <button class="btn icon ghost" id="menuBtn" aria-label="Menu">${icon('menu')}</button>
      <div class="crumb" id="crumb"></div>
      <div class="spacer"></div>
      <button id="netStatus" class="pill"></button>
      <button class="btn icon ghost" id="themeBtn" title="${t('theme')}" aria-label="${t('theme')}">${icon(isDark() ? 'sun' : 'moon')}</button>
      <button class="btn ghost sm" id="langBtn">${icon('globe')} ${t('language')}</button>
    </header>
    <main id="main"></main>`;
  const closeMenu = () => document.body.classList.remove('menu-open');
  $('#menuBtn').onclick = () => document.body.classList.toggle('menu-open');
  $('#scrim').onclick = closeMenu;
  $('#langBtn').onclick = () => { setLang(LANG === 'bn' ? 'en' : 'bn'); renderShell(); route(); };
  $('#themeBtn').onclick = () => { const next = isDark() ? 'light' : 'dark'; LS.set('ims.theme', next); applyTheme(next); $('#themeBtn').innerHTML = icon(isDark() ? 'sun' : 'moon'); route(); };
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
  el.innerHTML = `${icon(navigator.onLine ? 'wifi' : 'wifiOff')}<span>${navigator.onLine ? t('online') : t('offline')}${q ? ` · ${num(q)} ${t('pending_sync')}` : ''}</span>`;
  el.title = q ? t('sync_now') : '';
}
window.addEventListener('online', updateNet);
window.addEventListener('offline', updateNet);
window.addEventListener('ims:queue', updateNet);

function applyBootstrap(d) {
  App.settings = d.settings; App.brands = d.brands; App.categories = d.categories; App.products = d.products;
}
async function loadLookups() {
  try { applyBootstrap(await Offline.refresh()); } catch { /* offline: keep cached copies */ }
}

// Each navigation gets a token; work finishing after the user has moved on is ignored
// instead of writing into (or erroring on) a page that is no longer on screen.
let routeToken = 0;
const isCurrent = tok => tok === routeToken;

const VIEWS = {};
function route() {
  const [, name = '', arg] = location.hash.split('/');
  const def = can('manager') ? 'dashboard' : 'pos';
  const entry = NAV.find(n => n[0] === name);
  const view = name === 'invoice' ? 'invoice' : entry && can(entry[1]) ? name : def;
  if (view !== name && name !== 'invoice') { location.hash = '#/' + view; return; }
  $$('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === view));
  document.body.classList.remove('menu-open');
  $('#crumb').textContent = view === 'invoice' ? t('invoice') : t(view);
  const tok = ++routeToken;
  const main = $('#main');
  main.className = 'view-' + view;
  main.innerHTML = `<div class="loading"><span class="spinner"></span>${t('loading')}</div>`;
  main.onclick = main.onsubmit = main.oninput = main.onchange = null;
  Promise.resolve(VIEWS[view](main, arg, tok)).catch(e => {
    if (!isCurrent(tok)) return;
    main.innerHTML = `<div class="empty">${icon('alert')}<p class="err">${esc(e.message === 'offline' ? t('offline') : e.message)}</p></div>`;
  });
}
window.addEventListener('hashchange', () => App.user && route());

async function start() {
  LS.set('ims.user', App.user);
  lastActivity = Date.now();
  const cached = Offline.lookups();
  App.settings = Offline.settings(); App.brands = cached.brands; App.categories = cached.categories; App.products = Offline.catalog();
  await loadLookups();
  Offline.sync().catch(() => {});
  renderShell();
  route();
}

// ---------------------------------------------------------------------------
// Charts (inline SVG, colours from CSS variables so they follow the theme)
function barChart(series) {
  const W = 720, H = 240, L = 52, B = 26, T = 12, R = 8;
  const max = Math.max(1, ...series.map(s => s.revenue));
  const step = (W - L - R) / series.length, bw = Math.max(4, step * 0.62);
  const y = v => T + (H - T - B) * (1 - v / max);
  const grid = [0, 0.25, 0.5, 0.75, 1].map(f => `<line x1="${L}" x2="${W - R}" y1="${y(max * f)}" y2="${y(max * f)}" class="grid"/>
    <text x="${L - 8}" y="${y(max * f) + 4}" class="axis" text-anchor="end">${compact(max * f)}</text>`).join('');
  const bars = series.map((s, i) => {
    const x = L + i * step + (step - bw) / 2;
    return `<g class="bar-g"><rect x="${x}" y="${y(s.revenue)}" width="${bw}" height="${Math.max(0, H - B - y(s.revenue))}" rx="3" class="bar"/>
      <title>${fmtDate(s.day)} — ${t('revenue')}: ${money(s.revenue)} · ${t('profit')}: ${money(s.profit)} · ${num(s.n)} ${t('transactions').toLowerCase()}</title>
      ${i % 5 === 4 || i === series.length - 1 ? `<text x="${x + bw / 2}" y="${H - 6}" class="axis" text-anchor="middle">${fmtDate(s.day)}</text>` : ''}</g>`;
  }).join('');
  const line = series.map((s, i) => `${L + i * step + step / 2},${y(Math.max(0, s.profit))}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${t('sales_trend')}">${grid}${bars}
    <polyline points="${line}" class="line"/></svg>
    <div class="legend"><span><i class="sw sw-bar"></i>${t('revenue')}</span><span><i class="sw sw-line"></i>${t('profit')}</span></div>`;
}

function donut(items) {
  const total = items.reduce((s, x) => s + x.revenue, 0) || 1;
  const top = items.slice(0, 5);
  const other = items.slice(5).reduce((s, x) => s + x.revenue, 0);
  if (other) top.push({ category: LANG === 'bn' ? 'অন্যান্য' : 'Other', revenue: other });
  const C = 2 * Math.PI * 52;
  let off = 0;
  const segs = top.map((x, i) => {
    const len = C * x.revenue / total;
    const s = `<circle r="52" cx="70" cy="70" class="dseg c${i + 1}" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}"><title>${esc(x.category)}: ${money(x.revenue)}</title></circle>`;
    off += len;
    return s;
  }).join('');
  return `<div class="donut-wrap"><svg viewBox="0 0 140 140" class="donut">${segs}
      <text x="70" y="66" text-anchor="middle" class="donut-k">${compact(total)}</text><text x="70" y="84" text-anchor="middle" class="axis">${t('last_30')}</text></svg>
    <ul class="donut-legend">${top.map((x, i) => `<li><i class="sw c${i + 1}"></i><span>${esc(x.category)}</span><b>${num(Math.round(x.revenue / total * 100))}%</b></li>`).join('')}</ul></div>`;
}

// ---------------------------------------------------------------------------
// Dashboard
VIEWS.dashboard = async (main, _, tok) => {
  const d = await api('/reports/dashboard');
  if (!isCurrent(tok)) return;
  const tdy = d.today;
  const change = tdy.yesterday ? Math.round((tdy.gross - tdy.yesterday) / tdy.yesterday * 100) : null;
  const trend = change == null ? '' : `<span class="trend ${change >= 0 ? 'up' : 'down'}">${icon(change >= 0 ? 'trendUp' : 'trendDown')}${num(Math.abs(change))}%</span> ${t('vs_yesterday')}`;
  const maxTop = Math.max(1, ...d.top.map(x => x.revenue));
  main.innerHTML = `${pageHead(t('dashboard'), `<a class="btn primary" href="#/pos">${icon('plus')} ${t('new_sale')}</a>`,
      new Date().toLocaleDateString(LANG === 'bn' ? 'bn-BD' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}
    <div class="stats">
      ${stat(t('gross_sales'), money(tdy.gross), 'receipt', { foot: trend || `${num(tdy.transactions)} ${t('transactions').toLowerCase()}` })}
      ${stat(t('profit'), money(tdy.profit), 'trendUp', { tone: 'green', foot: `${num(tdy.transactions)} ${t('transactions').toLowerCase()}` })}
      ${stat(t('cash_collected'), money(tdy.cash), 'coins', { tone: 'amber', foot: `${t('credit_extended')}: ${money(tdy.credit)}` })}
      ${stat(t('this_month'), money(d.month.revenue), 'reports', { tone: 'violet', foot: `${t('profit')}: ${money(d.month.profit)}` })}
      ${stat(t('dues_total'), money(d.dues.total), 'wallet', { tone: 'red', foot: `${num(d.dues.customers)} ${t('customers_owing')}` })}
    </div>
    <div class="grid-dash">
      <section class="card chart-card"><div class="card-head"><h2>${t('sales_trend')}</h2><span class="muted small">${t('last_30')}</span></div>${barChart(d.series)}</section>
      <section class="card"><div class="card-head"><h2>${t('by_category')}</h2></div>${d.categories.length ? donut(d.categories) : `<div class="empty">${icon('box')}<p>${t('none')}</p></div>`}</section>
      <section class="card"><div class="card-head"><h2>${t('top_products')}</h2><span class="muted small">${t('last_30')}</span></div>
        ${d.top.length ? `<ul class="rank">${d.top.map((x, i) => `<li><span class="rank-n">${num(i + 1)}</span><div><b>${esc(x.name)}</b>
          <div class="meter"><i style="width:${Math.round(x.revenue / maxTop * 100)}%"></i></div></div><span class="num">${money(x.revenue)}<small>${num(x.qty)} ${t('sold').toLowerCase()}</small></span></li>`).join('')}</ul>`
          : `<div class="empty">${icon('box')}<p>${t('none')}</p></div>`}</section>
      <section class="card"><div class="card-head"><h2>${t('low_stock')} <span class="badge bad">${num(d.low.length)}</span></h2><a href="#/inventory" class="small">${t('see_all')}</a></div>
        ${d.low.length ? `<ul class="list">${d.low.map(p => `<li><div><b>${esc(p.name)}</b><small>${esc(p.code)} · ${esc(p.category)}</small></div>
          <span class="badge ${p.stock_qty <= 0 ? 'bad' : 'warn'}">${num(p.stock_qty)} / ${num(p.threshold)}</span></li>`).join('')}</ul>`
          : `<div class="empty">${icon('check')}<p>${t('none')}</p></div>`}</section>
      <section class="card wide"><div class="card-head"><h2>${t('recent_sales')}</h2><a href="#/sales" class="small">${t('see_all')}</a></div>
        ${table([{ label: t('invoice_no'), html: r => `<a href="#/invoice/${r.id}">${esc(r.invoice_no)}</a>` }, { label: t('date_time'), html: r => fmtDateTime(r.created_at) },
          { label: t('customer'), key: 'customer' }, { label: t('total'), cls: 'num', html: r => money(r.total) },
          { label: t('status'), html: r => r.credit_amount > 0 ? `<span class="badge warn">${t('due')}</span>` : `<span class="badge ok">${t('paid')}</span>` }], d.recent)}</section>
    </div>`;
};

// ---------------------------------------------------------------------------
// POS
const POS = { cart: [], cat: '' };

VIEWS.pos = async (main, _, tok) => {
  if (navigator.onLine) await loadLookups();
  if (!isCurrent(tok)) return;
  const products = App.products.length ? App.products : Offline.catalog();
  const settings = App.settings;
  const canDisc = can('manager');
  const cats = App.categories.filter(c => products.some(p => p.category_id === c.id));

  main.innerHTML = `<div class="pos">
    <section class="pos-left">
      <div class="search-box">${icon('search')}<input id="pSearch" placeholder="${t('search_product')}" autocomplete="off" type="search"></div>
      <div class="chips" id="chips"><button class="chip ${POS.cat ? '' : 'on'}" data-cat="">${t('all_categories')}</button>${cats.map(c =>
        `<button class="chip ${POS.cat === String(c.id) ? 'on' : ''}" data-cat="${c.id}">${esc(c.name)}</button>`).join('')}</div>
      <div class="tiles" id="tiles"></div>
    </section>
    <form class="pos-right card" id="checkout" novalidate>
      <div class="card-head"><h2>${icon('pos')} ${t('cart')} <span class="badge" id="cartCount"></span></h2>
        <button type="button" class="btn ghost sm" id="clearCart">${icon('trash')} ${t('clear')}</button></div>
      <div id="cart" class="cart"></div>
      <details class="cust" open><summary>${icon('user')} ${t('customer')}</summary>
        ${field(t('phone'), 'phone', '', 'tel', 'required id="cPhone" inputmode="tel" autocomplete="off"')}
        <p id="cDue" class="small bad-text"></p>
        <div class="grid2">${field(t('customer_name'), 'name', '', 'text', 'required')}${field(t('address'), 'address', '', 'text', 'required')}</div>
      </details>
      <div class="seg block">
        <label><input type="radio" name="payment_type" value="cash" checked> ${icon('coins')} ${t('cash')}</label>
        <label><input type="radio" name="payment_type" value="credit"> ${icon('credit')} ${t('credit')}</label>
      </div>
      <div class="grid2">
        ${canDisc ? field(t('bill_discount'), 'extra_discount', '', 'text', `placeholder="${t('discount_hint')}" id="billDisc" autocomplete="off"`) : ''}
        ${field(t('amount_paid'), 'cash_paid', '', 'number', 'min="0" step="0.01" inputmode="decimal" id="cPaid"')}
      </div>
      <div class="totals" id="totals"></div>
      <p class="err" hidden></p>
      <button class="btn primary block lg" id="confirmBtn">${icon('check')} ${t('confirm_sale')}</button>
    </form></div>`;

  const search = $('#pSearch');
  const matches = () => {
    const q = search.value.trim().toLowerCase();
    return products.filter(p => (q || !POS.cat || String(p.category_id) === POS.cat) && (!q || p.name.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q) || (p.model_code || '').toLowerCase().includes(q) || String(p.id) === q || (p.brand || '').toLowerCase().includes(q)));
  };
  const inCart = id => POS.cart.filter(c => c.product_id === id).reduce((s, c) => s + c.qty, 0);
  const renderTiles = () => {
    const list = matches().slice(0, 60);
    $('#tiles').innerHTML = list.length ? list.map(p => {
      const left = p.stock_qty - inCart(p.id);
      return `<button type="button" class="tile ${left <= 0 ? 'out' : ''}" data-id="${p.id}">
        <span class="tile-top"><span class="tile-cat">${esc(p.category)}</span>${inCart(p.id) ? `<span class="badge brand">${num(inCart(p.id))}</span>` : ''}</span>
        <b>${esc(p.name)}</b><small>${esc(p.brand || '')} · ${esc(p.code)}${p.model_code ? ' · ' + esc(p.model_code) : ''}</small>
        <span class="tile-foot"><span class="price">${money(p.sale_price)}</span>
        <span class="stock ${left <= 0 ? 'bad' : left <= p.threshold ? 'warn' : ''}">${left <= 0 ? t('out_of_stock') : `${num(left)} ${t('in_stock')}`}</span></span></button>`;
    }).join('') : `<div class="empty">${icon('search')}<p>${t('none')}</p></div>`;
  };

  const parseDiscount = (raw, gross) => {
    raw = String(raw || '').trim();
    if (!raw) return 0;
    const v = parseFloat(raw);
    if (!(v >= 0)) throw new Error(t('discount') + '?');
    const d = raw.endsWith('%') ? gross * v / 100 : v;
    if (d > gross) throw new Error(`${t('discount')} > ${money(gross)}`);
    return r2(d);
  };

  const addProduct = p => {
    if (!p) return;
    const line = POS.cart.find(c => c.product_id === p.id);
    if (navigator.onLine && inCart(p.id) + 1 > p.stock_qty) return toast(`${p.name}: ${num(p.stock_qty)} ${t('in_stock')}`, 'bad');
    if (line) line.qty++;
    else POS.cart.push({ product_id: p.id, name: p.name, code: p.code, qty: 1, unit_price: p.sale_price, discountRaw: '', discount: 0 });
    renderCart(); renderTiles();
  };

  $('#chips').onclick = e => {
    const b = e.target.closest('[data-cat]'); if (!b) return;
    POS.cat = b.dataset.cat;
    $$('.chip', $('#chips')).forEach(c => c.classList.toggle('on', c === b));
    renderTiles();
  };
  search.addEventListener('input', renderTiles);
  search.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); const m = matches(); if (m.length) { addProduct(m[0]); search.select(); } }
  });
  $('#tiles').onclick = e => { const b = e.target.closest('.tile'); if (b) addProduct(products.find(p => p.id === +b.dataset.id)); };

  const totals = () => {
    const subtotal = r2(POS.cart.reduce((s, c) => s + c.unit_price * c.qty, 0));
    const lineDisc = r2(POS.cart.reduce((s, c) => s + c.discount, 0));
    let bill = 0, billErr = '';
    try { bill = canDisc ? parseDiscount($('#billDisc')?.value, subtotal - lineDisc) : 0; } catch (e) { billErr = e.message; }
    return { subtotal, lineDisc, bill, billErr, discount: r2(lineDisc + bill), total: r2(subtotal - lineDisc - bill) };
  };

  const renderTotals = () => {
    const tt = totals();
    const form = $('#checkout');
    const type = form.payment_type.value;
    const paid = form.cash_paid.value === '' ? tt.total : +form.cash_paid.value;
    form.cash_paid.placeholder = tt.total.toFixed(2);
    $('#totals').innerHTML = `
      <div><span>${t('subtotal')}</span><span>${money(tt.subtotal)}</span></div>
      ${tt.discount ? `<div class="disc"><span>${t('discount')}</span><span>− ${money(tt.discount)}</span></div>` : ''}
      ${tt.billErr ? `<div class="bad-text"><span>${esc(tt.billErr)}</span></div>` : ''}
      <div class="grand"><span>${t('grand_total')}</span><span>${money(tt.total)}</span></div>
      ${type === 'cash' && paid > tt.total ? `<div><span>${t('change')}</span><span>${money(paid - tt.total)}</span></div>` : ''}
      ${type === 'credit' ? `<div class="bad-text"><span>${t('outstanding')}</span><span>${money(Math.max(0, tt.total - paid))}</span></div>` : ''}`;
    const n = POS.cart.reduce((s, c) => s + c.qty, 0);
    $('#cartCount').textContent = n ? num(n) : '';
  };

  const renderCart = () => {
    $('#cart').innerHTML = POS.cart.length ? POS.cart.map((c, i) => `<div class="line">
      <div class="line-main"><b>${esc(c.name)}</b><small>${esc(c.code)} · ${money(c.unit_price)}</small>
        ${canDisc ? `<input class="line-disc" data-disc="${i}" value="${esc(c.discountRaw)}" placeholder="${t('discount')}: 500 / 10%" autocomplete="off">` : ''}</div>
      <div class="stepper"><button type="button" data-dec="${i}" aria-label="−">${icon('minus')}</button>
        <input data-qty="${i}" value="${c.qty}" inputmode="numeric" aria-label="${t('qty')}"><button type="button" data-inc="${i}" aria-label="+">${icon('plus')}</button></div>
      <div class="line-total">${c.discount ? `<s>${money(c.unit_price * c.qty)}</s>` : ''}<b>${money(c.unit_price * c.qty - c.discount)}</b></div>
      <button type="button" class="btn icon ghost rm" data-rm="${i}" aria-label="${t('delete')}">${icon('x')}</button></div>`).join('')
      : `<div class="empty small">${icon('pos')}<p>${t('cart_empty')}<br><span class="muted">${t('add_more')}</span></p></div>`;
    renderTotals();
  };

  const setQty = (i, q) => {
    const c = POS.cart[i]; const p = products.find(x => x.id === c.product_id);
    q = Math.max(1, parseInt(q, 10) || 1);
    if (navigator.onLine && p && q > p.stock_qty) { toast(`${p.name}: ${num(p.stock_qty)} ${t('in_stock')}`, 'bad'); q = p.stock_qty; }
    c.qty = q;
    try { c.discount = parseDiscount(c.discountRaw, c.unit_price * c.qty); } catch { c.discount = 0; }
  };
  $('#cart').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.rm) POS.cart.splice(+b.dataset.rm, 1);
    if (b.dataset.inc) setQty(+b.dataset.inc, POS.cart[+b.dataset.inc].qty + 1);
    if (b.dataset.dec) setQty(+b.dataset.dec, POS.cart[+b.dataset.dec].qty - 1);
    renderCart(); renderTiles();
  });
  $('#cart').addEventListener('change', e => {
    if (e.target.dataset.qty) { setQty(+e.target.dataset.qty, e.target.value); renderCart(); renderTiles(); }
    if (e.target.dataset.disc) {
      const c = POS.cart[+e.target.dataset.disc];
      try { c.discount = parseDiscount(e.target.value, c.unit_price * c.qty); c.discountRaw = e.target.value; }
      catch (ex) { toast(ex.message, 'bad'); c.discount = 0; c.discountRaw = ''; }
      renderCart();
    }
  });
  $('#clearCart').onclick = () => { POS.cart = []; renderCart(); renderTiles(); };
  // Enter inside a field applies it instead of submitting the sale.
  $('#checkout').addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); e.target.blur(); }
  });
  $('#checkout').addEventListener('input', e => { if (!e.target.closest('#cart')) renderTotals(); });
  renderTiles(); renderCart();
  search.focus();

  // Autofill returning customers by phone.
  $('#cPhone').addEventListener('change', async e => {
    const c = await api('/customers/lookup?phone=' + encodeURIComponent(e.target.value)).catch(() => null);
    const f = $('#checkout'); if (!f) return;
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
    if (!data.name.trim() || !data.address.trim() || !data.phone.trim()) { $('details.cust', f).open = true; return fail(`${t('customer_name')}, ${t('address')}, ${t('phone')}`); }
    const tt = totals();
    if (tt.billErr) return fail(tt.billErr);
    const offlineRef = 'OFFLINE-' + uuid().slice(0, 8).toUpperCase();
    const sale = {
      client_uuid: uuid(),
      customer: { name: data.name.trim(), address: data.address.trim(), phone: data.phone.trim() },
      items: POS.cart.map(c => ({ product_id: c.product_id, qty: c.qty, discount: c.discount, unit_price: c.unit_price })),
      extra_discount: tt.bill,
      payment_type: data.payment_type,
      cash_paid: data.cash_paid === '' ? tt.total : Math.min(+data.cash_paid, data.payment_type === 'cash' ? Infinity : tt.total),
    };
    if (sale.payment_type === 'cash' && sale.cash_paid < tt.total) return fail(t('amount_paid') + ' < ' + money(tt.total));
    btn.disabled = true;
    try {
      const r = await api('/sales', { body: sale });
      POS.cart = [];
      loadLookups();
      location.hash = '#/invoice/' + r.id;
    } catch (ex) {
      if (ex.status === 0 || (ex.status === 401 && App.user.offline)) {
        // Offline: queue it and print a provisional invoice from local data.
        Offline.enqueue({ ...sale, offline_ref: offlineRef, offline_at: new Date().toISOString(),
          _local: { cart: POS.cart.map(c => ({ ...c })), totals: tt, user: App.user.name, settings } });
        POS.cart = [];
        location.hash = '#/invoice/local-' + sale.client_uuid;
      } else fail(ex.message);
    } finally { btn.disabled = false; }
  });
};

// ---------------------------------------------------------------------------
// Invoice (printable)
VIEWS.invoice = async (main, id, tok) => {
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
    // Spread the bill discount over the lines the same way the server will.
    const base = L.cart.reduce((s, c) => s + c.unit_price * c.qty - c.discount, 0);
    let left = L.totals.bill || 0;
    items = L.cart.map((c, i, a) => {
      const share = i === a.length - 1 ? left : r2((L.totals.bill || 0) * (c.unit_price * c.qty - c.discount) / (base || 1));
      left = r2(left - share);
      const discount = r2(c.discount + share);
      return { product_name: c.name, qty: c.qty, unit_price: c.unit_price, discount, line_total: r2(c.unit_price * c.qty - discount) };
    });
    sale = { invoice_no: q.offline_ref || 'OFFLINE', created_at: new Date(q.offline_at).toLocaleString('en-GB'),
      customer_name: q.customer.name, customer_address: q.customer.address, customer_phone: q.customer.phone,
      subtotal: L.totals.subtotal, discount_total: L.totals.discount, total: L.totals.total, cash_paid: paid,
      outstanding: L.totals.total - paid, payment_type: q.payment_type, salesperson: L.user };
  } else {
    ({ sale, items, shop } = await api('/sales/' + id));
  }
  if (!isCurrent(tok)) return;
  main.innerHTML = `
    <div class="page-head no-print"><div><h1>${t('invoice')}</h1></div><div class="head-actions"><button class="btn primary" id="printBtn">${icon('print')} ${t('print')}</button>
      <a class="btn" href="#/pos">${icon('plus')} ${t('new_sale')}</a></div></div>
    ${provisional ? `<p class="notice no-print">${icon('wifiOff')} ${t('provisional')}</p>` : ''}
    <article class="invoice card">
      <header>
        <div class="inv-shop">${shop.logo ? `<img src="${esc(shop.logo)}" alt="" class="inv-logo">` : '<div class="brand-mark">৳</div>'}
          <div><h2>${esc(shop.name)}</h2><p>${esc(shop.address)}<br>${esc(shop.phone)}</p></div></div>
        <div class="inv-meta"><h1>${t('invoice')}</h1>
          <p><b>${t('invoice_no')}:</b> ${esc(sale.invoice_no)}<br>
          ${sale.offline_ref ? `<b>${t('offline_ref')}:</b> ${esc(sale.offline_ref)}<br>` : ''}
          <b>${t('date_time')}:</b> ${esc(sale.created_at)}<br><b>${t('salesperson')}:</b> ${esc(sale.salesperson)}</p></div>
      </header>
      <section class="inv-cust"><span class="muted small">${t('customer')}</span><b>${esc(sale.customer_name)}</b>${esc(sale.customer_address)}<br>${esc(sale.customer_phone)}</section>
      <table class="inv-items"><thead><tr><th>#</th><th>${t('product')}</th><th class="num">${t('qty')}</th><th class="num">${t('unit_price')}</th>
        <th class="num">${t('discount')}</th><th class="num">${t('line_total')}</th></tr></thead>
        <tbody>${items.map((it, i) => `<tr><td>${num(i + 1)}</td><td>${esc(it.product_name)}</td><td class="num">${num(it.qty)}</td>
          <td class="num">${money(it.unit_price)}</td><td class="num">${it.discount ? money(it.discount) : '—'}</td><td class="num">${money(it.line_total)}</td></tr>`).join('')}</tbody></table>
      <div class="inv-totals">
        <div><span>${t('subtotal')}</span><span>${money(sale.subtotal)}</span></div>
        <div><span>${t('discount')}</span><span>− ${money(sale.discount_total)}</span></div>
        <div class="grand"><span>${t('grand_total')}</span><span>${money(sale.total)}</span></div>
        <div><span>${t('amount_paid')}</span><span>${money(sale.cash_paid)}</span></div>
        <div class="${sale.outstanding > 0 ? 'bad-text' : ''}"><span>${t('outstanding')}</span><span>${money(sale.outstanding)}</span></div>
        <div><span>${t('payment_mode')}</span><span>${sale.payment_type === 'cash' ? t('cash') : t('credit')}</span></div>
      </div>
      <footer>${t('thanks')}</footer>
    </article>`;
  $('#printBtn').onclick = () => window.print();
};

// ---------------------------------------------------------------------------
// Inventory
VIEWS.inventory = async (main, _, tok) => {
  const state = { q: '', category_id: '', brand_id: '', low: '' };
  main.innerHTML = `${pageHead(t('inventory'), `<button class="btn" data-exp="xlsx">${icon('download')} ${t('export_xlsx')}</button>
      <button class="btn" data-exp="csv">${icon('download')} ${t('export_csv')}</button>
      <button class="btn" id="printInv">${icon('print')} ${t('print')}</button><button class="btn primary" id="addProd">${icon('plus')} ${t('add_product')}</button>`)}
    <div class="filters card no-print">
      <div class="search-box sm">${icon('search')}<input id="fQ" placeholder="${t('search')}…" type="search"></div>
      <select id="fCat"><option value="">${t('category')}: ${t('all')}</option>${App.categories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
      <select id="fBrand"><option value="">${t('brand')}: ${t('all')}</option>${App.brands.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
      <label class="check"><input type="checkbox" id="fLow"> ${t('low_stock')}</label>
    </div>
    <div class="card flush" id="invTable"></div>`;

  let rows = [];
  const load = async () => {
    const qs = new URLSearchParams(Object.entries(state).filter(([, v]) => v)).toString();
    const data = await api('/products?' + qs);
    if (!isCurrent(tok)) return;
    rows = data;
    rows.forEach(r => { if (r.stock_qty <= r.threshold) r._cls = 'low'; });
    $('#invTable').innerHTML = table([
      { label: t('name'), html: r => `<b>${esc(r.name)}</b><small class="muted block">${esc(r.brand || '')}${r.model_code ? ' · ' + esc(r.model_code) : ''}</small>` },
      { label: t('id'), html: r => `<code>${esc(r.code)}</code>` }, { label: t('category'), key: 'category' },
      { label: t('stock_qty'), cls: 'num', html: r => `<span class="badge ${r.stock_qty <= 0 ? 'bad' : r.stock_qty <= r.threshold ? 'warn' : 'ok'}">${num(r.stock_qty)}</span>` },
      { label: t('purchase_price'), cls: 'num', html: r => money(r.purchase_price) },
      { label: t('sale_price'), cls: 'num', html: r => `<b>${money(r.sale_price)}</b>` },
      { label: '', cls: 'actions no-print', html: r => `<button class="btn sm ghost" data-edit="${r.id}" title="${t('edit')}">${icon('edit')}</button>
        <button class="btn sm" data-adj="${r.id}">± ${t('stock')}</button><button class="btn sm ghost" data-hist="${r.id}" title="${t('history')}">${icon('history')}</button>` },
    ], rows);
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
    const p = rows.find(r => r.id === +(b.dataset.edit || b.dataset.adj || b.dataset.hist));
    if (b.dataset.edit) productForm(p, load);
    if (b.dataset.adj) adjustForm(p, load);
    if (b.dataset.hist) historyView(p);
  });
  await load();
};

function productForm(p, done) {
  const margin = +App.settings.default_margin || 0;
  const form = modal(p ? `${t('edit')} — ${p.code}` : t('add_product'), `
    <div class="grid2">${select(t('brand'), 'brand_id', [['', '—'], ...App.brands.map(b => [b.id, b.name])], p?.brand_id)}
    ${select(t('category'), 'category_id', App.categories.map(c => [c.id, c.name]), p?.category_id)}</div>
    ${field(t('product_name'), 'name', p?.name, 'text', 'required')}
    ${field(t('model_code'), 'model_code', p?.model_code || '', 'text', 'maxlength="60"')}
    <div class="grid2">
      ${field(t('purchase_price') + ' (৳)', 'purchase_price', p?.purchase_price ?? '', 'number', 'min="0" step="0.01" required')}
      ${field(t('sale_price') + ' (৳)', 'sale_price', p?.sale_price ?? '', 'number', 'min="0" step="0.01" required')}
    </div>
    <p class="hint" id="marginNote">${p ? '' : `${t('margin_hint')}: ${num(margin)}%`}</p>
    <div class="grid2">
      ${p ? '' : field(t('stock_qty'), 'stock_qty', 0, 'number', 'min="0" step="1"')}
      ${field(t('threshold'), 'threshold', p?.threshold ?? 5, 'number', 'min="0" step="1"')}
    </div>`, async data => {
    await api(p ? `/products/${p.id}` : '/products', { method: p ? 'PUT' : 'POST', body: data });
    toast(t('saved'));
    loadLookups();
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
    <p class="notice">${t('stock')}: <b>${num(p.stock_qty)}</b></p>
    ${select(t('action'), 'type', [['restock', t('restock')], ['adjustment', t('adjustment')]], 'restock')}
    ${field(t('qty_change'), 'qty', '', 'number', 'step="1" required')}
    ${field(t('reason'), 'reason', '', 'text', 'required maxlength="250"')}`, async data => {
    if (!data.reason.trim()) throw new Error(t('reason'));
    await api(`/products/${p.id}/adjust`, { body: data });
    toast(t('saved'));
    loadLookups();
    done();
  });
}

async function historyView(p) {
  const rows = await api(`/products/${p.id}/movements`);
  modal(`${t('history')} — ${p.name}`, table([
    { label: t('date'), html: r => fmtDateTime(r.created_at) }, { label: t('action'), html: r => `<span class="badge">${esc(r.type)}</span>` },
    { label: t('qty'), cls: 'num', html: r => `<b class="${r.change_qty > 0 ? 'ok-text' : 'bad-text'}">${r.change_qty > 0 ? '+' : ''}${num(r.change_qty)}</b>` },
    { label: t('reason'), key: 'reason' }, { label: t('user'), key: 'user_name' }], rows), null, { wide: true });
}

// ---------------------------------------------------------------------------
// Brands & categories (admin)
VIEWS.categories = async (main, _, tok) => {
  let data;
  const render = async () => {
    const [brands, cats] = await Promise.all([api('/brands?all=1'), api('/categories?all=1')]);
    if (!isCurrent(tok)) return;
    data = { brands, categories: cats };
    main.innerHTML = `${pageHead(t('categories'))}<div class="grid2">${[['brands', t('brands'), brands], ['categories', t('categories').split(' & ').pop(), cats]].map(([kind, title, rows]) => `
      <section class="card flush"><div class="card-head pad"><h2>${esc(title)} <span class="badge">${num(rows.length)}</span></h2>
        <form class="inline-add" data-add="${kind}"><input name="name" placeholder="${t('name')}" required><button class="btn primary sm">${icon('plus')} ${t('add')}</button></form></div>
        ${table([{ label: t('name'), html: r => `<b>${esc(r.name)}</b>` }, { label: t('products'), cls: 'num', html: r => num(r.product_count) },
          { label: t('status'), html: r => r.active ? `<span class="badge ok">${t('active')}</span>` : `<span class="badge">${t('inactive')}</span>` },
          { label: '', cls: 'actions', html: r => `<button class="btn sm ghost" data-ed="${kind}:${r.id}" title="${t('edit')}">${icon('edit')}</button>
            <button class="btn sm ghost" data-tog="${kind}:${r.id}">${r.active ? t('deactivate') : t('activate')}</button>
            ${r.product_count ? '' : `<button class="btn sm ghost danger" data-del="${kind}:${r.id}" title="${t('delete')}">${icon('trash')}</button>`}` }], rows)}
      </section>`).join('')}</div>`;
  };
  main.onsubmit = async e => {
    const kind = e.target.dataset.add; if (!kind) return;
    e.preventDefault();
    try { await api('/' + kind, { body: { name: e.target.name.value } }); await loadLookups(); render(); } catch (ex) { toast(ex.message, 'bad'); }
  };
  main.onclick = async e => {
    const b = e.target.closest('button[data-ed],button[data-tog],button[data-del]'); if (!b) return;
    const [kind, id] = (b.dataset.ed || b.dataset.tog || b.dataset.del).split(':');
    const row = data[kind].find(r => r.id === +id);
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
VIEWS.customers = async (main, _, tok) => {
  const state = { q: '', owing: '1' };
  main.innerHTML = `${pageHead(t('customers'))}
    <div class="filters card"><div class="search-box sm">${icon('search')}<input id="cq" type="search" placeholder="${t('search')}… (${t('name')} / ${t('phone')})"></div>
      <label class="check"><input type="checkbox" id="cOwing" checked> ${t('owing_only')}</label></div><div class="card flush" id="cTable"></div>`;
  let rows = [];
  const load = async () => {
    const data = await api('/customers?' + new URLSearchParams(Object.entries(state).filter(([, v]) => v)));
    if (!isCurrent(tok)) return;
    rows = data;
    $('#cTable').innerHTML = table([
      { label: t('name'), html: r => `<div class="person"><span class="avatar sm">${esc(initials(r.name))}</span><div><b>${esc(r.name)}</b><small class="muted block">${esc(r.phone)}</small></div></div>` },
      { label: t('address'), key: 'address' },
      { label: t('due'), cls: 'num', html: r => r.credit_balance > 0 ? `<b class="bad-text">${money(r.credit_balance)}</b>` : `<span class="muted">${money(0)}</span>` },
      { label: '', cls: 'actions', html: r => `<button class="btn sm ghost" data-view="${r.id}">${t('view')}</button>
        ${r.credit_balance > 0 ? `<button class="btn sm primary" data-pay="${r.id}">${icon('coins')} ${t('record_payment')}</button>` : ''}` }], rows);
  };
  let timer;
  $('#cq').oninput = e => { clearTimeout(timer); timer = setTimeout(() => { state.q = e.target.value; load(); }, 250); };
  $('#cOwing').onchange = e => { state.owing = e.target.checked ? '1' : ''; load(); };
  $('#cTable').onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    const c = rows.find(r => r.id === +(b.dataset.view || b.dataset.pay));
    if (b.dataset.pay) {
      modal(`${t('record_payment')} — ${c.name}`, `<p class="notice">${t('due')}: <b>${money(c.credit_balance)}</b></p>
        ${field(t('amount') + ' (৳)', 'amount', c.credit_balance, 'number', `min="0.01" max="${c.credit_balance}" step="0.01" required`)}`,
      async d => { await api(`/customers/${c.id}/payments`, { body: d }); toast(t('saved')); load(); });
    } else {
      const { dues, payments } = await api(`/customers/${c.id}/dues`);
      modal(`${c.name} — ${c.phone}`, `<h3>${t('unpaid_invoices')}</h3>${table([
        { label: t('invoice_no'), html: r => `<a href="#/invoice/${r.id}" data-close>${esc(r.invoice_no)}</a>` }, { label: t('date'), html: r => fmtDate(r.created_at) },
        { label: t('total'), cls: 'num', html: r => money(r.total) }, { label: t('due'), cls: 'num', html: r => `<b class="bad-text">${money(r.outstanding)}</b>` }], dues)}
        <h3>${t('payments')}</h3>${table([{ label: t('date'), html: r => fmtDateTime(r.created_at) }, { label: t('invoice_no'), key: 'invoice_no' },
        { label: t('amount'), cls: 'num', html: r => money(r.amount) }, { label: t('user'), key: 'user_name' }], payments)}`, null, { wide: true });
    }
  };
  await load();
};

// ---------------------------------------------------------------------------
// Sales history
VIEWS.sales = async (main, _, tok) => {
  const mgr = can('manager');
  const state = { q: '', from: mgr ? today() : '', to: mgr ? today() : '' };
  const queued = Offline.queue();
  main.innerHTML = `${pageHead(t('sales'), `<a class="btn primary" href="#/pos">${icon('plus')} ${t('new_sale')}</a>`)}
    ${queued.length ? `<section class="card warn"><div class="card-head"><h2>${icon('wifiOff')} ${t('offline')} · ${num(queued.length)} ${t('pending_sync')}</h2></div>
      ${table([{ label: t('invoice_no'), html: r => `<a href="#/invoice/local-${r.client_uuid}">${esc(r.offline_ref || 'OFFLINE')}</a>` },
        { label: t('date'), html: r => esc(new Date(r.offline_at).toLocaleString('en-GB')) }, { label: t('customer'), html: r => esc(r.customer.name) },
        { label: t('total'), cls: 'num', html: r => money(r._local.totals.total) }, { label: '', html: r => r.sync_error ? `<span class="bad-text">${esc(r.sync_error)}</span>` : '' }], queued)}</section>` : ''}
    ${mgr ? `<div class="filters card"><div class="search-box sm">${icon('search')}<input id="sq" type="search" placeholder="${t('search')}… (${t('invoice_no')} / ${t('customer')} / ${t('phone')})"></div>
      <label class="field inline"><span>${t('from')}</span><input type="date" id="sFrom" value="${state.from}"></label>
      <label class="field inline"><span>${t('to')}</span><input type="date" id="sTo" value="${state.to}"></label></div>` : ''}
    <div class="card flush" id="sTable"></div>`;
  const load = async () => {
    const rows = await api('/sales?' + new URLSearchParams(Object.entries(state).filter(([, v]) => v)));
    if (!isCurrent(tok)) return;
    $('#sTable').innerHTML = table([
      { label: t('invoice_no'), html: r => `<a href="#/invoice/${r.id}"><b>${esc(r.invoice_no)}</b></a>${r.offline_ref ? `<small class="muted block">${esc(r.offline_ref)}</small>` : ''}` },
      { label: t('date_time'), html: r => fmtDateTime(r.created_at) }, { label: t('customer'), html: r => `${esc(r.customer)}<small class="muted block">${esc(r.phone)}</small>` },
      { label: t('total'), cls: 'num', html: r => `<b>${money(r.total)}</b>` }, { label: t('paid'), cls: 'num', html: r => money(r.cash_paid) },
      { label: t('due'), cls: 'num', html: r => r.credit_amount ? `<span class="badge warn">${money(r.credit_amount)}</span>` : '—' },
      { label: t('salesperson'), key: 'salesperson' }], rows);
  };
  if (mgr) {
    let timer;
    $('#sq').oninput = e => { clearTimeout(timer); timer = setTimeout(() => { state.q = e.target.value; load(); }, 250); };
    $('#sFrom').onchange = e => { state.from = e.target.value; load(); };
    $('#sTo').onchange = e => { state.to = e.target.value; load(); };
  }
  await load().catch(e => { if (e.status === 0 && isCurrent(tok)) $('#sTable').innerHTML = `<div class="empty">${icon('wifiOff')}<p>${t('offline')}</p></div>`; else throw e; });
};

// ---------------------------------------------------------------------------
// Reports
VIEWS.reports = async (main, _, tok) => {
  const st = { kind: 'daily', date: today(), month: today().slice(0, 7) };
  main.innerHTML = `${pageHead(t('reports'), `<button class="btn" data-fmt="xlsx">${icon('download')} ${t('export_xlsx')}</button>
      <button class="btn" data-fmt="csv">${icon('download')} ${t('export_csv')}</button>
      <button class="btn primary" id="rPrint">${icon('print')} ${t('print')} / PDF</button>`)}
    <div class="filters card no-print"><div class="seg"><label><input type="radio" name="kind" value="daily" checked> ${t('daily_report')}</label>
      <label><input type="radio" name="kind" value="monthly"> ${t('monthly_report')}</label></div>
      <input type="date" id="rDate" value="${st.date}"><input type="month" id="rMonth" value="${st.month}" hidden></div>
    <div id="report"></div>`;
  const param = () => st.kind === 'daily' ? `date=${st.date}` : `month=${st.month}`;
  const load = async () => {
    $('#rDate').hidden = st.kind !== 'daily'; $('#rMonth').hidden = st.kind === 'daily';
    const r = await api(`/reports/${st.kind}?${param()}`);
    if (!isCurrent(tok)) return;
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
    <div class="stats">${stat(t('transactions'), num(s.transactions), 'receipt')}${stat(t('gross_sales'), money(s.gross_sales), 'reports', { tone: 'violet' })}
      ${stat(t('cash_collected'), money(s.cash_collected), 'coins', { tone: 'amber', foot: `${t('due_collected')}: ${money(s.due_collected)}` })}
      ${stat(t('credit_extended'), money(s.credit_extended), 'credit', { tone: 'red' })}${stat(t('profit'), money(s.profit), 'trendUp', { tone: 'green', foot: `${t('discounts')}: ${money(s.discounts)}` })}</div>
    <section class="card flush"><div class="card-head pad"><h2>${t('by_category')}</h2></div>${table([{ label: t('category'), key: 'category' }, { label: t('qty'), cls: 'num', html: x => num(x.qty) },
      { label: t('gross_sales'), cls: 'num', html: x => money(x.sales) }, { label: t('profit'), cls: 'num', html: x => money(x.profit) }], r.categories)}</section>
    <section class="card flush"><div class="card-head pad"><h2>${t('transactions')}</h2></div>${table([{ label: t('invoice_no'), key: 'invoice_no' }, { label: t('date_time'), key: 'time' },
      { label: t('customer'), key: 'customer' }, { label: t('total'), cls: 'num', html: x => money(x.total) },
      { label: t('paid'), cls: 'num', html: x => money(x.cash_paid) }, { label: t('due'), cls: 'num', html: x => money(x.credit_amount) },
      { label: t('salesperson'), key: 'salesperson' }], r.transactions)}</section>`;
}

function monthlyHtml(r) {
  const p = r.pnl, c = r.credit;
  return `${reportHead(`${t('monthly_report')} — ${r.month}`)}
    <div class="stats">${stat(t('transactions'), num(p.transactions), 'receipt')}${stat(t('revenue'), money(p.revenue), 'reports', { tone: 'violet' })}
      ${stat(t('cost_of_goods'), money(p.cost_of_goods), 'box', { tone: 'amber' })}${stat(t('gross_profit'), money(p.gross_profit), 'trendUp', { tone: 'green' })}
      ${stat(t('discounts'), money(p.discounts), 'tag', { tone: 'red' })}</div>
    <div class="grid2">
      <section class="card"><div class="card-head"><h2>${t('credit_overview')}</h2></div><dl class="kv">
        <dt>${t('credit_owed')}</dt><dd>${money(c.extended)}</dd><dt>${t('credit_paid')}</dt><dd class="ok-text">${money(c.paid)}</dd>
        <dt>${t('credit_outstanding')}</dt><dd class="bad-text">${money(c.outstanding_total)}</dd></dl></section>
      <section class="card flush"><div class="card-head pad"><h2>${t('by_category')}</h2></div>${table([{ label: t('category'), key: 'category' }, { label: t('qty'), cls: 'num', html: x => num(x.qty) },
        { label: t('revenue'), cls: 'num', html: x => money(x.sales) }, { label: t('profit'), cls: 'num', html: x => money(x.profit) }], r.categories)}</section>
    </div>
    <section class="card flush"><div class="card-head pad"><h2>${t('stock_flow')}</h2><span class="muted small">${t('sold')} + ${t('written_off')}: ${num(r.stock_totals.consumed)} · ${t('restocked')}: ${num(r.stock_totals.restocked)}</span></div>
      ${table([{ label: t('id'), key: 'code' }, { label: t('product'), key: 'name' }, { label: t('category'), key: 'category' },
        { label: t('sold'), cls: 'num', html: x => num(x.sold) }, { label: t('written_off'), cls: 'num', html: x => num(x.written_off) },
        { label: t('restocked'), cls: 'num', html: x => num(x.restocked) }, { label: t('current_stock'), cls: 'num', html: x => num(x.current_stock) }], r.stock)}</section>
    <section class="card flush"><div class="card-head pad"><h2>${t('daily_breakdown')}</h2></div>${table([{ label: t('day'), key: 'day' }, { label: t('transactions'), cls: 'num', html: x => num(x.transactions) },
      { label: t('revenue'), cls: 'num', html: x => money(x.revenue) }, { label: t('profit'), cls: 'num', html: x => money(x.profit) }], r.daily)}</section>`;
}

// ---------------------------------------------------------------------------
// Settings (admin)
VIEWS.settings = async (main, _, tok) => {
  const [s, users, log] = await Promise.all([api('/settings'), api('/users'), api('/audit')]);
  if (!isCurrent(tok)) return;
  main.innerHTML = `${pageHead(t('settings'))}
    <div class="grid2">
      <form class="card" id="profile"><div class="card-head"><h2>${t('business_profile')}</h2></div>
        <div class="logo-row"><div class="brand-mark lg">${s.shop_logo ? `<img src="${esc(s.shop_logo)}" alt="">` : '৳'}</div>
          <label class="field"><span>${t('logo')}</span><input type="file" accept="image/*" id="logoFile"></label></div>
        ${field(t('shop_name'), 'shop_name', s.shop_name, 'text', 'required')}
        ${field(t('address'), 'shop_address', s.shop_address)}
        ${field(t('phone'), 'shop_phone', s.shop_phone, 'tel')}
        <div class="grid2">${field(t('default_margin'), 'default_margin', s.default_margin, 'number', 'min="0" step="0.1"')}
        ${field(t('retention'), 'retention_days', s.retention_days, 'number', 'min="1" step="1"')}</div>
        <button class="btn primary">${icon('check')} ${t('save')}</button></form>
      <div class="stack">
        <section class="card flush"><div class="card-head pad"><h2>${t('users')}</h2><button class="btn primary sm" id="addUser">${icon('plus')} ${t('add_user')}</button></div>
          ${table([{ label: t('name'), html: u => `<div class="person"><span class="avatar sm">${esc(initials(u.name))}</span><div><b>${esc(u.name)}</b><small class="muted block">${esc(u.username)}</small></div></div>` },
            { label: t('role'), html: u => `<span class="badge brand">${roleName(u.role)}</span>` },
            { label: t('status'), html: u => u.active ? `<span class="badge ok">${t('active')}</span>` : `<span class="badge">${t('inactive')}</span>` },
            { label: '', cls: 'actions', html: u => `<button class="btn sm ghost" data-user="${u.id}" title="${t('edit')}">${icon('edit')}</button>` }], users)}
          <div class="pad"><button class="btn ghost sm" id="myPw">${icon('lock')} ${t('change_password')}</button></div>
        </section>
        <section class="card demo"><div class="card-head"><h2>${icon('sparkles')} ${t('demo_data')}</h2></div>
          <p class="muted small">${t('demo_hint')}</p><button class="btn" id="demoBtn">${icon('sparkles')} ${t('load_demo')}</button></section>
      </div>
    </div>
    <section class="card flush"><div class="card-head pad"><h2>${t('audit_log')}</h2></div>${table([{ label: t('date'), html: r => fmtDateTime(r.created_at) }, { label: t('user'), key: 'user_name' },
      { label: t('action'), html: r => `<span class="badge">${esc(r.action)}</span>` }, { label: t('details'), html: r => `<code class="details">${esc(r.details)}</code>` }], log)}</section>`;

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
  const reload = () => route();
  $('#addUser').onclick = () => modal(t('add_user'), `${field(t('name'), 'name', '', 'text', 'required')}
    ${field(t('username'), 'username', '', 'text', 'required autocapitalize="off"')}${select(t('role'), 'role', roles, 'salesperson')}
    ${field(t('password'), 'password', '', 'password', 'required minlength="6" autocomplete="new-password"')}`,
  async d => { await api('/users', { body: d }); toast(t('saved')); reload(); });
  $$('[data-user]', main).forEach(b => b.onclick = () => {
    const u = users.find(x => x.id === +b.dataset.user);
    modal(`${t('edit')} — ${u.username}`, `${field(t('name'), 'name', u.name, 'text', 'required')}${select(t('role'), 'role', roles, u.role)}
      ${select(t('status'), 'active', [['1', t('active')], ['0', t('inactive')]], u.active ? '1' : '0')}
      ${field(`${t('new_password')} (${t('leave_blank')})`, 'password', '', 'password', 'autocomplete="new-password"')}`,
    async d => { await api(`/users/${u.id}`, { method: 'PUT', body: { ...d, active: d.active === '1' } }); toast(t('saved')); reload(); });
  });
  $('#myPw').onclick = () => modal(t('change_password'), `${field(t('current_password'), 'current', '', 'password', 'required autocomplete="current-password"')}
    ${field(t('new_password'), 'password', '', 'password', 'required minlength="6" autocomplete="new-password"')}`,
  async d => { await api('/me/password', { body: d }); toast(t('saved')); });
  $('#demoBtn').onclick = async e => {
    const btn = e.currentTarget;
    btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> ${t('loading')}`;
    try {
      const r = await api('/demo-data', { method: 'POST' });
      await loadLookups();
      modal(t('demo_done'), `<p>${num(r.products)} ${t('products').toLowerCase()} · ${num(r.customers)} ${t('customers').toLowerCase()} · ${num(r.sales)} ${t('sales').toLowerCase()}</p>
        ${r.users.length ? `<p><b>${t('demo_logins')}</b></p><ul class="list">${r.users.map(u => `<li><span>${roleName(u.role)}</span><code>${esc(u.username)} / ${esc(u.password)}</code></li>`).join('')}</ul>` : ''}`,
      null);
      renderShell(); location.hash = '#/dashboard'; route();
    } catch (ex) { toast(ex.message, 'bad'); btn.disabled = false; btn.innerHTML = `${icon('sparkles')} ${t('load_demo')}`; }
  };
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
  renderLogin();
})();
