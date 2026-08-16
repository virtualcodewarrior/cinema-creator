// Generate src/lib/icons.js: render every icon referenced in the repo via its
// source react-icons set, extract exact path data, emit a single icons module.
// Reads /tmp/icon-pairs.txt produced by scripts/collect-icons.mjs (name<TAB>module).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const lines = fs.readFileSync('/tmp/icon-pairs.txt', 'utf8').split('\n').filter(Boolean);

// Load each icon set module once.
const sets = new Map();
function getSet(name) {
  if (!sets.has(name)) sets.set(name, require('react-icons/' + name));
  return sets.get(name);
}

const out = {};
const seen = new Set();
for (const line of lines) {
  const [icon, set] = line.split('\t');
  const mod = getSet(set);
  const Cmp = mod[icon];
  if (!Cmp) { console.error('MISSING', icon, 'in', set); continue; }
  if (seen.has(icon)) continue; // first set wins for duplicate names
  seen.add(icon);
  const svg = renderToStaticMarkup(React.createElement(Cmp, {}));
  const open = /<svg([^>]*)>/.exec(svg)[1];
  const inner = svg.slice(svg.indexOf('>') + 1, svg.lastIndexOf('</svg>'));
  const attr = (n) => { const m = new RegExp(n + '="([^"]*)"').exec(open); return m ? m[1] : null; };
  const vb = (attr('viewBox') || '0 0 24 24').split(/\s+/);
  const rec = { vb: vb[2] + ' ' + vb[3], inner };
  for (const a of ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin']) {
    const v = attr(a);
    if (v == null) continue;
    const key = a.split('-').map((w, i) => (i === 0 ? w : w[0].toUpperCase() + w.slice(1))).join('');
    rec[key] = v;
  }
  out[icon] = rec;
}
const body = Object.entries(out).map(([name, d]) => {
  const parts = ['vb: ' + JSON.stringify(d.vb), 'inner: ' + JSON.stringify(d.inner)];
  for (const k of ['fill', 'stroke', 'strokeWidth', 'strokeLinecap', 'strokeLinejoin']) if (d[k]) parts.push(k + ': ' + JSON.stringify(d[k]));
  return '  ' + name + ': { ' + parts.join(', ') + ' } ,';
}).join('\n');

const fn = [
  'export function iconSvg(name, opts) {',
  '  const o = opts || {};',
  '  const d = ICONS[name];',
  "  if (!d) return '';",
  '  const size = o.size || 16;',
  "  const cls = o.className || '';",
  "  const attrs = ['viewBox=\"' + d.vb + '\"', 'width=\"' + size + '\"', 'height=\"' + size + '\"',",
  "    'xmlns=\"http://www.w3.org/2000/svg\"'];",
  "  if (d.fill != null) attrs.push('fill=\"' + d.fill + '\"');",
  "  if (d.stroke != null) attrs.push('stroke=\"' + d.stroke + '\"');",
  "  if (d.strokeWidth != null) attrs.push('stroke-width=\"' + d.strokeWidth + '\"');",
  "  if (d.strokeLinecap != null) attrs.push('stroke-linecap=\"' + d.strokeLinecap + '\"');",
  "  if (d.strokeLinejoin != null) attrs.push('stroke-linejoin=\"' + d.strokeLinejoin + '\"');",
  "  if (cls) attrs.push('class=\"' + cls + '\"');",
  "  attrs.push('aria-hidden=\"true\" focusable=\"false\"');",
  "  return '<svg ' + attrs.join(' ') + '>' + d.inner + '</svg>';",
  '}',
].join('\n');

const file =
  '// Inline SVG icons - exact glyph data rendered from react-icons (multiple sets).\n' +
  '// Glyphs: Font Awesome / Feather / Ionicons / Material etc. free icon license terms apply\n' +
  '// (see react-icons). Regenerate: node scripts/collect-icons.mjs && node scripts/gen-icons.mjs\n\n' +
  'export const ICONS = {\n' + body + '\n};\n\n' + fn + '\n';

fs.writeFileSync(path.resolve('src/lib/icons.js'), file);
console.log('wrote src/lib/icons.js with', Object.keys(out).length, 'icons');
