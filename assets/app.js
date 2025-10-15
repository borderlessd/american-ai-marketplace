/* assets/app.js — FULL REPLACE
   Renders loads in this exact layout per card:
   Seattle → Phoenix ACTIVE
   Item: Car
   Miles: 100
   Available: 2025-10-20
   Price: $1299
*/

/* ========== helpers ========== */
function formatPrice(v) {
  const n = Number(v || 0);
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
  } catch {
    return `$${(Math.round(n) || 0).toString()}`;
  }
}
function UC(x) { return String(x || '').trim().toUpperCase(); }

/* ========== data ========== */
async function fetchLoads() {
  const url = `/assets/loads.json?v=${Date.now()}`; // cache-bust to reflect sheet changes
  const res = await fetch(url, { cache: 'no-store', credentials: 'omit' });
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  const arr = await res.json();
  if (!Array.isArray(arr)) return [];
  // Normalize to the theme keys your site uses
  return arr.map(r => ({
    id: r.id ?? r.load_number ?? '',
    from_city: r.from_city ?? r.from ?? r.origin ?? r.pickup_city ?? '',
    to_city:   r.to_city   ?? r.to   ?? r.destination ?? r.dropoff_city ?? '',
    date:      r.date ?? r.availableDate ?? r.available ?? r.pickupDate ?? r.ready ?? '',
    item:      r.item ?? r.vehicle ?? '',
    miles:     Number(r.miles ?? r.distance ?? 0) || 0,
    price:     Number(r.price ?? r.amount ?? r.rate ?? 0) || 0,
    status:    String(r.status ?? 'open'),
    notes:     r.notes ?? '',
    commodity: r.commodity ?? r.item ?? r.vehicle ?? ''
  }));
}

/* ========== render ========== */
function renderLoads(loads) {
  // Try common containers; fallback if none found
  let container =
    document.querySelector('#loads-list') ||
    document.querySelector('.loads-list') ||
    document.querySelector('#list') ||
    document.querySelector('#loads') ||
    document.querySelector('.cards');

  if (!container) {
    container = document.createElement('div');
    container.id = 'loads-list';
    document.body.appendChild(container);
  }

  if (!loads.length) {
    container.innerHTML = `<div class="empty">No loads available.</div>`;
    return;
  }

  const html = loads.map(l => {
    const route = `
      <div class="route">
        ${l.from_city || '—'} → ${l.to_city || '—'}
        <span class="status">${UC(l.status)}</span>
      </div>
    `;

    const item = `<div class="meta">Item: ${l.item || '—'}</div>`;
    const miles = `<div class="meta">Miles: ${Number.isFinite(l.miles) ? l.miles : '—'}</div>`;
    const available = `<div class="meta">Available: ${l.date || '—'}</div>`;
    // Price label stays inside .price so it inherits the same font/style as before
    const price = `<div class="price">Price: ${formatPrice(l.price)}</div>`;

    // If you need action buttons, keep them; otherwise, harmless
    const actions = `
      <div class="actions">
        <a class="btn view" href="#" data-id="${l.id}">View</a>
        <a class="btn bid" href="#" data-id="${l.id}">Bid</a>
      </div>
    `;

    return `
      <div class="load-card">
        ${route}
        ${item}
        ${miles}
        ${available}
        ${price}
        ${actions}
      </div>
    `;
  }).join('');

  container.innerHTML = html;
}

/* ========== init ========== */
(async function init() {
  try {
    const loads = await fetchLoads();
    renderLoads(loads);
    window.LOADS = loads; // handy for quick console checks
  } catch (err) {
    console.error('Failed to load/render loads:', err);
    const container = document.querySelector('#loads-list') || document.querySelector('.loads-list') || document.body;
    const div = document.createElement('div');
    div.className = 'error';
    div.textContent = 'Error loading loads.';
    container.appendChild(div);
  }
})();
