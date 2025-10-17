const SUPABASE_URL = 'https://xntxctjjtfjeznircuas.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhudHhjdGpqdGZqZXpuaXJjdWFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2ODkxNTAsImV4cCI6MjA3NjI2NTE1MH0.KeP_BvUDX1nde1iw95sv0ETtcseVEjDuR7gcYHPmsVk';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function getSession(){ const { data } = await sb.auth.getSession(); return data?.session || null; }

function fmtUSD(n){
  try { return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(n||0)); }
  catch { return '$'+(Math.round(Number(n||0))); }
}

async function loadMyBids(){
  const { data } = await sb.auth.getSession();
  const uid = data?.session?.user?.id;
  const listEl = document.getElementById('bidsList');
  const emptyEl= document.getElementById('bidsEmpty');

  if(!uid){ listEl.innerHTML = '<div class="card">Please sign in from the Loads page.</div>'; return; }

  listEl.innerHTML = '<div class="card">Loading…</div>';

  const { data: bids, error } = await sb
    .from('bids')
    .select('id, load_number, amount, notes, created_at')
    .order('created_at', { ascending:false });

  if (error) { listEl.innerHTML = `<div class="card">${error.message}</div>`; return; }
  if (!bids.length){ listEl.innerHTML=''; emptyEl.style.display='block'; return; }

  listEl.innerHTML = bids.map(b => `
    <article class="card">
      <div class="route">Load: ${b.load_number}</div>
      <div class="meta"><strong>Amount:</strong> ${fmtUSD(b.amount)}</div>
      ${b.notes ? `<div class="meta"><strong>Notes:</strong> ${b.notes}</div>` : ''}
      <div class="meta"><strong>Submitted:</strong> ${new Date(b.created_at).toLocaleString()}</div>
    </article>
  `).join('');
}

document.addEventListener('DOMContentLoaded', loadMyBids);
