// One-shot source task: bundle each npm dependency into a single self-contained
// ESM file under public/vendor/ (committed, minified). The no-bundle production
// build (scripts/build.mjs) serves these + the app sources as native ES modules
// via the import map in index.html. Re-run ONLY after bumping a dependency in
// package.json: `npm run vendor` -> review -> commit.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'public', 'vendor');
fs.mkdirSync(OUT, { recursive: true });

const esbuild = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'esbuild.cmd' : 'esbuild');

const VENDORS = {
  'lit.js': 'node_modules/lit/index.js',
  'lit-unsafe-html.js': 'node_modules/lit/directives/unsafe-html.js',
  'lit-style-map.js': 'node_modules/lit/directives/style-map.js',
  'marked.js': 'node_modules/marked/lib/marked.esm.js',
  'dompurify.js': 'node_modules/dompurify/dist/purify.es.mjs',
  'hljs-common.js': 'node_modules/highlight.js/lib/common.js',
  'konva.js': 'node_modules/konva/lib/index.js',
};

let failed = false;
for (const [outName, entry] of Object.entries(VENDORS)) {
  const inFile = path.join(ROOT, entry);
  const outFile = path.join(OUT, outName);
  const res = spawnSync(
    esbuild,
    [inFile, '--bundle', '--format=esm', '--minify', '--target=es2022', `--outfile=${outFile}`, '--log-level=warning'],
    { cwd: ROOT, encoding: 'utf8' },
  );
  if (res.status !== 0) {
    failed = true;
    console.error(`[vendor] ${outName} FAILED:\n${res.stderr}`);
    continue;
  }
  console.log(`[vendor] ${outName} ${Math.round(fs.statSync(outFile).size / 1024)} KB`);
}
if (failed) process.exit(1);
console.log('[vendor] done');
