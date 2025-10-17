function token() { return sessionStorage.getItem('aim_admin_bearer') || ''; }
function setToken(t){ if (t) sessionStorage.setItem('aim_admin_bearer', t); else sessionStorage.removeItem('aim_admin_bearer'); }

function apiUrl(load){
  return '/api/admin-bids' + (load ? ('?load=' + encodeURIComponent(load)) : '');
}

function setRows(rows) {
  const tb = document.getElementById('admRows');
  tb.innerHTML = rows.map(r => `
    <tr>
      <td>${r.created_at ? new Date(r.created_at).toLocaleString() : ''}</td>
      <td>${r.load_number || ''}</td>
      <td>${r.auth_user_id || ''}</td>
      <td class="num">${(r.amount!=null && r.amount!=='') ? '$'+Math.round(Number(r.amount||0)).toLocaleString() : ''}</td>
      <td>${r.notes || ''}</td>
    </tr>
  `).join('');
}

async function login(){
  const u = document.getElementById('admUser').value.trim();
  const p = document.getElementById('admPass').value;
  const msg = document.getElementById('loginMsg'); msg.textContent='';
  try{
    const res = await fetch('/api/admin-login', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ username: u, password: p })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Login failed');
    setToken(data.token);
    showMain();
  }catch(e){ msg.textContent = e.message; }
}

async function fetchBids(){
  const bearer = token();
  const load   = document.getElementById('admLoad').value.trim();
  const msg = document.getElementById('admMsg'); msg.textContent = '';
  if (!bearer) { showLogin('Please log in'); return; }

  try {
    const res = await fetch(apiUrl(load), { headers: { Authorization: 'Bearer ' + bearer } });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Request failed');
    const rows = data.bids || [];
    setRows(rows);
    window.__adm_last = rows;
    msg.textContent = rows.length ? '' : 'No rows found.';
  } catch (e) {
    msg.textContent = e.message;
  }
}

function exportCSV() {
  const rows = window.__adm_last || [];
  const headers = ['created_at','load_number','auth_user_id','amount','notes'];
  const csv = [headers.join(',')];
  rows.forEach(r => {
    const line = headers.map(h => {
      const v = String(r[h] ?? '');
      return /[",\n]/.test(v) ? `"${v.replace(/"/g,'""')}"` : v;
    }).join(',');
    csv.push(line);
  });
  const blob = new Blob([csv.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'all_bids.csv';
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 200);
}

function showLogin(msg){
  document.getElementById('loginView').style.display = 'block';
  document.getElementById('mainView').style.display  = 'none';
  if (msg) document.getElementById('loginMsg').textContent = msg;
}
function showMain(){
  document.getElementById('loginView').style.display = 'none';
  document.getElementById('mainView').style.display  = 'block';
  fetchBids();
}

document.addEventListener('DOMContentLoaded', ()=>{
  if (token()) showMain(); else showLogin();

  document.getElementById('admLoginBtn')?.addEventListener('click', login);
  document.getElementById('admFetch')?.addEventListener('click', fetchBids);
  document.getElementById('admCSV')?.addEventListener('click', exportCSV);
  document.getElementById('admLogout')?.addEventListener('click', ()=>{ setToken(''); showLogin(); });
});