/* assets/app.js — FULL REPLACE (safe & complete)
   - Fetches /assets/loads.json with cache-busting
   - Renders cards with your theme classes (load-card, route, meta, price, status, actions)
   - Labels: Item, Miles, First Available Date, Price
   - Loader overlay (lightweight, never traps)
   - Pagination + page-size (10/25/50/100)
   - Toolbar positioned to the RIGHT of #sort-commodity (if present)
*/

/* =========================
   Helpers
   ========================= */
function formatPrice(v) {
  const n = Number(v || 0);
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
  } catch {
    return `$${(Math.round(n) || 0).toString()}`;
  }
}
function UC(x) { return String(x || '').trim().toUpperCase(); }
const $  = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

/* =========================
   Data (normalize to theme keys)
   ========================= */
async function fetchLoads() {
  const url = `/assets/loads.json?v=${Date.now()}`; // cache-bust so Sheet edits show fast
  const res = await fetch(url, { cache: 'no-store', credentials: 'omit' });
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  const arr = await res.json();
  if (!Array.isArray(arr)) return [];
  return arr.map(r => ({
    id:        r.id ?? r.load_number ?? '',
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

/* =========================
   Rendering
   ========================= */
function getContainer() {
  return $('#loads-list') || $('.loads-list') || $('#loads') || $('.cards') || document.body;
}

function renderLoads(loads) {
  const container = getContainer();
  if (!loads.length) {
    container.innerHTML = `<div class="empty">No loads available.</div>`;
    return;
  }

  const html = loads.map(l => `
    <div class="load-card">
      <div class="route">
        ${l.from_city || '—'} → ${l.to_city || '—'}
        <span class="status">${UC(l.status)}</span>
      </div>
      <div class="meta">Item: ${l.item || '—'}</div>
      <div class="meta">Miles: ${Number.isFinite(l.miles) ? l.miles : '—'}</div>
      <div class="meta">First Available Date: ${l.date || '—'}</div>
      <div class="price">Price: ${formatPrice(l.price)}</div>
      <div class="actions">
        <a class="btn view" href="#" data-id="${l.id}">View</a>
        <a class="btn bid" href="#" data-id="${l.id}">Bid</a>
      </div>
    </div>
  `).join('');

  container.innerHTML = html;
}

/* =========================
   Loader (lightweight; never traps)
   ========================= */
const LOADER_ID = 'loads-loader-overlay';
function showLoader() {
  if (document.getElementById(LOADER_ID)) return;
  const d = document.createElement('div');
  d.id = LOADER_ID;
  d.style.cssText = `
    position:fixed; inset:0; background:rgba(0,0,0,.35);
    display:flex; align-items:center; justify-content:center;
    z-index:99999; font-family:inherit;
  `;
  d.innerHTML = `
    <div style="background:#fff; padding:14px 18px; border-radius:8px; box-shadow:0 4px 20px rgba(0,0,0,.25); min-width:240px; text-align:center;">
      <div style="font-weight:600; margin-bottom:6px;">Loading loads…</div>
      <div style="font-size:12px; opacity:.8;">This can take a moment</div>
    </div>`;
  document.body.appendChild(d);
}
function hideLoader() {
  const d = document.getElementById(LOADER_ID);
  if (d && d.parentNode) d.parentNode.removeChild(d);
}

/* =========================
   Pagination + Page-size
   ========================= */
const PAGER_ID  = 'loads-pager-toolbar';
const HOLDER_ID = 'loads-pager-holder';
const state = { page: 1, pageSize: 25, total: 0 };

function findCards() {
  let nodes = $$('.load-card', getContainer());
  if (nodes.length) return nodes;
  nodes = $$('.card', getContainer());
  if (nodes.length) return nodes;
  return $$('.listing, .entry, .item', getContainer());
}

function buildToolbarAboveList() {
  if (document.getElementById(PAGER_ID)) return document.getElementById(PAGER_ID);

  const bar = document.createElement('div');
  bar.id = PAGER_ID;
  bar.style.cssText = `
    display:flex; gap:10px; align-items:center; justify-content:space-between;
    padding:8px 0; margin-bottom:8px; font-family:inherit;
  `;
  const left = document.createElement('div');
  left.innerHTML = `
    <label style="font-size:14px; margin-right:6px;">Show per page:</label>
    <select id="loads-pp" style="font:inherit; padding:4px 6px;">
      <option value="10">10</option>
      <option value="25" selected>25</option>
      <option value="50">50</option>
      <option value="100">100</option>
    </select>
  `;
  const right = document.createElement('div');
  right.innerHTML = `
    <button id="loads-prev" style="font:inherit; padding:4px 8px;">Prev</button>
    <span id="loads-pageinfo" style="margin:0 8px; font-size:14px;">Page 1 / 1</span>
    <button id="loads-next" style="font:inherit; padding:4px 8px;">Next</button>
  `;
  bar.appendChild(left);
  bar.appendChild(right);

  // Insert just above the list (default position; we’ll move it next to sort if found)
  const container = getContainer();
  const parent = container.parentNode || document.body;
  parent.insertBefore(bar, container);
  return bar;
}

function moveToolbarNextToSort() {
  const sort = document.getElementById('sort-commodity') ||
               document.querySelector('.commodity-sort, [data-role="commodity-sort"], select[name="commodity"]');
  const bar  = document.getElementById(PAGER_ID);
  if (!sort || !bar) return false;

  // Use the sort's nearest row-like parent (or its parent)
  const row = sort.closest('.filters, .toolbar, .header, .controls, .filter-row') || sort.parentElement;
  if (!row) return false;

  // Make it a flex row (inline style only; we don’t touch your CSS files)
  const prev = row.getAttribute('style') || '';
  if (!/display\s*:\s*flex/i.test(prev)) {
    row.style.display    = 'flex';
    row.style.alignItems = row.style.alignItems || 'center';
    row.style.gap        = row.style.gap || '10px';
    row.style.flexWrap   = row.style.flexWrap || 'wrap';
  }

  // Create a right-aligned holder and move bar into it
  let holder = document.getElementById(HOLDER_ID);
  if (!holder) {
    holder = document.createElement('div');
    holder.id = HOLDER_ID;
    holder.style.display = 'flex';
    holder.style.alignItems = 'center';
    holder.style.gap = '10px';
    holder.style.marginLeft = 'auto'; // push to right
    row.appendChild(holder);
  }
  if (!holder.contains(bar)) holder.appendChild(bar);

  // Compact bar in header context
  bar.style.margin = '0';
  bar.style.display = 'flex';
  bar.style.alignItems = 'center';
  bar.style.gap = '10px';
  const label = bar.querySelector('label');
  const ppSel = bar.querySelector('#loads-pp');
  if (label) label.style.marginRight = '6px';
  if (ppSel) { ppSel.style.minWidth = '64px'; ppSel.style.padding = '4px 6px'; }

  return true;
}

function updatePageInfo() {
  const info = document.getElementById('loads-pageinfo');
  if (!info) return;
  const lastPage = Math.max(1, Math.ceil(state.total / state.pageSize));
  if (state.page > lastPage) state.page = lastPage;
  info.textContent = `Page ${state.page} / ${lastPage}`;
  const prev = document.getElementById('loads-prev');
  const next = document.getElementById('loads-next');
  if (prev) prev.disabled = (state.page <= 1);
  if (next) next.disabled = (state.page >= lastPage);
}

function applyPagination() {
  const cards = findCards();
  state.total = cards.length;
  const start = (state.page - 1) * state.pageSize;
  const end   = start + state.pageSize;
  cards.forEach((el, i) => {
    el.style.display = (i >= start && i < end) ? '' : 'none';
  });
  updatePageInfo();
}

function wirePagerEvents() {
  const pp = document.getElementById('loads-pp');
  const prev = document.getElementById('loads-prev');
  const next = document.getElementById('loads-next');
  if (pp && !pp.__wired) {
    pp.__wired = true;
    pp.addEventListener('change', () => {
      state.pageSize = parseInt(pp.value, 10) || 25;
      state.page = 1;
      applyPagination();
    });
  }
  if (prev && !prev.__wired) {
    prev.__wired = true;
    prev.addEventListener('click', () => {
      if (state.page > 1) {
        state.page--;
        applyPagination();
        getContainer().scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }
  if (next && !next.__wired) {
    next.__wired = true;
    next.addEventListener('click', () => {
      const lastPage = Math.max(1, Math.ceil(state.total / state.pageSize));
      if (state.page < lastPage) {
        state.page++;
        applyPagination();
        getContainer().scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }
}

/* =========================
   Init
   ========================= */
(async function init() {
  try {
    showLoader();

    // Fetch & render
    const loads = await fetchLoads();
    renderLoads(loads);

    // Expose for quick diagnose
    window.LOADS = loads;

    // Build toolbar and place it near the sort (if present)
    buildToolbarAboveList();
    moveToolbarNextToSort();
    wirePagerEvents();

    // First pagination pass
    state.page = 1;
    applyPagination();

    // Hide loader when cards exist (or after a hard timeout)
    const start = Date.now();
    const timer = setInterval(() => {
      if (findCards().length || Date.now() - start > 8000) {
        hideLoader();
        clearInterval(timer);
      }
    }, 200);

    // If the list re-renders later, watch ONLY the list container (low overhead)
    const container = getContainer();
    const mo = new MutationObserver(() => {
      // Re-apply pagination if count changes (debounced)
      clearTimeout(init._t);
      init._t = setTimeout(() => {
        const before = state.total;
        const after  = findCards().length;
        if (after !== before) {
          state.page = Math.min(state.page, Math.max(1, Math.ceil(after / state.pageSize)));
          applyPagination();
        }
        // Ensure toolbar is still beside sort (if DOM moved)
        moveToolbarNextToSort();
      }, 120);
    });
    mo.observe(container, { childList: true, subtree: true });

  } catch (err) {
    hideLoader();
    console.error('Failed to load/render loads:', err);
    const container = getContainer();
    const div = document.createElement('div');
    div.className = 'error';
    div.textContent = 'Error loading loads.';
    container.appendChild(div);
  }
})();