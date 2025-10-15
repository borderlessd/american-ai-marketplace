import fs from 'fs/promises';
const url = 'https://script.google.com/macros/s/AKfycbzXfnH8m0LxiQ1rkqf7AJt9qmp1sok722xYMmwdS96RKwgWBOt2xLrBc-1FPTnIbHP91A/exec?mode=compat';
const res = await fetch(url); const data = await res.json();
await fs.writeFile('public/assets/loads.json', JSON.stringify(data, null, 2));
console.log('Wrote public/assets/loads.json with compat schema');
