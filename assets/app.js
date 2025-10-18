/* =========================================================================
   /assets/app.js — stable-key cards, delegated clicks, no scroll-to-top
   ========================================================================= */

let LOADS = [];
let sb = null;

// -------- Optional Supabase (only if keys exist on the page) --------
try {
  if (window.supabase && window.SUPABASE_URL && window.SUPABASE_KEY) {
    sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
    window.sb = sb; // for other scripts/modals that may use it
  }
} catch (e) {
  console.warn('Supabase init failed:', e);
}

// -------- tiny helpers --------
const $  = (q, el=document) => el.querySelector(q);
const $$ = (q, el=document) => Array.from(el.querySelectorAll(q));
const fmt = (n) => new Intl.NumberFormat().format(n);
const pick = (...xs)=>{ for (const x of xs){ if(x!=null && x!=='') return x; } return ''; };

function fromCity(l){ return pick(l.from_city,l.fromCity,l.originCity,l.origin,l.pickup_city,l.pickupCity,l.from); }
function toCity(l){   return pick(l.to_city,l.toCity,l.destinationCity,l.destination,l.dropoff_city,l.dropoffCity,l.to); }
function itemName(l){ return pick(l.item,l.vehicle,l.commodity,'Item'); }
function dateStr(l){  const r = pick(l.date,l.available,l.availableDate,l.pickup_date,l.pickupDate,l.readyDate,l.date_available); return r?String(r):''; }
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
    if (!s || s==='TBD' || s==='N/A' || s==='NA' || s==='-' || s==='—') return '';
    const num = Number(s.replace(/[^0-9.]/g,''));
    return (Number.isFinite(num) && num>0) ? `<div class="price" style="margin:8px 0">Price: $${fmt(num)}</div>` : '';
  }
  if (typeof p === 'number' && Number.isFinite(p) && p>0){
    return `<div class="price" style="margin:8px 0">Price: $${fmt(p)}</div>`;
  }
  return '';
}
function stableKey(l){
  // Deterministic key independent of sort/pagination
  const base = (l.load_number || l.id || `${fromCity(l)||'FROM'}-${toCity(l)||'TO'}-${dateStr(l)||''}`).toString().trim();
  return base.replace(/\s+/g,'_').toUpperCase().slice(0,64);
}

// -------- state used for click→load mapping --------
const CARD_MAP = new Map();   // key -> load snapshot used to render
let CURRENT_KEY = null;       // key of the card we’re bidding on

// -------- data load --------
async function loadData(){
  try{
    const res = await fetch('/assets/loads.json?ts=' + Date.now(), { cache:'no-store' });
    const data = await res.json();
    LOADS = Array.isArray(data) ? data : (data.loads || []);
  }catch(e){
    console.error('Failed to load loads.json', e);
    LOADS = [];
  }
  applyFilters();
}

// -------- render (builds CARD_MAP + data-aim-id) --------
function render(list){
  const grid = $('#grid'); if (!grid) return;
  CARD_MAP.clear();

  grid.innerHTML = list.map(l => {
    const routeFrom  = fromCity(l) || '';
    const routeTo    = toCity(l) || '';
    const status     = (l.status || 'open').toString().toUpperCase();
    const miles      = safeMiles(l);
    const date       = dateStr(l);
    const item       = itemName(l);
    const priceBlock = priceHTML(l);
    const key        = stableKey(l);

    // Cache the exact payload this card will use for Bid
    CARD_MAP.set(key, {
      key,
      load_number: key,
      load_id:     l.id || l.load_number || key,
      route_from:  routeFrom,
      route_to:    routeTo,
      item,
      miles:       miles? Number(miles) : null,
      date:        date || '',
      status
    });

    return `
      <article class="card load-card" data-aim-id="${key}">
        <div class="route">${routeFrom} → ${routeTo} <span class="status ${status.toLowerCase()}">${status}</span></div>
        <div class="meta"><strong>Item:</strong> ${item}</div>
        <div class="meta"><strong>Miles:</strong> ${miles ? fmt(miles) : ''}</div>
        <div class="meta"><strong>First Available Date:</strong> ${date}</div>
        ${priceBlock}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
          <button type="button" class="btn secondary view-btn">View</button>
          <button type="button" class="btn bid-btn">Bid</button>
        </div>
      </article>
    `;
  }).join('');

  applySortAndPagination();
}

// -------- filters --------
function applyFilters(){
  const term = ($('#q')?.value||'').toLowerCase();
  const comm = ($('#commodity')?.value||'').toLowerCase();

  const list = LOADS.filter(l => {
    const hay = (
      (itemName(l)||'') + ' ' +
      (fromCity(l)||'') + ' ' +
      (toCity(l)||'')   + ' ' +
      (l.commodity||'')
    ).toLowerCase();
    const okQ = !term || hay.includes(term);
    const okC = !comm || (l.commodity||'').toLowerCase()===comm;
    return okQ && okC;
  });

  render(list);
}

// -------- sort + pagination (DOM-only) --------
const pagerState = { page:1, pageSize:25 };
function getCards(){ return Array.from(document.querySelectorAll('#grid .load-card, #grid .card')); }

function parseCardData(card){
  const metas = $$('.meta', card).map(x=>x.textContent.trim());
  const milesLine = metas.find(t=>/^miles:/i.test(t))||'';
  const availLine = metas.find(t=>/^first available date:/i.test(t))||'';
  const itemLine  = metas.find(t=>/^item:/i.test(t))||'';

  let miles = Number((milesLine.match(/([\d,]+)/)?.[1]||'').replace(/,/g,''));
  if (!Number.isFinite(miles)) miles = NaN;

  let avail = 0; const a=availLine.replace(/^first available date:\s*/i,'').trim();
  if(a){ const d=new Date(a); if(!isNaN(d)) avail=d.getTime(); }

  const priceEl = card.querySelector('.price');
  let price = NaN; if (priceEl){ const txt=priceEl.textContent.replace(/[^0-9.]/g,''); if(txt) price=Number(txt); }

  const route = (card.querySelector('.route')?.textContent||'').trim().toLowerCase();
  const item  = itemLine.replace(/^item:\s*/i,'').trim().toLowerCase();
  return { miles, avail, price, route, item, el: card };
}

function sortCards(kind){
  const grid = $('#grid'); if(!grid) return;
  const items = getCards().map(parseCardData);
  const cmp = {
    avail_desc:(a,b)=> (b.avail||0)-(a.avail||0),
    avail_asc:(a,b)=> (a.avail||0)-(b.avail||0),
    price_desc:(a,b)=> (isFinite(b.price)?b.price:-1)-(isFinite(a.price)?a.price:-1),
    price_asc:(a,b)=> (isFinite(a.price)?a.price:Infinity)-(isFinite(b.price)?b.price:-1),
    miles_desc:(a,b)=> (isFinite(b.miles)?b.miles:-1)-(isFinite(a.miles)?a.miles:-1),
    miles_asc:(a,b)=> (isFinite(a.miles)?a.miles:Infinity)-(isFinite(b.miles)?b.miles:-1),
    route_az:(a,b)=> a.route.localeCompare(b.route),
    route_za:(a,b)=> b.route.localeCompare(a.route),
    item_az:(a,b)=> a.item.localeCompare(b.item),
    item_za:(a,b)=> b.item.localeCompare(a.item)
  }[kind] || ((a,b)=>0);

  items.sort(cmp);
  const frag = document.createDocumentFragment();
  items.forEach(x=>frag.appendChild(x.el));
  grid.appendChild(frag);
}

function applyPagination(){
  const cards = getCards();
  const total = cards.length;
  const last  = Math.max(1, Math.ceil(total / pagerState.pageSize));
  if (pagerState.page > last) pagerState.page = last;
  const start = (pagerState.page-1)*pagerState.pageSize;
  const end   = start + pagerState.pageSize;
  cards.forEach((el,i)=>{ el.style.display = (i>=start && i<end) ? '' : 'none'; });

  const info = $('#pagerInfo'); if(info) info.textContent = `Page ${pagerState.page} / ${last}`;
  const prev = $('#pagerPrev'); if(prev) prev.disabled = pagerState.page<=1;
  const next = $('#pagerNext'); if(next) next.disabled = pagerState.page>=last;
}

function applySortAndPagination(){
  const sortSel = $('#sortSel');
  const kind = sortSel ? sortSel.value : 'avail_desc';
  sortCards(kind);
  applyPagination();
}

function wireSortAndPaginationOnce(){
  const pp = $('#ppSel'), sortSel = $('#sortSel'), prev = $('#pagerPrev'), next = $('#pagerNext');
  if (pp && !pp.__wired){ pp.__wired=true; pp.addEventListener('change',()=>{ pagerState.pageSize=parseInt(pp.value,10)||25; pagerState.page=1; applyPagination(); }); }
  if (sortSel && !sortSel.__wired){ sortSel.__wired=true; sortSel.addEventListener('change',()=>{ pagerState.page=1; applySortAndPagination(); }); }
  if (prev && !prev.__wired){ prev.__wired=true; prev.addEventListener('click',()=>{ if(pagerState.page>1){ pagerState.page--; applyPagination(); } }); }
  if (next && !next.__wired){ next.__wired=true; next.addEventListener('click',()=>{
    const total=getCards().length; const last=Math.max(1,Math.ceil(total/pagerState.pageSize));
    if(pagerState.page<last){ pagerState.page++; applyPagination(); }
  });}
}

// -------- Modals + Auth --------
function ensureBidModal(){
  if (document.getElementById('bidModal')) return;
  const tpl = document.createElement('div');
  tpl.innerHTML = `
    <div id="bidModal" class="modal"><div class="panel">
      <div class="title">Submit a Bid</div>
      <div id="bidSummary" class="meta" style="margin-bottom:8px"></div>
      <label>Offer Amount (USD)
        <input id="bidAmount" type="number" class="input" min="1" step="1" placeholder="e.g. 1299">
      </label>
      <div style="height:8px"></div>
      <label>Notes (optional)
        <input id="bidNotes" class="input" placeholder="Any extra details…">
      </label>
      <div id="bidError" class="error"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
        <button class="btn secondary" type="button" id="bidCancel">Cancel</button>
        <button class="btn" type="button" id="bidSubmit">Submit Bid</button>
      </div>
    </div></div>
  `;
  document.body.appendChild(tpl.firstElementChild);
}
function openAuth(){ $('#authModal')?.classList.add('open'); }
function closeAuth(){ $('#authModal')?.classList.remove('open'); }
async function signin(){
  const err = $('#authError');
  try{
    const email = $('#authEmail')?.value?.trim();
    const pass  = $('#authPass')?.value?.trim();
    if(!email||!pass){ if(err) err.textContent='Email and password required.'; return; }
    if(!sb){ if(err) err.textContent='Auth service unavailable.'; return; }
    const { error } = await sb.auth.signInWithPassword({ email, password: pass });
    if(error) throw error;
    closeAuth(); location.reload();
  }catch(e){ if(err) err.textContent = e.message || 'Sign-in failed.'; }
}
window.signin = signin; // used by HTML “Continue” button

// -------- Global click handling (prevents scroll + uses keyed lookup) --------

// Prevent any "#" or empty anchors from scrolling the page to top
document.addEventListener('click', (e)=>{
  const a = e.target.closest('a');
  if (!a) return;
  const href = a.getAttribute('href')||'';
  if (href==='' || href==='#'){ e.preventDefault(); e.stopPropagation(); }
}, true);

// Delegate clicks within the grid for View/Bid — robust after sort/pagination
function wireGridDelegation(){
  const grid = $('#grid'); if (!grid || grid.__wired) return;
  grid.__wired = true;

  grid.addEventListener('click', async (e)=>{
    const viewBtn = e.target.closest('.view-btn');
    const bidBtn  = e.target.closest('.bid-btn');
    if (!viewBtn && !bidBtn) return;

    e.preventDefault(); e.stopPropagation();

    const card = e.target.closest('.load-card, .card');
    const key  = card?.dataset?.aimId || '';
    const payload = key ? CARD_MAP.get(key) : null;

    if (!payload){ alert('Load not found.'); return; }

    if (viewBtn){
      const box = $('#viewContent');
      if (box){
        const miles = (payload.miles!=null ? fmt(payload.miles) : '');
        box.innerHTML = `
          <div class="title">${payload.item}</div>
          <div class="meta"><strong>Route:</strong> ${payload.route_from} → ${payload.route_to}</div>
          <div class="meta"><strong>Miles:</strong> ${miles}</div>
          <div class="meta"><strong>First Available Date:</strong> ${payload.date||''}</div>
        `;
        $('#viewModal')?.classList.add('open');
      }
      return;
    }

    if (bidBtn){
      // Require auth if Supabase is present
      if (sb){
        try{
          const { data } = await sb.auth.getUser();
          if (!data?.user){ openAuth(); return; }
        }catch(_){ openAuth(); return; }
      }
      CURRENT_KEY = key;
      ensureBidModal();

      const sum = $('#bidSummary');
      if (sum){
        sum.innerHTML = `
          <strong>Route:</strong> ${payload.route_from} → ${payload.route_to}
          &nbsp;&nbsp;<strong>Item:</strong> ${payload.item}
          &nbsp;&nbsp;<strong>Miles:</strong> ${payload.miles!=null?fmt(payload.miles):''}
          &nbsp;&nbsp;<strong>First Available:</strong> ${payload.date||''}
        `;
      }
      $('#bidError') && ($('#bidError').textContent='');
      $('#bidAmount') && ($('#bidAmount').value='');
      $('#bidNotes') && ($('#bidNotes').value='');
      $('#bidModal')?.classList.add('open');
    }
  });
}

// Submit bid via CURRENT_KEY → CARD_MAP (never by index)
document.addEventListener('click', async (e)=>{
  if (e.target.id !== 'bidSubmit') return;
  const errEl = $('#bidError');
  const raw = ($('#bidAmount')?.value||'').trim();
  const amount = Number(raw);
  if (!raw || !Number.isFinite(amount) || amount<=0){
    if (errEl) errEl.textContent = 'Please enter a valid dollar amount.';
    return;
  }
  if (!CURRENT_KEY || !CARD_MAP.has(CURRENT_KEY)){
    if (errEl) err.textContent = 'Load not found.'; 
    alert('Load not found.');
    return;
  }
  const p = CARD_MAP.get(CURRENT_KEY);

  if (!sb){
    // No backend configured — still close modal to show UI works
    $('#bidModal')?.classList.remove('open');
    alert('Bid submitted (UI only). Configure Supabase on the page to save bids.');
    return;
  }

  try{
    const { data } = await sb.auth.getUser();
    const uid = data?.user?.id;
    if (!uid){ openAuth(); return; }

    const row = {
      load_number: p.load_number || p.load_id,
      load_id:     p.load_id || p.load_number,
      route_from:  p.route_from || '',
      route_to:    p.route_to || '',
      item:        p.item || 'Item',
      miles:       (p.miles!=null? Number(p.miles): null),
      price_offer: Math.round(amount),
      notes:       ($('#bidNotes')?.value||'').trim() || null,
      auth_user_id: uid,
      status:      'SUBMITTED',
      created_at:  new Date().toISOString()
    };

    const { error } = await sb.from('bids').insert(row);
    if (error) throw error;

    $('#bidModal')?.classList.remove('open');
    alert('Bid submitted! You can review it in Admin.');
  }catch(e){
    console.error('Bid insert failed:', e);
    if (errEl) errEl.textContent = e.message || 'Failed to submit bid.';
  }
});

// -------- Boot --------
document.addEventListener('DOMContentLoaded', ()=>{
  // reveal Admin only with ?admin=true
  try{
    const url = new URL(location.href);
    const adminFlag = url.searchParams.get('admin')==='true';
    const adminLink = $('#adminLink');
    if (adminLink) adminLink.style.display = adminFlag ? 'inline' : 'none';
  }catch(_){}

  // inputs
  ['q','commodity'].forEach(id=>{
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener(el.tagName==='SELECT' ? 'change' : 'input', applyFilters);
  });

  wireSortAndPaginationOnce();
  wireGridDelegation();   // <-- critical: one delegated handler on the grid
  loadData();
});

/* ======= AIM HOTFIX: bulletproof Bid + mobile behavior (append-only) ======= */
(function(){
  // Treat anything that *looks* like a Bid button as a bid trigger (no HTML edits required)
  function isBidButton(el){
    if (!el) return false;
    if (/bid-btn/.test(el.className||'')) return true;
    const txt = (el.textContent||'').trim().toLowerCase();
    return /^(bid|place bid)$/.test(txt);
  }

  // Build a stable key from a rendered card element (in case our map was cleared)
  function keyFromCard(card){
    if (!card) return null;
    const key = card.dataset && card.dataset.aimId;
    if (key) return key;
    // Fallback: compose a deterministic key from visible text (robust to re-renders)
    const route = (card.querySelector('.route')?.textContent||'').trim();
    const avail = (Array.from(card.querySelectorAll('.meta')).map(e=>e.textContent.trim())
                  .find(t=>/^first available date:/i.test(t))||'').replace(/^first available date:\s*/i,'').trim();
    const composed = (route + '|' + avail).toUpperCase().replace(/\s+/g,'_').slice(0,64);
    return composed || null;
  }

  // Extract all the fields we need directly from the card DOM (so we never depend on indices)
  function payloadFromCard(card){
    if (!card) return null;
    const routeTxt = (card.querySelector('.route')?.textContent||'').trim();
    const m = routeTxt.match(/^(.*?)\s*→\s*(.*?)\s/);
    const route_from = m ? m[1].trim() : '';
    const route_to   = m ? m[2].trim() : '';
    const itemLine = Array.from(card.querySelectorAll('.meta')).map(e=>e.textContent.trim()).find(t=>/^item:/i.test(t))||'';
    const item = itemLine.replace(/^item:\s*/i,'').trim() || 'Item';
    const milesLine = Array.from(card.querySelectorAll('.meta')).map(e=>e.textContent.trim()).find(t=>/^miles:/i.test(t))||'';
    let miles = milesLine.match(/([\d,\.]+)/); miles = miles ? Number(String(miles[1]).replace(/,/g,'')) : null;
    const availLine = Array.from(card.querySelectorAll('.meta')).map(e=>e.textContent.trim()).find(t=>/^first available date:/i.test(t))||'';
    const date = availLine.replace(/^first available date:\s*/i,'').trim();
    const key = keyFromCard(card) || (route_from+'_'+route_to+'_'+date).toUpperCase().replace(/\s+/g,'_').slice(0,64);
    return {
      key,
      load_number: key,
      load_id: key,
      route_from, route_to, item,
      miles: Number.isFinite(miles) ? miles : null,
      date
    };
  }

  // Stop any empty/# anchors from hijacking scroll (some themes do this)
  document.addEventListener('click', (e)=>{
    const a = e.target.closest('a');
    if (!a) return;
    const href = a.getAttribute('href')||'';
    if (href==='' || href==='#'){ e.preventDefault(); e.stopPropagation(); }
  }, true);

  // Ensure there *is* a Bid modal in the page (harmless if you already have one)
  function ensureBidModal(){
    if (document.getElementById('bidModal')) return;
    const tpl = document.createElement('div');
    tpl.innerHTML = `
      <div id="bidModal" class="modal"><div class="panel">
        <div class="title">Submit a Bid</div>
        <div id="bidSummary" class="meta" style="margin-bottom:8px"></div>
        <label>Offer Amount (USD)
          <input id="bidAmount" type="number" inputmode="numeric" class="input" min="1" step="1" placeholder="e.g. 1299">
        </label>
        <div style="height:8px"></div>
        <label>Notes (optional)
          <input id="bidNotes" class="input" placeholder="Any extra details…">
        </label>
        <div id="bidError" class="error"></div>
        <div class="panel-actions">
          <button class="btn secondary" type="button" id="bidCancel">Cancel</button>
          <button class="btn" type="button" id="bidSubmit">Submit Bid</button>
        </div>
      </div></div>`;
    document.body.appendChild(tpl.firstElementChild);
  }
  ensureBidModal();

  // When Bid is clicked, capture the *card DOM snapshot* into the modal (JSON in dataset)
  document.addEventListener('click', (e)=>{
    const btn = e.target.closest('button, a');
    if (!btn || !isBidButton(btn)) return;
    e.preventDefault(); e.stopPropagation();

    const card = btn.closest('.load-card, .card');
    const payload = payloadFromCard(card);
    if (!payload){ alert('Load not found.'); return; }

    const modal = document.getElementById('bidModal');
    modal.dataset.payload = JSON.stringify(payload);  // <- bulletproof across re-renders
    // Fill summary
    const sum = document.getElementById('bidSummary');
    if (sum){
      const milesTxt = (payload.miles!=null ? new Intl.NumberFormat().format(payload.miles) : '');
      sum.innerHTML = `<strong>Route:</strong> ${payload.route_from} → ${payload.route_to}
        &nbsp;&nbsp;<strong>Item:</strong> ${payload.item}
        &nbsp;&nbsp;<strong>Miles:</strong> ${milesTxt}
        &nbsp;&nbsp;<strong>First Available:</strong> ${payload.date||''}`;
    }
    const err = document.getElementById('bidError'); if (err) err.textContent = '';
    const amt = document.getElementById('bidAmount'); if (amt) amt.value = '';
    const nto = document.getElementById('bidNotes');  if (nto) nto.value = '';
    modal.classList.add('open');
  });

  // Modal buttons
  document.addEventListener('click', (e)=>{
    if (e.target.id === 'bidCancel'){ document.getElementById('bidModal')?.classList.remove('open'); }
  });

  // Submit using the payload we captured into the modal (no dependence on CARD_MAP or globals)
  document.addEventListener('click', async (e)=>{
    if (e.target.id !== 'bidSubmit') return;
    const err = document.getElementById('bidError');
    const raw = (document.getElementById('bidAmount')?.value||'').trim();
    const amount = Number(raw);
    if (!raw || !Number.isFinite(amount) || amount <= 0){
      if (err) err.textContent = 'Please enter a valid dollar amount.'; return;
    }

    const modal = document.getElementById('bidModal');
    let payload = null;
    try { payload = JSON.parse(modal?.dataset?.payload || 'null'); } catch(_){}
    if (!payload){
      if (err) err.textContent = 'Load not found.'; return;
    }

    // If Supabase isn’t available, just close and confirm (UI path proof)
    if (!window.sb){
      modal.classList.remove('open');
      alert('Bid submitted (UI only). Configure Supabase to save bids.');
      return;
    }

    try{
      const { data } = await window.sb.auth.getUser();
      const uid = data?.user?.id;
      if (!uid){ document.getElementById('authModal')?.classList.add('open'); return; }

      const row = {
        load_number: payload.load_number || payload.key,
        load_id:     payload.load_id || payload.key,
        route_from:  payload.route_from || '',
        route_to:    payload.route_to || '',
        item:        payload.item || 'Item',
        miles:       (payload.miles!=null ? Number(payload.miles) : null),
        price_offer: Math.round(amount),
        notes:       (document.getElementById('bidNotes')?.value||'').trim() || null,
        auth_user_id: uid,
        status: 'SUBMITTED',
        created_at: new Date().toISOString()
      };

      const { error } = await window.sb.from('bids').insert(row);
      if (error) throw error;

      modal.classList.remove('open');
      alert('Bid submitted! You can review it in Admin.');
    }catch(ex){
      console.error('Bid insert failed:', ex);
      if (err) err.textContent = ex.message || 'Failed to submit bid.';
    }
  });

  // Prevent accidental form submissions that scroll the page (mobile)
  document.addEventListener('submit', (e)=>{ e.preventDefault(); }, true);
})();