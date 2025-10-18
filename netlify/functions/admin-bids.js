// netlify/functions/admin-bids.js
// Returns bids enriched with company_name by looking up either `profiles(id, company_name)`
// or `carriers(auth_user_id, company_name)` — whichever exists.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE;
const ADMIN_BEARER = process.env.ADMIN_BEARER;

const cors = (extra = {}) => ({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  ...extra
});

async function restGet(path, params = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Prefer: 'count=exact',
      'Accept-Profile': 'public',
      'Content-Profile': 'public',
      Range: '0-999',
    },
  });
  const text = await res.text();
  let rows = [];
  try { rows = text ? JSON.parse(text) : []; } catch {}
  const cr = res.headers.get('content-range') || '';
  const total = Number((cr.split('/')[1] || '').trim() || rows.length);
  return { ok: res.ok, status: res.status, rows, total, errorText: res.ok ? null : text };
}

async function tryFetchCompanies(userIds) {
  if (!userIds.length) return { map: new Map(), source: null };

  // Build IN list like in.("id1","id2")
  const inList = `(${userIds.map(id => `"${id}"`).join(',')})`;

  // Try PROFILES first: id IN (...)
  let r = await restGet('profiles', { select: 'id,company_name', id: `in.${inList}` });
  if (r.ok) {
    const m = new Map(r.rows.map(row => [row.id, row.company_name || '']));
    return { map: m, source: 'profiles.id' };
  }

  // If profiles failed (404), try CARRIERS: auth_user_id IN (...)
  r = await restGet('carriers', { select: 'auth_user_id,company_name', auth_user_id: `in.${inList}` });
  if (r.ok) {
    const m = new Map(r.rows.map(row => [row.auth_user_id, row.company_name || '']));
    return { map: m, source: 'carriers.auth_user_id' };
  }

  // Neither table available; return empty map
  return { map: new Map(), source: null };
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors(), body: '' };

  // Admin bearer check
  const auth = event.headers.authorization || '';
  if (!auth.startsWith('Bearer ') || auth.slice(7) !== ADMIN_BEARER) {
    return { statusCode: 401, headers: cors(), body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const q = event.queryStringParameters || {};
  const load = (q.load || '').trim();

  // 1) Fetch bids
  const params = new URLSearchParams({
    select: 'id,auth_user_id,load_number,amount,notes,created_at',
    order: 'created_at.desc'
  });
  if (load) params.append('load_number', `eq.${load}`);

  const bidsRes = await restGet(`bids?${params.toString()}`);
  if (!bidsRes.ok) {
    return { statusCode: bidsRes.status, headers: cors(), body: JSON.stringify({ error: bidsRes.errorText || 'Request failed' }) };
  }
  const bids = bidsRes.rows || [];

  // 2) Enrich with company_name
  const userIds = [...new Set(bids.map(b => b.auth_user_id).filter(Boolean))];
  const { map: companyMap } = await tryFetchCompanies(userIds);

  const enriched = bids.map(b => ({
    ...b,
    company_name: companyMap.get(b.auth_user_id) || ''  // empty if not found
  }));

  return { statusCode: 200, headers: cors(), body: JSON.stringify({ bids: enriched, count: bidsRes.total }) };
}