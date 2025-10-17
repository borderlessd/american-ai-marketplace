const SUPABASE_URL = 'https://xntxctjjtfjeznircuas.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhudHhjdGpqdGZqZXpuaXJjdWFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2ODkxNTAsImV4cCI6MjA3NjI2NTE1MH0.KeP_BvUDX1nde1iw95sv0ETtcseVEjDuR7gcYHPmsVk';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.getElementById('regForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = document.getElementById('regError'); err.textContent = '';

  const email = document.getElementById('regEmail').value.trim();
  const pass  = document.getElementById('regPass').value;

  const profile = {
    company_name: document.getElementById('regCompany').value.trim() || null,
    contact_name: document.getElementById('regName').value.trim() || null,
    phone:        document.getElementById('regPhone').value.trim() || null,
    mc_number:    document.getElementById('regMC').value.trim() || null
  };

  try{
    const { data, error } = await sb.auth.signUp({ email, password: pass });
    if (error) throw error;
    const uid = data.user?.id;
    if (uid) {
      await sb.from('carriers').insert({ auth_user_id: uid, ...profile });
    }
    err.style.color = 'green';
    err.textContent = 'Check your email to confirm your account, then sign in from the Loads page.';
  }catch(ex){
    err.style.color = '';
    err.textContent = ex.message || 'Registration failed.';
  }
});
