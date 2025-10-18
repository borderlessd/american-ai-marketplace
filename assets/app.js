/* =========================================================================
   /assets/app.js  —  clean rewrite
   ========================================================================= */

//// ---------------------------- Config --------------------------------- ////
let LOADS = [];
let __lastList = [];          // last rendered (filtered/sorted) list for safe indexing
let __currentBidIndex = null; // index into __lastList used by Bid modal

// Supabase client from globals injected in HTML (window.SUPABASE_URL/KEY)
let sb = (function initSupabase() {
  try {
    if (!window.SUPABASE_URL || !window.SUPABASE_KEY || !window.supabase) return null;
    const c = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
    window.sb = c; // expose for nav.js
    return c;
  } catch (e) {
    console.warn('Supabase init failed:', e);
    return null;
  }
})();

//// ---------------------------- Helpers -------------------------------- ////
const $  = (q, el=document) => el.querySelector(q);
const $$ = (q, el=document) => Array.from(el.querySelectorAll(q));
const fmt = (n) => new Intl.NumberFormat().format(n);

function pick(...xs){ for(const x of xs){ if(x!=null && x!=='') return x; } return ''; }
function fromCity(l){ return pick(l.from_city,l.fromCity,l.originCity,l.origin,l.pickup_city,l.pickupCity,l.from); }
function toCity(l){   return pick(l.to_city,l.toCity,l.destinationCity,l.destination,l.dropoff_city,l.dropoffCity,l.to); }
function itemName(l){ return pick(l.item,l.vehicle,l.commodity,'Item'); }
function dateStr(l){  const raw = pick(l.date,l.available,l.availableDate,l.pickup_date,l.pickupDate,l.readyDate,l.date_available); return raw?String(raw):''; }
function safeMiles(l){
  const m = l.miles;
  const n = (typeof m === 'string') ? Number(m.replace(/,/g,'')) : Number(m);
  return Number.isFinite(n) ? n : '';
}

// Show price only when it's a real number > 0
function priceHTML(l){
  let p = l.price;
  if (p == null) return '';
  if (typeof p === 'string'){
    const s = p.trim().toUpperCase();
    if (!s || s === 'TBD' || s === 'N/A' || s === 'NA' || s === '-' || s === '—') return '';
    const num = Number(s.replace(/[^0-9.]/g,''));
    if (Number.isFinite(num) && num > 0) return `<div class="price" style="margin:8px 0">Price: $${fmt(num)}</div>`;
    return '';
  }
  if (typeof p === 'number' && Number.isFinite(p) && p > 0){
    return `<div class="price" style="margin:8px 0">Price: $${fmt(p)}</div>`;
  }
  return '';
}

// Always provide identifiers expected by DB
function getLoadIdentifiers(l){
  const ln = l.load_number || l.loadNo || l.loadNum;
  const id = l.id || l.uuid || l.key;
  let ident = ln || id;
  if (!ident){
    const f = fromCity(l) || 'FROM';
    const t = toCity(l) || 'TO';
    const d = (dateStr(l) || new Date().toISOString().slice(0,10));
    ident = `${String(f)}-${String(t)}-${String(d)}`.replace(/\s+/g,'_').toUpperCase().slice(0,64);
  }
  return { load_number: String(ident), load_id: String(id || ident) };
}

//// ---------------------------- Data ----------------------------------- ////
async function loadData(){
  try{
    const res = await fetch('/assets/loads.json?ts=' + Date.now(), { cache: 'no-store' });
    const data = await res.json();
    LOADS = Array.isArray(data) ? data : (data.loads || []);
  }catch(e){
    console.error('Failed to load loads.json', e);
    LOADS = [];
  }
  applyFilters();  // renders and updates __lastList
}

//// ---------------------------- Render --------------------------------- ////
function render(list){
  __lastList = Array.isArray(list) ? list : [];
  const grid = $('#grid'); if (!grid) return;

  grid.innerHTML = __lastList.map((l, idx) => {
    const routeFrom  = pick(fromCity(l));
    const routeTo    = pick(toCity(l));
    const status     = (l.status || 'open').toString().toUpperCase();
    const miles      = safeMiles(l);
    const date       = dateStr(l);
    const item       = itemName(l);
    const priceBlock = priceHTML(l);

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

  // After render, (re)apply sort/pagination because card count changed
  applySortAndPagination();
}

//// ---------------------------- Filters -------------------------------- ////
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

//// ---------------------------- Sort + Pagination ---------------------- ////
const pagerState = { page: 1, pageSize: 25 };

function getCards(){ return Array.from(document.querySelectorAll('#grid .card, #grid .load-card')); }

function parseCardData(card){
  // Miles
  const milesLine = Array.from(card.querySelectorAll('.meta')).map(e=>e.textContent.trim())
    .find(t => /^miles:/i.test(t));
  let miles = NaN;
  if (milesLine){ const m = milesLine.match(/miles:\s*([\d,]+)/i); if (m) miles = Number(m[1].replace(/,/g,'')); }

  // First Available Date
  const availLine = Array.from(card.querySelectorAll('.meta')).map(e=>e.textContent.trim())
    .find(t => /^first available date:/i.test(t));
  let avail = 0;
  if (availLine){ const m = availLine.match(/first available date:\s*(.+)$/i);
    if (m){ const d = new Date(m[1].trim()); if (!isNaN(d)) avail = d.getTime(); } }

  // Price
  const priceEl = card.querySelector('.price');
  let price = NaN;
  if (priceEl){
    const txt = priceEl.textContent.replace(/[^0-9.]/g,'');
    if (txt) price = Number(txt);
  }

  // Route + Item
  const route = (card.querySelector('.route')?.textContent || '').trim().toLowerCase();
  const item  = (Array.from(card.querySelectorAll('.meta')).map(e=>e.textContent.trim())
                  .find(t => /^item:/i.test(t)) || '').replace(/^item:\s*/i,'').trim().toLowerCase();
  return { miles, avail, price, route, item, el: card };
}

function sortCards(kind){
  const grid = $('#grid'); if (!grid) return;
  const cards = getCards().map(parseCardData);

  const cmp = {
    avail_desc: (a,b) => (b.avail||0) - (a.avail||0),
    avail_asc:  (a,b) => (a.avail||0) - (b.avail||0),
    price_desc: (a,b) => (isFinite(b.price)?b.price:-1) - (isFinite(a.price)?a.price:-1),
    price_asc:  (a,b) => (isFinite(a.price)?a.price:Infinity) - (isFinite(b.price)?b.price:Infinity),
    miles_desc: (a,b) => (isFinite(b.miles)?b.miles:-1) - (isFinite(a.miles)?a.miles:-1),
    miles_asc:  (a,b) => (isFinite(a.miles)?a.miles:Infinity) - (isFinite(b.miles)?b.miles:Infinity),
    route_az:   (a,b) => a.route.localeCompare(b.route),
    route_za:   (a,b) => b.route.localeCompare(a.route),
    item_az:    (a,b) => a.item.localeCompare(b.item),
    item_za:    (a,b) => b.item.localeCompare(a.item),
  }[kind] || ((a,b)=>0);

  cards.sort(cmp);
  const frag = document.createDocumentFragment();
  cards.forEach(x => frag.appendChild(x.el));
  grid.appendChild(frag);
}

function applyPagination(){
  const cards = getCards();
  const total = cards.length;
  const last  = Math.max(1, Math.ceil(total / pagerState.pageSize));
  if (pagerState.page > last) pagerState.page = last;

  const start = (pagerState.page-1) * pagerState.pageSize;
  const end   = start + pagerState.pageSize;
  cards.forEach((el,i)=>{ el.style.display = (i>=start && i<end) ? '' : 'none'; });

  const info = $('#pagerInfo'); if (info) info.textContent = `Page ${pagerState.page} / ${last}`;
  const prev = $('#pagerPrev'); if (prev) prev.disabled = pagerState.page <= 1;
  const next = $('#pagerNext'); if (next) next.disabled = pagerState.page >= last;
}

function applySortAndPagination(){
  const sortSel = $('#sortSel');
  const kind = sortSel ? sortSel.value : 'avail_desc';
  sortCards(kind);
  applyPagination();
}

function wireSortAndPaginationOnce(){
  const pp = $('#ppSel'), sortSel = $('#sortSel'), prev = $('#pagerPrev'), next = $('#pagerNext');
  if (pp && !pp.__wired){ pp.__wired = true; pp.addEventListener('change', () => { pagerState.pageSize = parseInt(pp.value,10)||25; pagerState.page=1; applyPagination(); });}
  if (sortSel && !sortSel.__wired){ sortSel.__wired = true; sortSel.addEventListener('change', () => { pagerState.page=1; applySortAndPagination(); });}
  if (prev && !prev.__wired){ prev.__wired = true; prev.addEventListener('click', () => { if (pagerState.page>1){ pagerState.page--; applyPagination(); } });}
  if (next && !next.__wired){ next.__wired = true; next.addEventListener('click', () => {
    const total = getCards().length;
    const last  = Math.max(1, Math.ceil(total / pagerState.pageSize));
    if (pagerState.page<last){ pagerState.page++; applyPagination(); }
  });}
}

//// ---------------------------- View modal ----------------------------- ////
function openView(index){
  const l = __lastList[index]; if (!l) return;
  const box = $('#viewContent'); if (!box) return;

  const routeFrom = fromCity(l), routeTo = toCity(l);
  const status = (l.status||'open').toString().toUpperCase();
  const miles = safeMiles(l), date = dateStr(l), item = itemName(l);
  const priceBlock = priceHTML(l);

  box.innerHTML = `
    <div class="title">${item}</div>
    <div class="meta" style="margin-bottom:6px"><strong>Route:</strong> ${routeFrom} → ${routeTo}
      &nbsp; <span class="status ${status.toLowerCase()}">${status}</span></div>
    <div class="meta"><strong>Miles:</strong> ${miles?fmt(miles):''}</div>
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

//// ---------------------------- Auth + Bid ----------------------------- ////
function openAuth(){ $('#authModal')?.classList.add('open'); }
function closeAuth(){ $('#authModal')?.classList.remove('open'); }

async function signin(){
  const err = $('#authError');
  try{
    const email = $('#authEmail')?.value?.trim();
    const pass  = $('#authPass')?.value?.trim();
    if (!email || !pass){ if (err) err.textContent = 'Email and password required.'; return; }
    if (!sb){ if (err) err.textContent = 'Auth service unavailable.'; return; }
    const { error } = await sb.auth.signInWithPassword({ email, password: pass });
    if (error) throw error;
    closeAuth();
    location.reload();
  }catch(e){ if (err) err.textContent = e.message || 'Sign-in failed.'; }
}

// Bid button → require auth → open modal
async function bid(index){
  __currentBidIndex = Number(index);
  try{
    if (!sb){ openAuth(); return; }
    const { data } = await sb.auth.getUser();
    if (!data?.user?.id){ openAuth(); return; }
    openBidModal();
  }catch(e){ openAuth(); }
}

function openBidModal(){ $('#bidModal')?.classList.add('open'); }
function closeBidModal(){
  $('#bidModal')?.classList.remove('open');
  const e=$('#bidError'); if (e) e.textContent='';
  const a=$('#bidAmount'); if (a) a.value='';
  const n=$('#bidNotes'); if (n) n.value='';
}

async function submitBid(){
  const err = $('#bidError');
  const raw = ($('#bidAmount')?.value || '').trim();
  const amount = Number(raw);
  if (!raw || !Number.isFinite(amount) || amount <= 0){
    if (err) err.textContent = 'Please enter a valid dollar amount.'; return;
  }

  if (!sb){ openAuth(); return; }
  const { data: userData } = await sb.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId){ openAuth(); return; }

  const l = __lastList[__currentBidIndex];
  if (!l){ if (err) err.textContent = 'Load not found.'; return; }

  const ids = getLoadIdentifiers(l);

  const payload = {
    load_number: ids.load_number,  // satisfies NOT NULL if present
    load_id: ids.load_id,
    route_from: fromCity(l),
    route_to: toCity(l),
    item: itemName(l),
    miles: (safeMiles(l) || null),
    price_offer: Math.round(amount),
    notes: ($('#bidNotes')?.value || '').trim() || null,
    auth_user_id: userId,
    status: 'SUBMITTED',
    created_at: new Date().toISOString()
  };

  try{
    const { error } = await sb.from('bids').insert(payload);
    if (error) throw error;
    closeBidModal();
    alert('Bid submitted! You can review it in Admin.');
  }catch(e){
    console.error('Bid insert failed:', e);
    if (err) err.textContent = e.message || 'Failed to submit bid.';
  }
}

//// ---------------------------- Boot ----------------------------------- ////
function exposeGlobals(){
  window.openView = openView;
  window.closeView = closeView;
  window.bid = bid;
  window.signin = signin;
  window.openAuth = openAuth;
  window.closeAuth = closeAuth;
  window.openBidModal = openBidModal;
  window.closeBidModal = closeBidModal;
  window.submitBid = submitBid;
}

function wireInputs(){
  ['q','commodity'].forEach(id=>{
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener(el.tagName==='SELECT' ? 'change' : 'input', applyFilters);
  });
  wireSortAndPaginationOnce();
}

function unblockOverlays(){
  // close hidden modals; disable invisible full-screen blockers
  $$('.modal').forEach(m=>{
    if (!m.classList.contains('open')) { m.style.display='none'; m.style.pointerEvents='none'; }
    else { m.style.display=''; m.style.pointerEvents=''; m.style.zIndex='99999'; }
  });
  const vw = Math.max(document.documentElement.clientWidth, window.innerWidth||0);
  const vh = Math.max(document.documentElement.clientHeight, window.innerHeight||0);
  $$('body *').forEach(el=>{
    const cs = getComputedStyle(el);
    if (cs.position==='fixed' || cs.position==='absolute'){
      const r = el.getBoundingClientRect();
      const covers = r.width>=vw*0.9 && r.height>=vh*0.9 && r.top<=0 && r.left<=0;
      const invisible = (parseFloat(cs.opacity)<0.05) || cs.visibility==='hidden';
      if (covers && (invisible || !el.innerText.trim()) && !el.classList.contains('modal')){
        el.style.pointerEvents='none';
      }
    }
  });
  document.addEventListener('keydown', (e)=>{ if (e.key==='Escape'){ $$('.modal.open').forEach(m=>m.classList.remove('open')); }});
}

document.addEventListener('DOMContentLoaded', () => {
  // Show Admin link only when ?admin=true
  try{
    const url = new URL(location.href);
    const adminFlag = url.searchParams.get('admin')==='true';
    const adminLink = $('#adminLink');
    if (adminLink) adminLink.style.display = adminFlag ? 'inline' : 'none';
  }catch(_){}

  exposeGlobals();
  wireInputs();
  unblockOverlays();
  loadData();

  // Re-apply guards after initial async renders
  setTimeout(unblockOverlays, 200);
  setTimeout(unblockOverlays, 800);
});