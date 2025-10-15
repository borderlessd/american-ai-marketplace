let LOADS = [];
let TOKEN = localStorage.getItem('aim_token')||'';
const $ = (q, el=document) => el.querySelector(q);
function fmt(n){return new Intl.NumberFormat().format(n);}

async function loadData(){
  try{
    const res = await fetch('/assets/loads.json?ts=' + Date.now());
    const data = await res.json();
    LOADS = Array.isArray(data) ? data : (data.loads||[]);
  }catch(e){
    console.error('Failed to load loads.json', e);
    LOADS = [];
  }
  render(LOADS);
}

function render(list){
  const grid = $('#grid'); if(!grid) return;
  grid.innerHTML = list.map((l, idx) => `
    <article class="card">
      <div class="route">${l.from_city} → ${l.to_city} <span class="status ${l.status||'open'}">${(l.status||'open').toUpperCase()}</span></div>
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
    <div class="meta" style="margin-bottom:6px"><strong>Route:</strong> ${l.from_city} → ${l.to_city}</div>
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
  // Reveal Admin link only with ?admin=true
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

/* ---- NON-DESTRUCTIVE TEXT PATCH (append-only) ---- */
(function () {
  function splitMilesAvailableInPlace(root) {
    // Find lines like: "Miles: 100 • Available: 2025-10-20"
    // Replace with:    "Miles: 100<br>First Available Date: 2025-10-20"
    const els = root.querySelectorAll('.meta, .details, .info');
    els.forEach(el => {
      const txt = (el.textContent || '').trim();
      if (!txt) return;
      // must contain both labels and a separator (• or -)
      if (/Miles:\s*/i.test(txt) && /Available:\s*/i.test(txt) && (txt.includes('•') || / - /.test(txt))) {
        const milesMatch = txt.match(/Miles:\s*([^•\-]+)/i);
        const availMatch = txt.match(/Available:\s*(.*)$/i);
        const milesVal = milesMatch ? milesMatch[1].trim() : '';
        const availVal = availMatch ? availMatch[1].trim() : '';
        // Keep the SAME element; just swap its HTML to add a <br>
        el.innerHTML = `Miles: ${milesVal}<br>First Available Date: ${availVal}`;
      }
    });
  }

  function labelPriceInPlace(root) {
    // Prepend "Price: " INSIDE the existing .price element so it keeps the same font/size
    root.querySelectorAll('.price').forEach(el => {
      const t = (el.textContent || '').trim();
      if (!t) return;
      if (!/^price:\s*/i.test(t)) {
        // Use innerText to preserve existing styling; set once
        el.textContent = `Price: ${t}`;
      }
    });
  }

  function applyPatch() {
    const scope = document;
    splitMilesAvailableInPlace(scope);
    labelPriceInPlace(scope);
  }

  // Run when DOM is ready and a bit after (for async render)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyPatch);
  } else {
    applyPatch();
  }
  setTimeout(applyPatch, 300);
  setTimeout(applyPatch, 900);

  // If your list re-renders dynamically, re-apply on mutations
  const mo = new MutationObserver(() => applyPatch());
  mo.observe(document.body, { childList: true, subtree: true });
})();
