// Generate per-package Tailwind utility sheets for Shadow DOM web components.
// Tailwind (v3, root config theme) compiles the classes used by each package's
// source into public/wc/<key>.css at build/dev time. At runtime each shadow
// root adopts its sheet via adoptedStyleSheets (see src/lib/wc-base.js).
//
// Sheet content = tailwind directives + the package's own component CSS
// (.skeleton, .premium-*, .custom-scrollbar, ...) + shared globals.css
// (reset, scrollbars, glass, keyframes) which shadow roots can no longer
// inherit from the light DOM.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'public', 'wc');
fs.mkdirSync(OUT_DIR, { recursive: true });

function stripDirectives(cssText) {
  return cssText
    .replace(/@import\s+url\([^)]*\);/g, '')
    .replace(/@import\s+"[^"]*";/g, '')
    .replace(/@tailwind\s+\w+;/g, '');
}

function stripThemeBlocks(text) {
  // Drop Tailwind v4 `@theme { ... }` blocks (not understood by the v3 CLI).
  const parts = [];
  let pos = 0;
  let idx;
  while ((idx = text.indexOf('@theme', pos)) !== -1) {
    const open = text.indexOf('{', idx);
    if (open === -1) break;
    let depth = 0;
    let end = text.length;
    for (let j = open; j < text.length; j++) {
      if (text[j] === '{') depth++;
      else if (text[j] === '}') {
        depth--;
        if (!depth) {
          end = j + 1;
          break;
        }
      }
    }
    parts.push(text.slice(pos, idx));
    pos = end;
  }
  parts.push(text.slice(pos));
  return parts.join('\n');
}

const SHEETS = {
  shell: {
    content: ['./index.html', './src/**/*.{js,jsx}', './app/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
    extra: [],
  },
  studio: {
    content: ['./packages/studio/src/**/*.{js,jsx}'],
    extra: ['packages/studio/src/tailwind.css'],
  },
  workflow: {
    content: ['./packages/Vibe-Workflow/packages/workflow-builder/src/**/*.{js,jsx}'],
    extra: ['packages/Vibe-Workflow/packages/workflow-builder/src/tailwind.css'],
  },
  agents: {
    content: ['./packages/Open-Poe-AI/packages/agents/src/**/*.{js,jsx}'],
    extra: ['packages/Open-Poe-AI/packages/agents/src/tailwind.css'],
  },
  design: {
    content: ['./packages/Open-AI-Design-Agent/packages/design-agent/src/**/*.{js,jsx}'],
    extra: ['packages/Open-AI-Design-Agent/packages/design-agent/src/tailwind.css'],
  },
};

const globalsCss = fs.readFileSync(path.join(ROOT, 'src/globals.css'), 'utf8');

const bin = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'tailwindcss.cmd' : 'tailwindcss');

for (const [key, spec] of Object.entries(SHEETS)) {
  const cfgPath = path.join(ROOT, 'scripts', `.wc-cfg-${key}.cjs`);
  const inputPath = path.join(ROOT, 'scripts', `.wc-input-${key}.css`);
  const outPath = path.join(OUT_DIR, `${key}.css`);

  fs.writeFileSync(
    cfgPath,
    "const base = require('../tailwind.config.js');\n" +
      `module.exports = { ...base, content: ${JSON.stringify(spec.content)} };\n`,
  );

  const extra = spec.extra
    .map((f) => {
      const raw = fs.readFileSync(path.join(ROOT, f), 'utf8');
      return key === 'design' ? stripThemeBlocks(raw) : raw;
    })
    .map(stripDirectives)
    .join('\n');

  fs.writeFileSync(
    inputPath,
    '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\n' +
      extra +
      '\n' +
      stripDirectives(globalsCss) +
      '\n',
  );

  const t0 = Date.now();
  const res = spawnSync(bin, ['-c', cfgPath, '-i', inputPath, '-o', outPath, '--minify'], { cwd: ROOT });
  if (res.status !== 0) {
    console.error(`[gen-wc-css] ${key} FAILED:\n${res.stderr}`);
    process.exitCode = 1;
    continue;
  }
  fs.rmSync(cfgPath);
  fs.rmSync(inputPath);
  const kb = (fs.statSync(outPath).size / 1024).toFixed(1);
  console.log(`[gen-wc-css] ${key}.css ${kb} KB (${Date.now() - t0} ms)`);
}
console.log('[gen-wc-css] done');
