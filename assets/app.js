/* assets/app.js — FULL REPLACE
   Stable base: your original look + our working pagination (top & bottom)
   Add-ons integrated safely:
   - Top load bar during fetch
   - Dark Mode toggle (persisted)
   - Auto-refresh (Off/30s/60s/120s) that preserves filters & page
*/

let LOADS = [];
let TOKEN = localStorage.getItem('aim_token')||'';

const $  = (q, el=document) => el.querySelector(q);
const $$ = (q, el=document) => Array.from(el.querySelectorAll(q || '*'));
function fmt(n){return new Intl.NumberFormat().format(Number(n||0));}
function fmtPrice(v){
  const n = Number(v||0);
  try { return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n); }
  catch { return `$${(Math.round(n)||0)}`; }
}

/* ------------------------------
   Dark Mode (persisted)
------------------------------ */
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
    localStorage.setItem(DARK_KEY, '1');
  } else {
    root.classList.remove('dark');
    localStorage.removeItem(DARK_KEY);
  }
}
// init dark mode from storage
setDarkMode(localStorage.getItem(DARK_KEY) === '1');

/* ------------------------------
   Top Load Bar (lightweight)
------------------------------ */
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
  let pct = 0;
  clearInterval(inner.__timer);
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
    clearInterval(inner.__timer);
    inner.__timer = null;
  }, 350);
}

/* ------------------------------
   Pagination state & helpers
------------------------------ */
const STATE = {
  filtered: [],
  page: 1,
  pageSize: 25
};
const PER_PAGE_OPTIONS = [10,25,50,100];

function render(list){
  const grid = $('#grid'); if(!grid) return;
  // Cards (unchanged structure to preserve styling)
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
}

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

  host.innerHTML = '';
  host.appendChild(left);
  // Controls strip on the right: Dark Mode + Auto-refresh + Prev/Next
  const controls = document.createElement('div');
  controls.style.cssText = 'display:flex;align-items:center;gap:12px;flex-wrap:wrap;';
  // Dark toggle
  const dm = document.createElement('label');
  dm.style.cssText = 'display:inline-flex;align-items:center;gap:6px;font-size:14px;';
  const dmInput = document.createElement('input'); dmInput.type = 'checkbox';
  dmInput.checked = (localStorage.getItem(DARK_KEY) === '1');
  dm.appendChild(dmInput);
  dm.appendChild(document.createTextNode('Dark Mode'));
  dmInput.onchange = () => setDarkMode(dmInput.checked);
  controls.appendChild(dm);

  // Auto-refresh
  const ar = document.createElement('label');
  ar.style.cssText = 'display:inline-flex;align-items:center;gap:6px;font-size:14px;';
  ar.appendChild(document.createTextNode('Auto Refresh:'));
  const arSel = document.createElement('select');
  arSel.style.cssText = 'font:inherit;padding:2px 6px;';
  ['0','30','60','120'].forEach(v => {
    const o = document.createElement('option');
    o.value = v; o.textContent = (v==='0'?'Off':v+'s');
    if (v === (localStorage.getItem('aim_auto_refresh')||'0')) o.selected = true;
    arSel.appendChild(o);
  });
  ar.appendChild(arSel);
  controls.appendChild(ar);

  right.appendChild(controls);
  right.appendChild(prev);
  right.appendChild(info);
  right.appendChild(next);
  host.appendChild(right);

  // Wire events
  sel.onchange = () => { STATE.pageSize = parseInt(sel.value, 10) || 25; STATE.page = 1; drawPage(); };
  prev.onclick = () => { if (STATE.page > 1) { STATE.page--; drawPage(); } };
  next.onclick = () => {
    const last = Math.max(1, Math.ceil(STATE.filtered.length / STATE.pageSize));
    if (STATE.page < last) { STATE.page++; drawPage(); }
  };
  arSel.onchange = () => setAutoRefresh(arSel.value);
}

function drawPage(){
  const start = (STATE.page - 1) * STATE.pageSize;
  const end   = start + STATE.pageSize;
  const slice = STATE.filtered.slice(start, end);
  render(slice);
  renderPager('top');
  renderPager('bottom');
}

/* ------------------------------
   Filters
------------------------------ */
function applyFilters(){
  const term = ($('#q')?.value||'').toLowerCase();
  const comm = ($('#commodity')?.value||'').toLowerCase();

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

/* ------------------------------
   View / Auth
------------------------------ */
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

/* ------------------------------
   Auto-refresh (preserves filters & page)
------------------------------ */
let refreshTimer = null;
function setAutoRefresh(val /* '0'|'30'|'60'|'120' */){
  localStorage.setItem('aim_auto_refresh', String(val || '0'));
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  const seconds = parseInt(val, 10) || 0;
  if (!seconds) return;
  refreshTimer = setInterval(async () => {
    try {
      progressStart();
      const res = await fetch('/assets/loads.json?ts=' + Date.now(), {cache:'no-store', credentials:'omit'});
      const data = await res.json();
      const arr  = Array.isArray(data) ? data : (data.loads||[]);
      LOADS = arr.map((l,i)=>({...l, __i:i}));
      // Re-apply current filters & keep page if still valid
      const term = ($('#q')?.value||'').toLowerCase();
      const comm = ($('#commodity')?.value||'').toLowerCase();
      const filtered = LOADS.filter(l => {
        const hay = (String(l.item||'')+' '+String(l.from_city||'')+' '+String(l.to_city||'')+' '+String(l.commodity||'')).toLowerCase();
        const okQ = !term || hay.includes(term);
        const okC = !comm || (String(l.commodity||'').toLowerCase()===comm);
        return okQ && okC;
      });
      const oldPage = STATE.page;
      STATE.filtered = filtered;
      const last = Math.max(1, Math.ceil(filtered.length / STATE.pageSize));
      STATE.page = Math.min(oldPage, last);
      drawPage();
    } catch(e){
      console.warn('Auto-refresh failed:', e);
    } finally {
      progressDone();
    }
  }, seconds * 1000);
}

/* ------------------------------
   Data load
------------------------------ */
async function loadData(){
  progressStart();
  try{
    const res = await fetch('/assets/loads.json?ts=' + Date.now(), {cache:'no-store', credentials:'omit'});
    const data = await res.json();
    const arr  = Array.isArray(data) ? data : (data.loads||[]);
    LOADS = arr.map((l,i)=>({...l, __i:i}));
  }catch(e){
    console.error('Failed to load loads.json', e);
    LOADS = [];
  } finally {
    progressDone();
  }
  applyFilters(); // sets STATE.filtered and draws
}

/* ------------------------------
   Boot
------------------------------ */
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

  // Init auto-refresh from storage
  const ar = localStorage.getItem('aim_auto_refresh') || '0';
  setAutoRefresh(ar);

  loadData();
});