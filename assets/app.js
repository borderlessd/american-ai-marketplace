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
   APPEND-ONLY: Loader + Pagination (non-destructive)
   - Keeps your existing boxes/markup/styles.
   - Shows a loading overlay until cards appear.
   - Adds page-size select (10/25/50/100) + Prev/Next.
   - Paginates by hiding/showing existing cards (no re-render).
   ========================= */

(function(){
  // ---------- helpers ----------
  function $(sel, root=document){ return root.querySelector(sel); }
  function $all(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }

  // Detect your card elements without assuming only one class name
  function findCardNodes() {
    // prioritize specific class used in your app, then fallbacks
    let nodes = $all('.load-card');
    if (nodes.length) return nodes;
    nodes = $all('.card');
    if (nodes.length) return nodes;
    nodes = $all('.listing, .entry, .item');
    return nodes;
  }

  // Try to locate your list container (parent that holds the cards)
  function findContainer() {
    return $('#loads-list') || $('.loads-list') || $('#loads') || $('.cards') || document.body;
  }

  // ---------- loader overlay ----------
  const LOADER_ID = 'loads-loader-overlay';
  function showLoader() {
    if (document.getElementById(LOADER_ID)) return;
    const d = document.createElement('div');
    d.id = LOADER_ID;
    d.setAttribute('style', `
      position: fixed; inset: 0; background: rgba(0,0,0,0.35);
      display: flex; align-items: center; justify-content: center;
      z-index: 99999; font-family: inherit;
    `);
    d.innerHTML = `
      <div style="background:#fff; padding:14px 18px; border-radius:8px; box-shadow:0 4px 20px rgba(0,0,0,.25); min-width: 240px; text-align:center;">
        <div style="font-weight:600; margin-bottom:6px;">Loading loads…</div>
        <div style="font-size:12px; opacity:.8;">This can take a moment</div>
      </div>`;
    document.body.appendChild(d);
  }
  function hideLoader() {
    const d = document.getElementById(LOADER_ID);
    if (d && d.parentNode) d.parentNode.removeChild(d);
  }

  // ---------- pagination UI ----------
  const PAGING_ID = 'loads-pager-toolbar';
  let state = {
    page: 1,
    pageSize: 25,
    total: 0
  };

  function buildToolbar(container) {
    if (document.getElementById(PAGING_ID)) return document.getElementById(PAGING_ID);
    const wrap = document.createElement('div');
    wrap.id = PAGING_ID;
    wrap.setAttribute('style', `
      display:flex; gap:10px; align-items:center; justify-content:space-between;
      padding:8px 0; margin-bottom:8px; font-family: inherit;
    `);

    const left = document.createElement('div');
    left.innerHTML = `
      <label style="font-size: 14px; margin-right:6px;">Show per page:</label>
      <select id="loads-pp" style="font: inherit; padding:4px 6px;">
        <option value="10">10</option>
        <option value="25" selected>25</option>
        <option value="50">50</option>
        <option value="100">100</option>
      </select>
    `;

    const right = document.createElement('div');
    right.innerHTML = `
      <button id="loads-prev" style="font: inherit; padding:4px 8px;">Prev</button>
      <span id="loads-pageinfo" style="margin: 0 8px; font-size: 14px;">Page 1 / 1</span>
      <button id="loads-next" style="font: inherit; padding:4px 8px;">Next</button>
    `;

    wrap.appendChild(left);
    wrap.appendChild(right);

    // Insert toolbar just before the list container
    container.parentNode.insertBefore(wrap, container);
    return wrap;
  }

  function updatePageInfo() {
    const info = document.getElementById('loads-pageinfo');
    if (!info) return;
    const lastPage = Math.max(1, Math.ceil(state.total / state.pageSize));
    const page = Math.min(state.page, lastPage);
    state.page = page;
    info.textContent = `Page ${page} / ${lastPage}`;
    const prev = document.getElementById('loads-prev');
    const next = document.getElementById('loads-next');
    if (prev) prev.disabled = (page <= 1);
    if (next) next.disabled = (page >= lastPage);
  }

  function applyPagination() {
    const cards = findCardNodes();
    state.total = cards.length;
    const start = (state.page - 1) * state.pageSize;
    const end = start + state.pageSize;

    // Hide/show cards without touching markup/CSS
    cards.forEach((el, i) => {
      el.style.display = (i >= start && i < end) ? '' : 'none';
    });

    updatePageInfo();
  }

  function attachEvents() {
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
          // scroll container into view so nav feels responsive
          findContainer().scrollIntoView({ behavior: 'smooth', block: 'start' });
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
          findContainer().scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    }
  }

  // ---------- initialization ----------
  function initWhenCardsExist() {
    const container = findContainer();
    const cards = findCardNodes();
    if (!cards.length || !container) return false;

    hideLoader(); // cards are visible now

    // Build toolbar once
    buildToolbar(container);
    attachEvents();

    // Initial pagination
    state.page = 1;
    applyPagination();

    return true;
  }

  function boot() {
    showLoader(); // show spinner immediately

    // Try immediately
    if (initWhenCardsExist()) return;

    // Watch for cards being rendered asynchronously
    const mo = new MutationObserver(() => {
      if (initWhenCardsExist()) {
        // Once initialized, we still need to re-apply if the list fully re-renders later:
        // Keep observing, but throttle.
        let t;
        new MutationObserver(() => {
          clearTimeout(t);
          t = setTimeout(() => {
            // Re-apply pagination if card count has changed
            state.page = Math.min(state.page, Math.max(1, Math.ceil(findCardNodes().length / state.pageSize)));
            applyPagination();
          }, 100);
        }).observe(findContainer(), { childList: true, subtree: true });
      }
    });

    mo.observe(document.documentElement, { childList: true, subtree: true });

    // Safety hatch: hide loader after 8s even if no cards (prevents overlay trap)
    setTimeout(hideLoader, 8000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
