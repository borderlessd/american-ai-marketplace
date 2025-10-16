/* assets/app.js — FULL REPLACE (pagination top+bottom, loader, safe labels/lines) */

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