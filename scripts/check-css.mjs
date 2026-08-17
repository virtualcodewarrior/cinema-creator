// Fail if any class used in a template has no rule in the committed CSS
// artifacts (public/globals.css + public/wc/*.css). The CSS is precompiled
// (no build step), so this is the guard against silently-losing styles:
// add a class to a template -> run `npm run check:css` -> add the CSS by hand.
// Extracts tokens only from `class=` attribute positions (lit static
// class="..." plus quoted fragments inside dynamic class="${...}").
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

// Bare (single-token) class names that are real utilities; other single
// tokens (wordy state names) are ignored to avoid false positives.
const BARE = new Set([
  'flex', 'grid', 'block', 'hidden', 'inline', 'relative', 'absolute', 'fixed',
  'sticky', 'static', 'inline-flex', 'inline-grid', 'inline-block', 'table',
  'overflow', 'overflow-x', 'overflow-y', 'pointer', 'grow', 'shrink', 'basis',
]);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(js|jsx|ts|tsx|html)$/.test(e.name)) out.push(p);
  }
  return out;
}

// Class names as Tailwind emits them: variants (dark:x, group-hover/att:x,
// data-[selected=true]:x) and arbitrary values (shadow-[0_0_12px_rgba(...)],
// text-[#22d3ee]) are single tokens — ':' '/' '=' '#' '(' ')' ',' '.' are
// valid token chars, so the only split boundaries are whitespace/quotes/etc.
function extractTokens(file) {
  const src = fs.readFileSync(file, 'utf8');
  const tokens = new Set();
  const addStr = (s) => {
    for (const t of s.split(/[\s"'`${};|]+/)) {
      if (!t || !/^!?[a-zA-Z0-9][a-zA-Z0-9_%:/.\-!=#\[\]()]*$/.test(t)) continue;
      if (!t.includes('-') && !BARE.has(t)) continue;
      tokens.add(t);
    }
  };
  for (const re of [/class\s*=\s*"([^"]*)"/g, /class\s*=\s*'([^']*)'/g, /class\s*=\s*`([^`]*)`/g]) {
    for (const m of src.matchAll(re)) {
      const inner = m[1];
      if (inner.includes('${')) {
        // dynamic: only accept quoted fragments that look like class strings
        for (const q of inner.matchAll(/(?<=[\s?(?:,])['"`]([^'"`$]+)['"`]/g)) addStr(q[1]);
      } else addStr(inner);
    }
  }
  return tokens;
}

// Collect class names defined in a CSS text. Escape-aware: in emitted CSS a
// variant ':' inside a class name is escaped (dark\:text-x) while a bare ':'
// delimits a pseudo-class/element (:hover, ::-webkit-scrollbar) — so the
// name runs through escape pairs and stops at any bare ':', '(', etc.
function definedClasses(css) {
  const set = new Set();
  for (let i = 0; i < css.length; i++) {
    if (css[i] !== '.' || !/[a-zA-Z_\\!]/.test(css[i + 1] ?? '')) continue;
    i++;
    let tok = '';
    while (i < css.length) {
      const c = css[i];
      if (c === '\\') {
        // CSS escape: 1-6 hex digits (leading-digit classes, e.g. .2xl -> .\32xl),
        // an optional space terminating the hex, or a single non-hex char (\: etc.)
        const hm = /^[0-9a-fA-F]{1,6}/.exec(css.slice(i + 1));
        if (hm) {
          tok += String.fromCharCode(parseInt(hm[0], 16));
          i += 1 + hm[0].length;
          if (css[i] === ' ') i++;
          continue;
        }
        tok += css[i + 1] ?? ''; i += 2; continue;
      }
      if (/[a-zA-Z0-9_%!/-]/.test(c)) { tok += c; i++; continue; }
      break;
    }
    if (tok) set.add(tok);
  }
  return set;
}

// Classes an element styles in its own lit css`...` block count as defined.
function litCssClasses(file) {
  const src = fs.readFileSync(file, 'utf8');
  const set = new Set();
  for (const m of src.matchAll(/css`([\s\S]*?)`/g)) for (const c of definedClasses(m[1])) set.add(c);
  return set;
}

// Class strings that were never styled in the original app either and are
// intentionally left unstyled (parity: the React build's Tailwind v3 ran
// over src/ + packages/studio only — the vendored packages' own theme tokens
// were never in the root config, no tailwindcss-animate/typography plugins
// existed, and v3 has no dynamic numerics — so none of these ever produced
// CSS in the original build).
const ALLOWLIST = new Set([
  // 1. Package theme tokens (design/agents standalone tailwind configs only):
  'bg-bg-card', 'bg-bg-card-hover', 'bg-bg-card/50', 'bg-bg-card/90',
  'bg-bg-page', 'bg-bg-page/20', 'bg-bg-page/30', 'bg-bg-page/50',
  'hover:bg-bg-card', 'hover:bg-bg-card-hover', 'hover:bg-bg-page',
  'bg-divider', 'border-divider', 'dark:border-divider', 'dark:disabled:bg-divider',
  'from-divider', 'bg-border-main', 'border-border-main',
  'text-primary-text', 'dark:text-primary-text', 'hover:text-primary-text',
  'dark:group-hover:text-primary-text', 'dark:hover:text-primary-text',
  'bg-primary-text', 'text-secondary-text', 'dark:text-secondary-text',
  'dark:disabled:text-secondary-text',
  'bg-[var(--accent)]/10', 'bg-[var(--accent)]/5', 'bg-[var(--component-bg)]/50',
  'dark:bg-primary-bg', 'dark:bg-primary-bg/50', 'dark:bg-primary-bg/95',
  'dark:hover:bg-primary-bg', 'dark:bg-secondary-bg', 'dark:hover:bg-secondary-bg',
  'dark:group-hover:bg-secondary-bg', 'dark:ring-primary-bg', 'dark:stroke-divider',
  // 2. Values outside the v3 default theme (v4-dynamic / invented shades):
  'h-18', 'h-22', 'w-18', 'left-4.5', 'rotate-185', 'rotate-270', 'shadow-4xl',
  'hover:scale-80', 'bg-zinc-850', 'hover:bg-zinc-850', 'bg-zinc-905',
  'hover:bg-zinc-650', 'text-zinc-650', 'border-zinc-705',
  // 3. Plugin classes that no config ever installed (tailwindcss-animate, typography):
  'animate-fade-in-down', 'animate-in', 'animate-shake', 'fade-in',
  'slide-in-from-bottom-2', 'slide-in-from-top-2', 'md:slide-in-from-left-2',
  'zoom-in', 'zoom-in-95',
  'prose-invert', 'dark:prose-invert', 'prose-sm',
  'prose-p:leading-relaxed', 'prose-p:my-2', 'prose-pre:bg-black/30', 'prose-pre:bg-black/40',
  // 4. Port marker/state classes that are JS hooks, not styles:
  'canvas-container', 'ctx-menu', 'design-agent-studio', 'no-scrollbar',
  'pointer', 'progress-bar', 'regional-edit', 'group/user-att',
]);

const ARTIFACTS = ['public/globals.css', 'public/wc/shell.css', 'public/wc/studio.css', 'public/wc/agents.css', 'public/wc/design.css'];
const defined = new Set();
for (const f of ARTIFACTS) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) {
    console.error(`check:css: missing artifact ${f}`);
    process.exit(1);
  }
  for (const c of definedClasses(fs.readFileSync(p, 'utf8'))) defined.add(c);
}

const used = new Map(); // token -> [files]
for (const file of [...walk(path.join(ROOT, 'src')), path.join(ROOT, 'index.html')]) {
  for (const t of extractTokens(file)) {
    if (!used.has(t)) used.set(t, []);
    used.get(t).push(path.relative(ROOT, file));
  }
  for (const c of litCssClasses(file)) defined.add(c); // element-local lit styles
}

const missing = [...used.entries()]
  .filter(([t]) => !defined.has(t) && !ALLOWLIST.has(t))
  .sort(([a], [b]) => a.localeCompare(b));

if (missing.length) {
  console.error(`check:css: ${missing.length} class(es) used in templates but missing from committed CSS:`);
  for (const [t, files] of missing) console.error(`  ${t}  (${files.join(', ')})`);
  console.error('\nAdd the missing rules to public/globals.css or the matching public/wc/<sheet>.css');
  console.error('(or justify an entry in ALLOWLIST above if it is intentionally unstyled).');
  process.exit(1);
}
console.log(`check:css: OK — ${used.size} classes in use, all covered (artifacts, lit css, or allow-listed)`);
