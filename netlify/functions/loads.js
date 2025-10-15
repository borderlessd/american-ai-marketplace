// netlify/functions/loads.js
export async function handler() {
  try {
    const SHEET_JSON_URL = 'https://script.google.com/macros/s/AKfycbzXfnH8m0LxiQ1rkqf7AJt9qmp1sok722xYMmwdS96RKwgWBOt2xLrBc-1FPTnIbHP91A/exec';

    const r = await fetch(SHEET_JSON_URL);
    const text = await r.text();

    if (!r.ok) {
      return {
        statusCode: r.status,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Upstream error', status: r.status, body: text })
      };
    }

    let data;
    try { data = JSON.parse(text); }
    catch { return { statusCode: 502, body: JSON.stringify({ error: 'Invalid JSON from sheet' }) }; }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=60' // 60-second edge cache
      },
      body: JSON.stringify(data)
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: String(e) }) };
  }
}
