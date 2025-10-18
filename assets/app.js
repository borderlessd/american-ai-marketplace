======/* =========================================================================
   /assets/app.js — rock-solid render + bid
   ========================================================================= */

/* ---------------------------- Globals ---------------------------- */
let LOADS = [];
let LAST_LIST = [];                  // last rendered list (post-filter)
let SNAPSHOT_BY_KEY = new Map();     // key -> load object snapshot
let CURRENT_BID_KEY = null;

let AUTH = { ready:false, uid:null };

// Supabase (from globals in HTML)
let sb = (function(){
  try{
    if (!window.sb && window.supabase && window.SUPABASE_URL && window.SUPABASE_KEY){
      window.sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
    }
    return window.sb || null;
  }catch(e){ console.warn('Supabase init failed:', e); return null; }
})();

/* ---------------------------- Helpers ---------------------------- */
const $  = (q, el=document) => el.querySelector(q);
const $$ = (q, el=document) => Array.from(el.querySelectorAll(q));
const fmt = n => new Intl.NumberFormat().format(n);
const pick = (...xs)=>{ for(const x of xs){ if(x!=null && x!=='') return x; } return ''; };

function fromCity(l){ return pick(l.from_city,l.fromCity,l.originCity,l.origin,l.pickup_city,l.pickupCity,l.from); }
function toCity(l){   return pick(l.to_city,l.toCity,l.destinationCity,l.destination,l.dropoff_city,l.dropoffCity,l.to); }
function itemName(l){ return pick(l.item,l.vehicle,l.commodity,'Item'); }
function dateStr(l){  const raw = pick(l.date,l.available,l.availableDate,l.pickup_date,l.pickupDate,l.readyDate,l.date_available); return raw?String(raw):''; }
function safeMiles(l){
  const m=l.miles; const n=(typeof m==='string')?Number(m.replace(/,/g,'')):Number(m);
  return Number.isFinite(n)?n:'';
}
function makeKey(l){
  const k = l.load_number || l.id || l.uuid || l.key;
  if (k) return String(k);
  return `${fromCity(l)||'FROM'}-${toCity(l)||'TO'}-${dateStr(l)||''}`.replace(/\s+/g,'_').toUpperCase().slice(0,64);
}
function getIds(l){
  const ln = l.load_number || l.loadNo || l.loadNum;
  const id = l.id || l.uuid || l.key;
  const ident = ln || id || makeKey(l);
  return { load_number: String(ident), load_id: String(id || ident) };
}
function priceHTML(l){
  let p = l.price;
  if (p == null) return '';
  if (typeof p === 'string'){
    const s = p.trim().toUpperCase();
    if (!s || s==='TBD' || s==='N/A' || s==='NA' || s==='-' || s==='—') return '';
    const num = Number(s.replace(/[^0-9.]/g,''));
    if (Number.isFinite(num) && num>0) return `<div class="price" style="margin:8px 0">Price: $${fmt(num)}</div>`;
    return '';
  }
  if (typeof p === 'number' && Number.isFinite(p) && p>0) return `<div class="price" style="margin:8px 0">Price: $${fmt(p)}</div>`;
  return '';
}

/* ----------------------------- Data ----------------------------- */
async function loadData(){
  try{
    const res = await fetch('/assets/loads.json?ts='+Date.now(), { cache:'no-store' });
    const data = await res.json();
    LOADS = Array.isArray(data) ? data : (data.loads||[]);
  }catch(e){
    console.error('Failed to load loads.json', e);
    LOADS = [];
  }
  applyFilters();
}

/* ---------------------------- Render ---------------------------- */
function render(list){
  LAST_LIST = Array.isArray(list) ? list : [];
  const grid = $('#grid'); if (!grid) return;

  // Build snapshot map fresh each render
  SNAPSHOT_BY_KEY.clear();

  grid.innerHTML = LAST_LIST.map(l => {
    const key    = makeKey(l);
    const from   = fromCity(l);
    const to     = toCity(l);
    const status = (l.status||'open').toString().toUpperCase();
    const miles  = safeMiles(l);
    const date   = dateStr(l);
    const item   = itemName(l);
    const price  = priceHTML(l);

    // keep a clean, serializable snapshot (what we will insert into DB)
    SNAPSHOT_BY_KEY.set(key, {
      __key: key,
      ...l,
      load_number: getIds(l).load_number,
      load_id: getIds(l).load_id
    });

    return `
      <article class="card load-card" data-aim-id="${key}">
        <div class="route">${from} → ${to} <span class="status ${status.toLowerCase()}">${status}</span></div>
        <div class="meta"><strong>Item:</strong> ${item}</div>
        <div class="meta"><strong>Miles:</strong> ${miles ? fmt(miles) : ''}</div>
        <div class="meta"><strong>First Available Date:</strong> ${date}</div>
        ${price}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
          <button class="btn secondary" type="button" data-view>View</button>
          <button class="btn" type="button" data-bid>Bid</button>
        </div>
      </article>
    `;
  }).join('');

  wireCardButtons(grid);
  applySortAndPagination();
}

function wireCardButtons(root){
  if (root.__wired) return; root.__wired = true;

  root.addEventListener('click', (e)=>{
    const btn = e.target.closest('button');
    if (!btn) return;

    if (btn.hasAttribute('data-view')){
      e.preventDefault(); e.stopPropagation();
      const card = btn.closest('.load-card'); if (!card) return;
      const key  = card.dataset.aimId; if (!key) return;
      const obj  = SNAPSHOT_BY_KEY.get(key);
      const index = LAST_LIST.findIndex(x => makeKey(x) === key);
      openView(index >= 0 ? index : 0);
      return;
    }

    if (btn.hasAttribute('data-bid')){
      e.preventDefault(); e.stopPropagation();
      const card = btn.closest('.load-card'); if (!card) return;
      const key  = card.dataset.aimId; if (!key) return;
      CURRENT_BID_KEY = key;
      if (!AUTH.uid){ openAuth(); return; }
      openBidModal();
      return;
    }
  }, true);
}

/* ------------------------- Filters / Search ------------------------ */
function applyFilters(){
  const term = ($('#q')?.value || '').toLowerCase();
  const comm = ($('#commodity')?.value || '').toLowerCase();

  const list = LOADS.filter(l=>{
    const hay = [
      itemName(l)||'',
      fromCity(l)||'',
      toCity(l)||'',
      l.commodity||''
    ].join(' ').toLowerCase();
    const okQ = !term || hay.includes(term);
    const okC = !comm || (l.commodity||'').toLowerCase() === comm;
    return okQ && okC;
  });

  render(list);
}

/* ---------------------- Sort + Pagination (UI) --------------------- */
/* Optional controls if present in HTML:
   #sortSel, #ppSel, #pagerPrev, #pagerNext, #pagerInfo */
const pagerState = { page:1, pageSize:25 };

function getCards(){ return Array.from(document.querySelectorAll('#grid .load-card')); }

function parseCardData(card){
  const metas = Array.from(card.querySelectorAll('.meta')).map(e=>e.textContent.trim());

  const milesLine = metas.find(t=>/^miles:/i.test(t));
  let miles = NaN;
  if (milesLine){ const m = milesLine.match(/miles:\s*([\d,]+)/i); if (m) miles = Number(m[1].replace(/,/g,'')); }

  const availLine = metas.find(t=>/^first available date:/i.test(t));
  let avail = 0;
  if (availLine){ const m = availLine.match(/first available date:\s*(.+)$/i);
    if (m){ const d = new Date(m[1].trim()); if (!isNaN(d)) avail = d.getTime(); } }

  const priceEl = card.querySelector('.price');
  let price = NaN;
  if (priceEl){ const txt = priceEl.textContent.replace(/[^0-9.]/g,''); if (txt) price = Number(txt); }

  const route = (card.querySelector('.route')?.textContent || '').trim().toLowerCase();
  const item  = (metas.find(t => /^item:/i.test(t)) || '').replace(/^item:\s*/i,'').trim().toLowerCase();
  return { miles, avail, price, route, item, el:card };
}

function sortCards(kind){
  const grid = $('#grid'); if (!grid) return;
  const cards = getCards().map(parseCardData);

  const cmp = {
    avail_desc:(a,b)=>(b.avail||0)-(a.avail||0),
    avail_asc:(a,b)=>(a.avail||0)-(b.avail||0),
    price_desc:(a,b)=>(isFinite(b.price)?b.price:-1)-(isFinite(a.price)?a.price:-1),
    price_asc:(a,b)=>(isFinite(a.price)?a.price:1e15)-(isFinite(b.price)?b.price:1e15),
    miles_desc:(a,b)=>(isFinite(b.miles)?b.miles:-1)-(isFinite(a.miles)?a.miles:-1),
    miles_asc:(a,b)=>(isFinite(a.miles)?a.miles:1e15)-(isFinite(b.miles)?b.miles:1e15),
    route_az:(a,b)=>a.route.localeCompare(b.route),
    route_za:(a,b)=>b.route.localeCompare(a.route),
    item_az:(a,b)=>a.item.localeCompare(b.item),
    item_za:(a,b)=>b.item.localeCompare(a.item),
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

  const start=(pagerState.page-1)*pagerState.pageSize;
  const end  = start + pagerState.pageSize;
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
  if (pp && !pp.__wired){ pp.__wired = true; pp.addEventListener('change', ()=>{ pagerState.pageSize=parseInt(pp.value,10)||25; pagerState.page=1; applyPagination(); }); }
  if (sortSel && !sortSel.__wired){ sortSel.__wired = true; sortSel.addEventListener('change', ()=>{ pagerState.page=1; applySortAndPagination(); }); }
  if (prev && !prev.__wired){ prev.__wired = true; prev.addEventListener('click', ()=>{ if (pagerState.page>1){ pagerState.page--; applyPagination(); } }); }
  if (next && !next.__wired){ next.__wired = true; next.addEventListener('click', ()=>{
    const last = Math.max(1, Math.ceil(getCards().length / pagerState.pageSize));
    if (pagerState.page<last){ pagerState.page++; applyPagination(); }
  }); }
}

/* ------------------------------ View Modal ------------------------------ */
function openView(index){
  const l = LAST_LIST[index]; if (!l) return;
  const box = $('#viewContent'); if (!box) return;

  const from = fromCity(l), to = toCity(l);
  const status = (l.status||'open').toString().toUpperCase();
  const miles = safeMiles(l), date = dateStr(l), item = itemName(l);
  const price = priceHTML(l);

  box.innerHTML = `
    <div class="title">${item}</div>
    <div class="meta" style="margin-bottom:6px"><strong>Route:</strong> ${from} → ${to}
      &nbsp; <span class="status ${status.toLowerCase()}">${status}</span></div>
    <div class="meta"><strong>Miles:</strong> ${miles?fmt(miles):''}</div>
    <div class="meta"><strong>First Available Date:</strong> ${date}</div>
    ${price}
    ${l.notes ? `<div class="meta"><strong>Notes:</strong> ${String(l.notes)}</div>` : ''}
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
      <button class="btn secondary" type="button" onclick="closeView()">Close</button>
      <button class="btn" type="button" onclick="openBidFromIndex(${index})">Bid</button>
    </div>
  `;
  $('#viewModal')?.classList.add('open');
}
function closeView(){ $('#viewModal')?.classList.remove('open'); }

/* ------------------------------- Auth / Modals --------------------------- */
function openAuth(){ $('#authModal')?.classList.add('open'); }
function closeAuth(){ $('#authModal')?.classList.remove('open'); }
function openBidModal(){ $('#bidModal')?.classList.add('open'); }
function closeBidModal(){
  $('#bidModal')?.classList.remove('open');
  const e=$('#bidError'); if (e) e.textContent='';
  const a=$('#bidAmount'); if (a) a.value='';
  const n=$('#bidNotes'); if (n) n.value='';
}

/* --------------------------- Auth bootstrap ----------------------------- */
(async function initAuth(){
  try{
    if (sb?.auth){
      const set = (uid)=>{ AUTH.ready=true; AUTH.uid=uid||null; };
      const { data } = await sb.auth.getUser();
      set(data?.user?.id || null);
      sb.auth.onAuthStateChange((_e, session)=> set(session?.user?.id || null));
    } else {
      AUTH.ready=true;
    }
  }catch(_){ AUTH.ready=true; }
})();

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

/* ------------------------------ Bid flow ------------------------------- */
// Legacy helper: open bid for an index (called from View modal button)
function openBidFromIndex(index){
  const l = LAST_LIST?.[Number(index)];
  if (l) CURRENT_BID_KEY = makeKey(l);
  if (!AUTH.uid){ openAuth(); return; }
  openBidModal();
}
// Legacy alias if some template still calls bid(index)
function bid(index){ openBidFromIndex(index); }

async function submitBid(){
  const err = $('#bidError');
  const raw = ($('#bidAmount')?.value || '').trim();
  const amount = Number(raw);
  if (!raw || !Number.isFinite(amount) || amount <= 0){
    if (err) err.textContent = 'Please enter a valid dollar amount.'; 
    return;
  }

  // resolve uid
  let uid = AUTH.uid;
  if (!uid && sb?.auth){ try{ const { data } = await sb.auth.getUser(); uid = data?.user?.id || null; }catch(_){} }
  if (!uid){ openAuth(); return; }

  // Resolve snapshot by CURRENT_BID_KEY (fast & robust)
  const obj = CURRENT_BID_KEY ? SNAPSHOT_BY_KEY.get(CURRENT_BID_KEY) : null;

  // If not found (shouldn’t happen), try LAST_LIST match
  const fallbackObj = (!obj && CURRENT_BID_KEY) ? LAST_LIST.find(x => makeKey(x)===CURRENT_BID_KEY) : null;
  const l = obj || fallbackObj;
  if (!l){ if (err) err.textContent = 'Load not found.'; return; }

  const ids = getIds(l);
  const milesVal = (function(){ const m=safeMiles(l); return m===''?null:m; })();

  const payload = {
    load_number: ids.load_number,
    load_id: ids.load_id,
    route_from: fromCity(l),
    route_to: toCity(l),
    item: itemName(l),
    miles: milesVal,
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

/* ------------------------------- Safety -------------------------------- */
function unblockOverlays(){
  $$('.modal').forEach(m=>{
    if (!m.classList.contains('open')){ m.style.display='none'; m.style.pointerEvents='none'; }
    else { m.style.display=''; m.style.pointerEvents=''; m.style.zIndex='99999'; }
  });
  const vw=Math.max(document.documentElement.clientWidth, window.innerWidth||0);
  const vh=Math.max(document.documentElement.clientHeight, window.innerHeight||0);
  $$('body *').forEach(el=>{
    const cs=getComputedStyle(el);
    if (cs.position==='fixed' || cs.position==='absolute'){
      const r=el.getBoundingClientRect();
      const covers=r.width>=vw*0.9 && r.height>=vh*0.9 && r.top<=0 && r.left<=0;
      const invisible=(parseFloat(cs.opacity)<0.05)||cs.visibility==='hidden';
      if (covers && (invisible || !el.innerText.trim()) && !el.classList.contains('modal')){
        el.style.pointerEvents='none';
      }
    }
  });
  document.addEventListener('keydown', e=>{ if (e.key==='Escape'){ $$('.modal.open').forEach(m=>m.classList.remove('open')); }});
}

/* ------------------------------- Boot ---------------------------------- */
function exposeGlobals(){
  window.openView = openView;
  window.closeView = closeView;
  window.openAuth = openAuth;
  window.closeAuth = closeAuth;
  window.openBidModal = openBidModal;
  window.closeBidModal = closeBidModal;
  window.submitBid = submitBid;
  window.bid = bid; // legacy support
}

function wireInputs(){
  ['q','commodity'].forEach(id=>{
    const el=document.getElementById(id);
    if (!el) return;
    el.addEventListener(el.tagName==='SELECT' ? 'change' : 'input', applyFilters);
  });
  wireSortAndPaginationOnce();
}

document.addEventListener('DOMContentLoaded', ()=>{
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
  setTimeout(unblockOverlays, 200);
  setTimeout(unblockOverlays, 800);
});

/* ======================================================================
   FINAL: Card-Embedded Payload + Click Guard (append-only, safe)
   - After every render(list), stamp each .load-card with:
       data-aim-id       (stable key)
       data-aim-payload  (JSON snapshot to submit)
   - Delegated click handler cancels anchors, opens Bid without scroll
   - submitBid will prefer dataset payload (no more "Load not found")
   ====================================================================== */
(function cardPayloadAndGuards(){
  // ---------- helpers ----------
  const pick = (...xs)=>{ for(const x of xs){ if(x!=null && x!=='') return x; } return ''; };
  const fromCity = l => pick(l.from_city,l.fromCity,l.originCity,l.origin,l.pickup_city,l.pickupCity,l.from);
  const toCity   = l => pick(l.to_city,l.toCity,l.destinationCity,l.destination,l.dropoff_city,l.dropoffCity,l.to);
  const dateStr  = l => { const r = pick(l.date,l.available,l.availableDate,l.pickup_date,l.pickupDate,l.readyDate,l.date_available); return r?String(r):''; };
  const itemName = l => pick(l.item,l.vehicle,l.commodity,'Item');
  const safeMilesNum = (m)=>{ const n=(typeof m==='string')?Number(m.replace(/,/g,'')):Number(m); return Number.isFinite(n)?n:null; };
  const makeKey  = l => {
    const k = l?.load_number || l?.id || l?.uuid || l?.key;
    if (k) return String(k);
    return `${fromCity(l)||'FROM'}-${toCity(l)||'TO'}-${dateStr(l)||''}`.replace(/\s+/g,'_').toUpperCase().slice(0,64);
  };
  const getIds = l => {
    const ln = l?.load_number || l?.loadNo || l?.loadNum;
    const id = l?.id || l?.uuid || l?.key;
    const ident = ln || id || makeKey(l);
    return { load_number: String(ident), load_id: String(id || ident) };
  };
  function snapshotFromLoad(l){
    if (!l) return null;
    const ids = getIds(l);
    return {
      __key: makeKey(l),
      load_number: ids.load_number,
      load_id: ids.load_id,
      route_from: fromCity(l) || '',
      route_to: toCity(l) || '',
      item: itemName(l) || 'Item',
      miles: safeMilesNum(l.miles),
      available: dateStr(l) || ''
    };
  }

  // ---------- wrap render(list) once: stamp cards with payload ----------
  if (typeof window.render === 'function' && !window.render.__aim_stamp){
    const orig = window.render;
    window.render = function(list){
      const out = orig.apply(this, arguments);
      try{
        const arr = Array.isArray(list) ? list : [];
        const cards = Array.from(document.querySelectorAll('#grid .load-card, #grid .card'));
        cards.forEach((el,i)=>{
          const obj = arr[i];
          if (!obj) return;
          const key = makeKey(obj);
          const payload = snapshotFromLoad(obj);
          if (key) el.dataset.aimId = key;
          if (payload){
            // store compact JSON on the element
            try { el.dataset.aimPayload = JSON.stringify(payload); } catch(_){}
          }
        });
        // keep last list for any legacy lookups
        window.__lastList = arr.slice();
      }catch(_){}
      return out;
    };
    window.render.__aim_stamp = true;
  }

  // ---------- global click guard: stop scroll-to-top & handle Bid ----------
  if (!document.__aimClickGuard){
    document.__aimClickGuard = true;

    document.addEventListener('click', (e)=>{
      const a = e.target.closest('a');
      if (a && (a.getAttribute('href')==='#' || a.getAttribute('href')==='' || a.getAttribute('href')?.startsWith('#'))){
        // kill default "jump to top" anchors
        e.preventDefault();
      }
    }, true);

    document.addEventListener('click', (e)=>{
      const btn = e.target.closest('button, a');
      if (!btn) return;

      // Treat element as a Bid button if it has "btn" class and text contains "bid"
      const looksBid = /(^|\s)btn(\s|$)/.test(btn.className||'') && /bid/i.test(btn.textContent||'');
      if (!looksBid) return;

      const card = btn.closest('.load-card, .card');
      if (!card) return;

      // stop link navigation & bubbling that could scroll the page
      e.preventDefault();
      e.stopPropagation();

      // read embedded payload; fall back to dataset key
      const payloadStr = card.dataset?.aimPayload || '';
      const key = card.dataset?.aimId || null;
      let snap = null;
      if (payloadStr){
        try { snap = JSON.parse(payloadStr); } catch(_){}
      }
      // Save snapshot/key for submit
      window.__aimBidSnapshot = snap || null;
      window.__currentBidKey = (snap && snap.__key) || key || null;

      // auth check (cached if present)
      const uid = (window.__aimAuth && window.__aimAuth.uid) || null;
      if (!uid){
        (typeof window.openAuth==='function' ? window.openAuth() : document.getElementById('authModal')?.classList.add('open'));
        return;
      }
      (typeof window.openBidModal==='function' ? window.openBidModal() : document.getElementById('bidModal')?.classList.add('open'));
    }, true);
  }

  // ---------- submitBid override: prefer embedded payload ----------
  (function patchSubmit(){
    const orig = (typeof window.submitBid === 'function') ? window.submitBid : null;
    window.submitBid = async function(){
      const err = document.getElementById('bidError');
      const amtEl = document.getElementById('bidAmount');
      const notesEl = document.getElementById('bidNotes');

      // validate amount
      const raw = (amtEl?.value || '').trim();
      const amount = Number(raw);
      if (!raw || !Number.isFinite(amount) || amount <= 0){
        if (err) err.textContent = 'Please enter a valid dollar amount.'; 
        return;
      }

      // resolve user id quickly
      let uid = (window.__aimAuth && window.__aimAuth.uid) || null;
      if (!uid && window.sb?.auth){
        try { const { data } = await sb.auth.getUser(); uid = data?.user?.id || null; } catch(_){}
      }
      if (!uid){ (typeof window.openAuth==='function'? window.openAuth() : document.getElementById('authModal')?.classList.add('open')); return; }

      // prefer the snapshot we stamped on the card
      let snap = window.__aimBidSnapshot || null;

      // fallback: try to resolve via key → __lastList
      if (!snap){
        const key = window.__currentBidKey || null;
        const list = Array.isArray(window.__lastList) ? window.__lastList : [];
        const obj = key ? list.find(x => makeKey(x) === key) : null;
        if (obj) snap = snapshotFromLoad(obj);
      }

      // last resort: locate the first visible .load-card and parse (should rarely happen)
      if (!snap){
        const card = document.querySelector('#grid .load-card, #grid .card');
        if (card){
          // very light parse
          const routeTxt = (card.querySelector('.route')?.textContent||'').trim();
          let route_from='', route_to='';
          if (routeTxt.includes('→')){
            const [f,t] = routeTxt.split('→'); route_from=(f||'').trim(); route_to=(t||'').replace(/\s+OPEN|CLOSED|ACTIVE|PENDING.*/i,'').trim();
          }
          const metas = Array.from(card.querySelectorAll('.meta')).map(x=>x.textContent.trim());
          const item  = (metas.find(t=>/^item:/i.test(t))||'').replace(/^item:\s*/i,'').trim();
          const miles = (metas.find(t=>/^miles:/i.test(t))||'').replace(/[^0-9]/g,'');
          const date  = (metas.find(t=>/^first available date:/i.test(t))||'').replace(/^first available date:\s*/i,'').trim();
          const key   = card.dataset?.aimId || null;
          const ids   = getIds({ load_number:key });
          snap = {
            __key: key || null,
            load_number: ids.load_number,
            load_id: ids.load_id,
            route_from, route_to,
            item: item || 'Item',
            miles: miles ? Number(miles) : null,
            available: date
          };
        }
      }

      if (!snap){
        if (err) err.textContent = 'Load not found.';
        return;
      }

      const ids = getIds({ load_number: snap.load_number, id: snap.load_id });
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
        window.__aimBidSnapshot = null; // clear
      }catch(e){
        console.error('Bid insert failed:', e);
        if (err) err.textContent = e.message || 'Failed to submit bid.';
      }
    };
  })();
})();

/* ============================================================
   FINAL CLICK + SUBMIT HARDENING (append-only, safe)
   - Works even for bottom rows after sorting/pagination
   - Prevents page jump, captures the exact card element
   ============================================================ */
(function finalBidClickHardening(){
  // 1) Cancel any anchor that would jump the page (scroll-to-top)
  if (!document.__aimKillAnchors){
    document.__aimKillAnchors = true;
    document.addEventListener('click', (e)=>{
      const a = e.target.closest('a');
      if (!a) return;
      const href = a.getAttribute('href') || '';
      if (href === '' || href === '#' || href.startsWith('#')) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    }, true);
  }

  // 2) Capture the exact card that was clicked for Bid
  if (!document.__aimBidCapture){
    document.__aimBidCapture = true;
    document.addEventListener('click', (e)=>{
      const btn = e.target.closest('button, a');
      if (!btn) return;

      // treat anything with "btn" class and text "Bid" as a bid trigger
      const looksBtn = /(^|\s)btn(\s|$)/.test(btn.className||'');
      const looksBid = /bid/i.test(btn.textContent || '');
      if (!looksBtn || !looksBid) return;

      const card = btn.closest('.load-card, .card');
      if (!card) return;

      // absolutely kill any bubbling that could cause scroll or reflow jumps
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      // remember the exact element and pull payload immediately
      window.__aimLastClickedCard = card;
      const payloadStr = card.dataset?.aimPayload || '';
      let snap = null;
      if (payloadStr) { try { snap = JSON.parse(payloadStr); } catch(_){} }
      window.__aimBidSnapshot = snap || null;

      // also store the key for fallbacks
      const key = (snap && snap.__key) || card.dataset?.aimId || null;
      window.__currentBidKey = key;

      // auth gate then open modal
      const uid = (window.__aimAuth && window.__aimAuth.uid) || null;
      if (!uid) {
        (typeof window.openAuth==='function' ? window.openAuth() : document.getElementById('authModal')?.classList.add('open'));
        return;
      }
      (typeof window.openBidModal==='function' ? window.openBidModal() : document.getElementById('bidModal')?.classList.add('open'));
    }, true);
  }

  // 3) Submit always prefers the card you actually clicked
  (function patchSubmit(){
    const orig = (typeof window.submitBid === 'function') ? window.submitBid : null;

    async function robustSubmit(){
      const err = document.getElementById('bidError');
      const amtEl = document.getElementById('bidAmount');
      const notesEl = document.getElementById('bidNotes');

      const raw = (amtEl?.value || '').trim();
      const amount = Number(raw);
      if (!raw || !Number.isFinite(amount) || amount <= 0){
        if (err) err.textContent = 'Please enter a valid dollar amount.';
        return;
      }

      // resolve auth
      let uid = (window.__aimAuth && window.__aimAuth.uid) || null;
      if (!uid && window.sb?.auth){
        try { const { data } = await sb.auth.getUser(); uid = data?.user?.id || null; } catch(_){}
      }
      if (!uid){
        (typeof window.openAuth==='function' ? window.openAuth() : document.getElementById('authModal')?.classList.add('open'));
        return;
      }

      // Prefer: payload embedded on the exact card element that was clicked
      let snap = window.__aimBidSnapshot || null;
      if (!snap && window.__aimLastClickedCard){
        const s = window.__aimLastClickedCard.dataset?.aimPayload || '';
        if (s) { try { snap = JSON.parse(s); } catch(_){} }
      }

      // Fallback: key -> last list
      const pick = (...xs)=>{ for (const x of xs){ if (x!=null && x!=='') return x; } return ''; };
      const fromCity = l => pick(l.from_city,l.fromCity,l.originCity,l.origin,l.pickup_city,l.pickupCity,l.from);
      const toCity   = l => pick(l.to_city,l.toCity,l.destinationCity,l.destination,l.dropoff_city,l.dropoffCity,l.to);
      const dateStr  = l => { const r = pick(l.date,l.available,l.availableDate,l.pickup_date,l.pickupDate,l.readyDate,l.date_available); return r?String(r):''; };
      const makeKey  = l => (l?.load_number || l?.id || l?.uuid || l?.key) ||
                            `${fromCity(l)||'FROM'}-${toCity(l)||'TO'}-${dateStr(l)||''}`.replace(/\s+/g,'_').toUpperCase().slice(0,64);
      const getIds   = l => { const id1 = l?.load_number || l?.id || l?.uuid || l?.key || makeKey(l)||''; return { load_number:String(id1), load_id:String(l?.id || id1) }; };
      const safeMilesNum = (m)=>{ const n=(typeof m==='string')?Number(m.replace(/,/g,'')):Number(m); return Number.isFinite(n)?n:null; };

      if (!snap){
        const key = window.__currentBidKey || null;
        const list = Array.isArray(window.__lastList) ? window.__lastList : [];
        const obj = key ? list.find(x => makeKey(x) === key) : null;
        if (obj){
          const ids = getIds(obj);
          snap = {
            __key: makeKey(obj),
            load_number: ids.load_number,
            load_id: ids.load_id,
            route_from: fromCity(obj)||'',
            route_to: toCity(obj)||'',
            item: pick(obj.item,obj.vehicle,obj.commodity,'Item'),
            miles: safeMilesNum(obj.miles),
            available: dateStr(obj)||''
          };
        }
      }

      // Last resort: still nothing
      if (!snap){
        if (err) err.textContent = 'Load not found.';
        return;
      }

      // Build payload
      const ids = getIds({ load_number: snap.load_number, id: snap.load_id });
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
        window.__aimBidSnapshot = null;
        window.__aimLastClickedCard = null;
      }catch(e){
        console.error('Bid insert failed:', e);
        if (err) err.textContent = e.message || 'Failed to submit bid.';
      }
    }

    if (!orig) {
      window.submitBid = robustSubmit;
    } else if (!window.submitBid.__aim_finalPatch){
      window.submitBid = robustSubmit;
      window.submitBid.__aim_finalPatch = true;
    }
  })();
})();

/* ======================================================================
   BULLETPROOF BID: modal snapshot + pre-click guards (append-only)
   - Captures payload on Bid press and stores it IN the modal (hidden)
   - Submit reads only that payload (sorting/pagination safe)
   - Kills any anchor jump-to-top BEFORE it happens
   ====================================================================== */
(function bidModalSnapshot(){
  // --- tiny helpers ---
  const pick = (...xs)=>{ for(const x of xs){ if(x!=null && x!=='') return x; } return ''; };
  const fromCity = l => pick(l.from_city,l.fromCity,l.originCity,l.origin,l.pickup_city,l.pickupCity,l.from);
  const toCity   = l => pick(l.to_city,l.toCity,l.destinationCity,l.destination,l.dropoff_city,l.dropoffCity,l.to);
  const dateStr  = l => { const r = pick(l.date,l.available,l.availableDate,l.pickup_date,l.pickupDate,l.readyDate,l.date_available); return r?String(r):''; };
  const itemName = l => pick(l.item,l.vehicle,l.commodity,'Item');
  const safeMiles = m => { const n=(typeof m==='string')?Number(m.replace(/,/g,'')):Number(m); return Number.isFinite(n)?n:null; };
  const makeKey  = l => (l?.load_number||l?.id||l?.uuid||l?.key) ||
    `${fromCity(l)||'FROM'}-${toCity(l)||'TO'}-${dateStr(l)||''}`.replace(/\s+/g,'_').toUpperCase().slice(0,64);
  const idsFor   = l => { const ident = l?.load_number || l?.id || l?.uuid || l?.key || makeKey(l) || ''; return { load_number:String(ident), load_id:String(l?.id||ident) }; };

  function payloadFromObj(l){
    if (!l) return null;
    const ids = idsFor(l);
    return {
      __key: makeKey(l),
      load_number: ids.load_number,
      load_id: ids.load_id,
      route_from: fromCity(l)||'',
      route_to: toCity(l)||'',
      item: itemName(l)||'Item',
      miles: safeMiles(l.miles),
      available: dateStr(l)||''
    };
  }

  function payloadFromCard(card){
    if (!card) return null;
    // Prefer data-aim-payload if render stamped it
    const s = card.dataset?.aimPayload;
    if (s) { try { return JSON.parse(s); } catch(_){} }
    // Fallback: shallow parse from visible text
    const routeTxt = (card.querySelector('.route')?.textContent||'').trim();
    let rf='', rt='';
    if (routeTxt.includes('→')) {
      const [f,t]=routeTxt.split('→');
      rf=(f||'').trim(); rt=(t||'').replace(/\s+(OPEN|ACTIVE|CLOSED|PENDING).*$/i,'').trim();
    }
    const metas = Array.from(card.querySelectorAll('.meta')).map(x=>x.textContent.trim());
    const item  = (metas.find(t=>/^item:/i.test(t))||'').replace(/^item:\s*/i,'').trim() || 'Item';
    const milesStr = (metas.find(t=>/^miles:/i.test(t))||'').replace(/[^0-9]/g,'');
    const miles = milesStr ? Number(milesStr) : null;
    const avail = (metas.find(t=>/^first available date:/i.test(t))||'').replace(/^first available date:\s*/i,'').trim();
    const key   = card.dataset?.aimId || `${rf}-${rt}-${avail}`.replace(/\s+/g,'_').toUpperCase().slice(0,64);
    const ids   = idsFor({ load_number:key });
    return { __key:key, load_number:ids.load_number, load_id:ids.load_id, route_from:rf, route_to:rt, item, miles, available:avail };
  }

  // --- ensure hidden payload store exists inside the modal ---
  function ensureHiddenStore(){
    let modal = document.getElementById('bidModal');
    if (!modal) {
      // create minimal modal if page lacks one (safety)
      const shell = document.createElement('div');
      shell.innerHTML = `
        <div id="bidModal" class="modal"><div class="panel">
          <div class="title">Submit a Bid</div>
          <label>Offer Amount (USD)
            <input id="bidAmount" type="number" class="input" min="1" step="1" placeholder="e.g. 1299">
          </label>
          <div style="height:8px"></div>
          <label>Notes (optional)
            <input id="bidNotes" class="input" placeholder="Any extra details…">
          </label>
          <div id="bidError" class="error"></div>
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
            <button class="btn secondary" type="button" onclick="(window.closeBidModal||function(){document.getElementById('bidModal')?.classList.remove('open');})()">Cancel</button>
            <button class="btn" type="button" onclick="window.submitBid && window.submitBid()">Submit Bid</button>
          </div>
        </div></div>`;
      document.body.appendChild(shell.firstElementChild);
      modal = document.getElementById('bidModal');
    }
    if (!modal.querySelector('#bidPayloadStore')) {
      const ta = document.createElement('textarea');
      ta.id = 'bidPayloadStore';
      ta.style.display = 'none';
      modal.appendChild(ta);
    }
  }
  ensureHiddenStore();

  // --- PREVENT JUMP: capture at pointer/touch/click before anchors fire ---
  function killAnchorDefault(ev){
    const a = ev.target.closest('a');
    if (!a) return;
    const href = a.getAttribute('href') || '';
    if (href === '' || href === '#' || href.startsWith('#')){
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
    }
  }
  if (!document.__aimAnchorGuards){
    document.__aimAnchorGuards = true;
    ['pointerdown','touchstart','click'].forEach(type=>{
      document.addEventListener(type, killAnchorDefault, true);
    });
  }

  // --- capture payload WHEN you press Bid, store it in the modal ---
  function onBidTrigger(ev){
    const el = ev.target.closest('button, a');
    if (!el) return;
    const isBidBtn = /(^|\s)btn(\s|$)/.test(el.className||'') && /bid/i.test(el.textContent||'');
    if (!isBidBtn) return;

    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();

    const card = el.closest('.load-card, .card');
    if (!card) return;

    // Build payload right now from the card
    let snap = payloadFromCard(card);

    // If render(list) saved a JS object list, try to refine snapshot with that object
    if ((!snap || !snap.load_number) && Array.isArray(window.__lastList) && window.__lastList.length){
      const key = card.dataset?.aimId || null;
      const obj = key ? window.__lastList.find(x => makeKey(x) === key) : null;
      if (obj) snap = payloadFromObj(obj);
    }

    // Store snapshot inside the modal (source of truth for submit)
    const store = document.getElementById('bidPayloadStore');
    if (store) store.value = snap ? JSON.stringify(snap) : '';

    // open modal or auth
    const uid = (window.__aimAuth && window.__aimAuth.uid) || null;
    if (!uid){
      (typeof window.openAuth==='function' ? window.openAuth() : document.getElementById('authModal')?.classList.add('open'));
      return;
    }
    (typeof window.openBidModal==='function' ? window.openBidModal() : document.getElementById('bidModal')?.classList.add('open'));
  }

  if (!document.__aimBidPressGuard){
    document.__aimBidPressGuard = true;
    // Use pointerdown to beat any click side-effects
    document.addEventListener('pointerdown', onBidTrigger, true);
    // Also guard click for keyboard activation/older browsers
    document.addEventListener('click', onBidTrigger, true);
  }

  // --- override submitBid to read ONLY the modal’s snapshot ---
  const origSubmit = (typeof window.submitBid === 'function') ? window.submitBid : null;
  window.submitBid = async function(){
    const err = document.getElementById('bidError');
    const amtEl = document.getElementById('bidAmount');
    const notesEl = document.getElementById('bidNotes');
    const store = document.getElementById('bidPayloadStore');

    // amount check
    const raw = (amtEl?.value||'').trim();
    const amount = Number(raw);
    if (!raw || !Number.isFinite(amount) || amount<=0){ if (err) err.textContent='Please enter a valid dollar amount.'; return; }

    // auth check
    let uid = (window.__aimAuth && window.__aimAuth.uid) || null;
    if (!uid && window.sb?.auth){ try { const { data } = await sb.auth.getUser(); uid = data?.user?.id || null; } catch(_){} }
    if (!uid){ (typeof window.openAuth==='function'? window.openAuth() : document.getElementById('authModal')?.classList.add('open')); return; }

    // payload from modal (single source of truth)
    let snap = null;
    if (store && store.value){ try { snap = JSON.parse(store.value); } catch(_){} }
    if (!snap){ if (err) err.textContent = 'Load not found.'; return; }

    const ids = idsFor({ load_number:snap.load_number, id:snap.load_id });
    const payload = {
      load_number: ids.load_number,
      load_id: ids.load_id,
      route_from: snap.route_from || '',
      route_to: snap.route_to || '',
      item: snap.item || 'Item',
      miles: (typeof snap.miles==='number' ? snap.miles : null),
      price_offer: Math.round(amount),
      notes: (notesEl?.value||'').trim() || null,
      auth_user_id: uid,
      status: 'SUBMITTED',
      created_at: new Date().toISOString()
    };

    try{
      const { error } = await (window.sb ? sb.from('bids').insert(payload) : Promise.reject(new Error('No DB client')));
      if (error) throw error;
      (typeof window.closeBidModal==='function' ? window.closeBidModal() : document.getElementById('bidModal')?.classList.remove('open'));
      alert('Bid submitted! You can review it in Admin.');
      if (store) store.value = ''; // clear after success
    }catch(e){
      console.error('Bid insert failed:', e);
      if (err) err.textContent = e.message || 'Failed to submit bid.';
    }
  };
})();