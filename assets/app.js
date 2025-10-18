./* =========================================================================
   /assets/app.js — cleaned, consolidated, non-destructive
   ========================================================================= */

/* ---------------------------- Config & Globals ---------------------------- */
let LOADS = [];
let __lastList = [];               // last rendered list (after filters/sort)
let __currentBidKey = null;        // stable key of the card you clicked
let __aimAuth = { ready:false, uid:null }; // fast auth cache

// Supabase: created from global HTML vars if present (window.SUPABASE_URL/KEY)
let sb = (function initSupabase() {
  try {
    if (!window.sb && window.supabase && window.SUPABASE_URL && window.SUPABASE_KEY) {
      window.sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
    }
    return window.sb || null;
  } catch (e) {
    console.warn('Supabase init failed:', e);
    return null;
  }
})();

/* ------------------------------- Utilities -------------------------------- */
const $  = (q, el=document) => el.querySelector(q);
const $$ = (q, el=document) => Array.from(el.querySelectorAll(q));
const fmt = (n) => new Intl.NumberFormat().format(n);
const pick = (...xs)=>{ for(const x of xs){ if(x!=null && x!=='') return x; } return ''; };

function fromCity(l){ return pick(l.from_city,l.fromCity,l.originCity,l.origin,l.pickup_city,l.pickupCity,l.from); }
function toCity(l){   return pick(l.to_city,l.toCity,l.destinationCity,l.destination,l.dropoff_city,l.dropoffCity,l.to); }
function itemName(l){ return pick(l.item,l.vehicle,l.commodity,'Item'); }
function dateStr(l){  const raw = pick(l.date,l.available,l.availableDate,l.pickup_date,l.pickupDate,l.readyDate,l.date_available); return raw?String(raw):''; }
function safeMiles(l){
  const m = l.miles;
  const n = (typeof m === 'string') ? Number(m.replace(/,/g,'')) : Number(m);
  return Number.isFinite(n) ? n : '';
}

// Hide price line unless a real number is present
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

// Stable, deterministic key for each load (used to resolve on submit)
function makeKey(l){
  const k = l.load_number || l.id || l.uuid || l.key;
  if (k) return String(k);
  return `${fromCity(l)||'FROM'}-${toCity(l)||'TO'}-${dateStr(l)||''}`
    .replace(/\s+/g,'_').toUpperCase().slice(0,64);
}

function getLoadIdentifiers(l){
  const ln = l.load_number || l.loadNo || l.loadNum;
  const id = l.id || l.uuid || l.key;
  let ident = ln || id || makeKey(l);
  return { load_number: String(ident), load_id: String(id || ident) };
}

/* --------------------------------- Data ----------------------------------- */
async function loadData(){
  try{
    const res = await fetch('/assets/loads.json?ts=' + Date.now(), { cache: 'no-store' });
    const data = await res.json();
    LOADS = Array.isArray(data) ? data : (data.loads || []);
  }catch(e){
    console.error('Failed to load loads.json', e);
    LOADS = [];
  }
  applyFilters(); // triggers first render
}

/* -------------------------------- Render ---------------------------------- */
function render(list){
  __lastList = Array.isArray(list) ? list : [];
  const grid = $('#grid'); if (!grid) return;

  grid.innerHTML = __lastList.map((l, idx) => {
    const routeFrom  = fromCity(l);
    const routeTo    = toCity(l);
    const status     = (l.status || 'open').toString().toUpperCase();
    const miles      = safeMiles(l);
    const date       = dateStr(l);
    const item       = itemName(l);
    const priceBlock = priceHTML(l);
    const key        = makeKey(l);  // stable key

    return `
      <article class="card load-card" data-aim-id="${key}">
        <div class="route">${routeFrom} → ${routeTo} <span class="status ${status.toLowerCase()}">${status}</span></div>
        <div class="meta"><strong>Item:</strong> ${item}</div>
        <div class="meta"><strong>Miles:</strong> ${miles ? fmt(miles) : ''}</div>
        <div class="meta"><strong>First Available Date:</strong> ${date}</div>
        ${priceBlock}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
          <button class="btn secondary" onclick="openView(${idx})">View</button>
          <button class="btn">Bid</button>
        </div>
      </article>
    `;
  }).join('');

  applySortAndPagination();  // keep your current toolbar behavior if present
}

/* ------------------------------- Filtering -------------------------------- */
function applyFilters(){
  const term = ($('#q')?.value || '').toLowerCase();
  const comm = ($('#commodity')?.value || '').toLowerCase();

  const list = LOADS.filter(l => {
    const hay = (
      (itemName(l) || '') + ' ' +
      (fromCity(l) || '') + ' ' +
      (toCity(l)   || '') + ' ' +
      (l.commodity || '')
    ).toLowerCase();
    const okQ = !term || hay.includes(term);
    const okC = !comm || (l.commodity || '').toLowerCase() === comm;
    return okQ && okC;
  });

  render(list);
}

/* -------------------------- Sort + Pagination (opt) ------------------------ */
/* Uses existing controls if they exist in your HTML: 
   #sortSel, #ppSel, #pagerPrev, #pagerNext, #pagerInfo */
const pagerState = { page: 1, pageSize: 25 };

function getCards(){ return Array.from(document.querySelectorAll('#grid .card, #grid .load-card')); }

function parseCardData(card){
  const metas = Array.from(card.querySelectorAll('.meta')).map(e=>e.textContent.trim());

  // Miles
  const milesLine = metas.find(t => /^miles:/i.test(t));
  let miles = NaN;
  if (milesLine){ const m = milesLine.match(/miles:\s*([\d,]+)/i); if (m) miles = Number(m[1].replace(/,/g,'')); }

  // First Available Date
  const availLine = metas.find(t => /^first available date:/i.test(t));
  let avail = 0;
  if (availLine){ const m = availLine.match(/first available date:\s*(.+)$/i); if (m){ const d = new Date(m[1].trim()); if (!isNaN(d)) avail = d.getTime(); } }

  // Price
  const priceEl = card.querySelector('.price');
  let price = NaN;
  if (priceEl){
    const txt = priceEl.textContent.replace(/[^0-9.]/g,'');
    if (txt) price = Number(txt);
  }

  // Route + Item (for alpha sorts)
  const route = (card.querySelector('.route')?.textContent || '').trim().toLowerCase();
  const item  = (metas.find(t => /^item:/i.test(t)) || '').replace(/^item:\s*/i,'').trim().toLowerCase();
  return { miles, avail, price, route, item, el: card };
}

function sortCards(kind){
  const grid = $('#grid'); if (!grid) return;
  const cards = getCards().map(parseCardData);

  const cmp = {
    avail_desc: (a,b) => (b.avail||0) - (a.avail||0),
    avail_asc:  (a,b) => (a.avail||0) - (b.avail||0),
    price_desc: (a,b) => (isFinite(b.price)?b.price:-1)   - (isFinite(a.price)?a.price:-1),
    price_asc:  (a,b) => (isFinite(a.price)?a.price:1e15) - (isFinite(b.price)?b.price:1e15),
    miles_desc: (a,b) => (isFinite(b.miles)?b.miles:-1)   - (isFinite(a.miles)?a.miles:-1),
    miles_asc:  (a,b) => (isFinite(a.miles)?a.miles:1e15) - (isFinite(b.miles)?b.miles:1e15),
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

/* --------------------------------- Modals --------------------------------- */
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
      <button class="btn" onclick="openBidFromIndex(${index})">Bid</button>
    </div>
  `;
  $('#viewModal')?.classList.add('open');
}
function closeView(){ $('#viewModal')?.classList.remove('open'); }

function openAuth(){ $('#authModal')?.classList.add('open'); }
function closeAuth(){ $('#authModal')?.classList.remove('open'); }

function openBidModal(){ $('#bidModal')?.classList.add('open'); }
function closeBidModal(){
  $('#bidModal')?.classList.remove('open');
  const e=$('#bidError'); if (e) e.textContent='';
  const a=$('#bidAmount'); if (a) a.value='';
  const n=$('#bidNotes'); if (n) n.value='';
}

/* ------------------------------- Auth cache ------------------------------- */
(async function initAuthCache(){
  try{
    if (sb?.auth) {
      const set = (uid)=>{ __aimAuth.ready = true; __aimAuth.uid = uid || null; };
      const { data } = await sb.auth.getUser();
      set(data?.user?.id || null);
      sb.auth.onAuthStateChange((_e, session)=> set(session?.user?.id || null));
    } else {
      __aimAuth.ready = true;
    }
  }catch(_){ __aimAuth.ready = true; }
})();

/* ------------------------------- Sign in/out ------------------------------ */
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

/* ----------------------------- Bid flow (stable) -------------------------- */
// 1) Clicking any "Bid" button sets the card’s stable key and opens the modal
document.addEventListener('click', async (e) => {
  const el = e.target.closest('button, a');
  if (!el) return;

  const looksLikeBid = /(^|\s)btn(\s|$)/.test(el.className||'') && /bid/i.test(el.textContent||'');
  if (!looksLikeBid) return;

  const card = el.closest('.card, .load-card');
  const key  = card?.dataset?.aimId;
  if (!key) return; // render not finished yet; ignore

  __currentBidKey = key;

  // If logged out, open sign-in immediately (fast, no network wait)
  if (!__aimAuth.uid){
    openAuth(); e.preventDefault(); return;
  }

  openBidModal(); e.preventDefault();
});

// 2) Also support inline onclick="bid(index)" if your cards still have it
function openBidFromIndex(index){
  const l = __lastList?.[Number(index)];
  if (l) __currentBidKey = makeKey(l);
  if (!__aimAuth.uid) { openAuth(); return; }
  openBidModal();
}
async function bid(index){ openBidFromIndex(index); } // expose for legacy

// 3) Submit uses the stable key to find the exact load regardless of filters/sorts
async function submitBid(){
  const err = $('#bidError');
  const raw = ($('#bidAmount')?.value || '').trim();
  const amount = Number(raw);
  if (!raw || !Number.isFinite(amount) || amount <= 0){
    if (err) err.textContent = 'Please enter a valid dollar amount.'; return;
  }

  // ensure we have a user id (use cache, fallback to network once)
  let uid = __aimAuth.uid;
  if (!uid && sb?.auth){
    try { const { data } = await sb.auth.getUser(); uid = data?.user?.id || null; } catch(_){}
  }
  if (!uid){ openAuth(); return; }

  // resolve load by key
  const l = __lastList.find(x => makeKey(x) === __currentBidKey);
  if (!l){ if (err) err.textContent = 'Load not found.'; return; }

  const ids = getLoadIdentifiers(l);
  const miles = (function(){ const m = safeMiles(l); return m===''?null:m; })();

  const payload = {
    load_number: ids.load_number,
    load_id: ids.load_id,
    route_from: fromCity(l),
    route_to: toCity(l),
    item: itemName(l),
    miles,
    price_offer: Math.round(amount),
    notes: ($('#bidNotes')?.value || '').trim() || null,
    auth_user_id: uid,
    status: 'SUBMITTED',
    created_at: new Date().toISOString()
  };

  try{
    const { error } = await (sb ? sb.from('bids').insert(payload) : Promise.reject(new Error('No DB client')));
    if (error) throw error;
    closeBidModal();
    alert('Bid submitted! You can review it in Admin.');
  }catch(e){
    console.error('Bid insert failed:', e);
    if (err) err.textContent = e.message || 'Failed to submit bid.';
  }
}

/* --------------------------------- Boot ----------------------------------- */
function exposeGlobals(){
  window.openView = openView;
  window.closeView = closeView;
  window.openAuth = openAuth;
  window.closeAuth = closeAuth;
  window.openBidModal = openBidModal;
  window.closeBidModal = closeBidModal;
  window.submitBid = submitBid;
  window.bid = bid; // legacy
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
  // Close hidden modals; disable invisible full-screen blockers
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
  // Show Admin link only with ?admin=true
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

/* ===============================
   BID SNAPSHOT FAIL-SAFE (append-only)
   - On Bid click: capture a full snapshot of that card’s data
   - On Submit: prefer snapshot; fall back to key/list if needed
   =============================== */
(function bidSnapshotFailsafe(){
  // Tiny helpers
  const pick = (...xs)=>{ for (const x of xs){ if (x!=null && x!=='') return x; } return ''; };
  const fromCity = l => pick(l.from_city,l.fromCity,l.originCity,l.origin,l.pickup_city,l.pickupCity,l.from);
  const toCity   = l => pick(l.to_city,l.toCity,l.destinationCity,l.destination,l.dropoff_city,l.dropoffCity,l.to);
  const dateStr  = l => { const r = pick(l.date,l.available,l.availableDate,l.pickup_date,l.pickupDate,l.readyDate,l.date_available); return r?String(r):''; };
  const itemName = l => pick(l.item,l.vehicle,l.commodity,'Item');
  const safeMilesNum = (m)=>{
    const n = (typeof m==='string') ? Number(m.replace(/,/g,'')) : Number(m);
    return Number.isFinite(n) ? n : null;
  };
  const makeKey  = l => {
    const k = l?.load_number || l?.id || l?.uuid || l?.key;
    if (k) return String(k);
    return `${fromCity(l)||'FROM'}-${toCity(l)||'TO'}-${dateStr(l)||''}`.replace(/\s+/g,'_').toUpperCase().slice(0,64);
  };
  function getLoadIdentifiers(l){
    const ln = l?.load_number || l?.loadNo || l?.loadNum;
    const id = l?.id || l?.uuid || l?.key;
    let ident = ln || id || makeKey(l);
    return { load_number: String(ident||''), load_id: String(id || ident || '') };
  }

  // Parse a card’s DOM if needed (route/item/miles/date). Last resort.
  function snapshotFromCardEl(card){
    if (!card) return null;
    const routeTxt = (card.querySelector('.route')?.textContent||'').trim();
    // Expect "From → To"
    let route_from = '', route_to = '';
    if (routeTxt.includes('→')){
      const [f,t] = routeTxt.split('→');
      route_from = (f||'').trim();
      route_to   = (t||'').replace(/\s+OPEN|CLOSED|ACTIVE|PENDING.*/i,'').trim();
    }
    const metas = Array.from(card.querySelectorAll('.meta')).map(x=>x.textContent.trim());
    const itemLine  = metas.find(t=>/^item:/i.test(t)) || '';
    const milesLine = metas.find(t=>/^miles:/i.test(t)) || '';
    const dateLine  = metas.find(t=>/^first available date:/i.test(t)) || '';

    const item  = itemLine.replace(/^item:\s*/i,'').trim();
    const miles = safeMilesNum((milesLine.match(/miles:\s*([\d,]+)/i)||[])[1]||'');
    const date  = (dateLine.match(/first available date:\s*(.+)$/i)||[])[1]?.trim()||'';

    const snap = {
      route_from, route_to, item, miles,
      available: date, availableDate: date, pickup_date: date, date, // many aliases
    };
    // try to carry key from dataset if present
    const k = card.dataset?.aimId;
    if (k) snap.__key = String(k);
    return snap;
  }

  // Build a clean snapshot from a load object
  function snapshotFromLoad(l){
    if (!l) return null;
    const ids = getLoadIdentifiers(l);
    return {
      __key: makeKey(l),
      load_number: ids.load_number,
      load_id: ids.load_id,
      route_from: fromCity(l),
      route_to: toCity(l),
      item: itemName(l),
      miles: safeMilesNum(l.miles),
      available: dateStr(l)
    };
  }

  // Store the snapshot when user clicks any Bid button
  document.addEventListener('click', (e)=>{
    const el = e.target.closest('button, a');
    if (!el) return;
    const looksBid = /(^|\s)btn(\s|$)/.test(el.className||'') && /bid/i.test(el.textContent||'');
    if (!looksBid) return;

    const card = el.closest('.card, .load-card');
    if (!card) return;

    // Preferred: find matching object in the last list by data-aim-id
    const key = card.dataset?.aimId || null;
    let snap = null;

    if (key && Array.isArray(window.__lastList) && window.__lastList.length){
      const obj = window.__lastList.find(x => makeKey(x) === key);
      snap = snapshotFromLoad(obj);
    }

    // Fallback: parse from card DOM if we didn’t find an object
    if (!snap) snap = snapshotFromCardEl(card);

    // Keep for submit
    window.__aimBidSnapshot = snap || null;
  }, true);

  // Wrap/replace submitBid to prefer the snapshot
  const origSubmit = (typeof window.submitBid === 'function') ? window.submitBid : null;
  window.submitBid = async function(){
    const err = document.getElementById('bidError');
    const amtEl = document.getElementById('bidAmount');
    const notesEl = document.getElementById('bidNotes');

    // Validate amount
    const raw = (amtEl?.value || '').trim();
    const amount = Number(raw);
    if (!raw || !Number.isFinite(amount) || amount <= 0){
      if (err) err.textContent = 'Please enter a valid dollar amount.';
      return;
    }

    // Resolve auth (cached first)
    let uid = (window.__aimAuth && window.__aimAuth.uid) || null;
    if (!uid && window.sb?.auth){
      try { const { data } = await sb.auth.getUser(); uid = data?.user?.id || null; } catch(_){}
    }
    if (!uid){ (typeof window.openAuth==='function'? window.openAuth() : document.getElementById('authModal')?.classList.add('open')); return; }

    // Prefer snapshot
    let snap = window.__aimBidSnapshot || null;

    // Fallback to key → list lookup
    if (!snap) {
      const key = window.__currentBidKey || null;
      const list = Array.isArray(window.__lastList) ? window.__lastList : [];
      const obj = key ? list.find(x => makeKey(x) === key) : null;
      if (obj) snap = snapshotFromLoad(obj);
    }

    // If still nothing, last-ditch: try open view’s card (DOM)
    if (!snap) {
      const openCard = document.querySelector('#grid .card, #grid .load-card'); // first visible card
      snap = snapshotFromCardEl(openCard);
    }

    if (!snap){
      if (err) err.textContent = 'Load not found.';
      return;
    }

    // Build payload from snapshot (no reliance on list now)
    const ids = getLoadIdentifiers({ load_number: snap.load_number, id: snap.load_id, ...snap });
    const payload = {
      load_number: ids.load_number,
      load_id: ids.load_id,
      route_from: snap.route_from || '',
      route_to: snap.route_to || '',
      item: snap.item || 'Item',
      miles: (typeof snap.miles==='number' ? snap.miles : null),
      price_offer: Math.round(amount),
      notes: (notesEl?.value || '').trim() || null,
      auth_user_id: uid,
      status: 'SUBMITTED',
      created_at: new Date().toISOString()
    };

    try{
      const { error } = await (window.sb ? sb.from('bids').insert(payload) : Promise.reject(new Error('No DB client')));
      if (error) throw error;
      (typeof window.closeBidModal==='function' ? window.closeBidModal() : document.getElementById('bidModal')?.classList.remove('open'));
      alert('Bid submitted! You can review it in Admin.');
      // clear snapshot after success
      window.__aimBidSnapshot = null;
    }catch(e){
      console.error('Bid insert failed:', e);
      if (err) err.textContent = e.message || 'Failed to submit bid.';
    }
  };
})();