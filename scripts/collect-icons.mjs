// Collect every react-icons import in the repo -> /tmp/icon-pairs.txt (name<TAB>module)
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DIRS = [
  'packages', 'app', 'components', 'src',
];
const files = [];
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name === 'build' || e.name === 'out' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(jsx?|tsx?)$/.test(e.name)) files.push(p);
  }
}
for (const d of DIRS) { const p = path.join(ROOT, d); if (fs.existsSync(p)) walk(p); }

const pairRe = /import\s*\{([^}]+)\}\s*from\s*["']react-icons\/([a-z0-9]+)["']/g;
const map = new Map(); // name -> set of modules
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  let m;
  while ((m = pairRe.exec(src))) {
    const names = m[1].split(',').map(s => s.trim()).filter(Boolean);
    for (const n of names) if (map.has(n)) map.get(n).add(m[2]); else map.set(n, new Set([m[2]]));
  }
}
const lines = [];
const clashes = [];
for (const [name, mods] of [...map.entries()].sort()) {
  if (mods.size > 1) clashes.push(`${name} <- ${[...mods].join(',')}`);
  for (const mod of mods) lines.push(name + '\t' + mod);
}
fs.writeFileSync('/tmp/icon-pairs.txt', lines.join('\n') + '\n');
console.log('pairs:', lines.length, 'unique names:', map.size);
if (clashes.length) { console.log('CLASHES (same name, multiple sets):'); clashes.forEach(c => console.log(' ', c)); }
