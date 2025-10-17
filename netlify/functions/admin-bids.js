// netlify/functions/admin-bids.js
// Uses built-in fetch (no imports). Adds Prefer: count=exact for debugging.

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
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors(), body: '' };
  }

  const auth = event.headers.authorization || '';
  if (!auth.startsWith('Bearer ') || auth.slice(7) !== ADMIN_BEARER) {
    return { statusCode: 401, headers: cors(), body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const load = (event.queryStringParameters || {}).load || '';

  const base = `${SUPABASE_URL}/rest/v1/bids`;
  const qs = new URLSearchParams({
    select: 'id,auth_user_id,load_number,amount,notes,created_at',
    order: 'created_at.desc'
  });
  const url = load
    ? `${base}?${qs.toString()}&load_number=eq.${encodeURIComponent(load)}`
    : `${base}?${qs.toString()}`;

  try {
    const res = await fetch(url, {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'count=exact'
      }
    });

    const text = await res.text();
    let data = [];
    try { data = text ? JSON.parse(text) : []; } catch(_) {}

    // count comes in Content-Range: 0-9/123 (the total after the /)
    const contentRange = res.headers.get('content-range') || '';
    const total = Number((contentRange.split('/')[1] || '').trim() || 0);

    if (!res.ok) {
      return { statusCode: res.status, headers: cors(), body: JSON.stringify({ error: text || 'Request failed' }) };
    }

    return { statusCode: 200, headers: cors(), body: JSON.stringify({ bids: data, count: total }) };
  } catch (e) {
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: e.message }) };
  }
}