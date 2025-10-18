/* /assets/app.js — drop-in replacement */

let LOADS = [];
let TOKEN = localStorage.getItem('aim_token') || '';

// Make sure Supabase client ALWAYS exists using the config from index.html
let sb = window.sb || (function(){
  try{
    const url = window.SUPABASE_URL;
    const key = window.SUPABASE_KEY;
    if (!url || !key) {
      console.warn('Supabase config missing: set window.SUPABASE_URL and window.SUPABASE_KEY before app.js');
      return null;
    }
    if (!window.supabase) {
      console.error('supabase-js not loaded. Make sure <script src="https://unpkg.com/@supabase/supabase-js@2"></script> is before app.js');
      return null;
    }
    const c = window.supabase.createClient(url, key);
    window.sb = c;
    return c;
  }catch(e){
    console.error('Supabase init error', e);
    return null;
  }
})();

const $  = (q, el=document) => el.querySelector(q);
const $$ = (q, el=document) => Array.from(el.querySelectorAll(q));
const fmt = (n) => new Intl.NumberFormat().format(n);

// Try to ensure any full-screen loader overlay is not blocking clicks
function hideLoaderOverlay() {
  const id = 'loads-loader-overlay';
  const el = document.getElementById(id);
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

/* ---------- Data loading ---------- */
async function loadData(){
  try{
    const res = await fetch('/assets/loads.json?ts=' + Date.now(), { cache: 'no-store' });
    const data = await res.json();
    LOADS = Array.isArray(data) ? data : (data.loads || []);
  }catch(e){
    console.error('Failed to load loads.json', e);
    LOADS = [];
  }
  applyFilters();           // Render using current filters
  hideLoaderOverlay();      // Make sure overlay is gone
}

/* ---------- Field helpers & normalization ---------- */
function val(v){ return (v==null ? '' : v); }

function pick(...xs){
  for (const x of xs) {
    if (x != null && x !== '') return x;
  }
  return '';
}

function dateStr(l){
  const raw = pick(l.date, l.available, l.availableDate, l.pickup_date, l.pickupDate, l.readyDate, l.date_available);
  return raw ? String(raw) : '';
}

function fromCity(l){
  return pick(l.from_city, l.fromCity, l.originCity, l.origin, l.pickup_city, l.pickupCity, l.from);
}
function toCity(l){
  return pick(l.to_city, l.toCity, l.destinationCity, l.destination, l.dropoff_city, l.dropoffCity, l.to);
}
function itemName(l){
  return pick(l.item, l.vehicle, l.commodity, 'Item');
}
function safeMiles(l){
  const m = l.miles;
  const n = (typeof m === 'string') ? Number(m.replace(/,/g,'')) : Number(m);
  return Number.isFinite(n) ? n : '';
}

/* Price: only show when it's a real number > 0. Blank/TBD/N/A/0 hides the line entirely. */
function priceHTML(l){
  let p = l.price;

  // Blank entirely?
  if (p == null) return '';

  // String cases
  if (typeof p === 'string') {
    const s = p.trim().toUpperCase();
    if (!s || s === 'TBD' || s === 'N/A' || s === 'NA' || s === '—' || s === '-') return '';
    const num = Number(s.replace(/[^0-9.]/g,''));
    if (Number.isFinite(num) && num > 0) return `<div class="price" style="margin:8px 0">Price: $${fmt(num)}</div>`;
    return '';
  }

  // Numeric case
  if (typeof p === 'number' && Number.isFinite(p) && p > 0) {
    return `<div class="price" style="margin:8px 0">Price: $${fmt(p)}</div>`;
  }

  return '';
}

/* ---------- Rendering ---------- */
function render(list){
  const grid = $('#grid'); 
  if (!grid) return;

  const cards = list.map((l, idx) => {
    const routeFrom = val(fromCity(l));
    const routeTo   = val(toCity(l));
    const status    = (l.status || 'open').toString().toUpperCase();
    const miles     = safeMiles(l);
    const date      = dateStr(l);
    const item      = val(itemName(l));
    const priceBlock = priceHTML(l); // empty string if non-numeric/TBD/etc.

    return `
    <article class="card load-card">
      <div class="route">${routeFrom} → ${routeTo} <span class="status ${status.toLowerCase()}">${status}</span></div>
      <div class="meta"><strong>Item:</strong> ${item}</div>
      <div class="meta"><strong>Miles:</strong> ${miles ? fmt(miles) : ''}</div>
      <div class="meta"><strong>First Available Date:</strong> ${date}</div>
      ${priceBlock}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
        <button class="btn secondary" onclick="openView(${idx})">View</button>
        <button class="btn" onclick="bid(${idx})">Bid</button>
      </div>
    </article>
    `;
  }).join('');

  grid.innerHTML = cards;
}

/* ---------- Filters ---------- */
function applyFilters(){
  const term = ($('#q')?.value || '').toLowerCase();
  const comm = ($('#commodity')?.value || '').toLowerCase();

  const list = LOADS.filter(l => {
    const hay = (
      (itemName(l) || '') + ' ' +
      (fromCity(l) || '') + ' ' +
      (toCity(l) || '')   + ' ' +
      (l.commodity || '')
    ).toLowerCase();

    const okQ = !term || hay.includes(term);
    const okC = !comm || (l.commodity || '').toLowerCase() === comm;
    return okQ && okC;
  });

  render(list);
}

/* ---------- View Modal ---------- */
function openView(index){
  const l = LOADS[index];
  if (!l) return;

  const routeFrom = val(fromCity(l));
  const routeTo   = val(toCity(l));
  const status    = (l.status || 'open').toString().toUpperCase();
  const miles     = safeMiles(l);
  const date      = dateStr(l);
  const item      = val(itemName(l));
  const priceBlock = priceHTML(l);

  const box = $('#viewContent');
  if (!box) return;

  box.innerHTML = `
    <div class="title">${item}</div>
    <div class="meta" style="margin-bottom:6px"><strong>Route:</strong> ${routeFrom} → ${routeTo} &nbsp; <span class="status ${status.toLowerCase()}">${status}</span></div>
    <div class="meta"><strong>Miles:</strong> ${miles ? fmt(miles) : ''}</div>
    <div class="meta"><strong>First Available Date:</strong> ${date}</div>
    ${priceBlock}
    ${l.notes ? `<div class="meta"><strong>Notes:</strong> ${String(l.notes)}</div>` : ''}
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
      <button class="btn secondary" onclick="closeView()">Close</button>
      <button class="btn" onclick="bid(${index})">Bid</button>
    </div>
  `;
  $('#viewModal')?.classList.add('open');
}
function closeView(){ $('#viewModal')?.classList.remove('open'); }

/* ---------- Auth + Bid ---------- */
function openAuth(){ $('#authModal')?.classList.add('open'); }
function closeAuth(){ $('#authModal')?.classList.remove('open'); }

async function signin(){
  const err = $('#authError');
  try{
    const email = $('#authEmail')?.value?.trim();
    const pass  = $('#authPass')?.value?.trim();
    if (!email || !pass) { if (err) err.textContent = 'Email and password required.'; return; }
    if (!sb) { if (err) err.textContent = 'Auth service unavailable on this page.'; return; }

    const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
    if (error) throw error;

    closeAuth();
    location.reload();
  }catch(e){
    if (err) err.textContent = e.message || 'Sign-in failed.';
  }
}

async function bid(index){
  const l = LOADS[index];
  if (!l) return;

  try{
    if (!sb) { openAuth(); return; }
    const { data: userData } = await sb.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) { openAuth(); return; }

    const payload = {
      load_id: l.id || l.load_number || null,
      route_from: fromCity(l),
      route_to: toCity(l),
      item: itemName(l),
      miles: safeMiles(l) || null,
      price_offer: null,
      auth_user_id: userId,
      status: 'SUBMITTED',
      created_at: new Date().toISOString()
    };

    const { error } = await sb.from('bids').insert(payload);
    if (error) throw error;

    alert('Bid submitted. You can see it in Admin.');
  }catch(e){
    console.warn('Bid error', e);
    openAuth();
  }
}

/* ---------- Wire-up & globals ---------- */
document.addEventListener('DOMContentLoaded', () => {
  // Reveal Admin link only with ?admin=true
  try{
    const url = new URL(window.location.href);
    const adminFlag = url.searchParams.get('admin');
    const adminLink = document.getElementById('adminLink');
    if (adminLink){ adminLink.style.display = (adminFlag === 'true') ? 'inline' : 'none'; }
  }catch(e){}

  ['q','commodity'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener(el.tagName==='SELECT' ? 'change' : 'input', applyFilters);
  });

  loadData();
});

// expose functions so inline onclick works
window.openView = openView;
window.closeView = closeView;
window.bid = bid;
window.signin = signin;
window.openAuth = openAuth;
window.closeAuth = closeAuth;