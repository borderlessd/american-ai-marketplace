
let LOADS = [];
let TOKEN = localStorage.getItem('aim_token')||'';
const $ = (q, el=document) => el.querySelector(q);
function fmt(n){return new Intl.NumberFormat().format(n);}

async function loadData(){
  try{
    const res = await fetch('assets/loads.json?ts=' + Date.now());
    const data = await res.json();
    LOADS = Array.isArray(data) ? data : (data.loads||[]);
  }catch(e){ console.error('Failed to load loads.json', e); LOADS = []; }
  render(LOADS);
}

function render(list){
  const grid = $('#grid'); if(!grid) return;
  grid.innerHTML = list.map((l, idx) => `
    <article class="card">
      <div class="route">${l.from_city} -> ${l.to_city} <span class="status ${l.status||'open'}">${(l.status||'open').toUpperCase()}</span></div>
      <div class="meta"><strong>Item:</strong> ${l.item}</div>
      <div class="meta"><strong>Miles:</strong> ${fmt(l.miles)} • <strong>Available:</strong> ${l.date}</div>
      <div class="price" style="margin:8px 0">${l.price||''}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn secondary" onclick="openView(${idx})">View</button>
        <button class="btn" onclick="bid()">Bid</button>
      </div>
    </article>
  `).join('');
}

function applyFilters(){
  const term = ($('#q')?.value||'').toLowerCase();
  const comm = ($('#commodity')?.value||'').toLowerCase();
  const list = LOADS.filter(l => {
    const hay = (l.item+' '+l.from_city+' '+l.to_city+' '+(l.commodity||'')).toLowerCase();
    const okQ = !term || hay.includes(term);
    const okC = !comm || (l.commodity||'').toLowerCase()===comm;
    return okQ && okC;
  });
  render(list);
}

function openView(index){
  const l = LOADS[index]; if(!l) return;
  const box = $('#viewContent');
  box.innerHTML = `
    <div class="title">${l.item}</div>
    <div class="meta" style="margin-bottom:6px"><strong>Route:</strong> ${l.from_city} -> ${l.to_city}</div>
    <div class="meta"><strong>Miles:</strong> ${fmt(l.miles)}</div>
    <div class="meta"><strong>Available:</strong> ${l.date}</div>
    ${l.price ? `<div class="price" style="margin:8px 0">${l.price}</div>` : ''}
    ${l.commodity ? `<div class="meta"><strong>Commodity:</strong> ${l.commodity}</div>` : ''}
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
      <button class="btn secondary" onclick="closeView()">Close</button>
      <button class="btn" onclick="bid()">Bid</button>
    </div>
  `;
  $('#viewModal').classList.add('open');
}
function closeView(){ $('#viewModal').classList.remove('open'); }

function bid(){
  if(!TOKEN){ openAuth(); return; }
  alert('Bid submitted');
}
function openAuth(){ $('#authModal').classList.add('open'); }
function closeAuth(){ $('#authModal').classList.remove('open'); }
function signin(){
  const err = $('#authError');
  if(err){ err.textContent = 'Invalid username or password.'; }
}

document.addEventListener('DOMContentLoaded', () => {
  try{
    const url = new URL(window.location.href);
    const adminFlag = url.searchParams.get('admin');
    const adminLink = document.getElementById('adminLink');
    if(adminLink){ adminLink.style.display = (adminFlag === 'true') ? 'inline' : 'none'; }
  }catch(e){}
  ['q','commodity'].forEach(id => {
    const el = document.getElementById(id);
    if(!el) return;
    el.addEventListener(el.tagName==='SELECT' ? 'change' : 'input', applyFilters);
  });
  loadData();
});
