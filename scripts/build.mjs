// Production build WITHOUT bundling: the app ships as native ES modules.
// Steps (nothing else runs):
//   1. copy index.html, src/, packages/studio/, public/ into out/
//   2. minify every .js of the copied sources + the page CSS (esbuild transform,
//      module-forwards import/export untouched — no resolution, no bundling)
// Committed artifacts are final: public/vendor/* (npm deps, see vendor.mjs) and
// public/wc/*.css (style sheets) are copied as-is.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'out');
const esbuild = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'esbuild.cmd' : 'esbuild');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

fs.copyFileSync(path.join(ROOT, 'index.html'), path.join(OUT, 'index.html'));
copyDir(path.join(ROOT, 'src'), path.join(OUT, 'src'));
copyDir(path.join(ROOT, 'packages', 'studio'), path.join(OUT, 'packages', 'studio'));
copyDir(path.join(ROOT, 'public'), OUT);

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

let js = 0;
for (const file of walk(path.join(OUT, 'src'))) {
  if (!file.endsWith('.js')) continue;
  const r = spawnSync(esbuild, [file, '--minify', '--target=es2022', '--allow-overwrite', `--outfile=${file}`], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(`[build] minify FAILED: ${path.relative(ROOT, file)}\n${r.stderr}`);
    process.exit(1);
  }
  js++;
}
for (const file of walk(path.join(OUT, 'packages'))) {
  if (!file.endsWith('.js')) continue;
  const r = spawnSync(esbuild, [file, '--minify', '--target=es2022', '--allow-overwrite', `--outfile=${file}`], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(`[build] minify FAILED: ${path.relative(ROOT, file)}\n${r.stderr}`);
    process.exit(1);
  }
  js++;
}
// globals.css ships unminified in the repo (human-editable) -> minify for prod.
// public/wc/*.css are committed pre-minified and copied as-is.
const globalsCss = path.join(OUT, 'globals.css');
const rc = spawnSync(esbuild, [globalsCss, '--minify', '--allow-overwrite', `--outfile=${globalsCss}`], { cwd: ROOT, encoding: 'utf8' });
if (rc.status !== 0) {
  console.error(`[build] minify CSS FAILED: globals.css\n${rc.stderr}`);
  process.exit(1);
}
console.log(`[build] done: ${js} js files + css minified, no bundling (native ES modules + import map)`);
