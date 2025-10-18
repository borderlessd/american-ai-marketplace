/***********************
 *  CONFIG: Supabase   *
 ***********************/
const SUPABASE_URL = 'https://xntxctjjtfjeznircuas.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhudHhjdGpqdGZqZXpuaXJjdWFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2ODkxNTAsImV4cCI6MjA3NjI2NTE1MH0.KeP_BvUDX1nde1iw95sv0ETtcseVEjDuR7gcYHPmsVk';
window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/***********************
 *   Utilities         *
 ***********************/
const $  = (q, el=document) => el.querySelector(q);
const $$ = (q, el=document) => Array.from(el.querySelectorAll(q));

function fmtNum(n){ const v = Number(n||0); return isFinite(v) ? new Intl.NumberFormat().format(v) : '0'; }
function fmtUSD(n){
  const v = Number(n);
  if (!isFinite(v)) return '';
  return new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits:0 }).format(v);
}
function isBlankOrTBD(v){
  if (v === null || v === undefined) return true;
  const s = String(v).trim().toLowerCase();
  return !s || s === 'tbd' || s === 'na' || s === 'n/a';
}

/***********************
 *   Loads state       *
 ***********************/
let LOADS = [];

/**
 * Normalize arbitrary keys from the Google Sheet / Apps Script feed
 * into a stable internal shape the UI expects.
 */
function normalizeLoad(raw){
  const from_city = raw.from_city || raw.fromCity || raw.originCity || raw.origin || raw.pickup_city || raw.pickupCity;
  const to_city   = raw.to_city   || raw.toCity   || raw.destinationCity || raw.destination || raw.dropoff_city || raw.dropoffCity;

  const item      = raw.item || raw.vehicle || raw.commodity || 'Item';
  const miles     = Number(raw.miles ?? raw.distance ?? 0) || 0;

  // choose a sensible “available” date field
  const available = raw.available || raw.availableDate || raw.dateAvailable || raw.date_available ||
                    raw.pickupDate || raw.pickup_date || raw.readyDate || raw.delivery_date || raw.date;

  const load_number = raw.load_number || raw.id || raw.ref || '';

  // price may be string like "1299" or "TBD"
  const priceRaw = raw.price ?? raw.rate ?? '';
  const price = isBlankOrTBD(priceRaw) ? '' : (isFinite(Number(priceRaw)) ? Number(priceRaw) : String(priceRaw));

  const status = String((raw.status || 'ACTIVE')).toUpperCase();

  return {
    load_number,
    from_city: from_city || '',
    to_city: to_city || '',
    item,
    miles,
    available: available || '',
    price,            // '' if blank/TBD, else number or string
    status,
    notes: raw.notes || '',
    _raw: raw         // keep original for debugging/compat
  };
}

/***********************
 *   Data loading      *
 ***********************/
async function loadData(){
  const grid = $('#grid');
  if (grid) grid.innerHTML = '<article class="card">Loading loads…</article>';

  try{
    // Netlify redirect maps this to your Apps Script endpoint
    const res = await fetch('/assets/loads.json?ts=' + Date.now(), { cache: 'no-store' });
    const data = await res.json();
    const arr = Array.isArray(data) ? data : (data.loads || []);
    LOADS = arr.map(normalizeLoad);
  }catch(e){
    console.error('Failed to load loads.json', e);
    LOADS = [];
  }
  applyFilters();
}

/***********************
 *   Rendering         *
 ***********************/
function render(list){
  const grid = $('#grid'); if(!grid) return;

  if (!list.length){
    grid.innerHTML = '<article class="card">No loads found.</article>';
    return;
  }

  grid.innerHTML = list.map((l, idx) => {
    const priceLine = isBlankOrTBD(l.price) ? '' : `<div class="price" style="margin:8px 0">Price: ${typeof l.price==='number' ? fmtUSD(l.price) : l.price}</div>`;
    return `
      <article class="card load-card">
        <div class="route">${l.from_city || '—'} → ${l.to_city || '—'} <span class="status ${l.status}">${l.status}</span></div>
        <div class="meta"><strong>Item:</strong> ${l.item}</div>
        <div class="meta"><strong>Miles:</strong> ${fmtNum(l.miles)}</div>
        <div class="meta"><strong>First Available Date:</strong> ${l.available || '—'}</div>
        ${priceLine}
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn secondary" onclick="openView(${idx})">View</button>
          <button class="btn" onclick="bid(${idx})">Bid</button>
        </div>
      </article>
    `;
  }).join('');
}

function applyFilters(){
  const term = ($('#q')?.value||'').toLowerCase();
  const comm = ($('#commodity')?.value||'').toLowerCase();

  const list = LOADS.filter(l => {
    const hay = (l.item + ' ' + l.from_city + ' ' + l.to_city + ' ' + (l._raw.commodity||'')).toLowerCase();
    const okQ = !term || hay.includes(term);
    const okC = !comm || l.item.toLowerCase() === comm || (l._raw.commodity||'').toLowerCase() === comm;
    return okQ && okC;
  });

  render(list);
}

/***********************
 *  View modal         *
 ***********************/
function openView(index){
  const l = LOADS[index]; if(!l) return;
  const box = $('#viewContent');
  box.innerHTML = `
    <div class="title">${l.item}</div>
    <div class="meta"><strong>Route:</strong> ${l.from_city || '—'} → ${l.to_city || '—'}</div>
    <div class="meta"><strong>Miles:</strong> ${fmtNum(l.miles)}</div>
    <div class="meta"><strong>First Available Date:</strong> ${l.available || '—'}</div>
    ${isBlankOrTBD(l.price) ? '' : `<div class="price" style="margin:8px 0">Price: ${typeof l.price==='number' ? fmtUSD(l.price) : l.price}</div>`}
    ${l.notes ? `<div class="meta"><strong>Notes:</strong> ${l.notes}</div>` : ''}
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
      <button class="btn secondary" onclick="closeView()">Close</button>
      <button class="btn" onclick="bid(${index})">Bid</button>
    </div>
  `;
  $('#viewModal').classList.add('open');
}
function closeView(){ $('#viewModal').classList.remove('open'); }

/***********************
 *  Auth + Profiles    *
 ***********************/
/**
 * Create/update the user's profile & carriers rows with a company name.
 * Reads #company if present; otherwise uses provided companyName or "New Carrier".
 */
async function ensureProfile(companyName){
  try{
    const { data: s } = await sb.auth.getSession();
    const uid = s?.session?.user?.id;
    if (!uid) return;

    const name = (companyName || $('#company')?.value || '').trim() || 'New Carrier';

    // Upsert into profiles (id is the auth user id)
    await sb.from('profiles').upsert({ id: uid, company_name: name });

    // Optional: keep carriers table in sync if you’re using it
    await sb.from('carriers').upsert({ auth_user_id: uid, company_name: name });
  }catch(e){
    console.warn('ensureProfile() failed:', e);
  }
}

/**
 * Sign in from the modal on index/loads pages.
 * Requires inputs with ids: #authEmail, #authPass
 */
async function signin(){
  const err = $('#authError'); if (err) err.textContent = '';
  try{
    const email = $('#authEmail').value.trim();
    const password = $('#authPass').value;

    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;

    // Make sure a profile exists for this user
    await ensureProfile();

    $('#authModal')?.classList.remove('open');
    alert('Signed in.');
  }catch(e){
    if (err) err.textContent = e.message || 'Sign-in failed';
  }
}

/**
 * Optional: sign-up helper if your /register.html calls it.
 * Call: signup(email, password, companyName)
 */
async function signup(email, password, companyName){
  const { error } = await sb.auth.signUp({ email, password });
  if (error) throw error;
  await ensureProfile(companyName);
  return true;
}

/***********************
 *  Bidding            *
 ***********************/
async function bid(index){
  const l = LOADS[index]; if(!l){ alert('Load not found'); return; }

  // Require auth
  const { data: s } = await sb.auth.getSession();
  const uid = s?.session?.user?.id;
  if (!uid){ $('#authModal')?.classList.add('open'); return; }

  // Enter bid
  const amt = prompt('Enter your bid amount (USD):');
  if (amt === null) return;
  const val = Number(String(amt).replace(/[^0-9.]/g, ''));
  if (!isFinite(val) || val <= 0){ alert('Please enter a valid number'); return; }

  const notes = prompt('Notes (optional):') || '';

  try{
    const payload = {
      auth_user_id: uid,
      load_number: l.load_number || l._raw.load_number || l._raw.id || '',
      amount: val,
      notes
    };
    const { error } = await sb.from('bids').insert(payload);
    if (error) throw error;
    alert('Bid submitted!');
  }catch(e){
    alert(e.message || 'Bid failed');
  }
}

/***********************
 *  Boot               *
 ***********************/
document.addEventListener('DOMContentLoaded', () => {
  // Optional: reveal admin link when ?admin=true is present
  try{
    const url = new URL(location.href);
    const adminFlag = url.searchParams.get('admin');
    const adminLink = $('#adminLink');
    if (adminLink) adminLink.style.display = (adminFlag === 'true') ? 'inline' : 'none';
  }catch(e){}

  // Filter events
  ['q','commodity'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', applyFilters);
  });

  loadData();
});