// netlify/functions/admin-bids.js
// Debug-enhanced: returns count + sample and echoes the REST URL used.

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

  // Admin bearer check
  const auth = event.headers.authorization || '';
  if (!auth.startsWith('Bearer ') || auth.slice(7) !== ADMIN_BEARER) {
    return { statusCode: 401, headers: cors(), body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const load = (event.queryStringParameters || {}).load || '';
  const debugFlag = (event.queryStringParameters || {}).debug === '1';

  // Build Supabase REST request
  const base = `${SUPABASE_URL}/rest/v1/bids`;
  const qs = new URLSearchParams({
    select: 'id,auth_user_id,load_number,amount,notes,created_at',
    order: 'created_at.desc'
  });
  const restUrl = load
    ? `${base}?${qs.toString()}&load_number=eq.${encodeURIComponent(load)}`
    : `${base}?${qs.toString()}`;

  try {
    const res = await fetch(restUrl, {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'count=exact'
      }
    });

    const text = await res.text();
    let rows = [];
    try { rows = text ? JSON.parse(text) : []; } catch(_) {}

    // Extract total count from Content-Range (e.g., "0-9/23")
    const cr = res.headers.get('content-range') || '';
    const total = Number((cr.split('/')[1] || '0').trim()) || rows.length;

    if (!res.ok) {
      return { statusCode: res.status, headers: cors(), body: JSON.stringify({
        error: text || 'Request failed',
        debug: debugFlag ? { status: res.status, contentRange: cr, restUrl, project: SUPABASE_URL } : undefined
      })};
    }

    const body = { bids: rows, count: total };
    if (debugFlag) {
      body.debug = {
        status: res.status,
        contentRange: cr || '(none)',
        restUrl,
        project: SUPABASE_URL,
        sample: rows[0] || null
      };
    }

    return { statusCode: 200, headers: cors(), body: JSON.stringify(body) };
  } catch (e) {
    return { statusCode: 500, headers: cors(), body: JSON.stringify({
      error: e.message,
      debug: debugFlag ? { restUrl, project: SUPABASE_URL } : undefined
    })};
  }
}