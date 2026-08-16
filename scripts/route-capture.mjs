// Usage: node route-capture.mjs <out.json>
// Navigates each route, waits, captures DOM probes + load-time console exceptions.
const OUT = process.argv[2];
const BASE = 'http://localhost:5173';
const ROUTES = [
  '/',
  '/studio/video',
  '/studio/cinema',
  '/studio/layers',
  '/agents/create',
  '/studio/workflow',
  '/agents/agent-1',
];
const PROBE = `JSON.stringify({
  title: document.title,
  rootChildren: document.getElementById('root')?.childElementCount ?? -1,
  text: document.body.innerText.slice(0, 350),
  buttons: [...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(Boolean).slice(0, 45),
  inputs: [...document.querySelectorAll('input,textarea,select')].length,
  videos: document.querySelectorAll('video').length,
  canvases: document.querySelectorAll('canvas').length
})`;

const targets = await (await fetch('http://127.0.0.1:9222/json')).json();
const page = targets.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise(res => {
  const mid = ++id;
  pending.set(mid, res);
  ws.send(JSON.stringify({ id: mid, method, params }));
});
const errors = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    errors.push(String(d.exception?.description || d.text || 'unknown').slice(0, 400).replace(/\s+/g, ' '));
  } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    const text = (m.params.args || []).map(a => a.value ?? a.description ?? '').join(' ');
    errors.push('console.error: ' + String(text).slice(0, 300));
  }
};
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
await send('Runtime.enable');
await send('Page.enable');

const out = {};
for (const route of ROUTES) {
  errors.length = 0;
  await send('Page.navigate', { url: BASE + route });
  await new Promise(r => setTimeout(r, 4500));
  const res = await send('Runtime.evaluate', { expression: PROBE, returnByValue: true });
  out[route] = {
    dom: JSON.parse(res?.result?.value ?? '{}'),
    errors: [...new Set(errors)],
  };
  await new Promise(r => setTimeout(r, 500));
}
ws.close();
const fs = await import('node:fs');
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log('wrote', OUT);
for (const [route, data] of Object.entries(out)) {
  console.log(route, '| children:', data.dom.rootChildren, '| errors:', data.errors.length);
}
