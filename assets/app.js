um/* assets/app.js — FULL REPLACE (pagination top+bottom, loader, safe labels/lines) */

let LOADS = [];
let TOKEN = localStorage.getItem('aim_token')||'';

const $  = (q, el=document) => el.querySelector(q);
const $$ = (q, el=document) => Array.from(el.querySelectorAll(q || '*'));
function fmt(n){return new Intl.NumberFormat().format(Number(n||0));}
function fmtPrice(v){
  const n = Number(v||0);
  try {
    return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);
  } catch {
    return `$${(Math.round(n)||0)}`;
  }
}

// Pagination state
const STATE = {
  filtered: [],
  page: 1,
  pageSize: 25
};
const PER_PAGE_OPTIONS = [10,25,50,100];

// Loader overlay (lightweight, never traps)
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

async function loadData(){
  showLoader();
  try{
    const res = await fetch('/assets/loads.json?ts=' + Date.now(), {cache:'no-store', credentials:'omit'});
    const data = await res.json();
    const arr  = Array.isArray(data) ? data : (data.loads||[]);
    // Attach original index so View works after pagination
    LOADS = arr.map((l,i)=>({...l, __i:i}));
  }catch(e){
    console.error('Failed to load loads.json', e);
    LOADS = [];
  }
  // Initialize filters/pagination
  applyFilters(); // this sets STATE.filtered and triggers render
  // Safety: hide loader even if something goes sideways after 10s
  setTimeout(hideLoader, 10000);
}

function render(list){
  const grid = $('#grid'); if(!grid) return;
  // Cards (DO NOT change outer markup/classes to keep styling intact)
  grid.innerHTML = list.map((l) => `
    <article class="card">
      <div class="route">${l.from_city} → ${l.to_city} <span class="status ${l.status||'open'}">${(l.status||'open').toUpperCase()}</span></div>
      <div class="meta"><strong>Item:</strong> ${l.item ?? ''}</div>
      <div class="meta"><strong>Miles:</strong> ${fmt(l.miles)}</div>
      <div class="meta"><strong>First Available Date:</strong> ${l.date ?? ''}</div>
      <div class="price" style="margin:8px 0">Price: ${fmtPrice(l.price)}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn secondary" onclick="openView(${l.__i})">View</button>
        <button class="btn" onclick="bid()">Bid</button>
      </div>
    </article>
  `).join('');
  hideLoader();
}

/* ---------- Pagination UI (top and bottom) ---------- */
function renderPager(where /* 'top'|'bottom' */){
  const grid = $('#grid'); if(!grid) return;
  const pagerId = where === 'top' ? 'pager-top' : 'pager-bottom';
  let host = document.getElementById(pagerId);
  if (!host) {
    host = document.createElement('div');
    host.id = pagerId;
    host.style.cssText = 'display:flex;align-items:center;gap:10px;justify-content:space-between;padding:8px 0;';
    if (where === 'top') {
      grid.parentNode.insertBefore(host, grid);
    } else {
      grid.parentNode.insertBefore(host, grid.nextSibling);
    }
  }

  const total = STATE.filtered.length;
  const lastPage = Math.max(1, Math.ceil(total / STATE.pageSize));
  if (STATE.page > lastPage) STATE.page = lastPage;

  // Build controls
  const left = document.createElement('div');
  const right = document.createElement('div');

  // Page size select
  const sel = document.createElement('select');
  sel.id = `perpage-${where}`;
  sel.style.cssText = 'font:inherit;padding:4px 6px;';
  PER_PAGE_OPTIONS.forEach(v => {
    const opt = document.createElement('option');
    opt.value = String(v);
    opt.textContent = v;
    if (v === STATE.pageSize) opt.selected = true;
    sel.appendChild(opt);
  });
  const label = document.createElement('label');
  label.textContent = 'Show per page: ';
  label.style.cssText = 'font-size:14px;margin-right:6px;';
  left.appendChild(label);
  left.appendChild(sel);

  // Prev / Page info / Next
  const prev = document.createElement('button');
  prev.textContent = 'Prev';
  prev.style.cssText = 'font:inherit;padding:4px 8px;';
  prev.disabled = STATE.page <= 1;

  const info = document.createElement('span');
  info.textContent = `Page ${STATE.page} / ${lastPage}`;
  info.style.cssText = 'margin:0 8px;font-size:14px;';

  const next = document.createElement('button');
  next.textContent = 'Next';
  next.style.cssText = 'font:inherit;padding:4px 8px;';
  next.disabled = STATE.page >= lastPage;

  right.appendChild(prev);
  right.appendChild(info);
  right.appendChild(next);

  host.innerHTML = ''; // clear and replace
  host.appendChild(left);
  host.appendChild(right);

  // Wire events (idempotent by re-render)
  sel.onchange = () => {
    STATE.pageSize = parseInt(sel.value, 10) || 25;
    STATE.page = 1;
    drawPage();
  };
  prev.onclick = () => {
    if (STATE.page > 1) { STATE.page--; drawPage(); }
  };
  next.onclick = () => {
    if (STATE.page < lastPage) { STATE.page++; drawPage(); }
  };
}

function drawPage(){
  const start = (STATE.page - 1) * STATE.pageSize;
  const end   = start + STATE.pageSize;
  const slice = STATE.filtered.slice(start, end);
  render(slice);
  renderPager('top');
  renderPager('bottom');
}

/* ---------- Filters ---------- */
function applyFilters(){
  const term = ($('#q')?.value||'').toLowerCase();
  const comm = ($('#commodity')?.value||'').toLowerCase();

  // Work from LOADS which has __i (original index)
  const list = LOADS.filter(l => {
    const hay = (String(l.item||'')+' '+String(l.from_city||'')+' '+String(l.to_city||'')+' '+String(l.commodity||'')).toLowerCase();
    const okQ = !term || hay.includes(term);
    const okC = !comm || (String(l.commodity||'').toLowerCase()===comm);
    return okQ && okC;
  });

  STATE.filtered = list;
  STATE.page = 1;
  drawPage();
}

/* ---------- View / Auth ---------- */
function openView(originalIndex){
  const l = LOADS.find(x => x.__i === originalIndex); if(!l) return;
  const box = $('#viewContent');
  box.innerHTML = `
    <div class="title">${l.item ?? ''}</div>
    <div class="meta" style="margin-bottom:6px"><strong>Route:</strong> ${l.from_city} → ${l.to_city}</div>
    <div class="meta"><strong>Miles:</strong> ${fmt(l.miles)}</div>
    <div class="meta"><strong>First Available Date:</strong> ${l.date ?? ''}</div>
    ${l.price ? `<div class="price" style="margin:8px 0">Price: ${fmtPrice(l.price)}</div>` : ''}
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

/* ---------- Boot ---------- */
document.addEventListener('DOMContentLoaded', () => {
  // Reveal Admin link only with ?admin=true
  try{
    const url = new URL(window.location.href);
    const adminFlag = url.searchParams.get('admin');
    const adminLink = document.getElementById('adminLink');
    if(adminLink){ adminLink.style.display = (adminFlag === 'true') ? 'inline' : 'none'; }
  }catch(e){}

  // Filters
  ['q','commodity'].forEach(id => {
    const el = document.getElementById(id);
    if(!el) return;
    el.addEventListener(el.tagName==='SELECT' ? 'change' : 'input', applyFilters);
  });

  loadData();
});

/* ============================================================
   APPEND-ONLY: Load bar + Dark Mode + Auto Refresh
   ============================================================ */
(function(){
  // ---------- tiny helpers ----------
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const LS = window.localStorage;

  // ---------- TOP LOAD BAR ----------
  const BAR_ID = 'aim-progress-bar';
  const BAR_INNER_ID = 'aim-progress-inner';

  function ensureProgressBar(){
    if (document.getElementById(BAR_ID)) return;
    const bar = document.createElement('div');
    bar.id = BAR_ID;
    bar.style.cssText = `
      position:fixed; left:0; top:0; right:0; height:3px;
      background:transparent; z-index:99998;
    `;
    const inner = document.createElement('div');
    inner.id = BAR_INNER_ID;
    inner.style.cssText = `
      width:0%; height:100%; background:#2dd4bf;
      transition:width .25s ease;
      box-shadow:0 0 8px rgba(45,212,191,0.6);
    `;
    bar.appendChild(inner);
    document.body.appendChild(bar);
  }
  function progressStart(){
    ensureProgressBar();
    const inner = document.getElementById(BAR_INNER_ID);
    if (!inner) return;
    inner.style.width = '0%';
    // ramp up to 85% to indicate loading
    let pct = 0;
    inner.__timer && clearInterval(inner.__timer);
    inner.__timer = setInterval(()=>{
      pct = Math.min(85, pct + 5);
      inner.style.width = pct + '%';
    }, 120);
  }
  function progressDone(){
    const inner = document.getElementById(BAR_INNER_ID);
    if (!inner) return;
    inner.style.width = '100%';
    setTimeout(()=>{
      inner.style.width = '0%';
      inner.__timer && clearInterval(inner.__timer);
      inner.__timer = null;
    }, 350);
  }

  // Monkey-patch loadData to show progress bar automatically
  if (typeof window.loadData === 'function' && !window.loadData.__wrappedForBar) {
    const _loadData = window.loadData;
    window.loadData = async function(){
      try { progressStart(); } catch(e){}
      try { return await _loadData(); }
      finally { try { progressDone(); } catch(e){} }
    };
    window.loadData.__wrappedForBar = true;
  }

  // ---------- DARK MODE ----------
  const DARK_KEY = 'aim_dark_mode';
  const DARK_STYLE_ID = 'aim-dark-style';

  function applyDarkModeStyles(){
    if (document.getElementById(DARK_STYLE_ID)) return;
    const css = `
      :root.dark body { background:#0f1216; color:#e6e6e6; }
      :root.dark .card { background:#171c22; color:#e6e6e6; border-color:#2a3441; }
      :root.dark .route { color:#eaeaea; }
      :root.dark .meta { color:#cfd6dd; }
      :root.dark .price { color:#e6f9f5; }
      :root.dark .status { color:#93e5dc; }
      :root.dark .btn { background:#263241; color:#e6e6e6; border-color:#3a4a5e; }
      :root.dark .btn.secondary { background:#1d2632; color:#e6e6e6; }
      :root.dark input, :root.dark select, :root.dark button {
        background:#1b222b; color:#e6e6e6; border-color:#334052;
      }
      :root.dark #loads-pager-toolbar { color:#e6e6e6; }
    `.trim();
    const style = document.createElement('style');
    style.id = DARK_STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  function setDarkMode(on){
    const root = document.documentElement;
    if (on) {
      applyDarkModeStyles();
      root.classList.add('dark');
      LS.setItem(DARK_KEY, '1');
    } else {
      root.classList.remove('dark');
      LS.removeItem(DARK_KEY);
    }
  }
  // init from storage
  setDarkMode(LS.getItem(DARK_KEY) === '1');

  // ---------- AUTO REFRESH ----------
  const REF_KEY = 'aim_auto_refresh';       // "0" | "30" | "60" | "120"
  let refreshTimer = null;

  function getFilters(){
    const term = ($('#q')?.value||'').toLowerCase();
    const comm = ($('#commodity')?.value||'').toLowerCase();
    return { term, comm };
  }

  // soft refresh that preserves filters + current page when possible
  async function softRefresh(){
    try {
      progressStart();
      const res = await fetch('/assets/loads.json?ts=' + Date.now(), {cache:'no-store', credentials:'omit'});
      const data = await res.json();
      const arr  = Array.isArray(data) ? data : (data.loads||[]);
      // Keep __i mapping consistent: recalc indexes per latest feed
      window.LOADS = arr.map((l,i)=>({...l, __i:i}));

      // Rebuild filtered set using current filter inputs
      const {term, comm} = getFilters();
      const filtered = window.LOADS.filter(l => {
        const hay = (String(l.item||'')+' '+String(l.from_city||'')+' '+String(l.to_city||'')+' '+String(l.commodity||'')).toLowerCase();
        const okQ = !term || hay.includes(term);
        const okC = !comm || (String(l.commodity||'').toLowerCase()===comm);
        return okQ && okC;
      });

      // Try to keep current page; fallback if out-of-range
      if (window.STATE) {
        const oldPage    = window.STATE.page;
        const pageSize   = window.STATE.pageSize;
        window.STATE.filtered = filtered;
        const lastPage   = Math.max(1, Math.ceil(filtered.length / pageSize));
        window.STATE.page = Math.min(oldPage, lastPage);
        // Use your existing drawPage if present; else render(filtered slice)
        if (typeof window.drawPage === 'function') {
          window.drawPage();
        } else if (typeof window.render === 'function') {
          const start = (window.STATE.page - 1) * pageSize;
          window.render(filtered.slice(start, start + pageSize));
        }
      }
    } catch (e) {
      console.warn('Auto-refresh failed:', e);
    } finally {
      progressDone();
    }
  }

  function setAutoRefresh(seconds){
    refreshTimer && clearInterval(refreshTimer);
    refreshTimer = null;
    if (!seconds || seconds === '0') {
      LS.setItem(REF_KEY, '0');
      return;
    }
    LS.setItem(REF_KEY, String(seconds));
    refreshTimer = setInterval(softRefresh, Number(seconds) * 1000);
  }

  // start with stored preference
  (function initStoredRefresh(){
    const v = LS.getItem(REF_KEY) || '0';
    if (v !== '0') setAutoRefresh(v);
  })();

  // ---------- CONTROL STRIP (buttons next to top pager if present) ----------
  function ensureControlStrip(){
    // Prefer to dock controls at top pager; fallback to top-right corner
    const topPager = document.getElementById('pager-top');
    let host = document.getElementById('aim-controls');
    if (!host) {
      host = document.createElement('div');
      host.id = 'aim-controls';
      host.style.cssText = `
        display:flex; align-items:center; gap:10px; flex-wrap:wrap;
      `;
      if (topPager && topPager.parentNode) {
        // place on the right side of top pager
        topPager.style.display = 'flex';
        topPager.style.justifyContent = 'space-between';
        // left side remains pager; we append controls to the right
        topPager.appendChild(host);
      } else {
        // fallback fixed bubble
        host.style.position = 'fixed';
        host.style.top = '12px';
        host.style.right = '12px';
        host.style.zIndex = '99997';
        document.body.appendChild(host);
      }
    }
    // Build controls content
    const currentDark = (LS.getItem(DARK_KEY) === '1');
    const currentRef  = LS.getItem(REF_KEY) || '0';

    host.innerHTML = `
      <label style="display:inline-flex;align-items:center;gap:6px; font-size:14px;">
        <input id="aim-dark-toggle" type="checkbox" ${currentDark?'checked':''}>
        Dark Mode
      </label>
      <label style="display:inline-flex;align-items:center;gap:6px; font-size:14px;">
        Auto Refresh:
        <select id="aim-refresh-sel" style="font:inherit;padding:2px 6px;">
          <option value="0" ${currentRef==='0'?'selected':''}>Off</option>
          <option value="30" ${currentRef==='30'?'selected':''}>30s</option>
          <option value="60" ${currentRef==='60'?'selected':''}>60s</option>
          <option value="120" ${currentRef==='120'?'selected':''}>120s</option>
        </select>
      </label>
    `;

    // Wire controls
    $('#aim-dark-toggle', host)?.addEventListener('change', (e)=> setDarkMode(e.target.checked));
    $('#aim-refresh-sel', host)?.addEventListener('change', (e)=> setAutoRefresh(e.target.value));
  }

  // Try now, and after first draw
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureControlStrip);
  } else {
    ensureControlStrip();
  }
  // Re-ensure after your first pagination draw
  const rehost = setInterval(()=>{
    ensureControlStrip();
    // stop after it’s placed on pager-top
    if (document.getElementById('pager-top')?.contains(document.getElementById('aim-controls'))) {
      clearInterval(rehost);
    }
  }, 400);

})();