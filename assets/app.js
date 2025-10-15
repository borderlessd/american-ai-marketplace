/* assets/app.js — Safe version that only adjusts labels and text layout */

function formatPrice(v) {
  const n = Number(v || 0);
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(n);
  } catch {
    return `$${(Math.round(n) || 0).toString()}`;
  }
}

function uc(x) {
  return String(x || '').trim().toUpperCase();
}

async function getLoads() {
  const url = `/assets/loads.json?v=${Date.now()}`;
  const res = await fetch(url, { cache: 'no-store', credentials: 'omit' });
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  const arr = await res.json();
  if (!Array.isArray(arr)) return [];

  return arr.map(r => ({
    id: r.id ?? r.load_number ?? '',
    from_city: r.from_city ?? r.from ?? r.origin ?? r.pickup_city ?? '',
    to_city: r.to_city ?? r.to ?? r.destination ?? r.dropoff_city ?? '',
    date: r.date ?? r.availableDate ?? r.available ?? r.pickupDate ?? '',
    item: r.item ?? r.vehicle ?? '',
    miles: Number(r.miles ?? 0) || 0,
    price: Number(r.price ?? r.amount ?? r.rate ?? 0) || 0,
    status: String(r.status ?? 'open'),
    notes: r.notes ?? '',
    commodity: r.commodity ?? r.item ?? r.vehicle ?? ''
  }));
}

function renderLoads(loads) {
  const container =
    document.querySelector('#loads-list') ||
    document.querySelector('.loads-list') ||
    document.querySelector('#loads') ||
    document.body;

  if (!loads.length) {
    container.innerHTML = `<div class="empty">No loads available.</div>`;
    return;
  }

  const html = loads
    .map(l => {
      return `
      <div class="load-card">
        <div class="route">
          ${l.from_city || '—'} → ${l.to_city || '—'}
          <span class="status">${uc(l.status)}</span>
        </div>
        <div class="meta">Item: ${l.item || '—'}</div>
        <div class="meta">Miles: ${l.miles || '—'}</div>
        <div class="meta">First Available Date: ${l.date || '—'}</div>
        <div class="price">Price: ${formatPrice(l.price)}</div>
      </div>
      `;
    })
    .join('');

  container.innerHTML = html;
}

(async function init() {
  try {
    const loads = await getLoads();
    renderLoads(loads);
    window.LOADS = loads;
  } catch (err) {
    console.error('Failed to load/render loads:', err);
    const container =
      document.querySelector('#loads-list') ||
      document.querySelector('.loads-list') ||
      document.body;
    const div = document.createElement('div');
    div.className = 'error';
    div.textContent = 'Error loading loads.';
    container.appendChild(div);
  }
})();
