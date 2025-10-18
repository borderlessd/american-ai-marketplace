/* /assets/bid.js — dedicated bid page logic */

(function(){
  // base64url decode
  function b64urlToStr(s){
    try{
      s = s.replace(/-/g,'+').replace(/_/g,'/');
      const pad = s.length % 4; if (pad) s += '='.repeat(4-pad);
      return decodeURIComponent(escape(atob(s)));
    }catch(e){ return ''; }
  }

  const $ = (q, el=document)=>el.querySelector(q);

  let sb = null;
  try{
    if (window.supabase && window.SUPABASE_URL && window.SUPABASE_KEY) {
      sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
      window.sb = window.sb || sb;
    }
  }catch(e){ console.error('Supabase init failed', e); }

  function renderSummary(p){
    const box = $('#bidSummary'); if (!box) return;
    const priceLine = (p.price && Number(p.price)>0) ? `<div class="meta"><strong>Price:</strong> $${new Intl.NumberFormat().format(Number(p.price))}</div>` : '';
    box.innerHTML = `
      <div class="meta"><strong>Route:</strong> ${p.route_from||''} → ${p.route_to||''}</div>
      <div class="meta"><strong>Item:</strong> ${p.item||'Item'}</div>
      <div class="meta"><strong>Miles:</strong> ${p.miles!=null ? new Intl.NumberFormat().format(Number(p.miles)) : ''}</div>
      <div class="meta"><strong>First Available Date:</strong> ${p.date||p.available||''}</div>
      ${priceLine}
    `;
  }

  async function requireAuth(){
    if (!sb) throw new Error('Auth unavailable');
    const { data } = await sb.auth.getUser();
    if (!data?.user) throw new Error('Please sign in on the main page before bidding.');
    return data.user.id;
  }

  async function submit(payload){
    const err = $('#bidError');
    try{
      const uid = await requireAuth();
      const amountRaw = ($('#bidAmount')?.value || '').trim();
      const amount = Number(amountRaw);
      if (!amountRaw || !Number.isFinite(amount) || amount<=0){
        err.textContent = 'Please enter a valid dollar amount.';
        return;
      }

      const notes = ($('#bidNotes')?.value || '').trim() || null;
      const out = {
        load_number: payload.load_number || payload.load_id,
        load_id:     payload.load_id || payload.load_number,
        route_from:  payload.route_from || '',
        route_to:    payload.route_to || '',
        item:        payload.item || 'Item',
        miles:       (payload.miles!=null ? Number(payload.miles) : null),
        price_offer: Math.round(amount),
        notes,
        auth_user_id: uid,
        status: 'SUBMITTED',
        created_at: new Date().toISOString()
      };

      const { error } = await sb.from('bids').insert(out);
      if (error) throw error;
      alert('Bid submitted!');
      window.location.href = '/index.html';
    }catch(e){
      console.error(e);
      err.textContent = e.message || 'Failed to submit bid.';
    }
  }

  // Boot
  document.addEventListener('DOMContentLoaded', ()=>{
    const url = new URL(location.href);
    const p = url.searchParams.get('p') || '';
    const json = b64urlToStr(p);
    let payload = {};
    try { payload = JSON.parse(json||'{}'); } catch(_){ payload = {}; }

    if (!payload || (!payload.load_number && !payload.route_from)){
      const box = $('#bidSummary');
      if (box) box.innerHTML = `<div class="error">Invalid or missing load. Please return to the <a href="/index.html">loads list</a>.</div>`;
      $('#submitBidBtn')?.setAttribute('disabled','disabled');
      return;
    }

    renderSummary(payload);
    $('#submitBidBtn')?.addEventListener('click', ()=>submit(payload));
  });
})();