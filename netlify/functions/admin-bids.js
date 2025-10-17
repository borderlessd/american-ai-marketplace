// netlify/functions/admin-bids.js
// Uses built-in fetch; no npm packages required.

const SUPABASE_URL = process.env.SUPABASE_URL;            // e.g. https://xntxctjjtfjeznircuas.supabase.co
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE;   // service_role key (secret)
const ADMIN_BEARER = process.env.ADMIN_BEARER;            // your own secret string

function cors(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    ...extra
  };
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors(), body: '' };
  }

  // Admin bearer check
  const auth = event.headers.authorization || '';
  if (!auth.startsWith('Bearer ') || auth.slice(7) !== ADMIN_BEARER) {
    return { statusCode: 401, headers: cors(), body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const loadFilter = (event.queryStringParameters || {}).load || '';

  // Build Supabase REST request
  const base = `${SUPABASE_URL}/rest/v1/bids`;
  const qs = new URLSearchParams({
    select: 'id,auth_user_id,load_number,amount,notes,created_at',
    order: 'created_at.desc'
  });
  const url = loadFilter
    ? `${base}?${qs.toString()}&load_number=eq.${encodeURIComponent(loadFilter)}`
    : `${base}?${qs.toString()}`;

  try {
    const res = await fetch(url, {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    if (!res.ok) {
      const txt = await res.text();
      return { statusCode: res.status, headers: cors(), body: JSON.stringify({ error: txt }) };
    }
    const data = await res.json();
    return { statusCode: 200, headers: cors(), body: JSON.stringify({ bids: data }) };
  } catch (e) {
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: e.message }) };
  }
}