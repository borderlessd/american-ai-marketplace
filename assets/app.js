/* /assets/app.js — drop-in replacement */

let LOADS = [];
let TOKEN = localStorage.getItem('aim_token') || '';

// Supabase client (reuse if already created elsewhere)
let sb = window.sb || (function(){
  // If you already create sb in another script, this will be skipped.
  // If not, and you want to wire here, fill in your project + anon key:
  const SUPABASE_URL = window.SUPABASE_URL || "";   // e.g. "https://xntxctjjtfjeznircuas.supabase.co"
  const SUPABASE_KEY = window.SUPABASE_KEY || "";   // your anon key
  try{
    if (SUPABASE_URL && SUPABASE_KEY && window.supabase) {
      return window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
  }catch(e){}
  return null;
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
  // supports: l.date, l.available, l.availableDate, l.pickup_date, etc.
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

/* Price: only show if we have a REAL dollar amount. Blank/TBD should hide line entirely */
function priceHTML(l){
  let p = l.price;
  if (p == null) return ''; // no price -> hide

  // If it's a string, check for TBD/blank
  if (typeof p === 'string') {
    const s = p.trim().toUpperCase();
    if (!s || s === 'TBD' || s === 'N/A') return ''; // hide entire price line
    // Try to parse a number from it
    const num = Number(s.replace(/[^0-9.]/g,''));
    if (Number.isFinite(num)) return `<div class="price" style="margin:8px 0">Price: $${fmt(num)}</div>`;
    return ''; // not a number -> hide
  }

  // If it's a number
  if (typeof p === 'number' && Number.isFinite(p)) {
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

    const priceBlock = priceHTML(l); // empty string if blank/TBD/invalid

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
    // optional profile bootstrap happens elsewhere
    location.reload();
  }catch(e){
    if (err) err.textContent = e.message || 'Sign-in failed.';
  }
}

async function bid(index){
  const l = LOADS[index];
  if (!l) return;

  // Require auth
  try{
    if (!sb) { openAuth(); return; }
    const { data: userData } = await sb.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) { openAuth(); return; }

    // Example insert (adjust columns to match your 'bids' table schema)
    // If you already have working bid code elsewhere, keep it; this is a safe fallback.
    const payload = {
      load_id: l.id || l.load_number || null,
      route_from: fromCity(l),
      route_to: toCity(l),
      item: itemName(l),
      miles: safeMiles(l) || null,
      price_offer: null,           // you can collect an offer amount in a modal if you want
      auth_user_id: userId,
      status: 'SUBMITTED',
      created_at: new Date().toISOString()
    };

    // If you’ve got your table named 'bids'
    const { error } = await sb.from('bids').insert(payload);
    if (error) throw error;

    alert('Bid submitted. You can see it in Admin.');
  }catch(e){
    // If the table/columns differ, open auth or show a friendly message
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