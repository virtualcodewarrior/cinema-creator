import { LitElement } from 'lit';

// Per-package Tailwind-generated utility sheets live in /public/wc/<key>.css.
// Each shadow root adopts its package sheet via adoptedStyleSheets so utility
// classes keep working inside encapsulated styles.
export const SHEET_KEYS = ['shell', 'studio', 'agents', 'design'];
const loaded = new Map(); // key -> CSSStyleSheet
const pending = new Map(); // key -> Promise<CSSStyleSheet>

function sheetUrl(key) {
  // Absolute path on purpose: resolving against the document URL breaks on
  // paths without a trailing slash (/agents/edit/x -> /agents/edit/wc/x.css),
  // which returns the SPA fallback HTML and yields an empty stylesheet.
  // import.meta.env is Vite-only; the unbundled production build hits this
  // in the raw browser, so guard it (BASE_URL has always been '/').
  const base = (import.meta.env?.BASE_URL) || '/';
  return base.replace(/\/?$/, '/') + 'wc/' + key + '.css';
}

export function loadWcSheet(key) {
  if (loaded.has(key)) return Promise.resolve(loaded.get(key));
  if (pending.has(key)) return pending.get(key);
  const p = (async () => {
    const res = await fetch(sheetUrl(key));
    if (!res.ok) throw new Error('wc sheet ' + key + ' -> ' + res.status);
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(await res.text());
    loaded.set(key, sheet);
    pending.delete(key);
    return sheet;
  })();
  pending.set(key, p);
  p.catch(() => pending.delete(key)); // don't wedge retries on a failed load
  return p;
}

export function loadWcCss(keys = SHEET_KEYS) {
  return Promise.all(keys.map((k) => loadWcSheet(k).catch((e) => console.warn('[wc]', e))));
}

function applySheet(root, key) {
  const ready = loaded.get(key);
  if (ready) {
    root.adoptedStyleSheets = [...(root.adoptedStyleSheets || []), ready];
    return;
  }
  loadWcSheet(key)
    .then((sheet) => {
      root.adoptedStyleSheets = [...(root.adoptedStyleSheets || []), sheet];
    })
    .catch(() => {});
}

export class BaseElement extends LitElement {
  // Subclasses set: static sheetKey = 'studio' | 'workflow' | ...
  // or a list: static sheetKeys = ['shell', 'studio'].
  static sheetKey = null;
  static sheetKeys = null;

  createRenderRoot() {
    const root = super.createRenderRoot();
    const ctor = this.constructor;
    const keys = ctor.sheetKeys ?? (ctor.sheetKey ? [ctor.sheetKey] : []);
    for (const key of keys) applySheet(root, key);
    return root;
  }
}
