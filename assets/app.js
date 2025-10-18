/* =========================================================================
   /assets/app.js — rock-solid bid flow (keyed cards, no index, no scroll)
   ========================================================================= */

let LOADS = [];
let sb = null;

// ---------- Supabase (optional; enable if keys are present) ----------
try {
  if (window.supabase && window.SUPABASE_URL && window.SUPABASE_KEY) {
    sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
    window.sb = sb;
  }
} catch (e) {
  console.warn('Supabase init failed:', e);
}

// ---------- tiny helpers ----------
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
  // deterministic id per load, independent of sorting/pagination
  const base = (l.load_number || l.id || `${fromCity(l)||'FROM'}-${toCity(l)||'TO'}-${dateStr(l)||''}`)
    .toString().trim();
  return base.replace(/\s+/g,'_').toUpperCase().slice(0,64);
}

// ---------- global state for keyed lookup ----------
const CARD_MAP = new Map();   // key -> load payload used to render that card
let CURRENT_KEY = null;       // key for the card whose Bid modal is open

// ---------- data ----------
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

// ---------- render ----------
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

// ---------- filters ----------
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

// ---------- sort + pagination ----------
const pagerState = { page:1, pageSize:25 };
function getCards(){ return Array.from(document.querySelectorAll('#grid .load-card, #grid .card')); }

function parseCardData(card){
  const metas = $$('.meta', card).map(x=>x.textContent.trim());
  const milesLine = metas.find(t=>/^miles:/i.test(t))||'';
  const availLine = metas.find(t=>/^first available date:/i.test(t))||'';
  const itemLine  = metas.find(t=>/^item:/i.test(t))||'';
  let miles = Number((milesLine.match(/([\d,]+)/)?.[1]||'').replace(/,/g,''));
  if (!Number.isFinite(miles)) miles = NaN;
  let avail = 0; const a=availLine.replace(/^first available date:\s*/i,'').trim(); if(a){ const d=new Date(a); if(!isNaN(d)) avail=d.getTime(); }
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

// ---------- modals ----------
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
window.signin = signin; // used by HTML button

// ---------- event wiring (kills anchors, uses keyed cards) ----------
function wireGlobalEvents(){
  // 1) Kill default "#" anchors to stop jump-to-top
  document.addEventListener('click', (e)=>{
    const a = e.target.closest('a');
    if (!a) return;
    const href = a.getAttribute('href')||'';
    if (href==='' || href==='#'){
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  // 2) Grid delegation: View and Bid from the card itself
  const grid = $('#grid');
  if (!grid || grid.__wired) return;
  grid.__wired = true;

  grid.addEventListener('click', async (e)=>{
    const viewBtn = e.target.closest('.view-btn');
    const bidBtn  = e.target.closest('.bid-btn');
    if (!viewBtn && !bidBtn) return;

    e.preventDefault(); e.stopPropagation();

    const card = e.target.closest('.load-card, .card');
    if (!card) return;

    const key = card.dataset.aimId;
    const payload = key ? CARD_MAP.get(key) : null;

    if (viewBtn){
      const box = $('#viewContent');
      if (box){
        const miles = (payload?.miles!=null ? fmt(payload.miles) : '');
        box.innerHTML = `
          <div class="title">${payload?.item || 'Item'}</div>
          <div class="meta"><strong>Route:</strong> ${(payload?.route_from||'')} → ${(payload?.route_to||'')}</div>
          <div class="meta"><strong>Miles:</strong> ${miles}</div>
          <div class="meta"><strong>First Available Date:</strong> ${(payload?.date||'')}</div>
        `;
        $('#viewModal')?.classList.add('open');
      }
      return;
    }

    if (bidBtn){
      if (!payload){ alert('Load not found.'); return; }

      // require auth
      try{
        if (!sb?.auth){ openAuth(); return; }
        const { data } = await sb.auth.getUser();
        if (!data?.user){ openAuth(); return; }
      }catch(_){ openAuth(); return; }

      CURRENT_KEY = payload.key;
      ensureBidModal();
      const sum = $('#bidSummary');
      if (sum){
        sum.innerHTML = `
          <strong>Route:</strong> ${payload.route_from||''} → ${payload.route_to||''}
          &nbsp;&nbsp;<strong>Item:</strong> ${payload.item||'Item'}
          &nbsp;&nbsp;<strong>Miles:</strong> ${payload.miles!=null?fmt(payload.miles):''}
          &nbsp;&nbsp;<strong>First Available:</strong> ${payload.date||''}
        `;
      }
      $('#bidError') && ($('#bidError').textContent='');
      $('#bidAmount') && ($('#bidAmount').value='');
      $('#bidNotes') && ($('#bidNotes').value='');
      $('#bidModal')?.classList.add('open');
      return;
    }
  });

  // 3) Modal buttons
  document.addEventListener('click', async (e)=>{
    if (e.target.id === 'bidCancel'){
      $('#bidModal')?.classList.remove('open');
    }
    if (e.target.id === 'bidSubmit'){
      const errEl = $('#bidError');
      const amtRaw = ($('#bidAmount')?.value||'').trim();
      const amount = Number(amtRaw);
      if (!amtRaw || !Number.isFinite(amount) || amount<=0){
        if (errEl) errEl.textContent = 'Please enter a valid dollar amount.';
        return;
      }
      if (!CURRENT_KEY || !CARD_MAP.has(CURRENT_KEY)){
        if (errEl) errEl.textContent = 'Load not found.';
        return;
      }
      const p = CARD_MAP.get(CURRENT_KEY);

      if (!sb){
        alert('Bid submitted (demo).'); 
        $('#bidModal')?.classList.remove('open'); 
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
    }
  });
}

// ---------- boot ----------
document.addEventListener('DOMContentLoaded', ()=>{
  // Show Admin link only with ?admin=true
  try{
    const url = new URL(location.href);
    const adminFlag = url.searchParams.get('admin')==='true';
    const adminLink = $('#adminLink');
    if (adminLink) adminLink.style.display = adminFlag ? 'inline' : 'none';
  }catch(_){}

  // wire inputs
  ['q','commodity'].forEach(id=>{
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener(el.tagName==='SELECT' ? 'change' : 'input', applyFilters);
  });
  wireSortAndPaginationOnce();
  wireGlobalEvents();
  loadData();
});