// Network layer: JSON API calls, offline catalogue cache, offline sales queue and sync.
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function api(path, opts = {}) {
  let res;
  try {
    res = await fetch('/api' + path, {
      method: opts.method || (opts.body ? 'POST' : 'GET'),
      headers: opts.body ? { 'Content-Type': 'application/json' } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, 'offline');
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/login' && path !== '/me') { window.dispatchEvent(new Event('ims:unauthorized')); }
  if (!res.ok) throw new ApiError(res.status, data.error || res.statusText);
  return data;
}

// ---- Offline support -------------------------------------------------------
// The POS keeps a copy of the product list and shop settings so sales can continue
// without internet. Sales made offline are queued and replayed through /api/sales/sync.

const Offline = {
  catalog() { return LS.get('ims.catalog', []); },
  settings() { return LS.get('ims.settings', {}); },
  queue() { return LS.get('ims.queue', []); },

  async refresh() {
    const [products, settings] = await Promise.all([api('/products'), api('/settings')]);
    LS.set('ims.catalog', products);
    LS.set('ims.settings', settings);
    return products;
  },

  // Queue a sale and update the local stock copy so the next search is accurate.
  enqueue(sale) {
    const q = this.queue();
    q.push(sale);
    LS.set('ims.queue', q);
    const cat = this.catalog();
    for (const it of sale.items) {
      const p = cat.find(x => x.id === it.product_id);
      if (p) p.stock_qty -= it.qty;
    }
    LS.set('ims.catalog', cat);
    window.dispatchEvent(new Event('ims:queue'));
  },

  syncing: false,
  async sync() {
    const q = this.queue();
    if (!q.length || this.syncing || !navigator.onLine) return null;
    this.syncing = true;
    try {
      const { results } = await api('/sales/sync', { body: { sales: q } });
      const done = new Set(results.filter(r => r.ok).map(r => r.client_uuid));
      const failed = results.filter(r => !r.ok);
      // Keep only failed ones; record server invoice numbers for synced ones.
      const map = LS.get('ims.syncedMap', {});
      results.filter(r => r.ok).forEach(r => { map[r.client_uuid] = { id: r.id, invoice_no: r.invoice_no }; });
      LS.set('ims.syncedMap', map);
      LS.set('ims.queue', this.queue().filter(s => !done.has(s.client_uuid)).map(s => {
        const f = failed.find(x => x.client_uuid === s.client_uuid);
        return f ? { ...s, sync_error: f.error } : s;
      }));
      window.dispatchEvent(new Event('ims:queue'));
      if (done.size) this.refresh().catch(() => {});
      return { synced: done.size, failed: failed.length };
    } finally {
      this.syncing = false;
    }
  },
};

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

window.addEventListener('online', () => Offline.sync().catch(() => {}));
setInterval(() => Offline.sync().catch(() => {}), 60 * 1000);
