/* assets/app.js — FULL REPLACE
   - Fetches /assets/loads.json with cache-busting
   - Renders cards using THEME KEYS: from_city, to_city, date, item, miles, price, status, notes, commodity
   - Price label shown in the SAME styled element (same font/size/weight)
   - Miles and Available split into separate lines; Available renamed to "First Available Date"
   - Optional sort by commodity if a <select id="sort-commodity"> exists
*/

/* =========================
   Helper functions
   ========================= */
function formatPrice(v) {
  const n = Number(v || 0);
  // Basic USD formatter; adjust if your theme has a utility
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
  } catch {
    return `$${(Math.round(n) || 0).toString()}`;
  }
}

function uc(x) {
  const s = String(x || '').trim();
  return s ? s.toUpperCase() : '';
}

/* =========================
   Fetch & normalize
   ========================= */
async function getLoads() {
  const url = `/assets/loads.json?v=${Date.now()}`; // cache-bust so Sheet edits show promptly
  const res = await fetch(url, { credentials: 'omit', cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  const arr = await res.json();
  if (!Array.isArray(arr)) return [];
  // Ensure required keys exist; fallbacks are conservative
  return arr.map((r) => ({
    id: r.id ?? r.load_number ?? '',
    from_city: r.from_city ?? r.from ?? r.origin ?? r.pickup_city ?? '',
    to_city: r.to_city ?? r.to ?? r.destination ?? r.dropoff_city ?? '',
    date: r.date ?? r.availableDate ?? r.available ?? r.pickupDate ?? r.ready ?? '',
    item: r.item ?? r.vehicle ?? '',
    miles: Number(r.miles ?? 0) || 0,
    price: Number(r.price ?? r.amount ?? r.rate ?? 0) || 0,
    status: String(r.status ?? 'open'),
    notes: r.notes ?? '',
    commodity: r.commodity ?? r.item ?? r.vehicle ?? ''
  }));
}

/* =========================
   Render
   ========================= */
function renderLoads(loads) {
  // Pick a reasonable container; prefer existing IDs/classes if present
  let container =
    document.querySelector('#loads-list') ||
    document.querySelector('.loads-list') ||
    document.querySelector('#list') ||
    document.querySelector('#loads') ||
    document.querySelector('.cards');

  if (!container) {
    // As a safety net, create a basic container so users see content
    container = document.createElement('div');
    container.id = 'loads-list';
    document.body.appendChild(container);
  }

  if (!loads.length) {
    container.innerHTML = `<div class="empty">No loads available.</div>`;
    return;
  }

  // Build the HTML for each card
  const html = loads
    .map((l) => {
      const routeLine = `
        <div class="route">
          ${l.from_city || '—'} → ${l.to_city || '—'}
          <span class="status">${uc(l.status)}</span>
        </div>
      `;

      // Price label INSIDE the same element so it inherits the exact theme font/styles
      const priceLine = `
        <div class="price">Price: ${formatPrice(l.price)}</div>
      `;

      // Split Miles / Available into two lines; rename Available
      const metaBlock = `
        <div class="meta">Miles: ${Number.isFinite(l.miles) ? l.miles : '—'}</div>
        <div class="meta">First Available Date: ${l.date || '—'}</div>
      `;

      // Optional commodity chip/line if your theme uses it (harmless if not styled)
      const commodityLine = l.commodity
        ? `<div class="meta">Commodity: ${l.commodity}</div>`
        : '';

      // Optional action buttons if your theme uses them; keep class hooks generic
      const actions = `
        <div class="actions">
          <a class="btn view" href="#" data-id="${l.id}">View</a>
          <a class="btn bid" href="#" data-id="${l.id}">Bid</a>
        </div>
      `;

      // Optional item line (you already show Item: SUV in your UI)
      const itemLine = `<div class="meta">Item: ${l.item || '—'}</div>`;

      return `
        <div class="load-card">
          ${routeLine}
          ${priceLine}
          ${itemLine}
          ${metaBlock}
          ${commodityLine}
          ${actions}
        </div>
      `;
    })
    .join('');

  container.innerHTML = html;
}

/* =========================
   Optional: sort by commodity
   If you have <select id="sort-commodity"> with options:
     - "" (no sort)
     - "asc"
     - "desc"
   This will sort current list by l.commodity (then re-render)
   ========================= */
function attachCommoditySort(allLoads) {
  const el = document.getElementById('sort-commodity');
  if (!el) return;
  const doRender = (dir) => {
    const copy = [...allLoads];
    if (dir === 'asc') copy.sort((a, b) => String(a.commodity).localeCompare(String(b.commodity)));
    if (dir === 'desc') copy.sort((a, b) => String(b.commodity).localeCompare(String(a.commodity)));
    renderLoads(copy);
  };
  el.addEventListener('change', () => doRender(el.value || ''));
}

/* =========================
   Init
   ========================= */
(async function init() {
  try {
    const loads = await getLoads();
    renderLoads(loads);
    attachCommoditySort(loads);

    // Expose for quick console inspection if needed
    window.LOADS = loads;
    // console.table(loads[0]); // uncomment to verify keys
  } catch (err) {
    console.error('Failed to load/render loads:', err);
    const container = document.querySelector('#loads-list') || document.querySelector('.loads-list') || document.body;
    const div = document.createElement('div');
    div.className = 'error';
    div.textContent = 'Error loading loads.';
    container.appendChild(div);
  }
})();

