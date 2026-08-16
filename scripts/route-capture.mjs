// Usage: node route-capture.mjs <out.json>
// Navigates each route, waits, captures DOM probes + load-time console exceptions.
const OUT = process.argv[2];
// Optional: only capture the routes listed after the out file
// (node route-capture.mjs out.json /studio/apps /studio/audio). All if omitted.
const ROUTE_FILTER = process.argv.slice(3);
const BASE = 'http://localhost:5173';
const STUDIO_NAMES = [
  'image', 'video', 'cinema', 'lipsync', 'workflow', 'agents', 'apps',
  'audio', 'marketing', 'recast', 'vibemotion', 'clipping', 'layers',
  'design', 'influencer',
];
const ROUTES = [
  '/',
  ...STUDIO_NAMES.map((n) => `/studio/${n}`),
  '/agents/create',
  '/agents/agent-1',
  '/agents/edit/agent-1',
];
// Shadow-piercing probe: querySelector/innerText on body do not cross shadow
// boundaries, so walk shadow roots explicitly. String.raw: the probe contains
// regex backslashes (\s) that a plain template literal would mangle.
const PROBE = String.raw`(() => {
  function deep(sel, root = document, acc = []) {
    // Walk every element (not just matches) so shadow roots of non-matching
    // containers are still traversed.
    for (const el of root.querySelectorAll('*')) {
      if (el.matches(sel)) acc.push(el);
      if (el.shadowRoot) deep(sel, el.shadowRoot, acc);
    }
    return acc;
  }
  function text(root, acc = '') {
    // Snapshot childNodes: iterating a live NodeList while the DOM mutates
    // (e.g. an HMR reload mid-probe) walks a torn tree and garbles the text.
    // Skip style/script so React <style> blocks (styled-jsx, inline CSS
    // strings) don't pollute the user-visible text metric.
    // Shadow-owning elements: collect BOTH the shadow tree and the light-DOM
    // children — with <slot> composition the light children (e.g. a
    // <prompt-composer>'s slotted content) are what actually renders.
    for (const c of Array.from(root.childNodes)) {
      if (c.nodeType === 3) acc += c.textContent;
      else if (c.nodeType === 1) {
        const tag = c.tagName;
        if (tag === 'STYLE' || tag === 'SCRIPT') continue;
        if (c.shadowRoot) acc += text(c.shadowRoot);
        acc += text(c);
      }
    }
    return acc;
  }
  // textContent + any slotted light-DOM children (web-component composition):
  // a <button><slot></slot></button> in a shadow root has empty textContent
  // but its label lives in the slotted nodes.
  function buttonText(b) {
    let t = b.textContent;
    for (const slotEl of b.querySelectorAll('slot')) {
      t += slotEl.assignedNodes().map((n) => n.textContent || '').join('');
    }
    return t.trim();
  }
  const buttons = deep('button').map(buttonText).filter(Boolean).slice(0, 45);
  const allEls = deep('*');
  return JSON.stringify({
    title: document.title,
    rootChildren: document.getElementById('root')?.childElementCount ?? -1,
    shadowRoots: allEls.reduce((n, el) => n + (el.shadowRoot ? 1 : 0), 0),
    text: text(document.body).replace(/\s+/g, ' ').trim().slice(0, 8000),
    buttons,
    inputs: deep('input,textarea,select').length,
    videos: deep('video').length,
    canvases: deep('canvas').length,
  });
})()`;

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
const captureRoutes = ROUTE_FILTER.length ? ROUTE_FILTER.filter((r) => ROUTES.includes(r)) : ROUTES;
for (const route of captureRoutes) {
  errors.length = 0;
  await send('Page.navigate', { url: BASE + route });
  await new Promise(r => setTimeout(r, 2000));
  // Hard reload: discards any in-flight HMR-patched DOM and guarantees a
  // clean document for this route.
  await send('Page.reload');
  // Wait until the DOM settles: lazy imports can keep mutating the tree for
  // a while after load. Two identical probes = stable.
  let last = null;
  let stableFor = 0;
  let dom = {};
  for (let attempt = 0; attempt < 20; attempt++) {
    if (attempt === 0) await new Promise(r => setTimeout(r, 3000));
    else await new Promise(r => setTimeout(r, 1000));
    const res = await send('Runtime.evaluate', { expression: PROBE, returnByValue: true });
    const now = res?.result?.value ?? '{}';
    if (now === last) {
      stableFor++;
      dom = JSON.parse(now);
      if (stableFor >= 1) break;
    } else {
      stableFor = 0;
      last = now;
      dom = JSON.parse(now);
    }
  }
  out[route] = { dom, errors: [...new Set(errors)] };
  await new Promise(r => setTimeout(r, 300));
}
ws.close();
const fs = await import('node:fs');
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log('wrote', OUT);
for (const [route, data] of Object.entries(out)) {
  console.log(route, '| children:', data.dom.rootChildren, '| errors:', data.errors.length);
}
