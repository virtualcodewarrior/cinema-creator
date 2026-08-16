// Compare two route-capture JSON files (before/after a surface migration).
// Usage: node scripts/parity-diff.mjs <before.json> <after.json> [expected-diff:route.key ...]
// Exits 1 on unexpected diffs.
import fs from 'node:fs';

const [,, beforePath, afterPath, ...expected] = process.argv;
const b = JSON.parse(fs.readFileSync(beforePath, 'utf8'));
const a = JSON.parse(fs.readFileSync(afterPath, 'utf8'));

// vite dep hash in error stacks changes per build — normalize
const normErr = (s) => String(s).replace(/v=[a-f0-9]{8}/g, 'v=X');
// textContent whitespace is formatting, not behavior
const normText = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

const expectedSet = new Set(expected); // e.g. "/.shadowRoots", "/agents/create.rootChildren"
let failures = 0;

const routes = new Set([...Object.keys(b), ...Object.keys(a)]);
for (const route of routes) {
  const bd = b[route]?.dom ?? {};
  const ad = a[route]?.dom ?? {};
  const be = (b[route]?.errors ?? []).map(normErr);
  const ae = (a[route]?.errors ?? []).map(normErr);

  const normVal = (key, v) => {
    if (key === 'text') return String(v ?? '').replace(/\s+/g, ''); // whitespace-only template nodes are invisible between block elements
    if (key === 'buttons') return JSON.stringify((v ?? []).map(normText));
    return JSON.stringify(v);
  };

  for (const key of new Set([...Object.keys(bd), ...Object.keys(ad)])) {
    const bV = normVal(key, bd[key]);
    const aV = normVal(key, ad[key]);
    const tag = `${route}.${key}`;
    if (bV !== aV) {
      if (expectedSet.has(tag)) {
        console.log(`EXPECTED ${tag}`);
      } else {
        failures++;
        console.log(`UNEXPECTED ${tag}`);
        console.log(`  before: ${String(bV).slice(0, 160)}`);
        console.log(`  after:  ${String(aV).slice(0, 160)}`);
      }
    }
  }
  if (JSON.stringify(be) !== JSON.stringify(ae)) {
    const tag = `${route}.errors`;
    if (expectedSet.has(tag)) {
      console.log(`EXPECTED ${tag}`);
    } else {
      failures++;
      console.log(`UNEXPECTED ${tag}`);
      console.log(`  before: ${JSON.stringify(be).slice(0, 200)}`);
      console.log(`  after:  ${JSON.stringify(ae).slice(0, 200)}`);
    }
  }
}
console.log(failures === 0 ? 'PARITY OK' : `PARITY FAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
