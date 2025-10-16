/* assets/app.js — FULL REPLACE
   Stable base + Bundle A features:
   - Cards unchanged (preserve styling)
   - Loader bar during fetch
   - Dark Mode toggle (persisted)
   - Auto-refresh (Off/30/60/120) preserving filters/page
   - Pagination top & bottom
   - NEW: Sort controls (Price/Miles/Date/From/To with ASC/DESC)
   - NEW: Sticky filters (q/commodity/per page/sort persist)
   - NEW: Shareable URLs (?q=&commodity=&per=&page=&sort=price:desc)
   - NEW: Export CSV (current page view)
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
function toISO(d){ return d || ''; }

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
    :root.dark #pager-top, :root.dark #pager-bottom { color:#e6e6e6; }
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
   Pagination + Sorting state
------------------------------ */
const STATE = {
  filtered: [],
  page: 1,
  pageSize: 25,
  sort: { key: 'date', dir: 'desc' } // default
};
const PER_PAGE_OPTIONS = [10,25,50,100];
const SORT_KEYS = [
  {value:'price',   label:'Price'},
  {value:'miles',   label:'Miles'},
  {value:'date',    label:'First Available Date'},
  {value:'from_city', label:'From'},
  {value:'to_city',   label:'To'}
];

function cmp(a,b){
  if (a==null && b==null) return 0;
  if (a==null) return -1;
  if (b==null) return 1;
  if (typeof a==='number' && typeof b==='number') return a-b;
  // Try date compare for ISO-like strings
  const ad = Date.parse(a); const bd = Date.parse(b);
  if (!isNaN(ad) && !isNaN(bd)) return ad - bd;
  return String(a).localeCompare(String(b));
}

function getSorted(list){
  const {key, dir} = STATE.sort || {};
  if (!key) return list.slice();
  const arr = list.slice();
  arr.sort((x,y) => {
    const res = cmp(x[key], y[key]);
    return dir === 'desc' ? -res : res;
  });
  return arr;
}

/* ------------------------------
   Rendering
------------------------------ */
function getGrid(){ return $('#grid'); }

function render(list){
  const grid = getGrid(); if(!grid) return;
  // Cards (unchanged structure to preserve styling)
  grid.innerHTML = list.map((l) => `
    <article class="card">
      <div class="route">${l.from_city} → ${l.to_city} <span class="status ${l.status||'open'}">${(l.status||'open').toUpperCase()}</span></div>
      <div class="meta"><strong>Item:</strong> ${l.item ?? ''}</div>
      <div class="meta"><strong>Miles:</strong> ${fmt(l.miles)}</div>
      <div class="meta"><strong>First Available Date:</strong> ${toISO(l.date) ?? ''}</div>
      <div class="price" style="margin:8px 0">Price: ${fmtPrice(l.price)}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn secondary" onclick="openView(${l.__i})">View</button>
        <button class="btn" onclick="bid()">Bid</button>
      </div>
    </article>
  `).join('');
}

/* ------------------------------
   Pager builders (top & bottom)
------------------------------ */
function renderPager(where /* 'top'|'bottom' */){
  const grid = getGrid(); if(!grid) return;
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

  // LEFT: Page size + Sort controls
  const left = document.createElement('div');
  // per-page
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

  // sort key
  const sortWrap = document.createElement('span');
  sortWrap.style.cssText = 'margin-left:12px;';
  const sortLabel = document.createElement('label');
  sortLabel.textContent = 'Sort: ';
  sortLabel.style.cssText = 'font-size:14px;margin-right:6px;';
  const sortSel = document.createElement('select');
  sortSel.id = `sortkey-${where}`;
  sortSel.style.cssText = 'font:inherit;padding:4px 6px;';
  SORT_KEYS.forEach(({value,label})=>{
    const opt = document.createElement('option');
    opt.value = value; opt.textContent = label;
    if ((STATE.sort?.key||'')===value) opt.selected = true;
    sortSel.appendChild(opt);
  });
  const dirBtn = document.createElement('button');
  dirBtn.id = `sortdir-${where}`;
  dirBtn.style.cssText = 'font:inherit;padding:4px 8px;margin-left:6px;';
  dirBtn.textContent = (STATE.sort?.dir==='asc') ? 'ASC' : 'DESC';
  sortWrap.appendChild(sortLabel);
  sortWrap.appendChild(sortSel);
  sortWrap.appendChild(dirBtn);
  left.appendChild(sortWrap);

  // RIGHT: Dark/Auto + Prev/Info/Next + Export
  const right = document.createElement('div');
  right.style.cssText = 'display:flex;align-items:center;gap:12px;flex-wrap:wrap;';

  // Dark toggle
  const dm = document.createElement('label');
  dm.style.cssText = 'display:inline-flex;align-items:center;gap:6px;font-size:14px;';
  const dmInput = document.createElement('input'); dmInput.type = 'checkbox';
  dmInput.checked = (localStorage.getItem(DARK_KEY) === '1');
  dm.appendChild(dmInput);
  dm.appendChild(document.createTextNode('Dark Mode'));
  dmInput.onchange = () => setDarkMode(dmInput.checked);
  right.appendChild(dm);

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
  right.appendChild(ar);

  // Export CSV (current page)
  const exportBtn = document.createElement('button');
  exportBtn.textContent = 'Export CSV';
  exportBtn.style.cssText = 'font:inherit;padding:4px 8px;';
  right.appendChild(exportBtn);

  // Prev/Next
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

  host.innerHTML = '';
  host.appendChild(left);
  host.appendChild(right);

  // Wire events
  sel.onchange = () => { STATE.pageSize = parseInt(sel.value, 10) || 25; STATE.page = 1; persistUI(); drawPage(); };
  sortSel.onchange = () => { STATE.sort.key = sortSel.value; STATE.page = 1; persistUI(); drawPage(); };
  dirBtn.onclick = () => { STATE.sort.dir = (STATE.sort.dir==='asc'?'desc':'asc'); dirBtn.textContent = STATE.sort.dir.toUpperCase(); STATE.page = 1; persistUI(); drawPage(); };
  prev.onclick = () => { if (STATE.page > 1) { STATE.page--; persistUI(); drawPage(); } };
  next.onclick = () => {
    const last = Math.max(1, Math.ceil(STATE.filtered.length / STATE.pageSize));
    if (STATE.page < last) { STATE.page++; persistUI(); drawPage(); }
  };
  arSel.onchange = () => setAutoRefresh(arSel.value);
  exportBtn.onclick = () => exportCurrentPageCSV();
}

function drawPage(){
  // sort then paginate
  const sorted = getSorted(STATE.filtered);
  const start = (STATE.page - 1) * STATE.pageSize;
  const end   = start + STATE.pageSize;
  const slice = sorted.slice(start, end);
  render(slice);
  renderPager('top');
  renderPager('bottom');
  updateURL();
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
  persistUI();
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
    <div class="meta"><strong>First Available Date:</strong> ${toISO(l.date) ?? ''}</div>
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
   Sticky UI + URL sync
------------------------------ */
function persistUI(){
  // Save q/commodity if present
  const qEl = $('#q'); const cEl = $('#commodity');
  if (qEl) localStorage.setItem('aim_q', qEl.value||'');
  if (cEl) localStorage.setItem('aim_commodity', cEl.value||'');
  localStorage.setItem('aim_per', String(STATE.pageSize));
  localStorage.setItem('aim_sort', `${STATE.sort.key||''}:${STATE.sort.dir||''}`);
  localStorage.setItem('aim_page', String(STATE.page));
}
function restoreUIFromStorage(){
  const q = localStorage.getItem('aim_q') || '';
  const c = localStorage.getItem('aim_commodity') || '';
  const per = parseInt(localStorage.getItem('aim_per')||'0',10);
  const page = parseInt(localStorage.getItem('aim_page')||'0',10);
  const sort = (localStorage.getItem('aim_sort')||'').split(':');
  if ($('#q')) $('#q').value = q;
  if ($('#commodity')) $('#commodity').value = c;
  if (per) STATE.pageSize = per;
  if (page) STATE.page = page;
  if (sort[0]) STATE.sort.key = sort[0];
  if (sort[1]) STATE.sort.dir = sort[1];
}
function restoreUIFromURL(){
  const url = new URL(window.location.href);
  const q = url.searchParams.get('q');
  const c = url.searchParams.get('commodity');
  const per = parseInt(url.searchParams.get('per')||'',10);
  const page = parseInt(url.searchParams.get('page')||'',10);
  const sort = url.searchParams.get('sort'); // e.g., "price:desc"
  if (q!=null && $('#q')) $('#q').value = q;
  if (c!=null && $('#commodity')) $('#commodity').value = c;
  if (!isNaN(per) && per>0) STATE.pageSize = per;
  if (!isNaN(page) && page>0) STATE.page = page;
  if (sort){
    const [k,d] = sort.split(':');
    if (k) STATE.sort.key = k;
    if (d) STATE.sort.dir = d;
  }
}
function updateURL(){
  const url = new URL(window.location.href);
  const q = $('#q')?.value || '';
  const c = $('#commodity')?.value || '';
  url.searchParams.set('q', q);
  url.searchParams.set('commodity', c);
  url.searchParams.set('per', String(STATE.pageSize));
  url.searchParams.set('page', String(STATE.page));
  url.searchParams.set('sort', `${STATE.sort.key}:${STATE.sort.dir}`);
  history.replaceState(null, '', url.toString());
}

/* ------------------------------
   CSV export (current page view)
------------------------------ */
function exportCurrentPageCSV(){
  // Build the exact slice currently shown
  const sorted = getSorted(STATE.filtered);
  const start = (STATE.page - 1) * STATE.pageSize;
  const end   = start + STATE.pageSize;
  const rows  = sorted.slice(start, end);

  // Columns (friendly headers)
  const headers = ['ID','From','To','First Available Date','Item','Miles','Price','Status','Commodity','Notes'];
  const csvRows = [headers.join(',')];

  rows.forEach(l => {
    const r = [
      l.id || l.load_number || '',
      l.from_city || '',
      l.to_city || '',
      toISO(l.date) || '',
      l.item || '',
      Number(l.miles||0),
      String(l.price||''),
      (l.status||'').toUpperCase(),
      l.commodity || '',
      (l.notes||'').replace(/"/g,'""')
    ];
    // CSV escape
    const line = r.map(v => {
      const s = String(v==null?'':v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
    }).join(',');
    csvRows.push(line);
  });

  const blob = new Blob([csvRows.join('\n')], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `loads_page${STATE.page}_per${STATE.pageSize}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 200);
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

  // Restore from URL first (so shared links win), then storage for anything missing
  restoreUIFromURL();
  restoreUIFromStorage();

  // Wire filters
  ['q','commodity'].forEach(id => {
    const el = document.getElementById(id);
    if(!el) return;
    el.addEventListener(el.tagName==='SELECT' ? 'change' : 'input', () => {
      applyFilters();
    });
  });

  // Init auto-refresh from storage
  const ar = localStorage.getItem('aim_auto_refresh') || '0';
  setAutoRefresh(ar);

  loadData();
});