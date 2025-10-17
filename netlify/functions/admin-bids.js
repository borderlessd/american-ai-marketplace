// netlify/functions/admin-bids.js
// No imports. Uses built-in fetch. Auto-detects the bids table and returns meta for debugging.

const SUPABASE_URL = process.env.SUPABASE_URL;          // e.g. https://xntxctjjtfjeznircuas.supabase.co
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE; // service_role (secret!)
const ADMIN_BEARER = process.env.ADMIN_BEARER;

const cors = (extra = {}) => ({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  ...extra
});

async function countTable(table) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=id&limit=1`;
  const res = await fetch(url, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Prefer: 'count=exact',
      'Accept-Profile': 'public',
      'Content-Profile': 'public',
      Range: '0-0'
    }
  });
  const contentRange = res.headers.get('content-range') || '';
  const total = Number((contentRange.split('/')[1] || '').trim() || 0);
  return { ok: res.ok, status: res.status, total, url };
}

async function fetchRows(table, load) {
  const params = new URLSearchParams({ select: '*', order: 'created_at.desc' });
  if (load) params.append('load_number', `eq.${load}`);
  const restUrl = `${SUPABASE_URL}/rest/v1/${table}?${params.toString()}`;

  const res = await fetch(restUrl, {
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
  let rows = [];
  try { rows = text ? JSON.parse(text) : []; } catch (_) {}

  const contentRange = res.headers.get('content-range') || '';
  const total = Number((contentRange.split('/')[1] || '').trim() || rows.length);

  return { ok: res.ok, status: res.status, rows, total, restUrl, contentRange, errorText: res.ok ? null : text };
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors(), body: '' };

  const auth = event.headers.authorization || '';
  if (!auth.startsWith('Bearer ') || auth.slice(7) !== ADMIN_BEARER) {
    return { statusCode: 401, headers: cors(), body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const q = event.queryStringParameters || {};
  const requestedTable = (q.table || '').trim(); // optional override
  const load = (q.load || '').trim();

  // Order of common table names we’ll try if none specified:
  const candidates = requestedTable
    ? [requestedTable]
    : ['bids', 'carrier_bids', 'bid', 'bids_test'];

  const tried = [];
  let chosen = null;
  let result = null;

  try {
    // First pass: count each candidate to find one with rows
    for (const name of candidates) {
      const c = await countTable(name);
      tried.push({ table: name, ok: c.ok, status: c.status, total: c.total, url: c.url });
      // Prefer the first table with rows; otherwise remember the first that returned ok
      if (!chosen && c.ok) {
        if (c.total > 0) { chosen = name; break; }
        if (!chosen) chosen = name; // fallback if all 0 later
      }
    }

    if (!chosen) {
      // Nothing ok → use 'bids' and surface the error from fetchRows
      chosen = requestedTable || 'bids';
    }

    // Fetch actual rows from the chosen table
    result = await fetchRows(chosen, load);

    if (!result.ok) {
      return {
        statusCode: result.status,
        headers: cors(),
        body: JSON.stringify({
          error: result.errorText || 'Request failed',
          meta: {
            project: SUPABASE_URL,
            chosenTable: chosen,
            loadFilter: load || null,
            contentRange: result.contentRange || '(none)',
            triedTables: tried
          }
        })
      };
    }

    return {
      statusCode: 200,
      headers: cors(),
      body: JSON.stringify({
        bids: result.rows,
        count: result.total,
        meta: {
          project: SUPABASE_URL,
          chosenTable: chosen,
          loadFilter: load || null,
          contentRange: result.contentRange || '(none)',
          triedTables: tried
        }
      })
    };
  } catch (e) {
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: e.message }) };
  }
}