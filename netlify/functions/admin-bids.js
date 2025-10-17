// netlify/functions/admin-bids.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE;
const ADMIN_BEARER = process.env.ADMIN_BEARER;

const sbAdmin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const cors = (h={}) => ({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  ...h
});

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors(), body: '' };
  }

  // Simple bearer check
  const auth = event.headers.authorization || '';
  if (!auth.startsWith('Bearer ') || auth.slice(7) !== ADMIN_BEARER) {
    return { statusCode: 401, headers: cors(), body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  try {
    // Optional filter: ?load=AAS-10001
    const load = (event.queryStringParameters || {}).load || null;

    let q = sbAdmin
      .from('bids')
      .select('id, auth_user_id, load_number, amount, notes, created_at')
      .order('created_at', { ascending: false });

    if (load) q = q.eq('load_number', load);

    const { data, error } = await q;
    if (error) throw error;

    return { statusCode: 200, headers: cors(), body: JSON.stringify({ bids: data }) };
  } catch (e) {
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: e.message }) };
  }
}