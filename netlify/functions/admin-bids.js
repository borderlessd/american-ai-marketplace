// netlify/functions/admin-bids.js
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE;
const ADMIN_BEARER = process.env.ADMIN_BEARER;

const cors = (extra = {}) => ({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  ...extra
});

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors(), body: '' };

  const auth = event.headers.authorization || '';
  if (!auth.startsWith('Bearer ') || auth.slice(7) !== ADMIN_BEARER) {
    return { statusCode: 401, headers: cors(), body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const q = event.queryStringParameters || {};
  const load = (q.load || '').trim();

  const url = new URL(`${SUPABASE_URL}/rest/v1/bids`);
  url.searchParams.set('select', 'id,auth_user_id,load_number,amount,notes,created_at');
  url.searchParams.set('order', 'created_at.desc');
  if (load) url.searchParams.set('load_number', `eq.${load}`);

  try {
    const res = await fetch(url.toString(), {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        Prefer: 'count=exact',
        'Accept-Profile': 'public',
        'Content-Profile': 'public',
        Range: '0-999'
      }
    });
    const text = await res.text();
    let rows = []; try { rows = text ? JSON.parse(text) : []; } catch {}
    const cr = res.headers.get('content-range') || '';
    const total = Number((cr.split('/')[1] || '').trim() || rows.length);
    if (!res.ok) return { statusCode: res.status, headers: cors(), body: JSON.stringify({ error: text || 'Request failed' }) };
    return { statusCode: 200, headers: cors(), body: JSON.stringify({ bids: rows, count: total }) };
  } catch (e) {
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: e.message }) };
  }
}