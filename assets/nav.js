// /assets/nav.js
(async function loadUniversalNav(){
  // Find the existing nav container; if missing, create one at the top
  let nav = document.querySelector('.nav');
  if (!nav) {
    nav = document.createElement('div');
    nav.className = 'nav';
    document.body.prepend(nav);
  }

  // Fetch and inject the shared HTML
  try {
    const res = await fetch('/assets/nav.html?ts=' + Date.now(), { cache: 'no-store' });
    const html = await res.text();
    nav.innerHTML = html;
  } catch (e) {
    console.error('Failed to load /assets/nav.html', e);
    return;
  }

  // --- Dark mode toggle ---
  const darkBtn = document.getElementById('darkToggle');
  function applyDark() {
    const dark = localStorage.getItem('aim_dark') === '1';
    document.body.classList.toggle('dark', dark);
    if (darkBtn) darkBtn.textContent = dark ? '☀️ Light' : '🌙 Dark';
  }
  if (darkBtn) {
    darkBtn.addEventListener('click', () => {
      const next = !document.body.classList.contains('dark');
      localStorage.setItem('aim_dark', next ? '1' : '0');
      applyDark();
    });
  }
  applyDark();

  // --- Highlight active link (best-effort) ---
  const path = location.pathname.replace(/\/+$/,'/');
  const map = {
    '/': 'home',
    '/index.html': 'home',
    '/register.html': 'register',
  };
  const activeKey = map[path] || '';
  if (activeKey) {
    const a = nav.querySelector(`[data-link="${activeKey}"]`);
    if (a) a.classList.add('active'); // your CSS can style .active
  }

  // --- Admin link visibility via ?admin=true ---
  try {
    const url = new URL(window.location.href);
    const adminFlag = url.searchParams.get('admin') === 'true';
    const adminLink = document.getElementById('adminLink');
    if (adminLink) {
      adminLink.style.display = adminFlag ? 'inline' : 'none';
      if (adminFlag) {
        adminLink.addEventListener('click', (e) => {
          e.preventDefault();
          // Reuse your existing gate modal if present, else go to /admin/
          const gate = document.getElementById('gateModal');
          if (gate) gate.classList.add('open');
          else window.location.href = '/admin/';
        });
      }
    }
  } catch(e) {}

  // --- Auth & My Bids (works if Supabase is present and configured) ---
  const signinLink = document.getElementById('signinLink');
  const signoutLink = document.getElementById('signoutLink');
  const myBidsLink  = document.getElementById('myBidsLink');
  const bidCountEl  = document.getElementById('bidCount');

  // Clicking Sign In tries to open your auth modal if available; otherwise jump to home with #signin
  if (signinLink) {
    signinLink.addEventListener('click', (e) => {
      e.preventDefault();
      if (typeof window.openAuth === 'function') {
        window.openAuth();
      } else {
        window.location.href = '/#signin';
      }
    });
  }

  if (signoutLink) {
    signoutLink.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        if (window.sb?.auth) await sb.auth.signOut();
      } catch {}
      localStorage.removeItem('aim_token');
      location.reload();
    });
  }

  // Update menu state if sb is available
  async function updateAuthUI(){
    // Default menu state
    if (signinLink) signinLink.style.display = 'inline';
    if (signoutLink) signoutLink.style.display = 'none';
    if (myBidsLink)  myBidsLink.style.display  = 'none';
    if (bidCountEl)  bidCountEl.textContent = '0';

    if (!window.sb?.auth) return;

    try {
      const { data } = await sb.auth.getUser();
      const uid = data?.user?.id;
      if (!uid) return;

      if (signinLink) signinLink.style.display = 'none';
      if (signoutLink) signoutLink.style.display = 'inline';
      if (myBidsLink)  myBidsLink.style.display  = 'inline';

      // Count user's bids
      try {
        const { data: rows } = await sb.from('bids').select('id').eq('auth_user_id', uid);
        if (Array.isArray(rows) && bidCountEl) bidCountEl.textContent = rows.length || 0;
      } catch {}

      // Tooltip “coming soon”
      if (myBidsLink) {
        myBidsLink.title = 'Feature coming soon';
        myBidsLink.addEventListener('click', (e) => {
          e.preventDefault();
          alert('My Bids page is coming soon.');
        });
      }
    } catch {}
  }
  updateAuthUI();
})();