function url(load) {
  return '/api/admin-bids' + (load ? ('?load=' + encodeURIComponent(load)) : '');
}
function setRows(rows) {
  const tb = document.getElementById('admRows');
  tb.innerHTML = rows.map(r => `
    <tr>
      <td>${new Date(r.created_at).toLocaleString()}</td>
      <td>${r.load_number||''}</td>
      <td>${r.auth_user_id||''}</td>
      <td class="num">$${Math.round(Number(r.amount||0)).toLocaleString()}</td>
      <td>${r.notes||''}</td>
    </tr>
  `).join('');
}

async function fetchBids() {
  const bearer = document.getElementById('admBearer').value.trim();
  const load   = document.getElementById('admLoad').value.trim();
  const msg = document.getElementById('admMsg'); msg.textContent = '';
  if (!bearer) { msg.textContent = 'Enter ADMIN_BEARER'; return; }

  try {
    const res = await fetch(url(load), { headers: { 'Authorization': 'Bearer ' + bearer } });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Request failed');
    const rows = data.bids || [];
    setRows(rows);
    window.__adm_last = rows;
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

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('admFetch').addEventListener('click', fetchBids);
  document.getElementById('admCSV').addEventListener('click', exportCSV);
});