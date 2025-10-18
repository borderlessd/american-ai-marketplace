/* =========================================================================
   /assets/app.js  —  stable build (data-carrying Bid buttons)
   ========================================================================= */

/* --------------------------- Globals & Setup --------------------------- */
let LOADS = [];
let __lastList = []; // last filtered list, used for optional features

// Supabase client (expects these in your HTML before this file):
// <script src="https://unpkg.com/@supabase/supabase-js@2"></script>
// <script>window.SUPABASE_URL='...'; window.SUPABASE_KEY='...';</script>
let sb = null;
try {
  if (window.supabase && window.SUPABASE_URL && window.SUPABASE_KEY) {
    sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
    window.sb = sb; // expose globally for other scripts
  }
} catch (e) { console.warn('Supabase init failed:', e); }

/* ------------------------------- Helpers ------------------------------ */
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

/* ------------------------------- Data --------------------------------- */
async function loadData(){
  try{
    const res = await fetch('/assets/loads.json?ts=' + Date.now(), { cache: 'no-store' });
    const data = await res.json();
    LOADS = Array.isArray(data) ? data : (data.loads||[]);
  }catch(e){
    console.error('Failed to load loads.json', e);
    LOADS = [];
  }
  applyFilters();
}

/* ------------------------------ Render -------------------------------- */
function render(list){
  __lastList = Array.isArray(list) ? list : [];
  const grid = $('#grid'); if(!grid) return;

  grid.innerHTML = __lastList.map((l, idx) => {
    const routeFrom  = fromCity(l) || '';
    const routeTo    = toCity(l) || '';
    const status     = (l.status || 'open').toString().toUpperCase();
    const miles      = safeMiles(l);
    const date       = dateStr(l);
    const item       = itemName(l);
    const priceBlock = priceHTML(l);

    // Build the payload for this card; store directly on the Bid button
    const payload = {
      load_number: l.load_number || l.id || `${routeFrom}-${routeTo}-${date}`.replace(/\s+/g,'_').toUpperCase().slice(0,64),
      load_id:     l.id || l.load_number || '',
      route_from:  routeFrom,
      route_to:    routeTo,
      item:        item,
      miles:       miles ? Number(miles) : null,
      date:        date || '',
      price:       l.price ?? null
    };
    const dataLoad = JSON.stringify(payload).replace(/'/g, "&apos;");

    return `
      <article class="card load-card">
        <div class="route">${routeFrom} → ${routeTo} <span class="status ${status.toLowerCase()}">${status}</span></div>
        <div class="meta"><strong>Item:</strong> ${item}</div>
        <div class="meta"><strong>Miles:</strong> ${miles ? fmt(miles) : ''}</div>
        <div class="meta"><strong>First Available Date:</strong> ${date}</div>
        ${priceBlock}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
          <button class="btn secondary" onclick="openView(${idx})">View</button>
          <button class="btn" onclick="bidDirect(this)" data-load='${dataLoad}'>Bid</button>
        </div>
      </article>
    `;
  }).join('');

  applySortAndPagination();
}

/* ----------------------------- Filtering ------------------------------ */
function applyFilters(){
  const term = ($('#q')?.value||'').toLowerCase();
  const comm = ($('#commodity')?.value||'').toLowerCase();

  const list = LOADS.filter(l => {
    const hay = (
      (itemName(l) || '') + ' ' +
      (fromCity(l) || '') + ' ' +
      (toCity(l) || '')   + ' ' +
      (l.commodity || '')
    ).toLowerCase();
    const okQ = !term || hay.includes(term);
    const okC = !comm || (l.commodity||'').toLowerCase()===comm;
    return okQ && okC;
  });

  render(list);
}

/* ------------------------ Sort + Pagination (hooks) ------------------- */
/* This uses existing controls if they exist:
   - #sortSel (value: avail_desc, avail_asc, price_desc, price_asc, miles_desc, miles_asc, route_az, route_za, item_az, item_za)
   - #ppSel (10/25/50/100), #pagerPrev, #pagerNext, #pagerInfo
   If you don’t have them, these no-op safely.
*/
const pagerState = { page: 1, pageSize: 25 };

function getCards(){ return Array.from(document.querySelectorAll('#grid .card, #grid .load-card')); }

function parseCardData(card){
  const metas = Array.from(card.querySelectorAll('.meta')).map(e=>e.textContent.trim());
  const milesLine  = metas.find(t => /^miles:/i.test(t)) || '';
  const availLine  = metas.find(t => /^first available date:/i.test(t)) || '';
  const itemLine   = metas.find(t => /^item:/i.test(t)) || '';
  let miles = Number((milesLine.match(/([\d,]+)/)?.[1]||'').replace(/,/g,''));
  if (!Number.isFinite(miles)) miles = NaN;
  let avail = 0;
  const a = availLine.replace(/^first available date:\s*/i,'').trim();
  if (a){ const d = new Date(a); if (!isNaN(d)) avail = d.getTime(); }
  const priceEl = card.querySelector('.price');
  let price = NaN;
  if (priceEl){
    const txt = priceEl.textContent.replace(/[^0-9.]/g,''); if (txt) price = Number(txt);
  }
  const route = (card.querySelector('.route')?.textContent || '').trim().toLowerCase();
  const item  = itemLine.replace(/^item:\s*/i,'').trim().toLowerCase();
  return { miles, avail, price, route, item, el: card };
}

function sortCards(kind){
  const grid = $('#grid'); if (!grid) return;
  const items = getCards().map(parseCardData);
  const cmp = {
    avail_desc: (a,b)=> (b.avail||0) - (a.avail||0),
    avail_asc:  (a,b)=> (a.avail||0) - (b.avail||0),
    price_desc: (a,b)=> (isFinite(b.price)?b.price:-1) - (isFinite(a.price)?a.price:-1),
    price_asc:  (a,b)=> (isFinite(a.price)?a.price:Infinity) - (isFinite(b.price)?b.price:Infinity),
    miles_desc: (a,b)=> (isFinite(b.miles)?b.miles:-1) - (isFinite(a.miles)?a.miles:-1),
    miles_asc:  (a,b)=> (isFinite(a.miles)?a.miles:Infinity) - (isFinite(b.miles)?b.miles:-1),
    route_az:   (a,b)=> a.route.localeCompare(b.route),
    route_za:   (a,b)=> b.route.localeCompare(a.route),
    item_az:    (a,b)=> a.item.localeCompare(b.item),
    item_za:    (a,b)=> b.item.localeCompare(a.item),
  }[kind] || ((a,b)=>0);

  items.sort(cmp);
  const frag = document.createDocumentFragment();
  items.forEach(x => frag.appendChild(x.el));
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
  if (pp && !pp.__wired){ pp.__wired = true; pp.addEventListener('change', ()=>{ pagerState.pageSize = parseInt(pp.value,10)||25; pagerState.page=1; applyPagination(); });}
  if (sortSel && !sortSel.__wired){ sortSel.__wired = true; sortSel.addEventListener('change', ()=>{ pagerState.page=1; applySortAndPagination(); });}
  if (prev && !prev.__wired){ prev.__wired = true; prev.addEventListener('click', ()=>{ if (pagerState.page>1){ pagerState.page--; applyPagination(); } });}
  if (next && !next.__wired){ next.__wired = true; next.addEventListener('click', ()=>{
    const total = getCards().length;
    const last  = Math.max(1, Math.ceil(total / pagerState.pageSize));
    if (pagerState.page<last){ pagerState.page++; applyPagination(); }
  });}
}

/* ------------------------------ View Modal ---------------------------- */
function openView(index){
  const l = __lastList[index]; if(!l) return;
  const box = $('#viewContent'); if(!box) return;

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
    </div>
  `;
  $('#viewModal')?.classList.add('open');
}
function closeView(){ $('#viewModal')?.classList.remove('open'); }

/* ------------------------------ Auth Modal ---------------------------- */
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

/* -------------------------- Bid: data-carrying ------------------------ */
// Called by the Bid button (onclick="bidDirect(this)")
async function bidDirect(btn) {
  try {
    // block any anchors from scrolling the page
    const a = btn.closest('a'); if (a) { a.href = 'javascript:void(0)'; }

    // Load payload from the button itself
    const loadData = JSON.parse(btn.dataset.load || "{}");
    if (!loadData.load_number && !loadData.route_from) {
      alert("Missing load data.");
      return;
    }

    // Require login
    if (!sb) { openAuth(); return; }
    const { data: auth } = await sb.auth.getUser();
    if (!auth?.user) { openAuth(); return; }

    // Stash payload on the modal element and open it
    const modal = document.getElementById("bidModal");
    if (modal) {
      modal.dataset.load = JSON.stringify(loadData);
      modal.classList.add("open");
    }
  } catch (e) {
    console.error("bidDirect error:", e);
  }
}

// Submit reads only the modal’s payload (no indexes, no DOM lookups)
async function submitBid() {
  const err = document.getElementById("bidError");
  const amtEl = document.getElementById("bidAmount");
  const notesEl = document.getElementById("bidNotes");
  const modal = document.getElementById("bidModal");

  const raw = (amtEl?.value || '').trim();
  const amount = Number(raw);
  if (!raw || !Number.isFinite(amount) || amount <= 0) {
    if (err) err.textContent = "Please enter a valid dollar amount.";
    return;
  }

  if (!sb){ openAuth(); return; }
  const { data: userData } = await sb.auth.getUser();
  const uid = userData?.user?.id;
  if (!uid) { openAuth(); return; }

  let loadData = {};
  try { loadData = JSON.parse(modal?.dataset.load || "{}"); } catch {}

  if (!loadData.load_number && !loadData.route_from) {
    if (err) err.textContent = "Load not found.";
    return;
  }

  const payload = {
    load_number: loadData.load_number || loadData.load_id,
    load_id:     loadData.load_id || loadData.load_number,
    route_from:  loadData.route_from || '',
    route_to:    loadData.route_to || '',
    item:        loadData.item || 'Item',
    miles:       loadData.miles != null ? Number(loadData.miles) : null,
    price_offer: Math.round(amount),
    notes:       (notesEl?.value || '').trim() || null,
    auth_user_id: uid,
    status:      "SUBMITTED",
    created_at:  new Date().toISOString()
  };

  try {
    const { error } = await sb.from("bids").insert(payload);
    if (error) throw error;
    if (modal) modal.classList.remove("open");
    alert("Bid submitted! You can review it in Admin.");
  } catch (e) {
    console.error("Bid insert failed:", e);
    if (err) err.textContent = e.message || "Failed to submit bid.";
  }
}

/* ------------------------------ Boot/Wiring --------------------------- */
function exposeGlobals(){
  window.openView = openView;
  window.closeView = closeView;
  window.openAuth = openAuth;
  window.closeAuth = closeAuth;
  window.signin = signin;
  window.bidDirect = bidDirect;
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

document.addEventListener('DOMContentLoaded', () => {
  // Show Admin link only with ?admin=true
  try{
    const url = new URL(window.location.href);
    const adminFlag = url.searchParams.get('admin')==='true';
    const adminLink = document.getElementById('adminLink');
    if (adminLink) adminLink.style.display = adminFlag ? 'inline' : 'none';
  }catch(_){}

  exposeGlobals();
  wireInputs();
  loadData();

  // prevent anchor jump-to-top globally
  document.addEventListener('click', (e)=>{
    const a = e.target.closest('a');
    if (!a) return;
    const href = a.getAttribute('href') || '';
    if (href === '' || href === '#'){ e.preventDefault(); }
  }, true);
});

/* ======================================================================
   >>> BID KILL-SWITCH (append-only) <<<
   Makes every Bid button reliable, even after sort/pagination.
   - Cancels anchor jumps (# / empty href)
   - Stamps/repairs payloads on ALL cards via MutationObserver
   - Opens modal with that exact payload
   - submitBid reads only the modal snapshot
   ====================================================================== */
(function AIM_BID_KILLSWITCH(){
  // ---------- tiny helpers ----------
  const $  = (q, r=document)=>r.querySelector(q);
  const $$ = (q, r=document)=>Array.from(r.querySelectorAll(q));
  const pick = (...xs)=>{ for(const x of xs){ if(x!=null && x!=='') return x; } return ''; };
  const fromCity = l => pick(l.from_city,l.fromCity,l.originCity,l.origin,l.pickup_city,l.pickupCity,l.from);
  const toCity   = l => pick(l.to_city,l.toCity,l.destinationCity,l.destination,l.dropoff_city,l.dropoffCity,l.to);
  const dateStr  = l => { const r = pick(l.date,l.available,l.availableDate,l.pickup_date,l.pickupDate,l.readyDate,l.date_available); return r?String(r):''; };
  const makeKey  = l => (l?.load_number||l?.id||l?.uuid||l?.key) ||
                        `${fromCity(l)||'FROM'}-${toCity(l)||'TO'}-${dateStr(l)||''}`.replace(/\s+/g,'_').toUpperCase().slice(0,64);

  // Build a payload by *reading the card DOM*, even if data-load is missing.
  function payloadFromCard(card){
    if (!card) return null;
    const routeTxt = (card.querySelector('.route')?.textContent||'').trim();
    let rf='', rt='';
    if (routeTxt.includes('→')){
      const [f,t] = routeTxt.split('→');
      rf = (f||'').trim();
      rt = (t||'').replace(/\s+(OPEN|ACTIVE|CLOSED|PENDING).*/i,'').trim();
    }
    const metas = $$('.meta', card).map(x=>x.textContent.trim());
    const item  = (metas.find(t=>/^item:/i.test(t))||'').replace(/^item:\s*/i,'').trim() || 'Item';
    const miles = (metas.find(t=>/^miles:/i.test(t))||'').replace(/[^0-9]/g,'');
    const avail = (metas.find(t=>/^first available date:/i.test(t))||'').replace(/^first available date:\s*/i,'').trim();

    // Prefer an id already present on the element
    const existing = card.dataset.aimId || card.getAttribute('data-aim-id') || null;
    const idGuess  = `${rf}-${rt}-${avail}`.replace(/\s+/g,'_').toUpperCase().slice(0,64);
    const load_number = existing || idGuess;
    return {
      __key: load_number,
      load_number,
      load_id: load_number,
      route_from: rf,
      route_to: rt,
      item,
      miles: miles ? Number(miles) : null,
      available: avail
    };
  }

  // Prevent any anchor jump (this is the piece that yanks you to top).
  if (!document.__aimKillAnchors){
    document.__aimKillAnchors = true;
    const kill = ev=>{
      const a = ev.target.closest('a');
      if (!a) return;
      const href = a.getAttribute('href')||'';
      if (href === '' || href === '#' || href.startsWith('#')){
        ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();
      }
    };
    ['pointerdown','touchstart','click'].forEach(t=>document.addEventListener(t, kill, true));
  }

  // Ensure bid modal + hidden store exist
  function ensureModalStore(){
    let modal = $('#bidModal');
    if (!modal){
      const shell = document.createElement('div');
      shell.innerHTML = `
        <div id="bidModal" class="modal"><div class="panel">
          <div class="title">Submit a Bid</div>
          <label>Offer Amount (USD)<input id="bidAmount" type="number" class="input" min="1" step="1" placeholder="e.g. 1299"></label>
          <div style="height:8px"></div>
          <label>Notes (optional)<input id="bidNotes" class="input" placeholder="Any extra details…"></label>
          <div id="bidError" class="error"></div>
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
            <button class="btn secondary" type="button" onclick="(window.closeBidModal||function(){document.getElementById('bidModal')?.classList.remove('open');})()">Cancel</button>
            <button class="btn" type="button" onclick="window.submitBid && window.submitBid()">Submit Bid</button>
          </div>
        </div></div>`;
      document.body.appendChild(shell.firstElementChild);
      modal = $('#bidModal');
    }
    if (!$('#bidPayloadStore', modal)){
      const ta = document.createElement('textarea');
      ta.id = 'bidPayloadStore';
      ta.style.display = 'none';
      modal.appendChild(ta);
    }
  }
  ensureModalStore();

  // Turn any “Bid” thing (button or link) into a reliable trigger.
  function wireOneBid(btn){
    if (!btn || btn.__aimWired) return;
    btn.__aimWired = true;

    // Make it a real button to avoid form/anchor defaults
    if (btn.tagName === 'A'){ btn.setAttribute('role','button'); btn.removeAttribute('href'); }
    btn.setAttribute('type','button');

    btn.addEventListener('click', async (e)=>{
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();

      // 1) Find the containing card and derive payload (or use existing data-load)
      const card = btn.closest('.load-card, .card');
      if (!card) return;
      let payload = null;
      const attr = btn.getAttribute('data-load');
      if (attr){ try { payload = JSON.parse(attr); } catch(_){} }
      if (!payload) payload = payloadFromCard(card);
      if (!payload){ alert('Could not read load info from card.'); return; }

      // 2) Auth gate
      try{
        if (!window.sb?.auth){ (window.openAuth||(()=>{}))(); return; }
        const { data } = await sb.auth.getUser();
        if (!data?.user){ (window.openAuth||(()=>{}))(); return; }
      }catch(_){ (window.openAuth||(()=>{}))(); return; }

      // 3) Stash payload into the modal store and open the modal
      const store = document.getElementById('bidPayloadStore');
      if (store) store.value = JSON.stringify(payload);
      const modal = document.getElementById('bidModal');
      if (modal) modal.classList.add('open');
    }, true);
  }

  // Scan the grid for all potential Bid triggers and repair them.
  function repairAllBids(){
    const grid = document.getElementById('grid') || document;
    // Any .btn that visually says "Bid", and any element with [data-bid]
    const candidates = $$('.btn, [data-bid]', grid).filter(el=>{
      const t = (el.textContent||'').trim().toLowerCase();
      return /\bbid\b/.test(t) || el.hasAttribute('data-bid');
    });
    candidates.forEach(btn=>{
      // If render didn’t set data-load, stamp from the card now
      const card = btn.closest('.load-card, .card');
      if (card && !btn.getAttribute('data-load')) {
        const p = payloadFromCard(card);
        if (p) btn.setAttribute('data-load', JSON.stringify(p).replace(/'/g,"&apos;"));
      }
      wireOneBid(btn);
    });
  }

  // Observe changes (sorting/pagination reorders nodes). Re-repair quickly.
  const mo = new MutationObserver(()=>{ repairAllBids(); });
  mo.observe(document.body, { childList:true, subtree:true });

  // Run once now and a couple more times in case of late renders
  const boot = ()=>{ ensureModalStore(); repairAllBids(); };
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  setTimeout(boot, 300);
  setTimeout(boot, 900);

  // Override submitBid to ONLY read the modal snapshot.
  (function hardenSubmit(){
    window.submitBid = async function(){
      const err  = document.getElementById('bidError');
      const amt  = (document.getElementById('bidAmount')?.value||'').trim();
      const notes= (document.getElementById('bidNotes')?.value||'').trim();
      const store= document.getElementById('bidPayloadStore');

      const amount = Number(amt);
      if (!amt || !Number.isFinite(amount) || amount<=0){ if (err) err.textContent='Please enter a valid dollar amount.'; return; }

      let uid = null;
      try{ const { data } = await window.sb.auth.getUser(); uid = data?.user?.id||null; }catch(_){}
      if (!uid){ (window.openAuth||(()=>{}))(); return; }

      let snap = null;
      if (store && store.value){ try { snap = JSON.parse(store.value); } catch(_){} }
      if (!snap){ if (err) err.textContent='Load not found.'; return; }

      const payload = {
        load_number: snap.load_number || snap.load_id,
        load_id:     snap.load_id || snap.load_number,
        route_from:  snap.route_from || '',
        route_to:    snap.route_to || '',
        item:        snap.item || 'Item',
        miles:       (typeof snap.miles==='number' ? snap.miles : null),
        price_offer: Math.round(amount),
        notes:       notes || null,
        auth_user_id: uid,
        status:      'SUBMITTED',
        created_at:  new Date().toISOString()
      };

      try{
        const { error } = await window.sb.from('bids').insert(payload);
        if (error) throw error;
        document.getElementById('bidModal')?.classList.remove('open');
        if (store) store.value = '';
        alert('Bid submitted! You can review it in Admin.');
      }catch(e){
        console.error('Bid insert failed:', e);
        if (err) err.textContent = e.message || 'Failed to submit bid.';
      }
    };
  })();
})();