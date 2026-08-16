// Usage: node cdp-console.mjs [url] [waitMs]
// Captures console messages + page errors from the first page target.
const targets = await (await fetch('http://127.0.0.1:9222/json')).json();
const page = targets.find(t => t.type === 'page');
if (!page) { console.error('no page target'); process.exit(1); }
const url = process.argv[2];
const waitMs = Number(process.argv[3] || 8000);

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
function send(method, params = {}) {
  return new Promise(res => {
    const mid = ++id;
    pending.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}
const lines = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return; }
  if (m.method === 'Runtime.consoleAPICalled') {
    const text = (m.params.args || []).map(a => a.value ?? a.description ?? a.unserializableValue ?? '').join(' ');
    lines.push(`[console.${m.params.type}] ${String(text).slice(0, 500)}`);
  } else if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    lines.push(`[EXCEPTION] ${d.exception?.description || d.text || 'unknown'}`.slice(0, 1200));
  } else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
    lines.push(`[log.error] ${m.params.entry.text}`.slice(0, 500));
  }
};
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
if (url) await send('Page.navigate', { url });
await new Promise(r => setTimeout(r, waitMs));
console.log(lines.length ? lines.join('\n') : '(no console output)');
ws.close();
process.exit(0);
