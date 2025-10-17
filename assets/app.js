/* assets/app.js — FULL REPLACE
   Build tag: auth-links + hide-price-TBD + all features
*/
console.info('AIM build: auth-links+hide-price', new Date().toISOString());

/* ------------------------------
   Supabase (ensure loads.html / index.html include:
   <script src="https://unpkg.com/@supabase/supabase-js@2"></script>
   BEFORE this file)
------------------------------ */
const SUPABASE_URL = 'https://xntxctjjtfjeznircuas.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhudHhjdGpqdGZqZXpuaXJjdWFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2ODkxNTAsImV4cCI6MjA3NjI2NTE1MH0.KeP_BvUDX1nde1iw95sv0ETtcseVEjDuR7gcYHPmsVk';
let sb = null;
try { sb = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) || null; } catch(e){ sb = null; }

async function getSession(){ if(!sb) return null; const { data } = await sb.auth.getSession(); return data?.session || null; }
async function isAuthed(){ return !!(await getSession()); }
async function signoutCarrier(){ if(!sb) return; await sb.auth.signOut(); }

/* ------------------------------
   Helpers
------------------------------ */
let LOADS = [];
const $  = (q, el=document) => el.querySelector(q);
const $$ = (q, el=document) => Array.from(el.querySelectorAll(q || '*'));
function fmt(n){ return new Intl.NumberFormat().format(Number(n||0)); }
function fmtPrice(v){
  const n = Number(v||0);
  try { return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n); }
  catch { return `$${(Math.round(n)||0)}`; }
}

/* ------------------------------
   Dark Mode + header/nav theming
------------------------------ */
const DARK_KEY = 'aim_dark_mode';
function applyNavDark(on){
  const sels = ['header','nav','#header','#topbar','#navbar','.navbar','.menu-bar','.topbar','.site-header','.main-header','[role="navigation"]','.nav'];
  const nodes = Array.from(new Set(sels.flatMap(s=>Array.from(document.querySelectorAll(s)))));
  nodes.forEach(el=>{
    if(on){
      if(!el.dataset._aimPrev) el.dataset._aimPrev = el.getAttribute('style')||'';
      el.style.background = '#12171d';
      el.style.color = '#e6e6e6';
      el.style.borderBottom = '1px solid #2a3441';
      el.querySelectorAll('a').forEach(a=>a.style.color='#e6e6e6');
      el.querySelectorAll('button,input,select').forEach(c=>{
        c.style.background='#1b222b'; c.style.color='#e6e6e6'; c.style.borderColor='#334052';
      });
    }else{
      el.setAttribute('style', el.dataset._aimPrev||'');
      el.querySelectorAll('a,button,input,select').forEach(c=>{
        c.style.background=''; c.style.color=''; c.style.borderColor='';
      });
    }
  });
}
function setDarkMode(on){
  const root=document.documentElement;
  if(on){ root.classList.add('dark'); localStorage.setItem(DARK_KEY,'1'); }
  else  { root.classList.remove('dark'); localStorage.removeItem(DARK_KEY); }
  applyNavDark(on);
}
setDarkMode(localStorage.getItem(DARK_KEY)==='1');

/* ------------------------------
   Top progress bar + overlay
------------------------------ */
const PROG_ID='aim-progress', PROG_IN='aim-progress-inner', OVER_ID='aim-overlay';
function ensureProgress(){
  if($('#'+PROG_ID)) return;
  const bar=document.createElement('div'); bar.id=PROG_ID;
  bar.style.cssText='position:fixed;left:0;top:0;right:0;height:3px;background:transparent;z-index:99998;';
  const inner=document.createElement('div'); inner.id=PROG_IN;
  inner.style.cssText='height:100%;width:0%;background:#2dd4bf;transition:width .25s ease;box-shadow:0 0 8px rgba(45,212,191,.6);';
  bar.appendChild(inner); document.body.appendChild(bar);
}
function progressStart(){
  ensureProgress(); const inner=$('#'+PROG_IN); if(!inner) return;
  clearInterval(inner._t); let p=0; inner.style.width='0%';
  inner._t=setInterval(()=>{ p=Math.min(85,p+5); inner.style.width=p+'%'; },120);
}
function progressDone(){
  const inner=$('#'+PROG_IN); if(!inner) return;
  inner.style.width='100%'; setTimeout(()=>{ inner.style.width='0%'; clearInterval(inner._t); inner._t=null; },350);
}
function showOverlay(){
  if($('#'+OVER_ID)) return;
  const d=document.createElement('div'); d.id=OVER_ID;
  d.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;z-index:99997;';
  d.innerHTML='<div style="background:#fff;padding:14px 18px;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,.25)">Loading loads…<div style="font-size:12px;opacity:.8">This can take a moment</div></div>';
  document.body.appendChild(d);
}
function hideOverlay(){ const d=$('#'+OVER_ID); if(d&&d.parentNode) d.parentNode.removeChild(d); }

/* ------------------------------
   State (filters/sort/pagination)
------------------------------ */
const STATE = { filtered:[], page:1, pageSize: parseInt(localStorage.getItem('aim_per')||'25',10)||25, sort:{key:'date', dir:'desc'} };
const PER_PAGE_OPTIONS = [10,25,50,100];
const SORT_KEYS = [
  {value:'price', label:'Price'},
  {value:'miles', label:'Miles'},
  {value:'date',  label:'First Available Date'},
  {value:'from_city', label:'From'},
  {value:'to_city',   label:'To'},
];

/* ------------------------------
   Normalization (handles Price/TBD)
------------------------------ */
function firstNonEmpty(o, keys){ for(const k of keys){ if(o[k]!=null && String(o[k]).trim()!=='') return o[k]; } return ''; }

function normalizeLoad(l, i){
  const from = firstNonEmpty(l, ['from_city','fromCity','origin','originCity','pickup_city','pickupCity','from']);
  const to   = firstNonEmpty(l, ['to_city','toCity','destination','destinationCity','dropoff_city','dropoffCity','to']);
  const date = firstNonEmpty(l, ['date','available','availableDate','pickupDate','pickup_date','date_available','readyDate','delivery_date']);
  const item = firstNonEmpty(l, ['item','vehicle','commodity']);
  const id   = firstNonEmpty(l, ['id','load_number']) || `L${i+1}`;
  const status = (l.status||'ACTIVE').toString().toUpperCase();
  const miles = Number(firstNonEmpty(l, ['miles']))||0;

  // --- Price handling: hide when blank or “TBD” (case-insensitive) or not a positive number
  const rawPrice = firstNonEmpty(l, ['price']);
  const rawStr   = String(rawPrice ?? '').trim();
  const isTBD    = rawStr.toLowerCase() === 'tbd';
  const num      = Number(rawPrice);
  const hasPrice = !isTBD && rawStr !== '' && Number.isFinite(num) && num > 0;

  return {
    ...l,
    __i: i,
    id,
    from_city: from,
    to_city: to,
    date,
    item,
    status,
    miles,
    price: hasPrice ? num : 0,
    _priceRaw: rawStr,
    _hasPrice: hasPrice
  };
}

/* ------------------------------
   Data load
------------------------------ */
async function loadData(){
  progressStart(); showOverlay();
  try{
    const res = await fetch('/assets/loads.json?ts='+Date.now(), {cache:'no-store', credentials:'omit'});
    const data = await res.json();
    const arr = Array.isArray(data) ? data : (data.loads||[]);
    LOADS = arr.map((l,i)=>normalizeLoad(l,i));
  }catch(e){
    console.error('Failed to load loads.json', e);
    LOADS = [];
  } finally {
    progressDone(); hideOverlay();
  }
  applyFilters();
}

/* ------------------------------
   Sorting / Filters / URL sync
------------------------------ */
function cmp(a,b){
  if (a==null && b==null) return 0;
  if (a==null) return -1;
  if (b==null) return 1;
  const ad=Date.parse(a), bd=Date.parse(b);
  if(!isNaN(ad) && !isNaN(bd)) return ad-bd;
  if(typeof a==='number' && typeof b==='number') return a-b;
  return String(a).localeCompare(String(b));
}
function getSorted(list){
  const {key,dir} = STATE.sort||{};
  if(!key) return list.slice();
  const arr=list.slice();
  arr.sort((x,y)=>{ const r = cmp(x[key], y[key]); return dir==='desc' ? -r : r; });
  return arr;
}

function applyFilters(){
  const term = ($('#q')?.value||'').toLowerCase();
  const comm = ($('#commodity')?.value||'').toLowerCase();
  const list = LOADS.filter(l=>{
    const hay = (String(l.item||'')+' '+String(l.from_city||'')+' '+String(l.to_city||'')+' '+String(l.commodity||'')).toLowerCase();
    const okQ = !term || hay.includes(term);
    const okC = !comm || (String(l.commodity||'').toLowerCase()===comm);
    return okQ && okC;
  });
  STATE.filtered = list;
  STATE.page = 1;
  persistUI();
  drawPage();
}

/* ------------------------------
   Rendering
------------------------------ */
function getGrid(){ return $('#grid'); }

function render(list){
  const grid = getGrid(); if(!grid) return;
  grid.innerHTML = list.map(l=>`
    <article class="card">
      <div class="route">${l.from_city} → ${l.to_city} <span class="status ${l.status||'ACTIVE'}">${(l.status||'ACTIVE')}</span></div>
      <div class="meta"><strong>Item:</strong> ${l.item||''}</div>
      <div class="meta"><strong>Miles:</strong> ${fmt(l.miles)}</div>
      <div class="meta"><strong>First Available Date:</strong> ${l.date||''}</div>
      ${l._hasPrice ? `<div class="price" style="margin:8px 0">Price: ${fmtPrice(l.price)}</div>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn secondary" onclick="openView(${l.__i})">View</button>
        <button class="btn" onclick="bidByIndex(${l.__i})">Bid</button>
      </div>
    </article>
  `).join('');
}

function renderPager(where){
  const grid = getGrid(); if(!grid) return;
  const hostId = where==='top'?'pager-top':'pager-bottom';
  let host = $('#'+hostId);
  if(!host){
    host = document.createElement('div'); host.id=hostId;
    host.style.cssText='display:flex;align-items:center;gap:10px;justify-content:space-between;padding:8px 0;';
    if(where==='top') grid.parentNode.insertBefore(host, grid);
    else grid.parentNode.insertBefore(host, grid.nextSibling);
  }

  const total = STATE.filtered.length;
  const lastPage = Math.max(1, Math.ceil(total/STATE.pageSize));
  if (STATE.page > lastPage) STATE.page = lastPage;

  const left = document.createElement('div');
  const perLab = document.createElement('label'); perLab.textContent='Show per page: '; perLab.style.cssText='font-size:14px;margin-right:6px;';
  const perSel = document.createElement('select'); perSel.id=`perpage-${where}`; perSel.style.cssText='font:inherit;padding:4px 6px;';
  [10,25,50,100].forEach(v=>{ const o=document.createElement('option'); o.value=String(v); o.textContent=v; if(v===STATE.pageSize) o.selected=true; perSel.appendChild(o); });
  left.appendChild(perLab); left.appendChild(perSel);

  const sortWrap = document.createElement('span'); sortWrap.style.cssText='margin-left:12px;';
  const sLab = document.createElement('label'); sLab.textContent='Sort: '; sLab.style.cssText='font-size:14px;margin-right:6px;';
  const sSel = document.createElement('select'); sSel.id=`sortkey-${where}`; sSel.style.cssText='font:inherit;padding:4px 6px;';
  SORT_KEYS.forEach(({value,label})=>{ const o=document.createElement('option'); o.value=value; o.textContent=label; if(STATE.sort?.key===value) o.selected=true; sSel.appendChild(o); });
  const dirBtn = document.createElement('button'); dirBtn.id=`sortdir-${where}`; dirBtn.style.cssText='font:inherit;padding:4px 8px;margin-left:6px;min-width:2.2em;text-align:center;line-height:1;';
  const asc = STATE.sort?.dir==='asc'; dirBtn.textContent = asc ? '▲' : '▼'; dirBtn.title = asc ? 'Ascending' : 'Descending';
  sortWrap.appendChild(sLab); sortWrap.appendChild(sSel); sortWrap.appendChild(dirBtn);
  left.appendChild(sortWrap);

  const right = document.createElement('div'); right.style.cssText='display:flex;align-items:center;gap:12px;flex-wrap:wrap;';
  // Dark toggle
  const dm = document.createElement('label'); dm.style.cssText='display:inline-flex;align-items:center;gap:6px;font-size:14px;';
  const dmChk = document.createElement('input'); dmChk.type='checkbox'; dmChk.checked=(localStorage.getItem(DARK_KEY)==='1');
  dm.appendChild(dmChk); dm.appendChild(document.createTextNode('Dark Mode')); right.appendChild(dm);

  // Auto refresh
  const ar = document.createElement('label'); ar.style.cssText='display:inline-flex;align-items:center;gap:6px;font-size:14px;';
  ar.appendChild(document.createTextNode('Auto Refresh:'));
  const arSel = document.createElement('select'); arSel.style.cssText='font:inherit;padding:2px 6px;';
  ['0','30','60','120'].forEach(v=>{ const o=document.createElement('option'); o.value=v; o.textContent=(v==='0'?'Off':v+'s'); if(v===(localStorage.getItem('aim_auto_refresh')||'0')) o.selected=true; arSel.appendChild(o); });
  ar.appendChild(arSel); right.appendChild(ar);

  // Export + Pager
  const ex = document.createElement('button'); ex.textContent='Export CSV'; ex.style.cssText='font:inherit;padding:4px 8px;'; right.appendChild(ex);
  const prev=document.createElement('button'); prev.textContent='Prev'; prev.style.cssText='font:inherit;padding:4px 8px;'; prev.disabled=STATE.page<=1;
  const info=document.createElement('span'); info.textContent=`Page ${STATE.page} / ${lastPage}`; info.style.cssText='margin:0 8px;font-size:14px;';
  const next=document.createElement('button'); next.textContent='Next'; next.style.cssText='font:inherit;padding:4px 8px;'; next.disabled=STATE.page>=lastPage;
  right.appendChild(prev); right.appendChild(info); right.appendChild(next);

  host.innerHTML=''; host.appendChild(left); host.appendChild(right);

  // events
  perSel.onchange = ()=>{ STATE.pageSize=parseInt(perSel.value,10)||25; STATE.page=1; persistUI(); drawPage(); };
  sSel.onchange   = ()=>{ STATE.sort.key=sSel.value; STATE.page=1; persistUI(); drawPage(); };
  dirBtn.onclick  = ()=>{ STATE.sort.dir=(STATE.sort.dir==='asc'?'desc':'asc'); dirBtn.textContent=(STATE.sort.dir==='asc'?'▲':'▼'); STATE.page=1; persistUI(); drawPage(); };
  dmChk.onchange  = ()=> setDarkMode(dmChk.checked);
  arSel.onchange  = ()=> setAutoRefresh(arSel.value);
  ex.onclick      = exportCurrentPageCSV;
  prev.onclick    = ()=>{ if(STATE.page>1){ STATE.page--; persistUI(); drawPage(); } };
  next.onclick    = ()=>{ const last=Math.max(1,Math.ceil(STATE.filtered.length/STATE.pageSize)); if(STATE.page<last){ STATE.page++; persistUI(); drawPage(); } };
}

function drawPage(){
  const sorted = getSorted(STATE.filtered);
  const start = (STATE.page-1)*STATE.pageSize;
  const end   = start + STATE.pageSize;
  render(sorted.slice(start,end));
  renderPager('top');
  renderPager('bottom');
  updateURL();
}

/* ------------------------------
   View / Auth / Bid
------------------------------ */
function openView(originalIndex){
  const l = LOADS.find(x=>x.__i===originalIndex); if(!l) return;
  const box = $('#viewContent');
  box.innerHTML = `
    <div class="title">${l.item||''}</div>
    <div class="meta" style="margin-bottom:6px"><strong>Route:</strong> ${l.from_city} → ${l.to_city}</div>
    <div class="meta"><strong>Miles:</strong> ${fmt(l.miles)}</div>
    <div class="meta"><strong>First Available Date:</strong> ${l.date||''}</div>
    ${l._hasPrice ? `<div class="price" style="margin:8px 0">Price: ${fmtPrice(l.price)}</div>` : ''}
    ${l.commodity ? `<div class="meta"><strong>Commodity:</strong> ${l.commodity}</div>` : ''}
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
      <button class="btn secondary" onclick="closeView()">Close</button>
      <button class="btn" onclick="bidByIndex(${l.__i})">Bid</button>
    </div>
  `;
  $('#viewModal').classList.add('open');
}
function closeView(){ $('#viewModal').classList.remove('open'); }
function openAuth(){ $('#authModal').classList.add('open'); }
function closeAuth(){ $('#authModal').classList.remove('open'); }

async function signin(){
  const email = $('#authEmail')?.value?.trim();
  const password = $('#authPass')?.value || '';
  const err = $('#authError'); if (err) err.textContent='';
  if (!sb) { if (err) err.textContent='Supabase not loaded.'; return; }
  if (!email || !password){ if (err) err.textContent='Please enter both email and password.'; return; }
  try{
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    closeAuth();
    updateAuthLinksUI();
    alert('Signed in successfully!');
  }catch(e){ if (err) err.textContent = e.message || 'Sign-in failed.'; }
}
async function signup(){
  const email = $('#authEmail')?.value?.trim();
  const password = $('#authPass')?.value || '';
  const err = $('#authError'); if (err) err.textContent='';
  if (!sb) { if (err) err.textContent='Supabase not loaded.'; return; }
  if (!email || !password){ if (err) err.textContent='Please enter both email and password.'; return; }
  try{
    const { error } = await sb.auth.signUp({ email, password });
    if (error) throw error;
    if (err) err.textContent='Check your email to confirm your account.';
  }catch(e){ if (err) err.textContent = e.message || 'Sign-up failed.'; }
}

async function bidByIndex(originalIndex){
  if (!(await isAuthed())) { openAuth(); return; }
  const l = LOADS.find(x => x.__i === originalIndex);
  if (!l) { alert('Sorry, that load is unavailable.'); return; }
  const amountStr = prompt(`Enter your bid for ${l.load_number || l.id || ''} (${l.from_city} → ${l.to_city})`);
  if (!amountStr) return;
  const amount = Number(amountStr);
  if (!Number.isFinite(amount) || amount <= 0) { alert('Enter a valid positive number.'); return; }
  const session = await getSession();
  const uid = session?.user?.id;
  const load_number = l.load_number || l.id || '';
  try{
    const { error } = await sb.from('bids').insert({ auth_user_id: uid, load_number, amount, notes: '' });
    if (error) throw error;
    alert('Bid submitted!');
  }catch(e){ console.error(e); alert('Failed to submit bid.'); }
}

/* ------------------------------
   Auto refresh + CSV export
------------------------------ */
let refreshTimer=null;
function setAutoRefresh(val){
  localStorage.setItem('aim_auto_refresh', String(val||'0'));
  if(refreshTimer){ clearInterval(refreshTimer); refreshTimer=null; }
  const seconds = parseInt(val,10)||0; if(!seconds) return;
  refreshTimer = setInterval(async()=>{
    try{
      progressStart();
      const res = await fetch('/assets/loads.json?ts='+Date.now(), {cache:'no-store', credentials:'omit'});
      const data = await res.json();
      const arr = Array.isArray(data) ? data : (data.loads||[]);
      LOADS = arr.map((l,i)=>normalizeLoad(l,i));
      applyFilters();
    }catch(e){ console.warn('Auto-refresh failed', e); }
    finally{ progressDone(); }
  }, seconds*1000);
}

function exportCurrentPageCSV(){
  const sorted=getSorted(STATE.filtered);
  const start=(STATE.page-1)*STATE.pageSize, end=start+STATE.pageSize;
  const rows=sorted.slice(start,end);
  const headers=['ID','From','To','First Available Date','Item','Miles','Price','Status','Commodity','Notes'];
  const csv=[headers.join(',')];
  rows.forEach(l=>{
    const r=[l.id||l.load_number||'', l.from_city||'', l.to_city||'', l.date||'', l.item||'', Number(l.miles||0), (l._hasPrice?String(l.price):''), (l.status||'').toUpperCase(), l.commodity||'', (l.notes||'').replace(/"/g,'""')];
    const line=r.map(s=>{ const v=String(s==null?'':s); return /[",\n]/.test(v)?`"${v.replace(/"/g,'""')}"`:v; }).join(',');
    csv.push(line);
  });
  const blob=new Blob([csv.join('\n')],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a');
  a.href=url; a.download=`loads_page${STATE.page}_per${STATE.pageSize}.csv`; document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); },200);
}

/* ------------------------------
   Sticky UI + URL
------------------------------ */
function persistUI(){
  const qEl=$('#q'), cEl=$('#commodity');
  if(qEl) localStorage.setItem('aim_q', qEl.value||'');
  if(cEl) localStorage.setItem('aim_commodity', cEl.value||'');
  localStorage.setItem('aim_per', String(STATE.pageSize));
  localStorage.setItem('aim_sort', `${STATE.sort.key||''}:${STATE.sort.dir||''}`);
  localStorage.setItem('aim_page', String(STATE.page));
}
function restoreUIFromStorage(){
  const q=localStorage.getItem('aim_q')||'', c=localStorage.getItem('aim_commodity')||'';
  const per=parseInt(localStorage.getItem('aim_per')||'0',10);
  const page=parseInt(localStorage.getItem('aim_page')||'0',10);
  const sort=(localStorage.getItem('aim_sort')||'').split(':');
  if($('#q')) $('#q').value=q;
  if($('#commodity')) $('#commodity').value=c;
  if(per) STATE.pageSize=per;
  if(page) STATE.page=page;
  if(sort[0]) STATE.sort.key=sort[0];
  if(sort[1]) STATE.sort.dir=sort[1];
}
function restoreUIFromURL(){
  const url = new URL(window.location.href);
  const q=url.searchParams.get('q'); const c=url.searchParams.get('commodity');
  const per=parseInt(url.searchParams.get('per')||'',10);
  const page=parseInt(url.searchParams.get('page')||'',10);
  const sort=url.searchParams.get('sort');
  if(q!=null && $('#q')) $('#q').value=q;
  if(c!=null && $('#commodity')) $('#commodity').value=c;
  if(!isNaN(per)&&per>0) STATE.pageSize=per;
  if(!isNaN(page)&&page>0) STATE.page=page;
  if(sort){ const [k,d]=sort.split(':'); if(k) STATE.sort.key=k; if(d) STATE.sort.dir=d; }
}
function updateURL(){
  const url = new URL(window.location.href);
  const q=$('#q')?.value||''; const c=$('#commodity')?.value||'';
  url.searchParams.set('q', q); url.searchParams.set('commodity', c);
  url.searchParams.set('per', String(STATE.pageSize));
  url.searchParams.set('page', String(STATE.page));
  url.searchParams.set('sort', `${STATE.sort.key}:${STATE.sort.dir}`);
  history.replaceState(null,'',url.toString());
}

/* ------------------------------
   Auth links in nav (no HTML changes needed)
------------------------------ */
function ensureAuthLinks(){
  // find right-side nav container (the 2nd <div> inside .nav)
  const navRight = document.querySelector('.nav > div:nth-child(2)') || document.querySelector('.nav') || document.body;

  // Sign in
  let signin = document.getElementById('signinLink');
  if(!signin){
    signin = document.createElement('a');
    signin.id = 'signinLink';
    signin.href = '#';
    signin.textContent = 'Sign in';
    signin.style.marginLeft = '8px';
    signin.onclick = (e)=>{ e.preventDefault(); openAuth(); };
    navRight.appendChild(signin);
  }

  // Sign out
  let signout = document.getElementById('signoutLink');
  if(!signout){
    signout = document.createElement('a');
    signout.id = 'signoutLink';
    signout.href = '#';
    signout.textContent = 'Sign out';
    signout.style.marginLeft = '8px';
    signout.onclick = async (e)=>{ e.preventDefault(); await signoutCarrier(); updateAuthLinksUI(); alert('Signed out.'); };
    navRight.appendChild(signout);
  }

  updateAuthLinksUI();
}

async function updateAuthLinksUI(){
  const signedIn = await isAuthed();
  const inEl = document.getElementById('signinLink');
  const outEl = document.getElementById('signoutLink');
  if (inEl)  inEl.style.display  = signedIn ? 'none' : 'inline';
  if (outEl) outEl.style.display = signedIn ? 'inline' : 'none';
}

/* ------------------------------
   Boot
------------------------------ */
document.addEventListener('DOMContentLoaded', ()=>{
  // Admin link only with ?admin=true
  try{
    const url=new URL(window.location.href);
    const adminFlag=url.searchParams.get('admin');
    const adminLink=$('#adminLink'); if(adminLink) adminLink.style.display=(adminFlag==='true')?'inline':'none';
  }catch(e){}

  // Build auth links automatically
  ensureAuthLinks();
  if (sb?.auth?.onAuthStateChange) {
    sb.auth.onAuthStateChange(() => updateAuthLinksUI());
  }

  // Restore UI state & wire filters
  restoreUIFromURL(); restoreUIFromStorage();
  ['q','commodity'].forEach(id=>{
    const el=document.getElementById(id);
    if(!el) return;
    el.addEventListener(el.tagName==='SELECT' ? 'change' : 'input', applyFilters);
  });

  // Auto-refresh init
  setAutoRefresh(localStorage.getItem('aim_auto_refresh')||'0');

  // Initial load
  showOverlay();
  loadData().finally(hideOverlay);
});

/* ------------------------------
   Expose globals for onclick in HTML
------------------------------ */
window.openView = openView;
window.closeView = closeView;
window.bidByIndex = bidByIndex;
window.signin = signin;
window.signup = signup;
window.openAuth = openAuth;
window.closeAuth = closeAuth;