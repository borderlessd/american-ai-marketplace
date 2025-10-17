// netlify/functions/admin-login.js
const ADMIN_USER   = process.env.ADMIN_USER || '';
const ADMIN_PASS   = process.env.ADMIN_PASS || '';
const ADMIN_BEARER = process.env.ADMIN_BEARER || '';

const cors = (extra = {}) => ({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  ...extra
});

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS')
    return { statusCode: 204, headers: cors(), body: '' };

  if (event.httpMethod !== 'POST')
    return { statusCode: 405, headers: cors(), body: 'Only POST' };

  try {
    const { username, password } = JSON.parse(event.body || '{}');
    if (!username || !password) {
      return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: 'Missing credentials' }) };
    }
    if (username !== ADMIN_USER || password !== ADMIN_PASS) {
      return { statusCode: 401, headers: cors(), body: JSON.stringify({ error: 'Invalid credentials' }) };
    }
    // Return the bearer the admin UI should use
    return { statusCode: 200, headers: cors(), body: JSON.stringify({ token: ADMIN_BEARER }) };
  } catch (e) {
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: e.message }) };
  }
}
