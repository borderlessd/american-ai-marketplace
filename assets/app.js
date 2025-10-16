let LOADS = [];
let TOKEN = localStorage.getItem('aim_token')||'';
const $ = (q, el=document) => el.querySelector(q);
function fmt(n){return new Intl.NumberFormat().format(n);}

async function loadData(){
  try{
    const res = await fetch('/assets/loads.json?ts=' + Date.now());
    const data = await res.json();
    LOADS = Array.isArray(data) ? data : (data.loads||[]);
  }catch(e){
    console.error('Failed to load loads.json', e);
    LOADS = [];
  }
  render(LOADS);
}

function render(list){
  const grid = $('#grid'); if(!grid) return;
  grid.innerHTML = list.map((l, idx) => `
    <article class="card">
      <div class="route">${l.from_city} → ${l.to_city} <span class="status ${l.status||'open'}">${(l.status||'open').toUpperCase()}</span></div>
      <div class="meta"><strong>Item:</strong> ${l.item}</div>
      <div class="meta"><strong>Miles:</strong> ${fmt(l.miles)} • <strong>Available:</strong> ${l.date}</div>
      <div class="price" style="margin:8px 0">${l.price||''}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn secondary" onclick="openView(${idx})">View</button>
        <button class="btn" onclick="bid()">Bid</button>
      </div>
    </article>
  `).join('');
}

function applyFilters(){
  const term = ($('#q')?.value||'').toLowerCase();
  const comm = ($('#commodity')?.value||'').toLowerCase();
  const list = LOADS.filter(l => {
    const hay = (l.item+' '+l.from_city+' '+l.to_city+' '+(l.commodity||'')).toLowerCase();
    const okQ = !term || hay.includes(term);
    const okC = !comm || (l.commodity||'').toLowerCase()===comm;
    return okQ && okC;
  });
  render(list);
}

function openView(index){
  const l = LOADS[index]; if(!l) return;
  const box = $('#viewContent');
  box.innerHTML = `
    <div class="title">${l.item}</div>
    <div class="meta" style="margin-bottom:6px"><strong>Route:</strong> ${l.from_city} → ${l.to_city}</div>
    <div class="meta"><strong>Miles:</strong> ${fmt(l.miles)}</div>
    <div class="meta"><strong>Available:</strong> ${l.date}</div>
    ${l.price ? `<div class="price" style="margin:8px 0">${l.price}</div>` : ''}
    ${l.commodity ? `<div class="meta"><strong>Commodity:</strong> ${l.commodity}</div>` : ''}
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
      <button class="btn secondary" onclick="closeView()">Close</button>
      <button class="btn" onclick="bid()">Bid</button>
    </div>
  `;
  $('#viewModal').classList.add('open');
}
function closeView(){ $('#viewModal').classList.remove('open'); }

function bid(){
  if(!TOKEN){ openAuth(); return; }
  alert('Bid submitted');
}
function openAuth(){ $('#authModal').classList.add('open'); }
function closeAuth(){ $('#authModal').classList.remove('open'); }
function signin(){
  const err = $('#authError');
  if(err){ err.textContent = 'Invalid username or password.'; }
}

document.addEventListener('DOMContentLoaded', () => {
  // Reveal Admin link only with ?admin=true
  try{
    const url = new URL(window.location.href);
    const adminFlag = url.searchParams.get('admin');
    const adminLink = document.getElementById('adminLink');
    if(adminLink){ adminLink.style.display = (adminFlag === 'true') ? 'inline' : 'none'; }
  }catch(e){}
  ['q','commodity'].forEach(id => {
    const el = document.getElementById(id);
    if(!el) return;
    el.addEventListener(el.tagName==='SELECT' ? 'change' : 'input', applyFilters);
  });
  loadData();
});

/* ---- NON-DESTRUCTIVE TEXT PATCH (append-only) ---- */
(function () {
  function splitMilesAvailableInPlace(root) {
    // Find lines like: "Miles: 100 • Available: 2025-10-20"
    // Replace with:    "Miles: 100<br>First Available Date: 2025-10-20"
    const els = root.querySelectorAll('.meta, .details, .info');
    els.forEach(el => {
      const txt = (el.textContent || '').trim();
      if (!txt) return;
      // must contain both labels and a separator (• or -)
      if (/Miles:\s*/i.test(txt) && /Available:\s*/i.test(txt) && (txt.includes('•') || / - /.test(txt))) {
        const milesMatch = txt.match(/Miles:\s*([^•\-]+)/i);
        const availMatch = txt.match(/Available:\s*(.*)$/i);
        const milesVal = milesMatch ? milesMatch[1].trim() : '';
        const availVal = availMatch ? availMatch[1].trim() : '';
        // Keep the SAME element; just swap its HTML to add a <br>
        el.innerHTML = `Miles: ${milesVal}<br>First Available Date: ${availVal}`;
      }
    });
  }

  function labelPriceInPlace(root) {
    // Prepend "Price: " INSIDE the existing .price element so it keeps the same font/size
    root.querySelectorAll('.price').forEach(el => {
      const t = (el.textContent || '').trim();
      if (!t) return;
      if (!/^price:\s*/i.test(t)) {
        // Use innerText to preserve existing styling; set once
        el.textContent = `Price: ${t}`;
      }
    });
  }

  function applyPatch() {
    const scope = document;
    splitMilesAvailableInPlace(scope);
    labelPriceInPlace(scope);
  }

  // Run when DOM is ready and a bit after (for async render)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyPatch);
  } else {
    applyPatch();
  }
  setTimeout(applyPatch, 300);
  setTimeout(applyPatch, 900);

  // If your list re-renders dynamically, re-apply on mutations
  const mo = new MutationObserver(() => applyPatch());
  mo.observe(document.body, { childList: true, subtree: true });
})();

/* =========================
   LIGHTWEIGHT Loader + Pagination (append-only, safe)
   ========================= */
(function(){
  // --- tiny helpers ---
  const $  = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  // Try your usual container/classes; fallbacks kept
  function findContainer() {
    return $('#loads-list') || $('.loads-list') || $('#loads') || $('.cards') || document.body;
  }
  function findCards() {
    let nodes = $$('.load-card');
    if (nodes.length) return nodes;
    nodes = $$('.card');
    if (nodes.length) return nodes;
    return $$('.listing, .entry, .item');
  }

  // --- overlay ---
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

  // --- pagination UI ---
  const BAR_ID = 'loads-pager-toolbar';
  const state = { page: 1, pageSize: 25, total: 0 };

  function buildToolbar(container) {
    if (document.getElementById(BAR_ID)) return;
    const wrap = document.createElement('div');
    wrap.id = BAR_ID;
    wrap.style.cssText = `
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

    wrap.appendChild(left);
    wrap.appendChild(right);
    // Insert above the list
    const parent = container.parentNode || document.body;
    parent.insertBefore(wrap, container);
  }

  function updatePageInfo() {
    const info = $('#loads-pageinfo');
    if (!info) return;
    const last = Math.max(1, Math.ceil(state.total / state.pageSize));
    if (state.page > last) state.page = last;
    info.textContent = `Page ${state.page} / ${last}`;
    const prev = $('#loads-prev'), next = $('#loads-next');
    if (prev) prev.disabled = state.page <= 1;
    if (next) next.disabled = state.page >= last;
  }

  function applyPagination() {
    const cards = findCards();
    state.total = cards.length;
    const start = (state.page - 1) * state.pageSize;
    const end   = start + state.pageSize;
    cards.forEach((el, i) => { el.style.display = (i >= start && i < end) ? '' : 'none'; });
    updatePageInfo();
  }

  function wireEvents() {
    const pp = $('#loads-pp'), prev = $('#loads-prev'), next = $('#loads-next');
    if (pp && !pp.__wired) {
      pp.__wired = true;
      pp.addEventListener('change', () => { state.pageSize = parseInt(pp.value,10) || 25; state.page = 1; applyPagination(); });
    }
    if (prev && !prev.__wired) {
      prev.__wired = true;
      prev.addEventListener('click', () => { if (state.page > 1) { state.page--; applyPagination(); findContainer().scrollIntoView({behavior:'smooth', block:'start'}); } });
    }
    if (next && !next.__wired) {
      next.__wired = true;
      next.addEventListener('click', () => {
        const last = Math.max(1, Math.ceil(state.total / state.pageSize));
        if (state.page < last) { state.page++; applyPagination(); findContainer().scrollIntoView({behavior:'smooth', block:'start'}); }
      });
    }
  }

  // --- initialize when cards exist (no heavy observers) ---
  function initOnce() {
    const container = findContainer();
    const cards = findCards();
    if (!container || !cards.length) return false;

    hideLoader();
    buildToolbar(container);
    wireEvents();
    state.page = 1;
    applyPagination();

    // Watch the container only (lightweight) for list changes
    const mo = new MutationObserver(() => {
      // Re-apply pagination if card count changes (debounced)
      clearTimeout(initOnce._t);
      initOnce._t = setTimeout(() => {
        const before = state.total;
        const after  = findCards().length;
        if (after !== before) {
          state.page = Math.min(state.page, Math.max(1, Math.ceil(after / state.pageSize)));
          applyPagination();
        }
      }, 120);
    });
    mo.observe(container, { childList: true, subtree: true });

    return true;
  }

  function boot() {
    showLoader();
    const started = Date.now();
    const MAX = 10000; // 10s hard stop
    const POLL = 200;

    const timer = setInterval(() => {
      if (initOnce()) { clearInterval(timer); return; }
      if (Date.now() - started > MAX) { clearInterval(timer); hideLoader(); /* give up gracefully */ }
    }, POLL);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();